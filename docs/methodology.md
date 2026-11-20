# Methodology

## 1. Compliance with the "generation only" rule
- **Metric.** Annual electricity generation (GWh/TWh) is the only energy quantity forecast or compared.
- **Challenge dataset** (`chrisjaimyantony/renewable-india-dataset`): its energy columns are `Installed - *` (MW), i.e.
  capacity, so they are **not loaded**. Only `State, Year, Zone, Population, GSDP` are used (`src/ingest.py: state_drivers`).
- **Ember files** also carry `Capacity` and `Power sector emissions` rows. These are filtered to
  `Category == "Electricity generation"` and `Unit == "GWh"`. Emissions rows are used only to derive tCO₂/MWh factors.
- **OWID**: only `*_electricity` and `electricity_generation` columns are loaded (`usecols`). `*_consumption` and
  `electricity_demand` are never read.
- **NPP** (`src/npp.py`): only station/utility name, fuel and the GENERATION (GWh) "ACTUAL" columns of the CEA reports are
  read. Monitored capacity (MW), target and PLF columns are ignored. The NPP map dashboard (installed capacity) is not used.

## 1b. Provided datasets vs supporting literature
The kickoff rule is that core energy prediction uses the two provided datasets. How each input maps to it:
- **Provided dataset 1 - National Power Portal:** all state × fuel generation NPP publishes (coal, lignite, gas, nuclear,
  large hydro, 2020–2025). This is the regional base and history.
- **Provided dataset 2 - Renewable India (GitHub):** state population and GSDP (its energy columns are capacity, not used).
- **Gaps in the provided data, filled from published statistics, each disclosed:**
  (a) solar, wind, bio and small-hydro generation by state (not published on NPP): Ember India, which is compiled from
  CEA data and equals NPP to 0.0% wherever both publish; (b) captive generation and the 1985–2025 national history
  needed to estimate growth relationships: Energy Institute Statistical Review / Ember via OWID; (c) drivers and
  cross-country saturation curve: UN WPP/WUP, World Bank, Maddison. These are used as "public literature informing growth
  rates", which the kickoff explicitly allows. Pending mentor confirmation (see CLAUDE.md N4).
- **Resource potentials** are published as MW/GWp. They are converted to a **generation ceiling** (TWh/yr = potential ×
  CUF × 8,760) in `ingest.resource_potential` and enter only the supply optimiser, never the demand forecast.

## 2. Data
| Source | Use |
|---|---|
| **National Power Portal** (provided dataset; CEA monthly generation reports, Jul 2019–Dec 2025) | State × fuel generation for coal, lignite, gas, nuclear, large hydro, 2020–2025 (`src/npp.py`). NPP publishes no RE / small hydro / captive |
| Ember India electricity data (state × fuel, 2019–Nov 2025) | Only what NPP does not publish: solar, wind, bio, small hydro (Dec-2025 RE estimated), and 2019. Equals NPP to 0.0% where both publish (`npp_vs_ember.csv`) |
| OWID energy dataset (Ember / Energy Institute) | India generation by source 1985–2025; 41-country peer panel (generation, Maddison GDP) |
| UN WPP 2024 (medium) | National population to 2047 (1.667 bn) |
| UN WUP (via OWID) | Urban share: national path to 2050; peer panel |
| World Bank WDI | India real GDP (constant 2015 USD) |
| Challenge dataset | State population (2015–24) & GSDP (constant 2011-12 prices; 2015–19 used, later years imputed) |
| Census 2011 | State urban share |
| NIWE 150 m atlas; NISE ground-mounted (Sept 2025, Table 5, all states) and floating (2026); CEEW rooftop (2023); CEA hydro reassessment 2017–23 (state-wise, PIB Aug 2024) | Resource generation ceilings (TWh/yr): solar ≈7,070, wind ≈3,090, hydro ≈506 |

**Two bases.** National = total generation incl. captive (2,082 TWh in 2025). State data (NPP + Ember RE) covers utility
generation (1,829 TWh in 2025: NPP 1,530, RE 286, small hydro 13). For each source, the national-minus-grid gap (captive coal ≈ 200 TWh, rooftop solar ≈ 34 TWh, gas, bio) is
allocated to states pro rata to their grid generation of that source. The 2025 regional base therefore sums exactly to the national total.

## 3. National forecast (`src/forecast.py`)
Per-capita generation `E = TWh / population`.

| Model | Specification | Fit | Backtest MAPE 2015–25 | Weight |
|---|---|---|---|---|
| A Driver regression | ln E = a + β ln(GDP/cap) + γ·Urban%, India 2000–2025; γ fixed from panel | β = 0.708 (se 0.017), R² 0.991 | **2.1%** | 62% |
| B Cross-country curve | ln E = αᵢ + τₜ + b₁ ln y + b₂ (ln y)² + γ·Urban%, 41 economies 1985–2022 | b₁ 4.01, b₂ −0.173, γ 0.0225 (se 0.0051) | 11.3% | 12% |
| C Damped-trend ETS | on ln(total), 1990–2025 | — | 5.0% | 26% |

