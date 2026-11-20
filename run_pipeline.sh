#!/usr/bin/env bash
# Rebuild every model output and the dashboard data bundle.
set -euo pipefail
cd "$(dirname "$0")"
python -X utf8 -m src.npp
python -X utf8 -m src.ingest
python -X utf8 -m src.forecast
python -X utf8 -m src.optimize
python -X utf8 -m src.export
node dashboard/scripts/check_model.mts
python -X utf8 -m pytest -q tests
