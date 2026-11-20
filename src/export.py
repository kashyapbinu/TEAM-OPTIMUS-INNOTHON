"""Bundle processed outputs into dashboard/public/data/dashboard.json.

Run order:  python -m src.ingest && python -m src.forecast && python -m src.optimize && python -m src.export
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .regions import STATES, REGIONS, ISLANDS
from . import forecast as F

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
OUT = ROOT / "dashboard" / "public" / "data"


def recs(df: pd.DataFrame, nd: int = 3):
    return json.loads(df.round(nd).to_json(orient="records"))


def calculator_block(meta: dict) -> dict:
    """Everything the browser needs to re-run the national model for user-chosen drivers."""
    df = F.load_national()
    peers = F.load_peers()
    nf = pd.read_csv(PROC / "national_forecast.csv")
    base = nf[nf.scenario == "base"].set_index("year")
    ind = peers[peers["country"] == "India"].set_index("year")["lg"]
    last = int(ind.index.max())
    return dict(
        years=F.YEARS.tolist(),
        epc0=float(df.loc[F.BASE_YEAR, "epc"]),
        gdp0_usd2015=float(df.loc[F.BASE_YEAR, "gdp_usd2015"]),
        pop_un=[float(df.loc[y, "population"]) for y in F.YEARS],
        urban_un=[float(df.loc[y, "urban_pct"]) for y in F.YEARS],
        # Maddison anchor: lg(y) = lg_anchor + ln(gdppc_wb(y)) - ln(gdppc_wb(anchor_year))
        lg_anchor=float(ind[last]), lg_anchor_year=last,
        gdppc_wb_anchor=float(df.loc[last, "gdp_pc_usd2015"]),
        A=meta["A_params"], B=meta["B_params"], weights=meta["weights"],
        C_path=base["C_ets"].tolist(), P_path=base["P_provided"].tolist(),
        AB_base=(base["A_driver"] + base["B_crosscountry"]).tolist(),
        loss=F.LOSS, h2_kwh_per_kg=F.H2_KWH_PER_KG,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = json.load(open(PROC / "model_meta.json"))
    ometa = json.load(open(PROC / "optimizer_meta.json"))

    nat_hist = pd.read_csv(PROC / "national_generation.csv")
    nat_hist = nat_hist[nat_hist.year >= 1990].pivot(index="year", columns="source", values="twh").fillna(0)
    nat_hist["total"] = nat_hist.sum(axis=1)  # OWID incl. captive (supporting literature)
    nat_hist = nat_hist.reset_index()
    # grid basis actual (provided data: NPP + Ember RE), the series the forecast is anchored on
    grid = pd.read_csv(PROC / "state_generation.csv").groupby("year")["gwh"].sum() / 1e3
    nat_hist["grid"] = nat_hist["year"].map(grid)

    drivers = pd.read_csv(PROC / "national_drivers.csv")
    drivers = drivers[(drivers.year >= 1990) & (drivers.year <= 2025)]

    sg = pd.read_csv(PROC / "state_generation.csv")
    reg_hist = sg.groupby(["year", "region", "source"], as_index=False)["gwh"].sum()
    reg_hist["twh"] = reg_hist["gwh"] / 1e3
    st_hist = sg.groupby(["year", "state", "region"], as_index=False)["gwh"].sum()
    st_hist["twh"] = st_hist["gwh"] / 1e3

    nf = pd.read_csv(PROC / "national_forecast.csv")
    fan = pd.read_csv(PROC / "national_fan.csv")
    rf = pd.read_csv(PROC / "regional_forecast.csv")
    sf = pd.read_csv(PROC / "state_forecast.csv")
    sf = sf[sf.year.isin([2025, 2030, 2035, 2040, 2047])][
        ["scenario", "year", "state", "region", "twh", "population", "urban_pct", "gdppc_rel_usd2015"]]
    mix = pd.read_csv(PROC / "generation_mix.csv")
    summ = pd.read_csv(PROC / "mix_summary.csv")
    pot = pd.read_csv(PROC / "resource_potential_twh.csv")
    pot_st = pd.read_csv(PROC / "resource_potential_state_twh.csv")
    sens = pd.read_csv(PROC / "sensitivity.csv")
    assert "infeasible" not in sens.columns, "a sensitivity run was infeasible"
    bt = pd.read_csv(PROC / "backtest_national.csv")
    rbt = pd.read_csv(PROC / "backtest_regional.csv").rename(columns={"state": "region"})

    sdrv = pd.read_csv(PROC / "state_drivers.csv")
    sdrv = sdrv[sdrv.year == 2024][["state", "region", "population", "gsdp_cr", "urban_pct_2011"]]

    states = [dict(name=s, region=r, code=c, island=s in ISLANDS) for s, (r, c) in STATES.items()]

    strategies = {k: dict(label=v["label"], desc=v["desc"],
                          carbon=v["carbon"], vre_max=v["vre_max"], solar_max=v["solar_max"],
                          nuclear_max=v["nuclear_max"], coal_cap=v["coal_cap"], coal_survival=v["coal_survival"])
                  for k, v in ometa["strategies"].items()}
    runs = {}
    for key, r in ometa["runs"].items():
        un = {k: v for k, v in r["unserved_twh"].items() if k.isdigit()}
        runs[key] = dict(unserved=un, vre_tier2=r["unserved_twh"]["vre_tier2_twh"],
                         coal_over=r["unserved_twh"]["coal_over_cap_twh"],
                         self_shortfall=r["unserved_twh"]["self_shortfall_twh"],
                         marginal_cost=r["marginal_cost_rs_kwh"])

    bundle = dict(
        generated=str(date.today()),
        regions=REGIONS, states=states,
        scenarios={k: dict(label=v["label"], notes=v["notes"], gdp_growth=v["gdp_growth"], urban_2047=v["urban_2047"],
                           pop_mult_2047=v["pop_mult_2047"], h2_mt_2047=v["h2_mt_2047"],
                           ev_twh_2047=v["ev_twh_2047"], dc_twh_2047=v["dc_twh_2047"])
                   for k, v in meta["scenarios"].items()},
        strategies=strategies, runs=runs,
        model=dict(weights=meta["weights"], backtest_mape=meta["backtest_mape"], A=meta["A_params"],
                   A_bse=meta["A_bse"], A_r2=meta["A_r2"], B=meta["B_params"], B_bse=meta["B_bse"],
                   B_r2=meta["B_r2"], B_countries=meta["B_countries"], P=meta["P"], P_weight=meta["P_weight"],
                   national_basis=meta["national_basis"], anchor_2025_twh=meta["anchor_2025_twh"], captive=meta["captive"]),
        optimizer=dict(lcoe=ometa["lcoe"], ef=ometa["ef"], wheeling=ometa["wheeling"], firming=ometa["firming"],
                       vre_free=ometa["vre_free"], self_target=ometa["self_target"], self_floor=ometa["self_floor"],
                       export_max=ometa["export_max"], nuclear_site_share=ometa["nuclear_site_share"],
                       solar_share=ometa["solar_share"], wind_share=ometa["wind_share"],
                       hydro_dev=ometa["hydro_dev"], build=ometa["build"], committed=ometa["committed"]),
        history=dict(national=recs(nat_hist), drivers=recs(drivers, 4), regional=recs(reg_hist[["year", "region", "source", "twh"]]),
                     states=recs(st_hist[["year", "state", "region", "twh"]])),
        forecast=dict(national=recs(nf), fan=recs(fan), regional=recs(rf), states=recs(sf, 4)),
        strategy=dict(mix=recs(mix), summary=recs(summ)),
        potential=dict(region=recs(pot), state=recs(pot_st)),
        backtest=dict(national=recs(bt), regional=recs(rbt, 4)),
        sensitivity=recs(sens, 4),
        state_drivers_2024=recs(sdrv, 2),
        calculator=calculator_block(meta),
    )
    path = OUT / "dashboard.json"
    json.dump(bundle, open(path, "w"), separators=(",", ":"), default=float)
    print(f"wrote {path} ({path.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