- **Why γ is fixed.** In India's time series urbanisation and income trend together. A free γ came out at 0.053/pp and
  inflated the High scenario implausibly. The panel with country and year fixed effects identifies γ = 0.0225/pp.
- **Backtest.** Train on data ≤2014, forecast 2015–2025 with realised drivers. Weights are inverse MAPE.
- **Scenario response of C.** C has no drivers, so in scenarios it is scaled by (A+B)/(A+B)base.
- **Structural loads** absent from history, added explicitly and grossed up for 12% losses where end-use:
  green hydrogen (Mt × 55 kWh/kg), incremental e-mobility, incremental data centres. They follow a logistic adoption ramp centred on 2036.
  Sizes come from NITI Aayog, *Scenarios towards Viksit Bharat and Net Zero* (Feb 2026; Vol. 3 Transport, 5 Buildings, 6 Industry,
  7 Power; files in `data/raw/ref/niti/`): transport electricity 34 TWh (2024) → ~550 TWh (2050 CPS); data centres ~88 TWh (2030)
  → ~400 TWh (2050); green H₂ 5 Mt (2030, NGHM) → 8.4 Mt (2050 CPS) / 22 Mt (2050 NZS). Values are interpolated log-linearly:
  Base = 2047 point; Low = 2042 point (5-year delay); High = 2050 level reached in 2047 (NZS for H₂ and transport). EV and data
  centres are counted *beyond trend*: the 2024 load (transport 34, data centres 9 TWh per IEA) grown with the ensemble trend is
  subtracted, because it is already inside the history the models were fitted on. Result (end-use, Low/Base/High): EV 155/305/425,
  data centres 195/295/365 TWh; H₂ 6.8/7.8/22 Mt.
  *Data-centre cross-check (official, converted to TWh at 70–100% utilisation × 8,760 h; never used as an input):* PIB/MeitY
  factsheet (Sept 2026): 1.57 GW installed Aug 2026, ~8 GW by 2030 ≈ 50–60 TWh; Ministry of Power 13.56 GW and CEA 17 GW
  demand in 2031-32 ≈ 100–150 TWh. Our NITI-based path gives 88 TWh (2030) and ~102 TWh (2032), inside the official range.
- **External cross-check.** NITI Aayog projects 7,350–7,700 TWh of generation in 2050 (Current Policy) and 9,700–10,200 TWh
  (Net Zero). Our Base 2047 (6,843 TWh) continued at ~4%/yr reaches ~7,700 TWh in 2050, at the top of the NITI CPS range.
- **Monte Carlo** (3,000 draws): GDP growth shock σ 1.2 pp, urban 2047 triangular (39, 42.2, 50), population σ 2.5%,
  coefficient covariance (A and B), structural-load scale U(0.3, 1.7).

| 2047 | Low | Base | High |
|---|---|---|---|
| Real GDP growth (26-30/31-40/41-47) | 5.5/5.0/4.0% | 6.5/6.0/5.0% | 7.5/7.5/6.5% |
| Urban share | 40% | 42.2% | 50% |
| Green H₂ | 6.8 Mt | 7.8 Mt | 22 Mt |
| Trend generation | 4,719 | 5,732 | 8,280 TWh |
| + structural loads (H₂ + EV + data centres) | 772 | 1,111 | 2,108 TWh |
| **Total** | **5,490** | **6,843** | **10,388 TWh** |

