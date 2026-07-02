# Martbase DHIS2 Superset

Martbase is a DHIS2-focused Apache Superset distribution for deploying analytics, dashboards, public map experiences, and AI-assisted analysis on top of DHIS2 data. This fork adds DHIS2-specific dataset flows, public chart support, staged metadata handling, ClickHouse-backed serving paths, and operational tooling for local and server deployments.

This repository should be treated as an application distribution, not the upstream Superset project. The canonical setup and operations entrypoint is `superset-manager-v2.sh`.

## What This Fork Includes

- DHIS2 API connection and dataset workflows inside Superset
- DHIS2-specific chart types, public dashboard handling, and map behavior
- ClickHouse-backed staging and serving support
- Background sync and metadata refresh tasks routed through Celery
- Public metadata and public chart endpoints for DHIS2 use cases
- AI Insights configuration with OpenAI-compatible providers
- A deployment and operations script for local development, server install, and remote deployment

## Architecture Overview

The standard deployment consists of:

- `superset-web`: the Superset web/API process
- `superset-worker`: Celery worker for DHIS2 sync, cache, and metadata jobs
- `superset-beat`: Celery beat scheduler for periodic DHIS2 sync and routine jobs
- `postgresql`: Superset metadata database
- `redis`: cache and Celery broker/backend
- `clickhouse`: staging/serving engine when enabled
- `nginx`: reverse proxy and TLS termination on server installs

Practical responsibilities:

- The web server handles login, APIs, Explore, dashboards, public pages, and map rendering requests.
- The Celery worker handles DHIS2 background tasks. If the worker is down, syncs, metadata refreshes, and other background work stall.
- Celery beat triggers scheduled DHIS2 sync jobs. If beat is down, scheduled refreshes stop and the platform can drift stale.
- ClickHouse supports DHIS2 staging/serving workloads when `CLICKHOUSE_ENABLED=1`.

## Repository Layout

- `superset-manager-v2.sh`: primary setup, deploy, and operations script
- `superset_config.py`: runtime Superset configuration for this fork
- `superset/` and `superset-frontend/`: backend and frontend application code
- `docs/dhis2-user-guide.md`: DHIS2 end-user implementation guide
- `docs/dhis2-multi-instance/`: deeper technical runbooks and architecture notes

## System Requirements

Minimum practical requirements depend on data volume, but for a single production node:

- Ubuntu/Debian-style Linux server for `install-server` or `deploy-remote`
- 4+ CPU cores
- 16+ GB RAM recommended for frontend builds and background jobs
- 80+ GB disk recommended for app files, logs, metadata, and ClickHouse data
- Public DNS record pointing at the server if TLS and public access are required
- Open ports `80` and `443` for public deployments

Local development requirements:

- `python3`
- `node` and `npm` compatible with the repo defaults
- `redis`
- `postgresql`
- optional `clickhouse` if you want to validate ClickHouse-backed paths locally

The manager script defaults assume:

- `NODE_MAJOR=20`
- `NPM_VERSION=10.8.2`
- `CLICKHOUSE_ENABLED=1`

## General Requirements Before Setup

Collect these inputs before installing:

- domain name for the deployment, for example `analytics.example.org`
- admin account email and password
- target server access for remote deployment
- DHIS2 base URL and credentials for each source instance you plan to connect
- outbound internet access from the browser to external basemap providers if using non-transparent map backgrounds
- outbound internet access from the server for package installation and optional AI provider access

For AI Insights with OpenAI-compatible providers, also prepare:

- `OPENAI_API_KEY`
- optional `OPENAI_BASE_URL`
- optional `OPENAI_MODELS`
- optional `OPENAI_DEFAULT_MODEL`

## Canonical Setup Path

Use `superset-manager-v2.sh` as the primary install and operations interface.

### Core Commands

Local development:

```bash
./superset-manager-v2.sh install
./superset-manager-v2.sh start-all
./superset-manager-v2.sh status-all
./superset-manager-v2.sh build-frontend
./superset-manager-v2.sh create-admin
./superset-manager-v2.sh db-upgrade
```

Production install on the current machine:

```bash
DOMAIN=analytics.example.org \
ADMIN_EMAIL=admin@example.org \
ADMIN_PASSWORD='ChangeMeNow' \
./superset-manager-v2.sh install-server
```

