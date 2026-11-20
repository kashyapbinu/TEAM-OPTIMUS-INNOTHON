# India Electricity Generation 2047 — Forecast & Regional Strategy

ExxonMobil Innothon entry: forecasting India's energy **production (generation)** requirement for 2047,
nationally and by grid region, and an optimised region-specific generation mix to fulfil it.

> **Compliance:** every energy quantity used for forecasting or comparison is electricity **generated** (TWh).
> No installed-capacity or consumption data enters the forecast. See `docs/methodology.md` §1.
>
> **Provided datasets:** National Power Portal generation reports (state × fuel, `src/npp.py`) and the Renewable India
> dataset (population, GSDP). Other sources fill documented gaps only (`docs/methodology.md` §1b).

## Headline results (Base demand, Balanced strategy)

Basis: **grid generation** (NPP + Ember solar/wind/bio). Ensemble: **50% Model P** (fitted only on the provided datasets)
+ 50% literature models A/B/C. Baseline before this change (OWID basis, A/B/C only) is tagged `baseline-abc`.

| | 2025 | 2047 |
|---|---|---|
| National generation requirement (grid) | 1,829 TWh | **6,621 TWh** (P10–P90: 5,467–8,698) |
| Generation per person | 1,249 kWh | 3,973 kWh |
| Clean share of generation | 28% | 77% |
| Grid carbon intensity | 583 g/kWh | 183 g/kWh |
| Low / High scenario | | 5,332 / 9,984 TWh |
| Captive generation (outside grid basis, literature) | 253 TWh | ~377 TWh at 2019–25 trend |
| Cross-check: NITI Aayog (Feb 2026) | | 7,350–7,700 TWh in **2050** (Current Policy, incl. captive) |

## Repository

```
data/raw/            downloaded sources (untouched) + ref/ resource-potential tables with SOURCES.md
data/processed/      model outputs (CSV/JSON)
src/                 Python pipeline
  regions.py         state -> grid-region map, Census 2011 urbanisation
  npp.py             National Power Portal (CEA) generation reports -> state x fuel x month
  ingest.py          clean sources; NPP overlay; resource potentials converted to TWh
  forecast.py        national ensemble (P provided-data + A/B/C literature), backtest, Monte Carlo, regional shift-share
  optimize.py        generation-mix linear programme (3 strategies x 3 demand scenarios)
  export.py          dashboard/public/data/dashboard.json
dashboard/           React + TypeScript + Recharts (Vite) interactive dashboard
docs/                methodology.md, regional_strategy.md
```

## Reproduce

```bash
pip install -r requirements.txt
./run_pipeline.sh            # ingest -> forecast -> optimise -> export -> JS/Python model parity check

cd dashboard
npm install
npm run dev                  # http://localhost:5173
npm run build                # static site in dashboard/dist (open via any static server)
```

Dashboard URL options: `?theme=light|dark`, and tabs by hash (`#overview`, `#regional`, `#strategy`,
`#profiles`, `#whatif`, `#method`).

## Documents
- `docs/methodology.md`: data, models, validation, assumptions, uncertainties
- `docs/regional_strategy.md`: region-by-region generation mix and its justification
