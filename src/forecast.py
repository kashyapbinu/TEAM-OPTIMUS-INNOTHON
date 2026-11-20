"""National + regional electricity GENERATION forecast to 2047.

Models (national, per-capita generation E_pc in kWh/person):
  A  Driver regression (India, 2000-2025):   ln E_pc = a + b ln GDPpc + c Urban%
  B  Cross-country development curve (41 economies, 1985-2022, country fixed effects):
         ln E_pc = a_i + b1 ln GDPpc + b2 (ln GDPpc)^2     -> elasticity falls as income rises
  C  Damped-trend exponential smoothing on ln(total generation), 1990-2025 (no drivers)
National baseline = inverse-backtest-error weighted ensemble of A, B, C.
Then explicit structural loads not visible in history (green hydrogen, e-mobility, data centres)
are added as generation requirements.

Regional (5 grids): shift-share. Each region's 2025 generation grows with its own driver index
  D_r = Pop_r * GSDPpc_r^b * exp(c * Urban_r)
using Model A coefficients, then shares are reconciled so regions sum to the national forecast.

Only generation (TWh) is used as the energy metric. Run: python -m src.forecast
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from .regions import REGIONS, STATES

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"

BASE_YEAR = 2025
HORIZON = 2047
YEARS = np.arange(BASE_YEAR, HORIZON + 1)
LOSS = 0.12  # generation needed per unit of new end-use load: 1/(1-LOSS) (T&D + auxiliary)

PEERS = ["China", "South Korea", "Japan", "Germany", "United Kingdom", "France", "Italy", "Spain",
         "Brazil", "Mexico", "Turkey", "Indonesia", "Thailand", "Malaysia", "Vietnam", "Philippines",
         "Egypt", "South Africa", "Poland", "Chile", "Argentina", "Colombia", "Bangladesh", "Pakistan",
         "India", "Sri Lanka", "Morocco", "Peru", "Iran", "Romania", "Portugal", "Greece", "Ukraine",
         "United States", "Australia", "Netherlands", "Belgium", "Hungary", "Czechia", "Nigeria", "Kenya"]


# ------------------------------------------------------------------ scenarios
@dataclass
class Scenario:
    key: str
    label: str
    gdp_growth: list  # [(start, end, real GDP growth)]
    urban_2047: float  # % urban in 2047 (UN WUP base = 42.2)
    pop_mult_2047: float  # multiplier on UN medium population in 2047 (linear ramp from 1.0 in 2025)
    h2_mt_2047: float  # green hydrogen production via electrolysis, Mt/yr
    ev_twh_2047: float  # incremental e-mobility load beyond historical trend, TWh end-use
    dc_twh_2047: float  # incremental data-centre load beyond trend, TWh end-use
    notes: str = ""


SCENARIOS = {
    "low": Scenario("low", "Low growth",
                    [(2026, 2030, .055), (2031, 2040, .050), (2041, 2047, .040)],
                    urban_2047=40.0, pop_mult_2047=0.98, h2_mt_2047=6.8, ev_twh_2047=155, dc_twh_2047=195,
                    notes="Growth slows to ~4-5%; slow urbanisation; new loads follow the NITI Current Policy path 5 years late."),
    "base": Scenario("base", "Base (reference)",
                     [(2026, 2030, .065), (2031, 2040, .060), (2041, 2047, .050)],
                     urban_2047=42.2, pop_mult_2047=1.00, h2_mt_2047=7.8, ev_twh_2047=305, dc_twh_2047=295,
                     notes="IMF/RBI-consistent ~6-6.5% medium-term growth; UN WPP medium population; UN WUP urbanisation; "
                           "new loads on the NITI Aayog (2026) Current Policy path, interpolated to 2047."),
    "high": Scenario("high", "High growth (Viksit Bharat)",
                     [(2026, 2030, .075), (2031, 2040, .075), (2041, 2047, .065)],
                     urban_2047=50.0, pop_mult_2047=1.02, h2_mt_2047=22.0, ev_twh_2047=425, dc_twh_2047=365,
                     notes="~7.5% growth consistent with developed-economy ambition by 2047; faster urbanisation; "
                           "new loads reach NITI 2050 levels (Net Zero Scenario for H2/transport) by 2047; H2 export hub."),
}
H2_KWH_PER_KG = 55.0  # NITI Aayog (2026) Vol. 6 Industry: "around 55 MWh of electricity required per tonne"

# New-load anchors (end-use TWh / Mt), NITI Aayog "Scenarios towards Viksit Bharat and Net Zero" (Feb 2026),
# files in data/raw/ref/niti (see SOURCES.md). Derivation of the Scenario values above:
#   Transport electricity: 2024 = 2.2% x 1,541 = 34 TWh; 2050 CPS ~550, NZS 48 Mtoe = 558 TWh (Vol. 7 Power, Vol. 3).
#   Data centres: 2030 ~10 GW avg = 88 TWh; 2050 ~400 TWh (Vol. 7 Power, Vol. 5 Buildings). 2024 = 9 TWh (IEA Energy and AI).
#   Green H2: 5 Mt 2030 (National Green Hydrogen Mission); 2050 CPS 8.4 Mt, NZS 22 Mt (Vol. 6 Industry).
#   Path between anchors = log-linear. Base = value in 2047; Low = value in 2042 (5-yr delay); High = 2050 value by 2047.
#   Transport 2047: 399 base / 234 low / 558 high. Data centres: 319 / 218 / 400. H2: 7.8 / 6.8 / 22 Mt.
#   "Beyond trend" = anchor minus the 2024 load grown with the scenario's own ensemble trend
#   (x2.27 low, x2.75 base, x3.98 high): transport 34, data centres 9 TWh are already inside the history.
#   -> EV 155/305/425, DC 195/295/365 TWh end-use. H2 has no grid-electricity history, nothing subtracted.


def gdp_path(sc: Scenario, gdp_2025: float) -> pd.Series:
    g = {BASE_YEAR: gdp_2025}
    rate = {y: r for (a, b, r) in sc.gdp_growth for y in range(a, b + 1)}
    for y in YEARS[1:]:
        g[y] = g[y - 1] * (1 + rate[y])
    return pd.Series(g)


def ramp(v2047: float, start: float = 0.0) -> pd.Series:
    """Logistic ramp from start (2025) to v2047, midpoint 2036 - adoption-shaped."""
    t = YEARS
    s = 1 / (1 + np.exp(-(t - 2036) / 3.0))
    s = (s - s[0]) / (s[-1] - s[0])
    return pd.Series(start + (v2047 - start) * s, index=YEARS)


# ------------------------------------------------------------------ data
def load_national() -> pd.DataFrame:
    gen = pd.read_csv(PROC / "national_generation.csv").groupby("year")["twh"].sum()
    d = pd.read_csv(PROC / "national_drivers.csv").set_index("year")
    df = d.join(gen.rename("twh"))
    df["epc"] = df["twh"] * 1e9 / df["population"]
    return df


def load_peers() -> pd.DataFrame:
    o = pd.read_csv(RAW / "owid-energy-data.csv",
                    usecols=["country", "year", "population", "gdp", "electricity_generation"]).dropna()
    p = o[o["country"].isin(PEERS) & (o["year"] >= 1985)].copy()
    p["lepc"] = np.log(p["electricity_generation"] * 1e9 / p["population"])
    p["lg"] = np.log(p["gdp"] / p["population"])  # Maddison, 2011 int$ PPP
    p["lg2"] = p["lg"] ** 2
    u = pd.read_csv(RAW / "owid_urban_share_all.csv")
    u.columns = ["country", "code", "year", "urban"]
    p = p.merge(u[["country", "year", "urban"]], on=["country", "year"], how="left")
    assert p["urban"].notna().all(), "missing urban share for a peer country-year"
    return p


# ------------------------------------------------------------------ models
@dataclass
class FitA:
    params: pd.Series  # const, lg (estimated on India) and u (fixed from cross-country panel)
    bse: pd.Series
    rsquared: float


def fit_A(df: pd.DataFrame, end: int, u_coef: float, u_se: float) -> FitA:
    """India GDP elasticity, with the urbanisation effect fixed at the cross-country panel estimate.

    In India's own time series urbanisation and income both trend upward and are nearly collinear,
    so a free urban coefficient absorbs the time trend (0.053/pp, implausibly large). The panel of
    41 economies with country fixed effects identifies it at ~0.021/pp; we impose that value."""
    x = df.loc[2000:end].dropna(subset=["twh"])
    y = np.log(x["epc"]) - u_coef * x["urban_pct"]
    m = sm.OLS(y, sm.add_constant(pd.DataFrame({"lg": np.log(x["gdp_pc_usd2015"])}))).fit(
        cov_type="HAC", cov_kwds={"maxlags": 2})
    params = pd.Series({"const": m.params["const"], "lg": m.params["lg"], "u": u_coef})
    bse = pd.Series({"const": m.bse["const"], "lg": m.bse["lg"], "u": u_se})
    return FitA(params, bse, float(m.rsquared))


def predict_A(m, gdppc: pd.Series, urban: pd.Series, anchor_year: int, anchor_epc: float, params=None) -> pd.Series:
    """Growth-form prediction anchored on the last observed year (removes level bias)."""
    p = m.params if params is None else params
    ln = p["lg"] * np.log(gdppc / gdppc[anchor_year]) + p["u"] * (urban - urban[anchor_year])
    return anchor_epc * np.exp(ln)


def fit_B(peers: pd.DataFrame, end: int):
    p = peers[peers["year"] <= end]
    return smf.ols("lepc ~ lg + lg2 + urban + C(country) + C(year)", p).fit(
        cov_type="cluster", cov_kwds={"groups": pd.factorize(p["country"])[0]})


def predict_B(m, lg_path: pd.Series, urban: pd.Series, anchor_year: int, anchor_epc: float, params=None) -> pd.Series:
    p = m.params if params is None else params
    f = p["lg"] * lg_path + p["lg2"] * lg_path ** 2 + p["urban"] * urban
    return anchor_epc * np.exp(f - f[anchor_year])


def fit_predict_C(df: pd.DataFrame, end: int, years) -> pd.Series:
    y = np.log(df.loc[1990:end, "twh"])
    y.index = pd.RangeIndex(1990, end + 1)
    m = ExponentialSmoothing(y.values, trend="add", damped_trend=True).fit(optimized=True)
    h = int(max(years) - end)
    f = m.forecast(h)
    return pd.Series(np.exp(f), index=np.arange(end + 1, end + h + 1)).reindex(years)


# ------------------------------------------------------------------ backtest
def backtest(df: pd.DataFrame, peers: pd.DataFrame, cut: int = 2014) -> pd.DataFrame:
    """Train on data <= cut, forecast cut+1..2025 using ACTUAL drivers (conditional forecast)."""
    yrs = np.arange(cut, 2026)
    act = df.loc[yrs, "twh"]
    pop = df.loc[yrs, "population"]
    mB = fit_B(peers, cut)
    mA = fit_A(df, cut, mB.params["urban"], mB.bse["urban"])
    epcA = predict_A(mA, df.loc[yrs, "gdp_pc_usd2015"], df.loc[yrs, "urban_pct"], cut, df.loc[cut, "epc"])
    # India Maddison GDPpc only to 2022 -> extend with WB per-capita growth
    lg = india_lg_path(df, peers, yrs)
    epcB = predict_B(mB, lg, df.loc[yrs, "urban_pct"], cut, df.loc[cut, "epc"])
    C = fit_predict_C(df, cut, yrs)
    out = pd.DataFrame({"year": yrs, "actual": act.values,
                        "A_driver": (epcA * pop / 1e9).values,
                        "B_crosscountry": (epcB * pop / 1e9).values,
                        "C_ets": C.values})
    return out[out.year > cut].reset_index(drop=True)


def india_lg_path(df: pd.DataFrame, peers: pd.DataFrame, years) -> pd.Series:
    """ln GDPpc in Maddison units for India: observed to 2022, then chained with WB/scenario growth."""
    ind = peers[peers["country"] == "India"].set_index("year")["lg"]
    last = ind.index.max()
    wb = np.log(df["gdp_pc_usd2015"])
    s = {}
    for y in years:
        s[y] = ind[y] if y in ind.index else ind[last] + (wb[y] - wb[last])
    return pd.Series(s)


def mape(a, f):
    return float(np.mean(np.abs(f - a) / a) * 100)


# ------------------------------------------------------------------ national forecast
def national_paths(df, peers, mA, mB, sc: Scenario, pA=None, pB=None, urb_override=None, pop_mult=None, gdp=None):
    pop = df.loc[YEARS, "population"] * (1 + (sc.pop_mult_2047 - 1 if pop_mult is None else pop_mult - 1)
                                        * (YEARS - BASE_YEAR) / (HORIZON - BASE_YEAR))
    gdp = gdp_path(sc, df.loc[BASE_YEAR, "gdp_usd2015"]) if gdp is None else gdp
    gdppc = gdp / pop
    u25 = df.loc[BASE_YEAR, "urban_pct"]
    u47 = sc.urban_2047 if urb_override is None else urb_override
    un = df.loc[YEARS, "urban_pct"]  # UN path shape, rescaled to hit the scenario 2047 value
    urban = u25 + (un - u25) * (u47 - u25) / (un[HORIZON] - u25)
    epc0 = df.loc[BASE_YEAR, "epc"]
    A = predict_A(mA, gdppc, urban, BASE_YEAR, epc0, pA) * pop / 1e9
    full = pd.concat([df["gdp_pc_usd2015"].loc[:BASE_YEAR - 1], gdppc])
    lg = india_lg_path(pd.DataFrame({"gdp_pc_usd2015": full}), peers, YEARS)
    B = predict_B(mB, lg, urban, BASE_YEAR, epc0, pB) * pop / 1e9
    return A, B, pop, gdppc, urban


def structural_loads(sc: Scenario, scale: float = 1.0) -> pd.DataFrame:
    h2 = ramp(sc.h2_mt_2047 * H2_KWH_PER_KG, 0.0) * scale  # Mt * kWh/kg = TWh
    ev = ramp(sc.ev_twh_2047) * scale / (1 - LOSS)
    dc = ramp(sc.dc_twh_2047) * scale / (1 - LOSS)
    return pd.DataFrame({"green_hydrogen": h2, "e_mobility": ev, "data_centres": dc})


def ensemble(w, A, B, C, A0, B0):
    """Weighted ensemble. The ETS model has no drivers, so it is read as the base-case path and
    scaled by the driver models' relative scenario response: C_sc = C * (A_sc + B_sc) / (A_base + B_base)."""
    Cs = C * (A + B) / (A0 + B0)
    return w["A_driver"] * A + w["B_crosscountry"] * B + w["C_ets"] * Cs


