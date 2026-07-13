# Martbase DHIS2 User Guide

Martbase is a DHIS2-focused Superset distribution for building datasets, charts, dashboards, maps, and AI-assisted analysis on top of DHIS2 data.

This README is the primary user guide for working with DHIS2 inside the platform.

If you need deployment, infrastructure, multi-instance, or deeper operational references, use these technical guides:

- [DHIS2 implementation guide copy](docs/dhis2-user-guide.md)
- [Multi-instance runbook](docs/dhis2-multi-instance/runbook.md)
- [Multi-instance architecture](docs/dhis2-multi-instance/architecture.md)
- [AI configuration reference](docs/docs/configuration/ai-insights.mdx)

## Before You Start

Before creating DHIS2 content, confirm:

- you can log in to Superset
- the platform is already installed and accessible
- your DHIS2 source instance URL and credentials are available
- you know the org unit levels, indicators, data elements, and periods you want to analyze

If you are not responsible for platform setup, ask your implementer or administrator to confirm the environment is ready before you begin.

## 1. Add a DHIS2 API Connection

Create the source connection first.

Typical flow:

1. Open the database or DHIS2 connection area in Superset.
2. Create a new DHIS2 connection.
3. Enter the DHIS2 instance URL and credentials.
4. Save the connection.
5. Run any validation or metadata fetch available in the interface.

What to verify:

- the connection saves successfully
- metadata loads without authentication errors
- org unit levels are visible
- the indicators or data elements you need are available

If it fails:

- re-check the DHIS2 URL
- re-check the credentials
- confirm the source instance is reachable

## 2. Create a DHIS2 Dataset

After the connection is available, create a dataset that defines what DHIS2 data should be exposed in Superset.

Typical workflow:

1. Start a new dataset.
2. Select the DHIS2 source connection.
3. Choose the variables, indicators, or metrics to include.
4. Choose the org unit dimensions and levels you need.
5. Configure period handling.
6. Save the dataset.

Recommended checks after saving:

- the dataset appears in Superset
- preview or sample data loads
- the expected org unit field is populated
- the expected metric columns are populated
- the selected period and source structure match your use case

Good practice:

- keep metric names clear and consistent
- choose the org unit field carefully
- use explicit level mapping where available

## 3. Wait for the Dataset to Become Ready

Some DHIS2 datasets require background processing before they are fully usable.

Do not assume the dataset is ready the moment it is saved.

What to watch for:

- preview data loads correctly
- metadata is available
- map boundaries can be resolved where needed
- values appear as expected

If the dataset appears empty or incomplete immediately after creation, wait briefly and refresh before assuming there is a configuration problem.

## 4. Build DHIS2 Charts

Once the dataset is ready:

1. Open Explore on the DHIS2 dataset.
2. Choose a chart type.
3. Configure metrics, dimensions, filters, and time settings.
4. Save the chart.

Good first chart types:

- KPI summaries
- time series
- bar charts by district or region
- DHIS2 maps

For each chart, verify:

- the row counts are sensible
- filters behave as expected
- labels use the intended org unit field
- the metric values align with what you expect from DHIS2

## 5. Build DHIS2 Maps

For maps, pay close attention to org unit and boundary alignment.

Checklist:

1. Use the correct org unit dimension for the map.
2. Select the intended boundary level.
3. Confirm the dataset level matches the boundary level being rendered.
4. Save and test hover, zoom, and labels.

Common map observations:

- If boundaries render but many areas show no value, the data rows and map boundaries may not be matching correctly.
- If the basemap shows blank or broken tiles in production, `Transparent Background` is a safe fallback.
- If hover tooltips do not appear on public pages, ask the implementer to check the public map CSS and pointer-events behavior.

## 6. Add Charts to a Dashboard

After saving charts:

1. Create a dashboard or open an existing one.
2. Add the DHIS2 charts.
3. Arrange the layout.
4. Add filters if needed.
5. Save the dashboard.

Validation steps:

- every chart loads successfully
- filters apply correctly
- charts using the same dataset remain consistent with each other
- maps behave correctly when zooming, hovering, and switching views

## 7. Validate Public Usage

If the dashboard or charts will be shared publicly:

1. Confirm public access is enabled for the intended content.
2. Test the public page in a logged-out browser session.
3. Test map hover, filters, tooltips, and layout behavior in that public view.

Public DHIS2 map notes:

- external basemap providers may not always load in every environment
- public map hover behavior should be tested directly in the public page, not only in the authenticated UI

## 8. Use AI Insights

If AI Insights is enabled in your environment, you can use it to help interpret configured datasets, charts, and dashboards.

Typical usage:

1. Open a dataset, chart, or dashboard where AI Insights is available.
2. Ask focused analytical questions.
3. Review the generated explanation carefully.
4. Validate important conclusions against the underlying data.

Best practice:

- use AI to accelerate interpretation
- do not treat AI output as a replacement for checking the chart or source data yourself

## 9. Common Problems

### The dataset exists but charts show little or no data

Check:

- selected periods
- selected source instance
- selected variables or indicators
- whether the dataset has finished preparing

### Maps show boundaries but not values

Check:

- selected org unit column
- selected boundary level
- whether the row labels match the boundary labels you expect

### Maps show no hover tooltips

This is usually an environment or rendering issue rather than a dataset creation issue. If it happens consistently, ask the implementer or administrator to inspect the map interaction settings in that environment.

### Public maps show blank basemap areas

Use `Transparent Background` if external basemap tiles are not loading reliably.

## 10. Recommended First End-to-End Validation

After a new environment or new DHIS2 source is introduced, validate with one small use case:

1. Add one DHIS2 source connection.
2. Create one small dataset with a known metric and known org unit level.
3. Build one table or KPI chart.
4. Build one map.
5. Add both to one dashboard.
6. Test in the authenticated UI.
7. Test in the public UI if public access is required.
8. Test AI Insights if it is enabled.

This helps confirm the full user flow before you scale to many datasets, charts, and dashboards.
