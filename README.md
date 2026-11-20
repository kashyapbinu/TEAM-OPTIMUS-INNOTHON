# India Electricity Generation 2047 — Forecast & Regional Strategy

ExxonMobil Innothon entry: forecasting India's energy **production (generation)** requirement for 2047,
nationally and by grid region, and an optimised region-specific generation mix to fulfil it.

> **Compliance:** every energy quantity used for forecasting or comparison is electricity **generated** (TWh).
> No installed-capacity or consumption data enters the forecast. See `docs/methodology.md` §1.
>
> **Provided datasets:** National Power Portal generation reports (state × fuel, `src/npp.py`) and the Renewable India
> dataset (population, GSDP). Other sources fill documented gaps only (`docs/methodology.md` §1b).

## Headline results (Base demand, Balanced strategy)

| | 2025 | 2047 |
|---|---|---|
| National generation requirement | 2,082 TWh | **6,843 TWh** (P10–P90: 5,647–8,736) |
| Generation per person | 1,422 kWh | 4,106 kWh |
| Clean share of generation | 27% | 75% |
| Grid carbon intensity | 593 g/kWh | 200 g/kWh |
| Low / High scenario | | 5,490 / 10,388 TWh |
| Cross-check: NITI Aayog (Feb 2026) | | 7,350–7,700 TWh in **2050** (Current Policy) |

## Repository

```
data/raw/            downloaded sources (untouched) + ref/ resource-potential tables with SOURCES.md
data/processed/      model outputs (CSV/JSON)
src/                 Python pipeline
  regions.py         state -> grid-region map, Census 2011 urbanisation
  npp.py             National Power Portal (CEA) generation reports -> state x fuel x month
  ingest.py          clean sources; NPP overlay; resource potentials converted to TWh
  forecast.py        national ensemble, backtest, Monte Carlo, regional shift-share
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