## 4. Regional forecast
Five CEA grid regions. Island UTs (A&N → East, Lakshadweep → South) are flagged as off-grid.
1. **State drivers to 2047.** Population shares follow a log-linear 2015–24 trend damped to zero by 2047, times the UN total.
   GSDP per capita growth differentials vs national (2015–19) decay with a 15-year half-life, capped at ±1.5%/yr, and are
   normalised so that the population-weighted mean equals the national figure.
   *GSDP check.* The challenge dataset's GSDP is at constant 2011-12 prices: its national sum matches MoSPI real GDP
   (2019: ₹146.7 vs ≈₹145 lakh crore). But its 2021–24 values are imputed (2022–23 are exact linear extrapolations for
   most states, 2024 is a uniform −0.2%, there is no post-COVID rebound) and 2020 is COVID-distorted. Level and growth
   differential therefore use the observed 2015–19 window only. The ±1.5%/yr cap stops noisy 4-year differentials
   compounding for 22 years (e.g. it prevents Uttar Pradesh's income from falling to 0.3× the national average).
   An official RBI/MoSPI state series could not be downloaded in this environment; the cap limits the exposure. Urban share is Census 2011 logit-shifted each year so the
   population-weighted mean matches the national path.
2. **Shift-share.** gen_s(t) = gen_s(2025) × Pop ratio × (GSDP/cap ratio)^β × e^{γ·ΔUrban}.
3. **Reconciliation.** Proportional (top-down), so states sum to the national forecast in every year.
4. **Validation.** Predicting 2024 regional shares from 2019: shift-share MAE 0.68 pp, the same as constant shares. This is reported honestly:
   over 5 years plant siting dominates. The regional figures are therefore a **BAU production path**, and the optimiser decides
   where production should go.

## 5. Generation-mix optimiser (`src/optimize.py`)
Linear programme (PuLP/CBC). Variables are G[region, source, year] in TWh for 2030, 2035, 2040 and 2047.

**Objective.** Σ years × [LCOE(region, source, year) + carbon price × EF + wheeling on re-allocated production + firming adder on
VRE above 35% + storage tier-2 cost + coal-cap penalty + self-reliance shortfall penalty].

**Constraints**
- National generation (VRE net of 2–5% storage/curtailment loss) equals the forecast requirement.
- Regional production between 45% (hard) / 70% (soft) and 150% of BAU (NE: 300%, hydro export hub).
- Resource ceilings: solar ≤ 8→44%, wind ≤ 6→35% of technical TWh potential; hydro ≤ existing + 15→65% of undeveloped potential (NE at 0.6×).
- Build rate (national TWh/yr increment): solar 110→200, wind 40→80, hydro 8→14, coal 60→0. Scaled with demand in Low/High.
- Committed pipeline (units under construction): nuclear ≥ 85 / 110 TWh, hydro ≥ 205 / 225 TWh (2030 / 2035). These override the strategy nuclear ceiling and the build-rate limit.
- No-regret: solar, wind, hydro, nuclear and bio output never falls.
- Coal: regional fleet-survival floor; national cap (Balanced 1,750 / 1,900 / 1,900 / 1,650 TWh); growth only in pithead regions (East/West); no increase after 2040.
- Balancing: national VRE ≤ strategy limit (+10 pp at extra cost), solar ≤ separate limit, regional VRE ≤ 75%.
- Gas between 40 TWh and its import-limited cap. Bio ≤ feedstock cap.

| Strategy | Carbon ₹/t 2047 | VRE limit 2047 | Nuclear 2047 | Coal retained 2047 |
|---|---|---|---|---|
| Balanced (recommended) | 2,500 | 61% (solar ≤45%) | ≤700 TWh | ≥50% |
| Accelerated | 6,000 | 65% | ≤700 TWh | ≥30% |
| Energy-security | 800 | 48% | ≤450 TWh | ≥70% |

Every strategy × demand run is solved. Exceedances are reported, not hidden. The recommended Balanced × Base plan uses no
tier-2 storage, breaches no cap and has no unserved energy. Energy-security has a 2047 gap of 47 TWh (0.7%, Base) and 804 TWh
(7.7%, High); the others report storage-tier VRE or coal-cap breaches where demand outruns the strategy's limits (High demand
breaches the coal cap in every strategy).

**Coal trajectory (Balanced/Base).** 1,474 → 1,724 → 1,900 → 1,900 → 1,650 TWh (2025/30/35/40/47): a peak by 2035, plateau,
then decline. Justification: 2025–35 requirement growth (~1,800 TWh) exceeds what clean sources can add (~1,450 TWh), which is limited by
how fast resource sites can be developed (developable-share path) and by grid-balancing limits, not by build rate (the
sensitivity shows build-rate limits are not binding); the fleet is young (median age < 15 y) with units under construction to ~2032; India's target is
net zero by 2070. Power-sector CO₂ peaks 2035–40 (1,235 Mt in 2025 → 1,578 → 1,587 → 1,407 Mt in 2047). Absolute emissions in 2047
are therefore still 14% above 2025 while generation rises 3.3× and intensity falls 66% (Accelerated: +12%; Energy-security: +37%).

**Sensitivity (`data/processed/sensitivity.csv`, Method tab).** Balanced/Base re-solved with each analyst assumption group at
−20% and +20%: LCOE (solar, wind, nuclear, coal), storage/firming cost, build-rate limits, committed additions, developable
resource share, and new loads (H₂, EV, data centres). Cost assumptions move average system cost by ₹0.05–0.36/kWh but
hardly change the 2047 mix: the plan is set by resource, balancing and policy limits. The binding risk is resource development:
at −20% developable share the 2047 plan is short by ~470 TWh (7%) unless coal or nuclear limits are relaxed.

## 6. Key uncertainties
See the dashboard's Method tab. In short: GDP growth dominates (±1.2 pp ≈ ±15–20% in 2047). New loads have no history.
The regional split relies on 7 years of state data. Captive generation is allocated pro rata. Potentials come from atlases.
There is no hourly dispatch.