def run_national(df, peers):
    bt = backtest(df, peers)
    errs = {k: mape(bt["actual"], bt[k]) for k in ["A_driver", "B_crosscountry", "C_ets"]}
    inv = {k: 1 / v for k, v in errs.items()}
    w = {k: v / sum(inv.values()) for k, v in inv.items()}
    mB = fit_B(peers, 2022)
    mA = fit_A(df, BASE_YEAR, mB.params["urban"], mB.bse["urban"])
    C = fit_predict_C(df, BASE_YEAR, YEARS)
    C[BASE_YEAR] = df.loc[BASE_YEAR, "twh"]
    A0, B0, *_ = national_paths(df, peers, mA, mB, SCENARIOS["base"])

    rows = []
    for sc in SCENARIOS.values():
        A, B, pop, gdppc, urban = national_paths(df, peers, mA, mB, sc)
        trend = ensemble(w, A, B, C, A0, B0)
        loads = structural_loads(sc)
        total = trend + loads.sum(axis=1)
        for y in YEARS:
            rows.append(dict(scenario=sc.key, year=int(y), A_driver=A[y], B_crosscountry=B[y], C_ets=C[y],
                             trend=trend[y], **{k: loads.loc[y, k] for k in loads}, total=total[y],
                             population=pop[y], gdp_pc_usd2015=gdppc[y], urban_pct=urban[y],
                             kwh_per_capita=total[y] * 1e9 / pop[y]))
    nf = pd.DataFrame(rows)
    meta = dict(weights=w, backtest_mape=errs,
                A_params=mA.params.to_dict(), A_bse=mA.bse.to_dict(), A_r2=mA.rsquared,
                B_params={k: mB.params[k] for k in ["lg", "lg2", "urban"]},
                B_bse={k: mB.bse[k] for k in ["lg", "lg2", "urban"]}, B_r2=mB.rsquared, B_countries=len(PEERS))
    return nf, bt, meta, (mA, mB, C, w)


