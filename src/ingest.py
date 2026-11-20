"""Load raw sources -> tidy processed tables in data/processed/.

COMPLIANCE: only electricity GENERATION (GWh/TWh) is read as an energy metric.
Capacity (MW), consumption and demand columns are never loaded.

Run:  python -m src.ingest
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .regions import STATES, URBAN_PCT_2011, ISLANDS, canon

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REF = RAW / "ref"
OUT = ROOT / "data" / "processed"

# Ember fuel -> model source category
EMBER_SOURCE = {
    "Coal": "coal", "Gas": "gas", "Other Fossil": "other_fossil", "Hydro": "hydro",
    "Nuclear": "nuclear", "Solar": "solar", "Wind": "wind",
    "Bioenergy": "bio", "Other Renewables": "bio",
}
# OWID *_electricity (generation, TWh) -> source category. Only generation columns.
OWID_SOURCE = {
    "coal_electricity": "coal", "gas_electricity": "gas", "oil_electricity": "other_fossil",
    "hydro_electricity": "hydro", "nuclear_electricity": "nuclear",
    "solar_electricity": "solar", "wind_electricity": "wind",
    # other_renewable_electricity = bioenergy + other RE; pre-2000 it is not split, so use the total
    "other_renewable_electricity": "bio",
}
SOURCES = ["coal", "gas", "other_fossil", "nuclear", "hydro", "solar", "wind", "bio"]


# ---------------------------------------------------------------- national
def national_generation() -> pd.DataFrame:
    cols = ["year", "electricity_generation", *OWID_SOURCE]
    # usecols: *_consumption / electricity_demand / primary_energy_consumption are never loaded
    o = pd.read_csv(RAW / "owid-energy-data.csv", usecols=["country", *cols])
    o = o[o["country"] == "India"]
    o = o[cols].dropna(subset=["electricity_generation"])
    long = o.melt(id_vars="year", value_vars=list(OWID_SOURCE), var_name="col", value_name="twh")
    long["source"] = long["col"].map(OWID_SOURCE)
    long["twh"] = long["twh"].fillna(0.0)
    nat = long.groupby(["year", "source"], as_index=False)["twh"].sum()
    # residual check: components must add to reported total
    tot = o.set_index("year")["electricity_generation"]
    gap = (nat.groupby("year")["twh"].sum() - tot).abs()
    assert gap.max() < 1.0, f"OWID component sum mismatch {gap.max():.2f} TWh"
    return nat


def wb_series(fname: str) -> pd.Series:
    rows = json.load(open(RAW / fname))[1]
    s = pd.Series({int(r["date"]): r["value"] for r in rows if r["value"] is not None})
    return s.sort_index()


def national_drivers() -> pd.DataFrame:
    """Population (UN WPP 2024: estimates + medium projection), GDP (WB, constant 2015 USD),
    urban share (UN WUP via OWID: estimates + projections)."""
    p = pd.read_csv(RAW / "owid_pop_proj.csv")
    p["population"] = p.iloc[:, 3].fillna(p.iloc[:, 4])
    pop = p.set_index("year")["population"]

    u = pd.read_csv(RAW / "owid_urban-and-rural-population-2050.csv")
    u = u[(u["code"] == "IND") & (u["year"] >= 1950)].set_index("year")
    urban = 100 * u["urban_population"] / (u["urban_population"] + u["rural_population"])
    urban = urban.reindex(range(1950, 2051)).interpolate()

    gdp = wb_series("wb_gdp.json")  # constant 2015 USD
    df = pd.DataFrame({"population": pop, "urban_pct": urban, "gdp_usd2015": gdp})
    df = df.loc[1960:2050]
    df["gdp_pc_usd2015"] = df["gdp_usd2015"] / df["population"]
    df.index.name = "year"
    return df.reset_index()


# ---------------------------------------------------------------- states
def _ember(path: Path, period_col: str) -> pd.DataFrame:
    e = pd.read_csv(path)
    e = e[(e["Category"] == "Electricity generation") & (e["Subcategory"] == "Fuel")
          & (e["Unit"] == "GWh") & (e["State type"] != "total") & (e["State"] != "Others")]
    e = e.assign(state=e["State"].map(canon), source=e["Variable"].map(EMBER_SOURCE))
    assert e["source"].notna().all()
    return e[["state", period_col, "source", "Value"]].rename(columns={"Value": "gwh"})


def state_generation() -> pd.DataFrame:
    y = _ember(RAW / "india_yearly_full_release_long_format.csv", "Year")
    y = y.groupby(["state", "Year", "source"], as_index=False)["gwh"].sum().rename(columns={"Year": "year"})
    y["estimated"] = False

    # 2025: Jan-Nov actual + December estimated as Dec-2024 x (Jan-Nov 2025 / Jan-Nov 2024) per state-source
    m = _ember(RAW / "india_monthly_full_release_long_format.csv", "Date")
    m["year"] = m["Date"].str[:4].astype(int)
    m["month"] = m["Date"].str[5:7].astype(int)
    m = m.groupby(["state", "year", "month", "source"], as_index=False)["gwh"].sum()
    last_month = m.loc[m["year"] == 2025, "month"].max()
    if last_month is not None and last_month < 12:
        key = ["state", "source"]
        ytd25 = m[(m.year == 2025) & (m.month <= last_month)].groupby(key)["gwh"].sum()
        ytd24 = m[(m.year == 2024) & (m.month <= last_month)].groupby(key)["gwh"].sum()
        rest24 = m[(m.year == 2024) & (m.month > last_month)].groupby(key)["gwh"].sum()
        ratio = (ytd25 / ytd24).replace([np.inf, -np.inf], np.nan).clip(0.5, 2.0).fillna(1.0)
        est = (ytd25.add(rest24.mul(ratio, fill_value=0), fill_value=0)).rename("gwh").reset_index()
        est["year"] = 2025
        est["estimated"] = True
        y = pd.concat([y, est[y.columns]], ignore_index=True)
    elif last_month == 12:
        full = m[m.year == 2025].groupby(["state", "source"], as_index=False)["gwh"].sum()
        full["year"], full["estimated"] = 2025, False
        y = pd.concat([y, full[y.columns]], ignore_index=True)

    y["gwh"] = y["gwh"].fillna(0.0)
    y["dataset"] = "Ember"
    y = _npp_overlay(y)
    y["region"] = y["state"].map(lambda s: STATES[s][0])
    return y.sort_values(["state", "year", "source"]).reset_index(drop=True)


NPP_YEARS = range(2020, 2026)  # calendar years fully covered by NPP monthly reports (Jan 2020 - Dec 2025)


def _npp_overlay(y: pd.DataFrame) -> pd.DataFrame:
    """National Power Portal (provided dataset) replaces Ember for every source NPP publishes.

    NPP (CEA monthly reports, src/npp.py) covers coal, lignite, gas/liquid fuel, nuclear and hydro stations > 25 MW,
    by state, from Jul 2019. It does not publish solar, wind, bio or small hydro, so those stay on Ember (which is
    compiled from CEA data; for the overlapping conventional sources Ember == NPP to 0.0%, see npp_vs_ember.csv).
    Small hydro = Ember hydro minus NPP large hydro, per state. 2019 stays Ember (NPP archive starts Jul 2019).
    """
    path = OUT / "npp_conventional_state_month.csv"
    assert path.exists(), "run `python -m src.npp` first"
    n = pd.read_csv(path)
    n = n[n.year.isin(NPP_YEARS)].groupby(["state", "year", "source"], as_index=False)["gwh"].sum()
    assert n.groupby("year").size().min() > 0 and set(n.year) == set(NPP_YEARS)
    keep = ~(y.year.isin(NPP_YEARS) & y.source.isin(["coal", "gas", "other_fossil", "nuclear", "hydro"]))
    eh = y[y.year.isin(NPP_YEARS) & (y.source == "hydro")].set_index(["state", "year"])["gwh"]
    nh = n[n.source == "hydro"].set_index(["state", "year"])["gwh"]
    small = eh.sub(nh, fill_value=0).clip(lower=0).rename("gwh").reset_index()
    small = small.assign(source="hydro", estimated=small.year.map(lambda t: t == 2025), dataset="Ember (small hydro)")
    n = n.assign(estimated=False, dataset="NPP")
    out = pd.concat([y[keep].assign(dataset=lambda d: d.dataset.where(d.year.isin(NPP_YEARS) | (d.year < 2020), d.dataset)),
                     n, small[n.columns]], ignore_index=True)
    out.loc[out.year.isin(NPP_YEARS) & (out.dataset == "Ember"), "dataset"] = "Ember (RE, not on NPP)"
    out.loc[~out.year.isin(NPP_YEARS), "dataset"] = "Ember (pre-NPP archive)"
    return out


def state_drivers() -> pd.DataFrame:
    """Population & GSDP from the challenge's GitHub dataset (non-energy columns only).

    GSDP series has a base-year break in 2011 (2004-05 -> 2011-12 base); only 2011+ is kept.
    Ladakh is split from J&K by its Census 2011 population share (Leh + Kargil = 274,289 of
    12,541,302 = 2.19%); GSDP split at the same share.
    DNH&DD absent from dataset -> imputed from Census 2011 (585,764) at national growth.
    """
    g = pd.read_csv(RAW / "renewable_energy_dataset.csv",
                    usecols=["State", "Year", "Population", "GSDP (crore INR)"])  # NOT Installed-* columns
    g = g.rename(columns={"State": "state", "Year": "year", "Population": "population",
                          "GSDP (crore INR)": "gsdp_cr"})
    g["state"] = g["state"].map(canon)
    g = g[g["year"] >= 2011].copy()

    # Ladakh split
    LA = 274_289 / 12_541_302
    jk = g[g.state == "Jammu and Kashmir"].copy()
    la = jk.copy()
    la["state"] = "Ladakh"
    la[["population", "gsdp_cr"]] *= LA
    g.loc[g.state == "Jammu and Kashmir", ["population", "gsdp_cr"]] *= (1 - LA)
    g = pd.concat([g, la], ignore_index=True)

    # DNH&DD imputation
    nat = g.groupby("year")[["population", "gsdp_cr"]].sum()
    dd = pd.DataFrame({"year": nat.index})
    dd["state"] = "Dadra and Nagar Haveli and Daman and Diu"
    pop11 = 585_764
    dd["population"] = pop11 * nat["population"].values / nat.loc[2011, "population"]
    # GSDP per capita assumed at 1.6x national (industrial UT) - small UT, negligible in totals
    dd["gsdp_cr"] = dd["population"] * 1.6 * (nat["gsdp_cr"] / nat["population"]).values
    g = pd.concat([g, dd[g.columns]], ignore_index=True)

    # Population: smooth obvious reporting glitches (e.g. 2013 national dip) with a rolling median
    g = g.sort_values(["state", "year"])
    g["population"] = g.groupby("state")["population"].transform(
        lambda s: s.rolling(3, center=True, min_periods=1).median())

    g["urban_pct_2011"] = g["state"].map(URBAN_PCT_2011)
    g["region"] = g["state"].map(lambda s: STATES[s][0])
    g["island"] = g["state"].isin(ISLANDS)
    return g.reset_index(drop=True)


# ---------------------------------------------------------------- resource ceilings
def resource_potential() -> pd.DataFrame:
    """Technical GENERATION potential by state & source in TWh/yr.

    Published potentials are in MW/GWp (capacity-type). They are converted here to
    annual energy (TWh) and only the TWh ceiling is used downstream.
    """
    rows = []
    # Wind: NIWE 150 m, per CUF band -> TWh with band mid-point CUF
    w = pd.read_csv(REF / "niwe_wind_150m_state.csv")
    band_cuf = {"mw_cuf25_30": .275, "mw_cuf30_32": .31, "mw_cuf32_35": .335,
                "mw_cuf35_38": .365, "mw_cuf38_40": .39, "mw_cuf40p": .42}
    for _, r in w.iterrows():
        st = canon(r["state"])
        twh = sum(r[c] * cuf * 8760 / 1e6 for c, cuf in band_cuf.items())
        rows.append((st, "wind", "onshore_150m", twh))

    # Solar: NISE (Sept 2025) "Solar PV Potential of India - Ground Mounted", Table 5, all 35
    # states/UTs (national 3,343.37 GWp DC; Lakshadweep not covered) + NISE floating (LS USQ 471, 2026).
    s = pd.read_csv(REF / "nise_solar_potential.csv").fillna(0.0)
    s["state"] = s["state"].map(canon)
    assert s["state"].is_unique and set(s["state"]) <= set(STATES), "solar table state names"
    assert abs(s["gwp_2025_ground"].sum() - 3343.37) < 0.1, s["gwp_2025_ground"].sum()
    assert abs(s["floating_gwp_2026"].sum() - 102.18) < 0.5, s["floating_gwp_2026"].sum()
    # state solar CUF (AC basis, DC/AC 1.3): high-irradiance west/north-west higher
    hi = {"Rajasthan", "Gujarat", "Ladakh", "Maharashtra", "Madhya Pradesh", "Andhra Pradesh",
          "Karnataka", "Telangana", "Tamil Nadu"}
    for _, r in s.iterrows():
        cuf = 0.21 if r["state"] in hi else 0.18
        rows.append((r["state"], "solar", "ground", r["gwp_2025_ground"] * cuf * 8760 / 1e3))
        rows.append((r["state"], "solar", "floating", r["floating_gwp_2026"] * cuf * 8760 / 1e3))
    # Residential rooftop: CEEW (2023) 637 GWp technical potential; state split by population share
    # (proxy for residential roof area - CEEW state table not machine-readable). CUF 0.16.
    sd = state_drivers()
    pop = sd[sd.year == 2024].set_index("state")["population"]
    for st, p in (pop / pop.sum()).items():
        rows.append((st, "solar", "rooftop", 637.0 * p * 0.16 * 8760 / 1e3))
    detail = pd.DataFrame(rows, columns=["state", "source", "component", "twh_potential"])
    detail["region"] = detail["state"].map(lambda x: STATES[x][0])
    detail.to_csv(OUT / "resource_potential_state_twh.csv", index=False)
    pot = detail.groupby(["region", "source"], as_index=False)["twh_potential"].sum()

    # Hydro: CEA reassessment (2017-23) exploitable conventional potential >25 MW, state-wise,
    # as on 30.06.2024 (PIB annexure, Aug 2024). Pumped storage excluded (storage, not generation).
    h = pd.read_csv(REF / "cea_hydro_potential_state.csv")
    h["state"] = h["state"].map(canon)
    assert abs(h["exploitable_mw_gt25"].sum() - 133410) < 1, h["exploitable_mw_gt25"].sum()
    h["region"] = h["state"].map(lambda x: STATES[x][0])
    assert (h["region"] == h["cea_region"]).all(), "CEA region differs from model region map"
    h = h.groupby("region", as_index=False)["exploitable_mw_gt25"].sum()
    # design load factors: CEA design-energy basis (~0.42 national average); South calibrated to 2025 output
    lf = {"North": .45, "West": .30, "South": .40, "East": .40, "North-East": .45}
    h["twh_potential"] = h.apply(lambda r: r["exploitable_mw_gt25"] * lf[r["region"]] * 8760 / 1e6, axis=1)
    h["source"] = "hydro"
    pot = pd.concat([pot, h[["region", "source", "twh_potential"]]], ignore_index=True)
    return pot


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    nat = national_generation()
    nat.to_csv(OUT / "national_generation.csv", index=False)
    nd = national_drivers()
    nd.to_csv(OUT / "national_drivers.csv", index=False)
    sg = state_generation()
    sg.to_csv(OUT / "state_generation.csv", index=False)
    sd = state_drivers()
    sd.to_csv(OUT / "state_drivers.csv", index=False)
    pot = resource_potential()
    pot.to_csv(OUT / "resource_potential_twh.csv", index=False)

    # ---- report
    print("national TWh:", nat.groupby("year")["twh"].sum().loc[[1990, 2010, 2024, 2025]].round(0).to_dict())
    reg = sg.groupby(["year", "region"])["gwh"].sum().unstack() / 1e3
    print("regional TWh (Ember grid basis):\n", reg.round(0))
    print("state drivers years:", sd.year.min(), sd.year.max(), "states:", sd.state.nunique())
    missing = set(STATES) - set(sd.state)
    print("states missing drivers:", missing or "none")
    print(pot.pivot(index="region", columns="source", values="twh_potential").round(0))


if __name__ == "__main__":
    main()
