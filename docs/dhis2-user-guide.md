# DHIS2 User Guide

This guide walks through the DHIS2-specific workflow after the platform has already been installed and is operational.

Use this guide when you need to:

- add a DHIS2 API connection
- create a DHIS2 dataset
- build charts and maps
- assemble dashboards
- use AI Insights with DHIS2-backed content

## Before You Start

Confirm the platform is ready:

- you can log in to Superset
- `superset-web` is running
- `superset-worker` is running
- `superset-beat` is running if scheduled sync is expected
- ClickHouse is available if your deployment uses ClickHouse-backed staging/serving

Collect the DHIS2 connection details:

- DHIS2 base URL
- username and password or other supported credentials
- the org unit structure and levels you expect to analyze
- the data elements, indicators, dimensions, and periods you intend to expose

## 1. Add a DHIS2 API Connection

Create the source connection first.

General flow:

1. Open the database or DHIS2 connection management area in Superset.
2. Create a new DHIS2 connection entry.
3. Enter the DHIS2 instance URL and credentials.
4. Save the connection.
5. Run any built-in validation or metadata fetch available in the UI.

What to verify immediately:

- the connection saves successfully
- metadata requests return without authentication errors
- org unit levels can be discovered
- data elements/indicators needed for your use case are visible

If this step fails:

- verify the DHIS2 URL is reachable from the server
- verify credentials
- verify the worker is running if background validation is involved
- inspect server logs for DHIS2 metadata request failures

## 2. Create a DHIS2 Dataset

After the connection is available, create a dataset that defines what DHIS2 data should be imported or exposed.

Typical workflow:

1. Start a new dataset.
2. Select the DHIS2 source connection.
3. Choose the metrics or variables to include.
4. Choose the org unit dimensions and levels you need.
5. Configure period handling.
6. Save the dataset.

Important implementation choices:

- Pick the org unit column carefully. Many map and dashboard problems come from using the wrong org unit level or dimension.
- Keep metric naming clear and stable for dashboard authors.
- Prefer explicit level mapping when the UI offers it.
- If using staged/local serving paths, allow the initial sync/build to complete before charting.

What to verify after saving:

- the dataset appears in Superset
- preview or sample data loads
- the expected org unit field is populated
- the expected metric columns are populated
- the dataset reflects the right source instance and period structure

## 3. Wait for Sync and Background Processing

Many DHIS2 workflows depend on background jobs.

Operational rule:

- do not assume the dataset is fully ready the moment it is saved

Confirm:

- `superset-worker` is running
- `superset-beat` is running if periodic sync is expected
- dataset sync/build jobs complete successfully
- metadata and boundaries are available

Symptoms of incomplete background processing:

- empty previews
- missing org unit boundaries
- stale values
- partial map coverage
- missing legend metadata

## 4. Build DHIS2 Charts

Once the dataset is ready:

1. Open Explore on the DHIS2 dataset.
2. Choose a chart type.
3. Configure metrics, dimensions, filters, and time settings.
4. Save the chart.

Good first charts:

- KPI summaries
- time series
- bar charts by district or region
- choropleth or DHIS2 maps

Recommended validation for every chart:

- confirm row counts are sensible
- confirm filters behave as expected
- confirm labels use the intended org unit field
- confirm metric values align with source expectations

## 5. Build DHIS2 Maps

For DHIS2 maps, pay special attention to org unit and boundary alignment.

Checklist:

1. Use the correct org unit dimension for the map.
2. Select the intended boundary level.
3. Confirm the dataset level matches the boundary level being rendered.
4. Save and test hover, zoom, and labels.

Map-specific troubleshooting guidance:

- If boundaries render but many areas show no value, the data rows and map boundaries are not matching correctly.
- If the basemap shows blank or broken tiles in production, external map-tile access is likely blocked. Use `Transparent Background` as a safe fallback.
- If hover tooltips do not appear on public pages, inspect pointer-events CSS for the Leaflet SVG overlay.

## 6. Add Charts to a Dashboard

After saving charts:

1. Create a dashboard or open an existing one.
2. Add the DHIS2 charts.
3. Arrange the layout.
4. Add native filters if needed.
5. Save the dashboard.

Validation steps:

- every chart loads successfully
- filters apply correctly
- charts using the same dataset remain consistent with each other
- public-facing elements behave correctly if the dashboard is meant to be shared

## 7. Publish and Validate Public Usage

If the dashboard or charts will be public:

1. Confirm public access is enabled for the intended content.
2. Verify public metadata endpoints behave correctly.
3. Test the public page in a logged-out browser session.
4. Test map hover, tooltips, filters, and basemap behavior in that public context.

Known public-map concerns in this fork:

- external basemap providers may be blocked by CSP or proxy/network policy
- public-page CSS can interfere with Leaflet pointer events
- protected metadata requests may need public endpoint fallback behavior

## 8. Use AI Insights

AI Insights depends on server-side configuration.

Before using it, confirm:

- the `AI_INSIGHTS` feature is enabled
- `AI_INSIGHTS_CONFIG["enabled"]` is enabled
- a provider is configured, such as OpenAI-compatible or mock mode
- your role is allowed to access AI features

Typical environment settings:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODELS`
- `OPENAI_DEFAULT_MODEL`

Practical usage guidance:

1. Open a dataset, chart, or dashboard where AI Insights is available.
2. Ask focused analytical questions.
3. Review any generated explanation carefully before using it operationally.
4. Treat AI output as an assistant to interpretation, not as a replacement for validating source data.

Important safeguards in this fork:

- SQL execution through AI is disabled by default
- context size is bounded
- provider access is role-controlled

## 9. Common Failure Modes

### Dataset exists but charts show little or no data

Check:

- source periods
- source instance selection
- dataset variables
- worker/beat status
- whether the initial sync/build completed

### Maps show boundaries but not values

Check:

- selected org unit column
- selected boundary level
- row-to-boundary naming or ID match
- stale boundary cache or stale dataset content

### Maps show no hover tooltips

Check:

- `.leaflet-overlay-pane svg`
- `.leaflet-overlay-pane path`

If either resolves to `pointer-events: none`, hover interaction will fail.

### Public maps show blank basemap areas

Check browser access to:

- `*.basemaps.cartocdn.com`
- `*.tile.openstreetmap.org`
- `*.tile.opentopomap.org`
- `server.arcgisonline.com`

If blocked, use `Transparent Background`.

### Background refreshes stop happening

Check:

- `superset-worker`
- `superset-beat`

If either is down, DHIS2 freshness and metadata completeness can degrade.

## 10. Recommended First End-to-End Validation

After a new deployment, validate with one small DHIS2 use case:

1. Add one DHIS2 source connection.
2. Create one small dataset with a known metric and known org unit level.
3. Build one table chart.
4. Build one map.
5. Add both to one dashboard.
6. Test in the authenticated UI.
7. Test in the public UI if required.
8. Test AI Insights on that dashboard if enabled.

This approach isolates environment, sync, boundary, and permissions issues early before you scale to many datasets and dashboards.