Remote deployment from the current codebase:

```bash
CODEBASE_SOURCE=local \
DOMAIN=analytics.example.org \
ADMIN_EMAIL=admin@example.org \
ADMIN_PASSWORD='ChangeMeNow' \
REMOTE_HOST=203.0.113.10 \
REMOTE_USER=root \
./superset-manager-v2.sh deploy-remote
```

Remote deployment from Git:

```bash
CODEBASE_SOURCE=git \
GIT_REPO_URL=https://github.com/HISP-Uganda/dhis2-superset.git \
GIT_BRANCH=martbase \
DOMAIN=analytics.example.org \
REMOTE_HOST=203.0.113.10 \
REMOTE_USER=root \
./superset-manager-v2.sh deploy-remote
```

Upgrade an existing remote deployment:

```bash
CODEBASE_SOURCE=git \
GIT_REPO_URL=https://github.com/HISP-Uganda/dhis2-superset.git \
GIT_REF=martbase \
DOMAIN=analytics.example.org \
REMOTE_HOST=203.0.113.10 \
REMOTE_USER=root \
./superset-manager-v2.sh upgrade-remote
```

### Important Environment Variables

Required or commonly used:

- `DOMAIN`
- `CODEBASE_SOURCE=local|git`
- `GIT_REPO_URL`
- `GIT_BRANCH`
- `GIT_REF`
- `REMOTE_HOST`
- `REMOTE_USER`
- `REMOTE_APP_USER`
- `INSTALL_DIR`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `LETSENCRYPT_EMAIL`
- `POSTGRES_PASSWORD`

ClickHouse and data-engine behavior:

- `CLICKHOUSE_ENABLED=1`
- `DUCKDB_ENABLED=1`
- `POSTGRES_ENABLED=1`
- `EXPOSE_CLICKHOUSE_HTTP=0`
- `EXPOSE_CLICKHOUSE_NATIVE=0`

Frontend build controls:

- `FRONTEND_NODE_OLD_SPACE_SIZE_MB=auto`
- `FRONTEND_FORK_TS_MEMORY_LIMIT_MB=auto`
- `FRONTEND_BUILD_MAX_RETRIES=2`
- `FRONTEND_TIMEOUT_MINUTES=90`
- `FRONTEND_LOG_TAIL_LINES=200`
- `FRONTEND_VERBOSE_LOGS=1`

AI configuration:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `OPENAI_MODELS=gpt-4.1-mini`
- `OPENAI_DEFAULT_MODEL=gpt-4.1-mini`
- `AI_INSIGHTS_ENABLE_MOCK=1`

## What The Manager Script Sets Up

The production install and deploy paths are designed to provision and configure:

- Python virtual environment and backend dependencies
- frontend dependencies and built assets
- Postgres metadata database
- Redis
- ClickHouse when enabled
- generated runtime `.env`
- generated `superset_config.py`
- Nginx site configuration
- systemd services for:
  - `superset-web`
  - `superset-worker`
  - `superset-beat`
- database migrations and DHIS2 metadata schema patching
- initial admin user

The script also enables:

- DHIS2 task routing to the `dhis2` Celery queue
- scheduled DHIS2 sync through Celery beat
- AI Insights feature flags and provider config scaffolding
- CSP allowances for DHIS2 external map tiles

## ClickHouse Setup Notes

ClickHouse is part of the expected stack for this fork.

With `CLICKHOUSE_ENABLED=1`, the manager script is intended to:

- install ClickHouse if missing on the target server
- start and enable the ClickHouse service
- bootstrap required ClickHouse databases and credentials
- sync ClickHouse-related settings into the Superset runtime environment

Operator expectations:

- keep ClickHouse running for DHIS2 staging/serving paths that depend on it
- do not expose ClickHouse ports publicly unless there is a specific need and network controls are in place
- verify ClickHouse connectivity after install before onboarding DHIS2 datasets

## First-Run Verification Checklist

After installation or deployment:

1. Confirm the site opens over the expected URL.
2. Log in with the configured admin user.
3. Confirm service health:
   - `./superset-manager-v2.sh status-server`
   - or `./superset-manager-v2.sh status-remote`
4. Confirm the critical services are running:
   - `superset-web`
   - `superset-worker`
   - `superset-beat`
   - `postgresql`
   - `redis`
   - `clickhouse` when enabled