def monte_carlo(df, peers, models, n=3000, seed=7) -> pd.DataFrame:
    """Joint uncertainty: GDP growth, urbanisation, population, model coefficients, structural loads."""
    mA, mB, C, w = models
    rng = np.random.default_rng(seed)
    base = SCENARIOS["base"]
    kB = ["lg", "lg2", "urban"]
    covB = mB.cov_params().loc[kB, kB].values
    A0, B0, *_ = national_paths(df, peers, mA, mB, base)
    out = np.empty((n, len(YEARS)))
    for i in range(n):
        dg = rng.normal(0, 0.012)  # +-1.2pp sustained growth shock (sd)
        sc = Scenario("mc", "", [(a, b, r + dg) for a, b, r in base.gdp_growth],
                      urban_2047=rng.triangular(39, base.urban_2047, 50), pop_mult_2047=rng.normal(1, 0.025),
                      h2_mt_2047=base.h2_mt_2047, ev_twh_2047=base.ev_twh_2047, dc_twh_2047=base.dc_twh_2047)
        pb = mB.params.copy(); pb[kB] = rng.multivariate_normal(mB.params[kB], covB)
        pa = mA.params.copy(); pa["lg"] = rng.normal(mA.params["lg"], mA.bse["lg"]); pa["u"] = pb["urban"]
        A, B, *_ = national_paths(df, peers, mA, mB, sc, pA=pa, pB=pb)
        trend = ensemble(w, A, B, C, A0, B0)
        loads = structural_loads(sc, scale=rng.uniform(0.3, 1.7)).sum(axis=1)
        out[i] = (trend + loads).values
    q = np.percentile(out, [5, 10, 25, 50, 75, 90, 95], axis=0)
    return pd.DataFrame({"year": YEARS, **{f"p{p}": q[j] for j, p in enumerate([5, 10, 25, 50, 75, 90, 95])}})


