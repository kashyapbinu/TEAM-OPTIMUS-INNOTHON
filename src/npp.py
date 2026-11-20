"""National Power Portal (NPP) generation reports -> tidy state x fuel x fiscal-year generation (GWh).

Source: CEA "18-column" monthly generation reports published on https://npp.gov.in/publishedReports
(Sub-report 16: region / state / station-wise detail; Sub-report 2: region summary). The March report of each year
gives cumulative ACTUAL generation for the whole fiscal year (April-March) and the same period of the previous year.

Coverage (stated by CEA in the reports): gross generation of conventional stations above 25 MW - coal, lignite,
gas/liquid fuel, diesel, nuclear, large hydro. Renewable (solar, wind, small hydro, bio) and captive generation
are NOT included. Only GENERATION columns (GWh) are read; capacity (MW), PLF and target columns are ignored.

Run:  python -m src.npp
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from .regions import STATES, canon

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "npp"
OUT = ROOT / "data" / "processed"

COL_NAME = 0  # other columns are located per file (layout changed in 2025: two extra columns)
FUEL_MAP = {"COAL": "coal", "LIGNITE": "coal", "NATURAL GAS": "gas", "LIQUID FUEL": "gas", "NAPTHA": "gas",
            "DIESEL": "gas", "MULTI FUEL": "gas", "HSD": "gas", "NUCLEAR": "nuclear", "HYDRO": "hydro"}
SECTOR_ROWS = re.compile(r"^(STATE SECTOR|PVT SECTOR|PVT\.? ?SECTOR|CENTRAL( SECTOR)?|PRIVATE SECTOR|IPP|"
                         r"PVT UTILITIES?|PVT\. UTILITIES?|PVT SECTOR UTILITIES?)$")
REGION_ROWS = re.compile(r"(NORTHERN|WESTERN|SOUTHERN|EASTERN|NORTH EASTERN|NORTH-EASTERN|ISLANDS?)\s+REGION|BHUTAN|ALL INDIA")
# state names in the CEA report that differ from regions.py names
NPP_ALIAS = {"J & K": "Jammu and Kashmir", "JAMMU & KASHMIR": "Jammu and Kashmir", "JAMMU AND KASHMIR": "Jammu and Kashmir",
             "CENTRAL SECTOR NR": None, "BBMB": "Punjab", "DVC": "Jharkhand", "BHUTAN IMP.": None,
             "ANDAMAN & NICOBAR": "Andaman and Nicobar", "A & N ISLANDS": "Andaman and Nicobar",
             "ANDAMAN NICOBAR": "Andaman and Nicobar", "PONDICHERRY": "Puducherry", "ORISSA": "Odisha",
             "CHATTISGARH": "Chhattisgarh", "CHHATISGARH": "Chhattisgarh", "UTTARANCHAL": "Uttarakhand", "D & N HAVELI": "Dadra and Nagar Haveli and Daman and Diu",
             "DAMAN & DIU": "Dadra and Nagar Haveli and Daman and Diu"}


def _clean(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip().upper() if pd.notna(v) else ""


def _state_name(raw: str) -> str | None:
    raw = raw.rstrip(". ")
    if raw in NPP_ALIAS:
        return NPP_ALIAS[raw]
    try:
        return canon(raw.title().replace(" And ", " and ").replace("&", "and"))
    except Exception:
        return None


def parse_station_report(path: Path) -> tuple[pd.DataFrame, int]:
    """Utility-level rows (one per utility x fuel within a state) with FY actual and previous-FY actual, GWh."""
    x = pd.read_excel(path, header=None, engine="xlrd")
    head = " ".join(_clean(v) for v in x.iloc[:8].values.ravel())
    m = re.search(r"APR[- ]?(\d{4})[- ]?(?:TO[- ]?)?[A-Z]{3}[- ]?(\d{4})", head)
    assert m, f"{path.name}: fiscal-year header not found"
    fy_end = int(m.group(1)) + 1  # FY label = year in which it ends (FY2024-25 -> 2025)
    # FY-cumulative ACTUAL = 2nd column headed exactly "ACTUAL" in the header row; next column = same period last FY
    hdr = [j for j, v in enumerate(x.iloc[8]) if _clean(v) == "ACTUAL"]
    COL_MONTH, COL_FY_ACT = hdr[0], hdr[1]
    COL_FY_PREV = COL_FY_ACT + 1
    assert _clean(x.iat[8, COL_FY_PREV]).startswith("ACTUAL SAME PE"), f"{path.name}: column layout changed"
    # fuel column = the one (1-3) that carries the fuel labels on utility rows
    COL_FUEL = max((1, 2, 3), key=lambda j: x[j].map(_clean).isin(FUEL_MAP).sum())

    rows, state, checks = [], None, []
    for _, r in x.iloc[11:].iterrows():
        name, fuel = _clean(r[COL_NAME]), _clean(r[COL_FUEL])
        if not name or REGION_ROWS.search(name):
            continue
        rest = [v for v in r.iloc[1:] if pd.notna(v)]
        if not rest and not SECTOR_ROWS.match(name):          # header row = state name
            state = name
            continue
        if name.startswith("TOTAL"):
            tgt = re.sub(r"^TOTAL\s+", "", name)
            if state and (tgt == state or tgt.replace(" ", "") == state.replace(" ", "")):
                checks.append((state, float(r[COL_FY_ACT] or 0), float(r[COL_FY_PREV] or 0)))
            continue
        if SECTOR_ROWS.match(name) or not fuel:                 # sector subtotal or station row
            continue
        if fuel not in FUEL_MAP:
            raise ValueError(f"{path.name}: unknown fuel {fuel!r} ({name})")
        rows.append(dict(npp_state=state, utility=name, fuel=fuel, source=FUEL_MAP[fuel],
                         gwh_month=float(r[COL_MONTH] or 0),
                         gwh_fy=float(r[COL_FY_ACT] or 0), gwh_prev=float(r[COL_FY_PREV] or 0)))
    df = pd.DataFrame(rows)
    # every state block must reproduce its own TOTAL row
    tot = df.groupby("npp_state")[["gwh_fy", "gwh_prev"]].sum()
    for st, a, b in checks:
        assert abs(tot.loc[st, "gwh_fy"] - a) < 1.0 and abs(tot.loc[st, "gwh_prev"] - b) < 1.0, (path.name, st, tot.loc[st].tolist(), a, b)
    return df, fy_end


def parse_region_report(path: Path) -> pd.DataFrame:
    """Sub-report 2: region x category (THERMAL / NUCLEAR / HYDRO) FY actual, GWh - used as a control total."""
    x = pd.read_excel(path, header=None, engine="xlrd")
    out, reg = [], None
    for _, r in x.iloc[11:].iterrows():
        a = _clean(r[0])
        if "REGION" in a:
            reg = a.replace(" REGION", "").strip()
            continue
        if a in ("THERMAL", "NUCLEAR", "HYDRO", "TOTAL") and reg and reg not in ("ALL INDIA", "BHUTAN IMP."):
            out.append(dict(npp_region=reg, category=a, gwh_fy=float(r[9])))
    return pd.DataFrame(out)


def build() -> pd.DataFrame:
    frames = []
    for f in sorted(RAW.glob("18_col_act-16_*-MAR.xls")):
        df, fy = parse_station_report(f)
        cur = df.assign(fy=fy, gwh=df.gwh_fy)
        frames.append(cur)
        if fy == min(int(re.search(r"_(\d{4})-MAR", g.name).group(1)) for g in RAW.glob("18_col_act-16_*-MAR.xls")):
            frames.append(df.assign(fy=fy - 1, gwh=df.gwh_prev))   # earliest file also gives the previous FY
        # control: utility rows reproduce the region summary (sub-report 2) of the same file
        reg = parse_region_report(RAW / f.name.replace("-16_", "-2_"))
        tot_reg = reg[reg.category == "TOTAL"].gwh_fy.sum()
        assert abs(df.gwh_fy.sum() - tot_reg) / tot_reg < 0.005, (f.name, df.gwh_fy.sum(), tot_reg)
    t = pd.concat(frames, ignore_index=True)
    t["state"] = t["npp_state"].map(_state_name)
    unmapped = sorted(t.loc[t.state.isna(), "npp_state"].dropna().unique())
    assert not unmapped, f"unmapped NPP state names: {unmapped}"
    t["region"] = t["state"].map(lambda s: STATES[s][0])
    g = t.groupby(["fy", "state", "region", "source"], as_index=False)["gwh"].sum()
    return g


MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()


def build_monthly() -> pd.DataFrame:
    """State x source x calendar month (GWh) from the monthly sub-report 16 files (data/raw/npp/monthly)."""
    frames = []
    for f in sorted((RAW / "monthly").glob("18_col_act-16_*.xls")):
        y, mon = re.search(r"_(\d{4})-([A-Z]{3})\.xls$", f.name).groups()
        df, _ = parse_station_report(f)
        frames.append(df.assign(year=int(y), month=MONTHS.index(mon) + 1, gwh=df.gwh_month))
    t = pd.concat(frames, ignore_index=True)
    t["state"] = t["npp_state"].map(_state_name)
    assert t.state.notna().all(), sorted(t.loc[t.state.isna(), "npp_state"].unique())
    t["region"] = t["state"].map(lambda s: STATES[s][0])
    return t.groupby(["year", "month", "state", "region", "source"], as_index=False)["gwh"].sum()


def reconcile(g: pd.DataFrame) -> pd.DataFrame:
    """NPP vs Ember (state x source x fiscal year) for the sources both publish. Written to npp_vs_ember.csv."""
    from .ingest import _ember, RAW as RAW_ALL
    m = _ember(RAW_ALL / "india_monthly_full_release_long_format.csv", "Date")
    d = pd.to_datetime(m["Date"])
    m = m.assign(fy=d.dt.year + (d.dt.month >= 4), source=m.source.replace({"other_fossil": "gas"}))
    months = m.groupby("fy")["Date"].nunique()
    m = m[m.fy.isin(months[months == 12].index) & m.source.isin(["coal", "gas", "nuclear", "hydro"])]
    e = m.groupby(["fy", "state", "source"])["gwh"].sum()
    n = g.set_index(["fy", "state", "source"])["gwh"]
    j = pd.concat([n, e], axis=1, keys=["npp_gwh", "ember_gwh"]).fillna(0.0)
    j = j[j.index.get_level_values("fy").isin(e.index.get_level_values("fy").unique())].reset_index()
    j["region"] = j["state"].map(lambda s: STATES[s][0])
    j["diff_gwh"] = j.ember_gwh - j.npp_gwh
    return j


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    g = build()
    g.to_csv(OUT / "npp_conventional_state_fy.csv", index=False)
    mo = build_monthly()
    mo.to_csv(OUT / "npp_conventional_state_month.csv", index=False)
    # control: 12 monthly values of each complete fiscal year reproduce the March FY-cumulative report
    mo["fy"] = mo.year + (mo.month >= 4)
    n = mo[["fy", "year", "month"]].drop_duplicates().groupby("fy").size()
    for fy in n[n == 12].index:
        a = mo[mo.fy == fy].groupby("source").gwh.sum()
        b = g[g.fy == fy].groupby("source").gwh.sum()
        dev = ((a - b).abs() / b).max()
        print(f"FY{fy}: sum of monthly vs March cumulative, max deviation by source {dev:.3%}")
        assert dev < 0.01, (fy, a.round(0).to_dict(), b.round(0).to_dict())
    rec = reconcile(g)
    rec.to_csv(OUT / "npp_vs_ember.csv", index=False)
    t = rec.groupby("source")[["npp_gwh", "ember_gwh"]].sum()
    print("Ember / NPP - 1, FY totals over overlap:", ((t.ember_gwh / t.npp_gwh - 1) * 100).round(2).to_dict(),
          "(hydro gap = small hydro < 25 MW, not on NPP)")
    # coal / gas / nuclear must match: guards against the NPP parser silently dropping stations or states
    assert ((t.ember_gwh / t.npp_gwh - 1).abs()[["coal", "nuclear"]] < 0.005).all(), t
    print(g.pivot_table(index="fy", columns="source", values="gwh", aggfunc="sum").div(1e3).round(1))
    print(g.pivot_table(index="fy", columns="region", values="gwh", aggfunc="sum").div(1e3).round(1))


if __name__ == "__main__":
    main()