5. Confirm migrations completed without error.
6. Confirm frontend assets are present and pages load correctly.
7. Confirm AI settings are loaded as expected if AI Insights is required.

## Operations Guide

Useful local commands:

```bash
./superset-manager-v2.sh status-all
./superset-manager-v2.sh logs
./superset-manager-v2.sh logs backend follow
./superset-manager-v2.sh logs frontend follow
./superset-manager-v2.sh health
./superset-manager-v2.sh cache-all
```

Useful server commands:

```bash
./superset-manager-v2.sh start-server
./superset-manager-v2.sh stop-server
./superset-manager-v2.sh restart-server
./superset-manager-v2.sh status-server
./superset-manager-v2.sh show-config-paths
```

Useful remote commands:

```bash
./superset-manager-v2.sh status-remote
./superset-manager-v2.sh start-remote
./superset-manager-v2.sh stop-remote
./superset-manager-v2.sh restart-remote
./superset-manager-v2.sh shell-remote
```

## DHIS2 Workflow Guide

The end-user implementation flow is documented in [docs/dhis2-user-guide.md](docs/dhis2-user-guide.md).

That guide covers:

- creating a DHIS2 API connection
- creating a DHIS2 dataset
- building DHIS2 charts and maps
- adding them to dashboards
- publishing and validating outputs
- using AI Insights on top of configured datasets and dashboards

## Troubleshooting

### Web server issues

- If the UI and APIs do not respond, inspect `superset-web` first.
- Use `status-server` or `status-remote` and inspect Gunicorn logs.
- If the web server is down, the application is unavailable regardless of worker state.

### Worker or beat stopped

- If `superset-worker` is stopped, DHIS2 background tasks, syncs, and metadata refreshes can stall.
- If `superset-beat` is stopped, scheduled sync and recurring jobs stop.
- These failures can lead to stale DHIS2 data, stale metadata, or incomplete background processing even when the web UI still loads.

### ClickHouse issues

- Confirm ClickHouse is running before troubleshooting staged/serving problems.
- Re-check generated environment settings if datasets fail to build against ClickHouse-backed paths.
- Verify firewall rules are not blocking required local connectivity between services.

### Public DHIS2 maps show blank or broken basemap tiles

- This is usually a browser-to-tile-provider access issue, not a DHIS2 data issue.
- Verify CSP, proxy, and outbound access to tile providers such as:
  - `*.basemaps.cartocdn.com`
  - `*.tile.openstreetmap.org`
  - `*.tile.opentopomap.org`
  - `server.arcgisonline.com`
- A safe production fallback is to use `Transparent Background` if external tiles are blocked.

### Public DHIS2 maps do not show hover tooltips

- Check the rendered page CSS for `.leaflet-overlay-pane svg` and `.leaflet-overlay-pane path`.
- If either resolves to `pointer-events: none`, map hover and tooltip interaction will fail.
- In this codebase, public-page styling for Leaflet is defined in `superset-frontend/src/pages/PublicLandingPage/PublicChartContainer.tsx`.

### Map boundaries render but many regions show no values

- This usually indicates a data-to-boundary matching issue rather than a tile-rendering issue.
- Check:
  - effective org unit column
  - boundary level selection
  - DHIS2 source instance selection
  - cached boundaries versus current dataset rows
  - worker/beat health for stale sync state

### `legendSets` requests return `401`

- This affects legend metadata retrieval, not raster basemap tile loading.
- Public fallback behavior depends on chart/public-view context being passed correctly.
- If a chart renders but logs `legendSets` auth failures, treat it as a separate metadata/auth issue from map tiles.

## Additional Technical References

- DHIS2 implementation guide: [docs/dhis2-user-guide.md](docs/dhis2-user-guide.md)
- Multi-instance runbook: [docs/dhis2-multi-instance/runbook.md](docs/dhis2-multi-instance/runbook.md)
- Multi-instance architecture: [docs/dhis2-multi-instance/architecture.md](docs/dhis2-multi-instance/architecture.md)
- AI configuration notes: [docs/docs/configuration/ai-insights.mdx](docs/docs/configuration/ai-insights.mdx)

## Support Expectations

This README is the fork-specific operational entrypoint. If you are deploying or running this repository, start here first, then move to the DHIS2 guide and runbooks as needed.