# ------------------------------------------------------------------ regional
GSDP_WINDOW = (2015, 2019)  # observed, pre-COVID; 2021-24 in the challenge dataset are imputed
GSDP_DIFF_CAP = 0.015       # max |state - national| per-capita income growth differential, /yr

def state_projections(nf_sc: pd.DataFrame, sc: Scenario) -> pd.DataFrame:
    """Project state population, GSDP per capita and urbanisation to 2047, consistent with national."""
    sd = pd.read_csv(PROC / "state_drivers.csv")
    nat_pop = nf_sc.set_index("year")["population"]
    nat_gdppc = nf_sc.set_index("year")["gdp_pc_usd2015"]
    nat_urb = nf_sc.set_index("year")["urban_pct"]

    # Trends use 2015-2024 only: Telangana exists from 2014 and pre-2014 Andhra Pradesh is the undivided state.
    sd = sd[sd["year"] >= 2015]
    # population: log-share linear trend 2015-2024, slope damped to zero by 2047
    piv = sd.pivot(index="year", columns="state", values="population")
    assert piv.notna().all().all(), f"missing population: {piv.columns[piv.isna().any()].tolist()}"
    share = piv.div(piv.sum(axis=1), axis=0)
    t = share.index.values
    slope = {s: np.polyfit(t, np.log(share[s].values), 1)[0] for s in share}
    last = share.loc[2024]
    rows = {}
    for y in YEARS:
        # integrated damped slope: full slope at 2024 decaying linearly to 0 at 2047
        k = sum(max(0, 1 - (yy - 2024) / (HORIZON - 2024)) for yy in range(2025, y + 1))
        rows[y] = last * np.exp(pd.Series(slope) * k)
    pshare = pd.DataFrame(rows).T
    pshare = pshare.div(pshare.sum(axis=1), axis=0)
    pop = pshare.mul(nat_pop, axis=0)

    # GSDP per capita: relative growth differential vs national, half-life 15y decay.
    # Challenge GSDP is constant 2011-12 prices (national sum matches MoSPI GDP), but 2021-24 are imputed
    # (2022-23 linear, 2024 a uniform -0.2%, no post-COVID rebound) and 2020 is COVID-distorted.
    # So level and differential use the observed pre-COVID window 2015-2019, differential capped at +-1.5%/yr.
    g = sd.pivot(index="year", columns="state", values="gsdp_cr")
    assert g.notna().all().all(), f"missing GSDP: {g.columns[g.isna().any()].tolist()}"
    gpc = g / piv
    nat_g = (g.sum(axis=1) / piv.sum(axis=1))
    g0, g1 = GSDP_WINDOW
    diff = ((np.log(gpc.loc[g1] / gpc.loc[g0]) - np.log(nat_g[g1] / nat_g[g0])) / (g1 - g0)).clip(-GSDP_DIFF_CAP, GSDP_DIFF_CAP)
    rel = {}
    level = gpc.loc[g1] / nat_g[g1]
    for y in YEARS:
        k = sum(0.5 ** ((yy - g1) / 15) for yy in range(g1 + 1, y + 1))
        rel[y] = level * np.exp(diff * k)
    rel = pd.DataFrame(rel).T
    # normalise so population-weighted mean of relative income = 1 (consistency with national)
    rel = rel.div((rel * pshare).sum(axis=1), axis=0)
    gdppc = rel.mul(nat_gdppc, axis=0)

    # urbanisation: logit shift so population-weighted mean matches national path
    u11 = sd.drop_duplicates("state").set_index("state")["urban_pct_2011"] / 100
    logit = np.log(u11 / (1 - u11))
    urb = {}
    for y in YEARS:
        target = nat_urb[y] / 100
        lo, hi = -3.0, 3.0
        for _ in range(60):
            mid = (lo + hi) / 2
            u = 1 / (1 + np.exp(-(logit + mid)))
            if (u * pshare.loc[y, u.index]).sum() < target:
                lo = mid
            else:
                hi = mid
        urb[y] = u * 100
    urb = pd.DataFrame(urb).T

    long = (pop.stack().rename("population").to_frame()
            .join(gdppc.stack().rename("gdppc_rel_usd2015"))
            .join(urb.stack().rename("urban_pct")))
    long.index.names = ["year", "state"]
    long = long.reset_index()
    missing = set(STATES) - set(long["state"])
    assert not missing, f"states dropped from projections: {missing}"
    assert long.notna().all().all()
    return long


