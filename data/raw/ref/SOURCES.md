# Reference data sources

Source PDFs ("local copy" below) are not committed to the repository: download them from the listed URLs.
The pipeline reads only the `.csv` tables and `.txt` extracts kept here.

All tables below are capacity-type potentials (MW / GWp). They are used ONLY after conversion to a generation
ceiling (TWh/yr = potential x CUF x 8760) in `src/ingest.py: resource_potential`; they never enter the demand forecast.
Sums are asserted in code.

- **niwe_wind_150m_state.csv** — NIWE "Wind Potential at 150 m agl" report, Table E.1 (state x CUF band, MW).
  https://maps.niwe.res.in/media/150m-report.pdf (local copy `niwe_150m.pdf`, text `niwe_text.txt`). Total 1,163,856 MW.

- **nise_solar_potential.csv**
  - `gwp_2025_ground`: NISE/MNRE, *Solar PV Potential of India (Ground Mounted)*, September 2025, Table 5
    "Statewise ground mounted solar potential", all 35 states/UTs (Lakshadweep not covered). National 3,343.37 GWp DC;
    sum of rounded state values = 3,343.35. Source PDF:
    https://cdnbbsr.s3waas.gov.in/s3716e1b8c6cd17b771da77391355749f3/uploads/2025/09/1759223689.pdf
    (64 MB, not stored; extracted table page in `nise_2025_ground_table5.txt`). The pdftotext layout scrambles the
    area columns but the potential column is in row order; 8 states cross-checked against pv-magazine India (2025-10-06).
  - `floating_gwp_2026`: NISE floating solar report (June 2026), Lok Sabha USQ 471 (22.07.2026), national 102.18 GWp
    (`nise_floating_ls_usq471.pdf/.txt`).
  - The 2014 NISE 748.98 GWp table (Waste Land Atlas 2010) is no longer used. An earlier version of this file carried it
    with only the top-10 states verified; it was dropped once the full 2025 state table was obtained (2026-11-16).

- **cea_hydro_potential_state.csv** — CEA reassessment of hydro potential (2017-23): state-wise *exploitable*
  conventional hydro potential, schemes > 25 MW, as on 30.06.2024. PIB / Ministry of Power parliamentary annexure
  (Aug 2024), Annexure-I: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2024/aug/doc202482363501.pdf
  (local copy `pib_2024_hydro_potential_annex.pdf`). Region subtotals NR 46,971 / WR 7,824 / SR 12,570 / ER 10,115 /
  NER 55,930; all-India 133,410 MW (all reproduced exactly by the CSV). Pumped-storage potential (176,280 MW) is
  storage, not generation, and is excluded. Small hydro (< 25 MW) is not included.
  The annexure's region grouping (Rajasthan NR; MP, Chhattisgarh WR; Sikkim ER) matches `src/regions.py`.
  Replaces the earlier 1978-87 reassessment region split (148,701 MW) whose regional values could not be verified.

- **Census 2011 urban % by state** — Census of India 2011 (via Wikipedia list), stored in `src/regions.py`.

- **niti/** — NITI Aayog, *Scenarios towards Viksit Bharat and Net Zero*, Sectoral Insights (Feb 2026), downloaded
  2026-11-18 with `curl -L -A "Mozilla/5.0"` from https://www.niti.gov.in/sites/default/files/2026-02/
  `Scenarios-Towards-Viksit-Bharat-and-Net-Zero-Sectoral-Insights-{Power_0,Industry,Transport,Buildings}.pdf`
  (landing pages https://www.niti.gov.in/node/2167, /node/2168). `.txt` = `pdftotext -layout` extracts.
  Used only for the size of new loads in `src/forecast.py` SCENARIOS (end-use TWh, never capacity):
  - Power Vol. 7 Ch. 4: transport electricity ~550 TWh (2050 CPS); transport 2.2% of 1,541 TWh in 2024; data centres
    ~400 TWh (2050); generation 7,350-7,700 TWh (2050 CPS) / 9,700-10,200 (NZS) used as an external cross-check only.
  - Transport Vol. 3: transport electricity 47 Mtoe (CPS) / 48 Mtoe (NZS) in 2050.
  - Buildings Vol. 5: data-centre electricity ~10 GW average load in 2030 (= 88 TWh/yr), ~45 GW in 2050, ~700 TWh by 2070.
  - Industry Vol. 6: green H2 8.4 Mt (2050 CPS), 22 Mt (2050 NZS); ~55 MWh electricity per tonne.
- **IEA, Energy and AI (2025)**, Box 2.2: India data centres ~9 TWh in 2024 (search result, not downloaded).
- **Data-centre cross-check (not a model input)** — PIB factsheet "Data Centres in India" (Sept 2026,
  https://www.pib.gov.in/PressReleasePage.aspx?PRID=2309950): 375 MW (2020) -> 1.57 GW (Aug 2026), ~8 GW by 2030;
  CEA ~17 GW and Ministry of Power 13.56 GW data-centre demand by 2031-32 (user-supplied 2026-11-18, PIB figures seen in
  search results). GW figures shown only after conversion to TWh in docs/methodology.md §3.
