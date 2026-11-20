# National Power Portal (NPP) - provided dataset

Link given in the problem statement: https://npp.gov.in/dashBoard/cp-map-dashboard
That dashboard page shows INSTALLED CAPACITY (banned) and is not used. Its JSON endpoint (`/dashBoard/getAllZone`)
returns capacity only. Generation data comes from the NPP "Published Reports" page:
https://npp.gov.in/publishedReports  -> "Monthly Reports ACTUAL" (CEA Operation Performance Monitoring Division,
18-column energy-wise performance reports). Downloaded 2026-11-16/17 with `curl -L -A "Mozilla/5.0"`.

| File pattern | Content | Used |
|---|---|---|
| `18_col_act-16_<YYYY>-MAR.xls` (2020-2026) | Sub-report 16: region / state / station-wise generation; March = full fiscal-year cumulative (Apr-Mar) + previous FY | FY totals FY2018-19 .. FY2025-26; control for monthly files |
| `18_col_act-2_<YYYY>-MAR.xls` | Sub-report 2: region summary | Control total for the station parse (< 0.5%) |
| `18_col_act-1_<YYYY>-MAR.xls` | Sub-report 1: all-India summary | Not parsed (kept for reference) |
| `monthly/18_col_act-16_<YYYY>-<MON>.xls` (Jul 2019 - Dec 2025, 78 files) | Same as sub-report 16, monthly | Calendar-year state x fuel generation 2020-2025 |

URL pattern: `https://npp.gov.in/public-reports/cea/monthly/generation/18_col_act/<YYYY>/<MON>/18_col_act-<n>_<YYYY>-<MON>.xls`
(`monthly/urls.txt` lists every monthly URL requested; Apr-Jun 2019 return 404 - archive starts Jul 2019.)

Columns read: station/utility name, fuel, and the GENERATION (GWh) "ACTUAL" columns only. Monitored capacity (MW),
programme/target and PLF columns are never read (`src/npp.py`).

Coverage, as stated by CEA in the reports: "Actual generation is gross generation from stations above 25 MW. It excludes
generation from RES." i.e. coal, lignite, gas/liquid fuel/diesel/naphtha, nuclear, large hydro. Solar, wind, bio and small
hydro are not published on NPP; captive plants are not covered.

Checks (asserted in `src/npp.py`):
- every state block sums to its own "TOTAL <state>" row;
- station rows reproduce the region summary (sub-report 2) of the same month;
- the 12 monthly values of each complete fiscal year (FY2020-21 .. FY2024-25) equal the March cumulative report (0.000%);
- coal and nuclear equal Ember India (state x fiscal year) to < 0.5% -> Ember's state data for these sources is CEA/NPP data.
  Hydro: Ember is 6.9% higher = small hydro (< 25 MW), which NPP excludes.
