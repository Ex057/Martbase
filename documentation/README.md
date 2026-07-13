# Martbase Documentation

Project documentation for Martbase (a customized Apache Superset with DHIS2 + CMS
integration). This folder collects the Martbase-specific guides; it is separate
from `docs/`, which is the upstream Apache Superset documentation site.

## Test server deployment

Deploying and re-deploying Martbase to the Multipass Ubuntu test server.

| Doc | What it covers |
| --- | --- |
| [Deployment Guide](test-server-deployment/DEPLOYMENT_GUIDE.md) | Full guide for deploying Martbase to a Multipass Ubuntu VM. |
| [Multipass Deployment Guide](test-server-deployment/MULTIPASS_DEPLOYMENT_GUIDE.md) | Step-by-step Multipass server setup and deploy. |
| [Quick Start](test-server-deployment/QUICK_START.md) | Condensed deploy steps for experienced users. |
| [Redeployment Checklist](test-server-deployment/REDEPLOYMENT_CHECKLIST.md) | Checklist to redeploy the *custom* build (not vanilla Superset). |
| [Deployment Status](test-server-deployment/DEPLOYMENT_STATUS.md) | Current state of the Multipass deployment. |
| [Deployment Issue Summary](test-server-deployment/DEPLOYMENT_ISSUE_SUMMARY.md) | Known deployment problems and their fixes. |

## Architecture

| Doc | What it covers |
| --- | --- |
| [Architecture on Multipass](architecture/ARCHITECTURE.md) | How the Martbase services fit together on the Multipass host. |

## Features

| Doc | What it covers |
| --- | --- |
| [CMS & DHIS2 Implementation Checklist](features/CHECKLIST.md) | Work items for the CMS pages and DHIS2 integration. |
| [Block Studio Enhancement Proposals](features/BLOCK_STUDIO_IMPROVEMENTS.md) | Proposed improvements to the CMS Block Studio. |
| [DHIS2 Filter Name-to-UID Mapping](features/DHIS2_FILTER_NAME_TO_UID_SOLUTION.md) | How dashboard filter names map to DHIS2 org-unit UIDs. |

## Testing

| Doc | What it covers |
| --- | --- |
| [Test and Validation Plan](testing/TEST_AND_VALIDATION_PLAN.md) | Validation plan for the DHIS2 → Superset → ClickHouse pipeline. Copied from `dhis2_superset_clickhouse_agent_bundle/11_TEST_AND_VALIDATION_PLAN.md`. |

---

_Standard project files (README, INSTALL, CONTRIBUTING, CHANGELOG, CODE_OF_CONDUCT)
remain at the repository root. Other custom root docs — `DEPLOYMENT.md`,
`CACHING_STATUS.md` — were left in place and are not part of this folder._
