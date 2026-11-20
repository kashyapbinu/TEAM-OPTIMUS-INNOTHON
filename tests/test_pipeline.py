"""Consistency and compliance tests on pipeline outputs. Run after ./run_pipeline.sh:  python -m pytest -q"""
import json
import re
from pathlib import Path

import pandas as pd
import pytest

from src import optimize as O
from src.regions import REGIONS, STATES

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
SCENARIOS = ["low", "base", "high"]
BANNED = re.compile(r"installed|capacity|consumption|demand", re.I)


@pytest.fixture(scope="module")
def nat():
    return pd.read_csv(PROC / "national_forecast.csv")


@pytest.fixture(scope="module")
def reg():
    return pd.read_csv(PROC / "regional_forecast.csv")


def test_regions_sum_to_national_every_year(nat, reg):
    r = reg.groupby(["scenario", "year"])["twh"].sum()
    n = nat.set_index(["scenario", "year"])["total"]
    joined = pd.concat([r, n], axis=1, keys=["reg", "nat"]).dropna()
    assert len(joined) == len(n)
    assert (joined["reg"] - joined["nat"]).abs().max() < 1e-6 * joined["nat"].max()


def test_regional_forecast_has_five_regions(reg):
    assert set(reg["region"]) == set(REGIONS) and len(REGIONS) == 5


def test_2025_bau_equals_base_mix(reg):
    base = O.base_mix_2025().sum(axis=1)
    for sc in SCENARIOS:
        r = reg[(reg.scenario == sc) & (reg.year == 2025)].set_index("region")["twh"]
        assert (r.reindex(REGIONS) - base.reindex(REGIONS)).abs().max() < 1e-6


def test_all_36_states_present():
    sf = pd.read_csv(PROC / "state_forecast.csv")
    assert len(STATES) == 36
    for sc in SCENARIOS:
        for y in (2025, 2047):
            got = set(sf[(sf.scenario == sc) & (sf.year == y)]["state"])
            assert got == set(STATES), set(STATES) ^ got


def test_no_capacity_or_consumption_columns_in_outputs():
    for f in PROC.glob("*.csv"):
        cols = pd.read_csv(f, nrows=0).columns
        bad = [c for c in cols if BANNED.search(c)]
        assert not bad, f"{f.name}: {bad}"


def test_raw_reads_restrict_columns():
    """Raw files that contain banned columns must be read with usecols / filtered to generation."""
    ing = (ROOT / "src" / "ingest.py").read_text(encoding="utf8")
    fc = (ROOT / "src" / "forecast.py").read_text(encoding="utf8")
    for src in (ing, fc):
        for m in re.finditer(r'read_csv\(RAW / "(owid-energy-data|renewable_energy_dataset)\.csv"[^)]*\)', src, re.S):
            assert "usecols" in m.group(0), m.group(0)
    assert '"Category"] == "Electricity generation"' in ing and '"Unit"] == "GWh"' in ing


def test_lp_meets_requirement_net_of_vre_loss(nat):
    mix = pd.read_csv(PROC / "generation_mix.csv")
    meta = json.load(open(PROC / "optimizer_meta.json"))
    for (st, sc), d in mix.groupby(["strategy", "scenario"]):
        need = nat[nat.scenario == sc].set_index("year")["total"]
        un = meta["runs"][f"{st}|{sc}"]["unserved_twh"]
        for t in O.MILESTONES:
            g = d[d.year == t].groupby("source")["twh"].sum()
            net = sum(v * (1 - (O.VRE_LOSS[t] if s in O.VRE else 0)) for s, v in g.items())
            assert abs(net + un[str(t)] - need[t]) < 1e-3 * need[t], (st, sc, t)


def test_recommended_plan_has_no_flags():
    run = json.load(open(PROC / "optimizer_meta.json"))["runs"]["balanced|base"]["unserved_twh"]
    assert all(run[str(t)] < 1e-6 for t in O.MILESTONES)
    assert all(v < 1 for v in run["vre_tier2_twh"].values())
    assert all(v < 1 for v in run["coal_over_cap_twh"].values())


def test_resource_potentials_in_twh_only():
    pot = pd.read_csv(PROC / "resource_potential_twh.csv")
    assert list(pot.columns) == ["region", "source", "twh_potential"]
    assert set(pot.source) == {"solar", "wind", "hydro"} and set(pot.region) == set(REGIONS)


def test_sensitivity_all_feasible():
    s = pd.read_csv(PROC / "sensitivity.csv")
    assert "infeasible" not in s.columns and len(s) == 1 + 2 * len(O.SENS_GROUPS)


def test_state_conventional_generation_comes_from_npp():
    """Provided-dataset rule: for 2020-2025 every coal / gas / nuclear GWh at state level is NPP; Ember only for
    sources NPP does not publish (solar, wind, bio, small hydro) and for 2019 (before the NPP archive)."""
    sg = pd.read_csv(PROC / "state_generation.csv")
    recent = sg[sg.year.between(2020, 2025)]
    conv = recent[recent.source.isin(["coal", "gas", "other_fossil", "nuclear"])]
    assert set(conv.dataset) == {"NPP"}, conv.dataset.unique()
    hydro = recent[recent.source == "hydro"]
    assert set(hydro.dataset) <= {"NPP", "Ember (small hydro)"}
    big = hydro.groupby("dataset").gwh.sum()
    assert big["NPP"] > 0.85 * big.sum()
    assert set(recent[recent.source.isin(["solar", "wind", "bio"])].dataset) == {"Ember (RE, not on NPP)"}


def test_npp_matches_ember_where_both_publish():
    rec = pd.read_csv(PROC / "npp_vs_ember.csv")
    t = rec.groupby("source")[["npp_gwh", "ember_gwh"]].sum()
    assert ((t.ember_gwh / t.npp_gwh - 1).abs()[["coal", "nuclear", "gas"]] < 0.005).all()


def test_provided_data_model_leads_the_ensemble(nat):
    """Panel guidance: main prediction from provided data. Model P (NPP + challenge dataset) carries >= 50% weight,
    and the 2025 anchor equals the provided-data grid total (NPP + Ember RE state sum)."""
    meta = json.load(open(PROC / "model_meta.json"))
    w = meta["weights"]
    assert abs(sum(w.values()) - 1) < 1e-9
    assert w["P_provided"] >= 0.5 - 1e-9
    assert w["P_provided"] >= max(v for k, v in w.items() if k != "P_provided")
    assert meta["national_basis"] == "grid"
    sg = pd.read_csv(PROC / "state_generation.csv")
    grid25 = sg.loc[sg.year == 2025, "gwh"].sum() / 1e3
    assert abs(meta["anchor_2025_twh"] - grid25) < 1e-6
    base25 = nat[(nat.scenario == "base") & (nat.year == 2025)]["total"].iloc[0]
    assert abs(base25 - grid25) < 1e-6
    # NPP is the majority of the anchor year
    npp = sg.loc[(sg.year == 2025) & (sg.dataset == "NPP"), "gwh"].sum() / 1e3
    assert npp / grid25 > 0.8
    # Model P is fitted on the provided-data window only
    assert meta["P"]["years"][0] >= 2019 and 0.02 < meta["P"]["slope"] < 0.08
