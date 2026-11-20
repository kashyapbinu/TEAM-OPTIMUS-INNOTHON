"""Region-specific generation-mix strategy, 2025 -> 2047 (milestones 2030/35/40/47).

Linear programme (PuLP/CBC). All quantities are annual GENERATION in TWh.

Decision  G[r,s,t]  generation in region r from source s in milestone year t.
Minimise  sum_t  years_t * [ LCOE[r,s,t]*G + carbon_t*EF_s*G + wheel*Export[r,t] + firming*VREexcess_t ]
Subject to
  national     sum_rs G*(1 - k_s,t)            = National requirement_t   (k: storage/curtailment loss of VRE)
  regional     Req_r is the region's BAU production requirement (shift-share forecast). Production may be
               re-allocated between regions: soft floor 70% / hard floor 45% of BAU, ceiling (1+exp_r) x BAU
               (inter-regional transmission). Re-allocation carries a wheeling cost.
  resource     solar/wind/hydro_r <= share_t * technical generation potential_r (TWh)
  build-rate   national increment of each source <= max TWh/yr * years  (calibrated on historical increments)
  no-regret    clean sources never decrease (solar, wind, hydro, nuclear)
  nuclear      national path ceiling; regional ceiling by planned-site shares
  coal         national floor (young fleet, no stranding) & ceiling; new coal only near pitheads (East/West)
  gas/bio      national ceilings (LNG import dependence, feedstock)
  balancing    national VRE share <= v_t ; regional VRE <= 75% of regional production
Infeasibility is never hidden: an 'unserved' slack with a prohibitive cost is reported if used.

Run:  python -m src.optimize
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pulp

from .forecast import national_2025_by_source
from .regions import REGIONS

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"

SRC = ["coal", "gas", "nuclear", "hydro", "solar", "wind", "bio"]
CLEAN = ["nuclear", "hydro", "solar", "wind", "bio"]
VRE = ["solar", "wind"]
MILESTONES = [2030, 2035, 2040, 2047]
ALL_T = [2025] + MILESTONES
STEP = {2030: 5, 2035: 5, 2040: 5, 2047: 7}

EF = {"coal": 0.82, "gas": 0.49}  # tCO2/MWh, derived from Ember India state data (emissions / generation, 2019-24)
PITHEAD = {"East", "West"}  # coalfields: Jharkhand, Odisha, WB, Chhattisgarh, MP, Maharashtra

# Technology cost assumptions, Rs/kWh, real 2025 (2025 value -> 2047 value, linear in between).
# Regional variation reflects resource quality / logistics (see docs/assumptions.md).
LCOE = {
    "solar": {"North": (2.6, 1.9), "West": (2.6, 1.9), "South": (2.7, 2.0), "East": (3.1, 2.4), "North-East": (3.4, 2.7)},
    "wind": {"North": (3.4, 3.0), "West": (3.2, 2.8), "South": (3.1, 2.7), "East": (4.0, 3.6), "North-East": (4.5, 4.1)},
    "hydro": {"North": (5.5, 5.5), "West": (5.8, 5.8), "South": (5.6, 5.6), "East": (5.8, 5.8), "North-East": (6.2, 6.0)},
    "nuclear": {r: (6.4, 5.6) for r in REGIONS},
    "coal": {"North": (5.2, 5.6), "West": (4.3, 4.7), "South": (5.3, 5.7), "East": (4.1, 4.5), "North-East": (5.8, 6.2)},
    "gas": {r: (8.5, 8.5) for r in REGIONS},
    "bio": {r: (6.5, 6.0) for r in REGIONS},
}
WHEELING = 0.35  # Rs/kWh for inter-regional transfer (charges + losses)
FIRMING = 1.6  # Rs/kWh storage/firming adder on VRE above 35% of national generation
# Committed pipeline (projects under construction, commissioning regardless of cost ranking), TWh national.
# Nuclear: RAPP 7-8, Kudankulam 3-6, GHAVP 1-2, PFBR, Kakrapar/... ; Hydro: Subansiri Lower, Teesta, Parbati,
# Pakal Dul, Ratle, Polavaram etc. Expressed as minimum generation.
COMMITTED = {"nuclear": {2030: 85, 2035: 110}, "hydro": {2030: 205, 2035: 225}}
VRE_FREE = 0.35
VRE_TIER2 = 0.10  # VRE may exceed the strategy limit by up to 10 pp at a heavy storage cost
FIRMING2 = 3.0  # Rs/kWh on VRE above the strategy limit (multi-hour battery + pumped hydro)
COAL_OVER_PENALTY = 3.0  # Rs/kWh on coal above the strategy cap (policy breach, reported)
VRE_LOSS = {2030: 0.02, 2035: 0.03, 2040: 0.04, 2047: 0.05}  # storage round-trip + curtailment
SELF_TARGET = 0.70  # soft target: each region produces >= 70% of its own requirement
SELF_FLOOR = 0.45  # hard floor
SELF_PENALTY = 1.0  # Rs/kWh energy-security premium on shortfall below the soft target
EXPORT_MAX = {"North": 0.5, "West": 0.5, "South": 0.5, "East": 0.5, "North-East": 2.0}  # NE hydro export hub
NUC_SITE_SHARE = {"North": 0.35, "West": 0.40, "South": 0.40, "East": 0.10, "North-East": 0.0}
# share of technical potential realistically developable by milestone (land, evacuation, clearances)
SOLAR_SHARE = {2030: .08, 2035: .17, 2040: .28, 2047: .44}  # raised 2026-11-18 when new loads moved to NITI (2026) anchors
WIND_SHARE = {2030: .06, 2035: .12, 2040: .22, 2047: .35}
HYDRO_DEV = {2030: .15, 2035: .25, 2040: .45, 2047: .65}  # fraction of undeveloped hydro potential tapped
HYDRO_DEV_NE = 0.6  # multiplier for NE (seismic, ecological, border constraints)

STRATEGIES = {
    "balanced": dict(
        label="Balanced transition (recommended)",
        carbon={2030: 500, 2035: 1000, 2040: 1500, 2047: 2500},  # Rs/tCO2
        # limits sized so the recommended plan needs no tier-2 storage in Base
        vre_max={2030: .30, 2035: .40, 2040: .52, 2047: .61},
        solar_max={2030: .24, 2035: .30, 2040: .38, 2047: .45},
        # 2047 = 100 GW nuclear target (Nuclear Energy Mission, Budget 2025-26) x ~80% load factor = ~700 TWh
        nuclear_max={2030: 90, 2035: 170, 2040: 380, 2047: 700},
        coal_survival={2030: .95, 2035: .85, 2040: .70, 2047: .50},
        # coal: peak by 2035, plateau to 2040, decline after (young fleet; NEP pipeline to 2032; net-zero 2070)
        coal_cap={2030: 1750, 2035: 1900, 2040: 1900, 2047: 1650},
        build=1.0, gas_max=120, gas_min=40, bio_max={2030: 30, 2035: 40, 2040: 50, 2047: 60},
        desc="Solar+wind lead growth inside grid-balancing limits; coal peaks ~2035, plateaus to 2040, then declines; nuclear "
             "scales to ~700 TWh/yr by 2047 (the 100 GW national target); NE hydro developed for export."),
    "accelerated": dict(
        label="Accelerated decarbonisation",
        carbon={2030: 1000, 2035: 2500, 2040: 4000, 2047: 6000},
        vre_max={2030: .34, 2035: .46, 2040: .56, 2047: .65},
        solar_max={2030: .27, 2035: .34, 2040: .40, 2047: .45},
        nuclear_max={2030: 95, 2035: 190, 2040: 380, 2047: 700},
        coal_survival={2030: .90, 2035: .75, 2040: .55, 2047: .30},
        coal_cap={2030: 1700, 2035: 1750, 2040: 1600, 2047: 1300},
        build=1.2, gas_max=140, gas_min=40, bio_max={2030: 35, 2035: 50, 2040: 65, 2047: 80},
        desc="Faster storage roll-out allows 65% VRE; nuclear up to 700 TWh/yr by 2047; early coal retirement."),
    "security": dict(
        label="Energy-security (coal-extended)",
        carbon={2030: 0, 2035: 250, 2040: 500, 2047: 800},
        vre_max={2030: .27, 2035: .35, 2040: .42, 2047: .48},
        solar_max={2030: .22, 2035: .27, 2040: .31, 2047: .34},
        nuclear_max={2030: 88, 2035: 140, 2040: 260, 2047: 450},
        coal_survival={2030: 1.0, 2035: .95, 2040: .85, 2047: .70},
        coal_cap={2030: 1850, 2035: 2150, 2040: 2350, 2047: 2400},
        build=0.85, gas_max=100, gas_min=40, bio_max={2030: 28, 2035: 35, 2040: 42, 2047: 50},
        desc="Supply-chain/storage risk hedged with domestic coal; slower RE build; minimal import exposure."),
}
# max national generation increment, TWh per year, per milestone step (2025 record: solar +53, wind +22)
BUILD = {
    "solar": {2030: 110, 2035: 150, 2040: 180, 2047: 200},
    "wind": {2030: 40, 2035: 60, 2040: 75, 2047: 80},
    "hydro": {2030: 8, 2035: 12, 2040: 14, 2047: 14},
    "coal": {2030: 60, 2035: 40, 2040: 20, 2047: 0},
}


def lerp(pair, t):
    a, b = pair
    return a + (b - a) * (t - 2025) / (2047 - 2025)


def base_mix_2025() -> pd.DataFrame:
    """2025 regional mix on the national (incl. captive) basis: grid generation by region & source,
    plus the per-source national-minus-grid gap (captive/rooftop) distributed by regional share."""
    sg = pd.read_csv(PROC / "state_generation.csv")
    sg = sg[sg.year == 2025].copy()
    sg["source"] = sg["source"].replace({"other_fossil": "gas"})
    grid = sg.groupby(["region", "source"])["gwh"].sum().unstack(fill_value=0) / 1e3
    nat = national_2025_by_source()
    out = grid.copy()
    for s in nat.index:
        gap = nat[s] - grid[s].sum()
        out[s] = grid[s] + gap * grid[s] / grid[s].sum()
    return out.reindex(index=REGIONS, columns=SRC).fillna(0.0)


def solve(strategy: str, demand: str, nat: pd.DataFrame, reg: pd.DataFrame, pot: pd.DataFrame, base: pd.DataFrame):
    P = STRATEGIES[strategy]
    N = nat[nat.scenario == demand].set_index("year")["total"]
    Nb = nat[nat.scenario == "base"].set_index("year")["total"]
    # delivery capacity (build rates, coal/gas limits) scales with the size of the economy relative to base
    k = {t: float(N[t] / Nb[t]) for t in MILESTONES}
    R = reg[reg.scenario == demand].set_index(["year", "region"])["twh"]
    potd = pot.set_index(["region", "source"])["twh_potential"]

    m = pulp.LpProblem(f"mix_{strategy}_{demand}", pulp.LpMinimize)
    G = {(r, s, t): pulp.LpVariable(f"G_{r}_{s}_{t}".replace("-", ""), lowBound=0)
         for r in REGIONS for s in SRC for t in MILESTONES}
    X = {(r, t): pulp.LpVariable(f"X_{r}_{t}".replace("-", ""), lowBound=0) for r in REGIONS for t in MILESTONES}
    V = {t: pulp.LpVariable(f"Vx_{t}", lowBound=0) for t in MILESTONES}
    U = {t: pulp.LpVariable(f"unserved_{t}", lowBound=0) for t in MILESTONES}
    V2 = {t: pulp.LpVariable(f"Vtier2_{t}", lowBound=0) for t in MILESTONES}
    CO = {t: pulp.LpVariable(f"coalover_{t}", lowBound=0) for t in MILESTONES}
    S = {(r, t): pulp.LpVariable(f"short_{r}_{t}".replace("-", ""), lowBound=0) for r in REGIONS for t in MILESTONES}

    def g(r, s, t):
        return base.loc[r, s] if t == 2025 else G[r, s, t]

    cost = []
    for t in MILESTONES:
        w = STEP[t]
        for r in REGIONS:
            for s in SRC:
                c = lerp(LCOE[s][r], t) + P["carbon"][t] * EF.get(s, 0) / 1000  # Rs/kWh
                cost.append(w * c * G[r, s, t])
            cost.append(w * WHEELING * X[r, t])
            cost.append(w * SELF_PENALTY * S[r, t])
        cost.append(w * FIRMING * V[t])
        cost.append(w * FIRMING2 * V2[t])
        cost.append(w * COAL_OVER_PENALTY * CO[t])
        cost.append(w * 1000 * U[t])
    m += pulp.lpSum(cost)

    for i, t in enumerate(MILESTONES):
        tp = ALL_T[i]  # previous milestone
        yrs = t - tp
        tot = pulp.lpSum(G[r, s, t] for r in REGIONS for s in SRC)
        vre = pulp.lpSum(G[r, s, t] for r in REGIONS for s in VRE)
        # national requirement (VRE output net of storage/curtailment losses)
        m += (pulp.lpSum(G[r, s, t] * (1 - (VRE_LOSS[t] if s in VRE else 0)) for r in REGIONS for s in SRC)
              + U[t] == N[t]), f"national_{t}"
        m += V[t] >= vre - VRE_FREE * N[t]
        m += vre <= P["vre_max"][t] * tot + V2[t], f"vre_share_{t}"
        m += V2[t] <= VRE_TIER2 * tot
        m += pulp.lpSum(G[r, "solar", t] for r in REGIONS) <= P["solar_max"][t] * tot + V2[t], f"solar_share_{t}"
        # nuclear / gas / bio / coal national
        kn = min(max(k[t], 1.0), 1.3)
        nuc_cap = max(P["nuclear_max"][t] * kn, base["nuclear"].sum(), COMMITTED["nuclear"].get(t, 0))
        m += pulp.lpSum(G[r, "nuclear", t] for r in REGIONS) <= nuc_cap
        m += pulp.lpSum(G[r, "gas", t] for r in REGIONS) <= P["gas_max"] * k[t]
        m += pulp.lpSum(G[r, "gas", t] for r in REGIONS) >= P["gas_min"]
        for s, fl in COMMITTED.items():
            if t in fl:
                m += pulp.lpSum(G[r, s, t] for r in REGIONS) >= fl[t], f"committed_{s}_{t}"
        m += pulp.lpSum(G[r, "bio", t] for r in REGIONS) <= P["bio_max"][t]
        coal = pulp.lpSum(G[r, "coal", t] for r in REGIONS)
        m += coal <= P["coal_cap"][t] * k[t] + CO[t], f"coal_cap_{t}"
        # build-rate limits (national increments)
        for s, lim in BUILD.items():
            prev = pulp.lpSum(g(r, s, tp) for r in REGIONS)
            now = pulp.lpSum(G[r, s, t] for r in REGIONS)
            extra = CO[t] if s == "coal" else 0
            if s in COMMITTED and t in COMMITTED[s]:  # projects under construction are not build-rate limited
                prev_floor = COMMITTED[s].get(tp, float(base[s].sum()))
                extra = max(0.0, COMMITTED[s][t] - prev_floor - lim[t] * yrs * k[t])
            m += now - prev <= lim[t] * yrs * k[t] * (P["build"] if s in VRE else 1.0) + extra, f"build_{s}_{t}"
        prev_coal = pulp.lpSum(g(r, "coal", tp) for r in REGIONS)
        if t >= 2047:
            m += coal <= prev_coal + CO[t]  # coal past peak by 2047

        for r in REGIONS:
            prod = pulp.lpSum(G[r, s, t] for s in SRC)
            req = R[(t, r)]
            m += prod + S[r, t] >= SELF_TARGET * req, f"selfreliance_{r}_{t}"
            m += prod >= SELF_FLOOR * req, f"selffloor_{r}_{t}"
            m += prod <= (1 + EXPORT_MAX[r]) * req, f"transfer_cap_{r}_{t}"
            m += X[r, t] >= prod - req
            m += pulp.lpSum(G[r, s, t] for s in VRE) <= 0.75 * prod
            # resource ceilings (generation potential, TWh)
            ks = max(k[t], 1.0)
            m += G[r, "solar", t] <= max(min(SOLAR_SHARE[t] * ks, 0.7) * potd[(r, "solar")], base.loc[r, "solar"])
            m += G[r, "wind", t] <= max(min(WIND_SHARE[t] * ks, 0.7) * potd[(r, "wind")], base.loc[r, "wind"])
            dev = HYDRO_DEV[t] * (HYDRO_DEV_NE if r == "North-East" else 1.0)
            h0 = base.loc[r, "hydro"]
            m += G[r, "hydro", t] <= h0 + dev * max(potd[(r, "hydro")] - h0, 0)
            m += G[r, "nuclear", t] <= max(NUC_SITE_SHARE[r] * nuc_cap, base.loc[r, "nuclear"])
            m += G[r, "bio", t] <= base.loc[r, "bio"] * P["bio_max"][t] / base["bio"].sum()
            # coal: load-centre regions may not expand coal; pithead regions may
            cmax = 1.0 if r not in PITHEAD else 1.6
            m += G[r, "coal", t] <= base.loc[r, "coal"] * cmax * max(k[t], 1.0)
            # existing fleet survival floor: plants are young (median age < 15 y); no early stranding
            m += G[r, "coal", t] >= base.loc[r, "coal"] * P["coal_survival"][t], f"coal_fleet_{r}_{t}"
            m += G[r, "gas", t] <= max(base.loc[r, "gas"] * 2.5, 5)
            # no-regret: clean generation never falls
            for s in ["solar", "wind", "hydro", "nuclear", "bio"]:
                m += G[r, s, t] >= g(r, s, tp)

    status = m.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[status] != "Optimal":
        raise RuntimeError(f"{strategy}/{demand}: {pulp.LpStatus[status]}")

    rows = []
    for r in REGIONS:
        for s in SRC:
            rows.append(dict(year=2025, region=r, source=s, twh=float(base.loc[r, s])))
            for t in MILESTONES:
                rows.append(dict(year=t, region=r, source=s, twh=float(G[r, s, t].value())))
    mix = pd.DataFrame(rows)
    mix["strategy"], mix["scenario"] = strategy, demand
    unserved = {t: float(U[t].value()) for t in MILESTONES}
    unserved["vre_tier2_twh"] = {t: float(V2[t].value()) for t in MILESTONES}
    unserved["coal_over_cap_twh"] = {t: float(CO[t].value()) for t in MILESTONES}
    unserved["self_shortfall_twh"] = {f"{r}|{t}": float(S[r, t].value()) for r in REGIONS for t in MILESTONES
                                      if S[r, t].value() > 1e-6}
    # duals for explanation (marginal cost of national requirement, Rs/kWh)
    duals = {t: m.constraints[f"national_{t}"].pi / STEP[t] for t in MILESTONES}
    return mix, unserved, duals, pulp.value(m.objective)


def summarise(mix: pd.DataFrame, reg: pd.DataFrame) -> pd.DataFrame:
    """Per strategy x scenario x year x region: production, requirement, net transfer, emissions, shares."""
    out = []
    for (st, sc, t, r), d in mix.groupby(["strategy", "scenario", "year", "region"]):
        prod = d.twh.sum()
        req = reg[(reg.scenario == sc) & (reg.year == t) & (reg.region == r)]["twh"]
        req = float(req.iloc[0]) if len(req) else prod
        s = d.set_index("source")["twh"]
        em = (s.get("coal", 0) * EF["coal"] + s.get("gas", 0) * EF["gas"])  # MtCO2 (TWh * t/MWh)
        out.append(dict(strategy=st, scenario=sc, year=t, region=r, production_twh=prod, bau_requirement_twh=req,
                        shift_vs_bau_twh=prod - req, emissions_mt=em,
                        clean_share=s[CLEAN].sum() / prod if prod else 0,
                        vre_share=s[VRE].sum() / prod if prod else 0,
                        intensity_g_per_kwh=em / prod * 1000 if prod else 0))
    return pd.DataFrame(out)


# ------------------------------------------------------------------ sensitivity
# One-at-a-time +-20% on each analyst assumption group (Balanced strategy, Base demand).
SENS_FACTOR = 0.20
_SENS_GLOBALS = ["LCOE", "FIRMING", "FIRMING2", "BUILD", "COMMITTED", "SOLAR_SHARE", "WIND_SHARE", "HYDRO_DEV"]


def _scaled(d, f):
    """Recursively scale numeric leaves of a (nested) dict / tuple by f."""
    if isinstance(d, dict):
        return {k: _scaled(v, f) for k, v in d.items()}
    if isinstance(d, tuple):
        return tuple(x * f for x in d)
    return d * f


def _perturb(label: str, f: float, base0: dict) -> None:
    g = globals()
    if label.startswith("LCOE "):
        s = label.split()[1]
        g["LCOE"] = {**LCOE, s: _scaled(LCOE[s], f)}
    elif label == "Storage/firming cost":
        g["FIRMING"], g["FIRMING2"] = FIRMING * f, FIRMING2 * f
    elif label == "Build-rate limits":
        g["BUILD"] = {k: (_scaled(v, f) if k != "coal" else v) for k, v in BUILD.items()}
    elif label == "Committed pipeline":  # scale the committed ADDITIONS over 2025, not the level
        g["COMMITTED"] = {s: {t: base0[s] + (v - base0[s]) * f for t, v in d.items()} for s, d in COMMITTED.items()}
    elif label == "Developable RE share":
        g["SOLAR_SHARE"], g["WIND_SHARE"] = _scaled(SOLAR_SHARE, f), _scaled(WIND_SHARE, f)
        g["HYDRO_DEV"] = {k: min(v * f, 1.0) for k, v in HYDRO_DEV.items()}


def _scale_new_loads(nat: pd.DataFrame, reg: pd.DataFrame, f: float):
    """Scale green-H2 + EV + data-centre loads by f; regional requirements scale with the national ratio."""
    n2 = nat.copy()
    new = n2[["green_hydrogen", "e_mobility", "data_centres"]].sum(axis=1)
    n2["total"] = n2["total"] + (f - 1) * new
    rat = (n2.set_index(["scenario", "year"])["total"] / nat.set_index(["scenario", "year"])["total"]).to_dict()
    r2 = reg.copy()
    r2["twh"] = r2["twh"] * [rat.get((s, y), 1.0) for s, y in zip(r2.scenario, r2.year)]
    return n2, r2


SENS_GROUPS = ["LCOE solar", "LCOE wind", "LCOE nuclear", "LCOE coal", "Storage/firming cost", "Build-rate limits",
               "Committed pipeline", "Developable RE share", "New loads (H2, EV, DC)"]


def sensitivity(nat, reg, pot, base) -> pd.DataFrame:
    import copy
    g = globals()
    saved = {k: copy.deepcopy(g[k]) for k in _SENS_GLOBALS}

    def metrics(mix, info, n2, label, side, obj):
        nb = n2[n2.scenario == "base"].set_index("year")["total"]
        energy = sum(STEP[t] * nb[t] for t in MILESTONES)  # TWh-years over the horizon
        y = mix[mix.year == 2047].groupby("source").twh.sum()
        em = y["coal"] * EF["coal"] + y["gas"] * EF["gas"]
        coal = mix[mix.source == "coal"].groupby("year").twh.sum()
        return dict(assumption=label, case=side,
                    req_2047_twh=float(n2[(n2.scenario == "base") & (n2.year == 2047)]["total"].iloc[0]),
                    clean_share_2047=y[CLEAN].sum() / y.sum(), g_per_kwh_2047=em / y.sum() * 1000,
                    coal_2047_twh=y["coal"], coal_peak_twh=coal.max(), coal_peak_year=int(coal.idxmax()),
                    solar_2047_twh=y["solar"], wind_2047_twh=y["wind"], nuclear_2047_twh=y["nuclear"],
                    vre_tier2_2047_twh=info["vre_tier2_twh"][2047], unserved_2047_twh=info[2047],
                    # objective incl. carbon price & penalties, Rs/kWh averaged over 2026-47 (unserved excluded)
                    system_cost_rs_kwh=(obj - 1000 * sum(STEP[t] * info[t] for t in MILESTONES)) / energy)

    mix, info, _, obj = solve("balanced", "base", nat, reg, pot, base)
    rows = [metrics(mix, info, nat, "Central case", "central", obj)]
    for label in SENS_GROUPS:
        for side, f in (("-20%", 1 - SENS_FACTOR), ("+20%", 1 + SENS_FACTOR)):
            n2, r2 = (_scale_new_loads(nat, reg, f) if label.startswith("New loads") else (nat, reg))
            try:
                if not label.startswith("New loads"):
                    _perturb(label, f, base.sum().to_dict())
                try:
                    mix, info, _, obj = solve("balanced", "base", n2, r2, pot, base)
                    rows.append(metrics(mix, info, n2, label, side, obj))
                except RuntimeError as e:
                    print(f"  sensitivity {label} {side}: {e}")
                    rows.append(dict(assumption=label, case=side, infeasible=True))
            finally:
                for k, v in saved.items():
                    g[k] = copy.deepcopy(v)
    return pd.DataFrame(rows)


def main():
    nat = pd.read_csv(PROC / "national_forecast.csv")
    reg = pd.read_csv(PROC / "regional_forecast.csv")
    pot = pd.read_csv(PROC / "resource_potential_twh.csv")
    base = base_mix_2025()
    mixes, info = [], {}
    for st in STRATEGIES:
        for sc in ["low", "base", "high"]:
            mix, unserved, duals, obj = solve(st, sc, nat, reg, pot, base)
            mixes.append(mix)
            info[f"{st}|{sc}"] = dict(unserved_twh=unserved, marginal_cost_rs_kwh=duals, objective=obj)
            un = {k: round(v) for k, v in unserved.items() if isinstance(k, int) and v > 1e-6}
            flag = (" UNSERVED " + str(un) if un else "") +                    " tier2=" + str({k: round(v) for k, v in unserved["vre_tier2_twh"].items() if v > 1}) +                    " coalover=" + str({k: round(v) for k, v in unserved["coal_over_cap_twh"].items() if v > 1})
            print(f"{st:12s} {sc:5s} ok{flag}")
    mix = pd.concat(mixes, ignore_index=True)
    mix.to_csv(PROC / "generation_mix.csv", index=False)
    summ = summarise(mix, reg)
    summ.to_csv(PROC / "mix_summary.csv", index=False)
    json.dump(dict(strategies={k: {kk: vv for kk, vv in v.items()} for k, v in STRATEGIES.items()},
                   lcoe=LCOE, ef=EF, wheeling=WHEELING, firming=FIRMING, vre_free=VRE_FREE, vre_loss=VRE_LOSS,
                   self_target=SELF_TARGET, self_floor=SELF_FLOOR, self_penalty=SELF_PENALTY, export_max=EXPORT_MAX, nuclear_site_share=NUC_SITE_SHARE,
                   solar_share=SOLAR_SHARE, wind_share=WIND_SHARE, hydro_dev=HYDRO_DEV, hydro_dev_ne=HYDRO_DEV_NE,
                   build=BUILD, committed=COMMITTED, runs=info), open(PROC / "optimizer_meta.json", "w"), indent=2, default=str)

    sens = sensitivity(nat, reg, pot, base)
    sens.to_csv(PROC / "sensitivity.csv", index=False)
    print("\nSensitivity (Balanced/base, 2047):")
    print(sens.round(2).to_string())

    b = mix[(mix.strategy == "balanced") & (mix.scenario == "base")]
    print("\nBalanced/base national mix (TWh):")
    print(b.groupby(["year", "source"]).twh.sum().unstack().round(0))
    print("\nBalanced/base 2047 regional mix (TWh):")
    print(b[b.year == 2047].pivot(index="region", columns="source", values="twh").round(0))
    s = summ[(summ.strategy == "balanced") & (summ.scenario == "base")]
    print(s[s.year == 2047].round(2).to_string())
    nat_s = summ.groupby(["strategy", "scenario", "year"]).agg(prod=("production_twh", "sum"), em=("emissions_mt", "sum")).reset_index()
    nat_s["g_kwh"] = nat_s.em / nat_s["prod"] * 1000
    print(nat_s[nat_s.year == 2047].round(0).to_string())
    print({k: {t: round(v, 2) for t, v in d["marginal_cost_rs_kwh"].items()} for k, d in info.items() if k.endswith("base")})


if __name__ == "__main__":
    main()
