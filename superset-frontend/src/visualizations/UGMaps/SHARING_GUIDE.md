# UGMaps Sharing Guide (Superset Docker)

This guide explains how to move the UGMaps chart type into another Superset repo that runs with Docker.

## 1) Copy Required Code

From this repo, copy these paths into the target repo at the same locations:

- `superset-frontend/src/visualizations/UGMaps`
- `superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/uganda.geojson`
- `superset/models/helpers.py`
- `superset/db_engine_specs/postgres.py`
- `superset-frontend/src/features/datasets/AddDataset/BranchingDatasetWizard/index.tsx`
- `superset-frontend/src/pages/ChartCreation/index.tsx`

If you prefer a patch workflow:

```bash
# On source repo
cd /path/to/source-repo

git diff -- \
  superset-frontend/src/visualizations/UGMaps \
  superset-frontend/plugins/legacy-plugin-chart-country-map/src/countries/uganda.geojson \
  superset/models/helpers.py \
  superset/db_engine_specs/postgres.py \
  superset-frontend/src/features/datasets/AddDataset/BranchingDatasetWizard/index.tsx \
  superset-frontend/src/pages/ChartCreation/index.tsx \
  > ugmaps.patch
```

## 2) Register UGMaps In `MainPreset.js`

Open `superset-frontend/src/visualizations/presets/MainPreset.js` in the target repo and add:

1. Import:

```js
import UGMapsChartPlugin from '../UGMaps';
```

2. Plugin registration inside the `plugins` list:

```js
new UGMapsChartPlugin().configure({ key: 'ug_maps' }),
```

Place it alongside the other chart plugin registrations.

Then apply in target repo:

```bash
cd /path/to/target-repo
git apply /path/to/ugmaps.patch
```

## 3) Rebuild Superset (Docker)

From target repo root:

```bash
docker compose down

docker compose build --no-cache superset

docker compose up -d
```

If your setup uses separate frontend image targets, rebuild those too.

## 4) Database Migrations / Init

Run standard Superset init inside the app container:

```bash
docker compose exec superset superset db upgrade
docker compose exec superset superset init
```

## 5) Validate UGMaps Appears

- Open Explore and check chart type list for `UGMaps` (`viz_type: ug_maps`).
- Create chart with dataset that has district names and a numeric metric.
- In Query controls set:
  - `Area Geometry`: `Uganda District Geometry`
  - `Boundary Join Column`: your district column
  - `GeoJSON Property`: `NAME_1`
  - `Metric`: e.g. `SUM(value)`

## 6) Troubleshooting

- If map is blank, open browser console and check `[UGMaps]` diagnostics logs.
- If `dhis2_metadata ... legendSets 400` appears on non-DHIS2 datasets, confirm you copied both:
  - `UGMaps/controlPanel.ts`
  - `UGMaps/DHIS2Map.tsx`