def state_base_2025() -> pd.Series:
    """2025 state generation on the national (incl. captive/rooftop) basis: each source's national-minus-grid
    gap is distributed to states pro rata to their grid generation of that source (same rule as optimizer)."""
    sg = pd.read_csv(PROC / "state_generation.csv")
    sg = sg[sg.year == BASE_YEAR].replace({"other_fossil": "gas"})
    grid = sg.groupby(["state", "source"])["gwh"].sum().unstack(fill_value=0) / 1e3
    nat = pd.read_csv(PROC / "national_generation.csv")
    nat = nat[nat.year == BASE_YEAR].replace({"other_fossil": "gas"}).groupby("source")["twh"].sum()
    scaled = grid.copy()
    for s in nat.index:
        scaled[s] = grid[s] * (nat[s] / grid[s].sum())
    return scaled.sum(axis=1).reindex(list(STATES)).fillna(0.0)


def run_regional(nf: pd.DataFrame, meta: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    gen25 = state_base_2025()
    b, c = meta["A_params"]["lg"], meta["A_params"]["u"]
    reg_rows, st_rows = [], []
    for sc in SCENARIOS.values():
        nsc = nf[nf.scenario == sc.key]
        sp = state_projections(nsc, sc)
        sp["region"] = sp["state"].map(lambda s: STATES[s][0])
        base = sp[sp.year == BASE_YEAR].set_index("state")
        sp = sp.join(base[["population", "gdppc_rel_usd2015", "urban_pct"]], on="state", rsuffix="_0")
        sp["driver_growth"] = (sp["population"] / sp["population_0"]
                               * (sp["gdppc_rel_usd2015"] / sp["gdppc_rel_usd2015_0"]) ** b
                               * np.exp(c * (sp["urban_pct"] - sp["urban_pct_0"])))
        sp["gen_unreconciled"] = sp["state"].map(gen25) * sp["driver_growth"]
        nat_tot = nsc.set_index("year")["total"]
        # reconcile: proportional (top-down) so states sum to national; grid-vs-total basis gap
        # (captive generation) is distributed pro rata to grid generation shares (documented assumption)
        sums = sp.groupby("year")["gen_unreconciled"].transform("sum")
        sp["twh"] = sp["gen_unreconciled"] / sums * sp["year"].map(nat_tot)
        sp["scenario"] = sc.key
        st_rows.append(sp)
        r = sp.groupby(["scenario", "year", "region"], as_index=False).agg(
            twh=("twh", "sum"), population=("population", "sum"))
        reg_rows.append(r)
    reg = pd.concat(reg_rows, ignore_index=True)
    reg["kwh_per_capita"] = reg["twh"] * 1e9 / reg["population"]
    st = pd.concat(st_rows, ignore_index=True)
    return reg, st


def regional_backtest() -> pd.DataFrame:
    """Shift-share check on Ember grid data: predict 2024 regional shares from 2019 shares x driver growth
    (actual population/GSDP), compare with naive constant shares."""
    sg = pd.read_csv(PROC / "state_generation.csv")
    sd = pd.read_csv(PROC / "state_drivers.csv").set_index(["state", "year"])
    meta = json.load(open(PROC / "model_meta.json"))
    b, c = meta["A_params"]["lg"], meta["A_params"]["u"]
    g = sg.groupby(["state", "year"])["gwh"].sum().unstack()
    st = [s for s in g.index if (s, 2019) in sd.index]
    grow = pd.Series({s: sd.loc[(s, 2024), "population"] / sd.loc[(s, 2019), "population"]
                      * ((sd.loc[(s, 2023), "gsdp_cr"] / sd.loc[(s, 2023), "population"])
                         / (sd.loc[(s, 2019), "gsdp_cr"] / sd.loc[(s, 2019), "population"])) ** b for s in st})
    pred = g.loc[st, 2019] * grow
    reg = lambda s: s.groupby(s.index.map(lambda x: STATES[x][0])).sum()
    act = reg(g.loc[st, 2024]); act_sh = act / act.sum()
    p_sh = reg(pred); p_sh = p_sh / p_sh.sum()
    n_sh = reg(g.loc[st, 2019]); n_sh = n_sh / n_sh.sum()
    return pd.DataFrame({"actual_share_2024": act_sh, "shift_share_pred": p_sh, "naive_2019_share": n_sh})


def main():
    df = load_national()
    peers = load_peers()
    nf, bt, meta, models = run_national(df, peers)
    nf.to_csv(PROC / "national_forecast.csv", index=False)
    bt.to_csv(PROC / "backtest_national.csv", index=False)
    meta["scenarios"] = {k: asdict(v) for k, v in SCENARIOS.items()}
    meta["loss_factor"] = LOSS
    meta["h2_kwh_per_kg"] = H2_KWH_PER_KG
    json.dump(meta, open(PROC / "model_meta.json", "w"), indent=2, default=float)
    fan = monte_carlo(df, peers, models)
    fan.to_csv(PROC / "national_fan.csv", index=False)
    reg, st = run_regional(nf, meta)
    reg.to_csv(PROC / "regional_forecast.csv", index=False)
    st.to_csv(PROC / "state_forecast.csv", index=False)
    rb = regional_backtest()
    rb.to_csv(PROC / "backtest_regional.csv")

    print("weights", {k: round(v, 3) for k, v in meta["weights"].items()},
          "MAPE", {k: round(v, 2) for k, v in meta["backtest_mape"].items()})
    print("A", {k: round(v, 4) for k, v in meta["A_params"].items()}, "B", {k: round(v, 4) for k, v in meta["B_params"].items()}, "B se", {k: round(v, 4) for k, v in meta["B_bse"].items()})
    p = nf[nf.year.isin([2025, 2030, 2035, 2040, 2047])].pivot(index="year", columns="scenario", values="total")
    print(p.round(0))
    print(nf[nf.year == 2047][["scenario", "A_driver", "B_crosscountry", "C_ets", "trend", "green_hydrogen",
                               "e_mobility", "data_centres", "total", "kwh_per_capita", "gdp_pc_usd2015", "urban_pct"]].round(0).to_string())
    print(fan[fan.year.isin([2030, 2040, 2047])].round(0).to_string())
    print(reg[reg.year == 2047].pivot(index="region", columns="scenario", values="twh").round(0))
    print(rb.round(4))
    mae = lambda col: (rb[col] - rb["actual_share_2024"]).abs().mean() * 100
    print("regional share MAE pp: shift-share", round(mae("shift_share_pred"), 2), "naive", round(mae("naive_2019_share"), 2))


if __name__ == "__main__":
    main()
