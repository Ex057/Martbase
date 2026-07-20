# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
DHIS2 Few-Shot Training Examples for AI Chart Generation.

These examples teach the AI how to create correct chart configurations
for DHIS2 health analytics datasets, including proper aggregation rules,
period handling, and chart type selection.
"""
from __future__ import annotations

from typing import Any

# Few-shot examples for DHIS2 chart generation
# Each example shows: prompt -> expected chart configuration
DHIS2_FEW_SHOT_EXAMPLES: list[dict[str, Any]] = [
    # ── Disease Surveillance Examples ──
    {
        "prompt": "Show malaria test positivity rate trend by district",
        "dataset_hint": "columns: period (dhis2_is_period), district (ou_level_3), "
                       "malaria_positivity_rate (indicator), tests_done (data_element)",
        "output": {
            "slice_name": "Malaria Positivity Rate Trend by District",
            "viz_type": "small_multiples",
            "description": "Monthly positivity rate trends split by district for comparison",
            "params": {
                "dhis2_split_preset": "by_district",
                "x_axis": "period",
                "metrics": [{
                    "label": "Positivity Rate",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "malaria_positivity_rate"},
                    "aggregate": "NONE"
                }],
                "mini_chart_type": "line",
                "number_format": ",.1%"
            }
        }
    },
    {
        "prompt": "Map of confirmed malaria cases by district",
        "dataset_hint": "columns: district (ou_level_3), confirmed_cases (data_element)",
        "output": {
            "slice_name": "Confirmed Malaria Cases by District",
            "viz_type": "dhis2_map",
            "description": "Choropleth map showing geographic distribution of malaria cases",
            "params": {
                "org_unit_column": "district",
                "metric": {
                    "label": "Confirmed Cases",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "confirmed_cases"},
                    "aggregate": "SUM"
                },
                "boundary_levels": [3],
                "aggregation_method": "sum",
                "enable_drill": True,
                "linear_color_scheme": "oranges",
                "show_labels": True
            }
        }
    },
    {
        "prompt": "Compare test positivity rates across facilities",
        "dataset_hint": "columns: facility (ou_level_6), positivity_rate (indicator), "
                       "tests_conducted (data_element)",
        "output": {
            "slice_name": "Test Positivity Rate by Facility",
            "viz_type": "ranked_variance",
            "description": "Facilities ranked by positivity rate deviation from target",
            "params": {
                "entity_column": "facility",
                "actual_metric": {
                    "column": {"column_name": "positivity_rate"},
                    "aggregate": "NONE"
                },
                "target_value": 5.0,
                "number_format": ",.1%",
                "show_deviation_bars": True
            }
        }
    },

    # ── Service Delivery Examples ──
    {
        "prompt": "Track ANC coverage trends by region",
        "dataset_hint": "columns: period, region (ou_level_2), anc_coverage (indicator)",
        "output": {
            "slice_name": "ANC Coverage Trend by Region",
            "viz_type": "echarts_timeseries_line",
            "description": "Monthly ANC coverage trends across regions",
            "params": {
                "x_axis": "period",
                "groupby": ["region"],
                "metrics": [{
                    "label": "ANC Coverage",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "anc_coverage"},
                    "aggregate": "NONE"
                }],
                "number_format": ",.1%",
                "y_axis_format": ",.0%",
                "show_legend": True,
                "markerEnabled": True
            }
        }
    },
    {
        "prompt": "Compare immunization coverage vs targets by district",
        "dataset_hint": "columns: district, dpt3_coverage (indicator), target_coverage",
        "output": {
            "slice_name": "DPT3 Coverage vs Target by District",
            "viz_type": "comparison_kpi",
            "description": "District immunization coverage compared to target",
            "params": {
                "groupby": ["district"],
                "actual_metric": {
                    "column": {"column_name": "dpt3_coverage"},
                    "aggregate": "NONE"
                },
                "target_metric": {
                    "column": {"column_name": "target_coverage"},
                    "aggregate": "NONE"
                },
                "number_format": ",.1%",
                "show_delta": True
            }
        }
    },
    {
        "prompt": "Show OPD attendance by age group and sex",
        "dataset_hint": "columns: age_group, sex, opd_visits (data_element)",
        "output": {
            "slice_name": "OPD Attendance by Age and Sex",
            "viz_type": "age_sex_pyramid",
            "description": "Demographic distribution of outpatient visits",
            "params": {
                "age_column": "age_group",
                "sex_column": "sex",
                "metric": {
                    "label": "OPD Visits",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "opd_visits"},
                    "aggregate": "SUM"
                },
                "number_format": ",.0f"
            }
        }
    },

    # ── Supply Chain Examples ──
    {
        "prompt": "Monitor commodity stock levels and consumption",
        "dataset_hint": "columns: period, product, facility, stock_on_hand (data_element), "
                       "consumption (data_element)",
        "output": {
            "slice_name": "Commodity Stock Status",
            "viz_type": "stock_status",
            "description": "Stock levels with months-of-stock calculations",
            "params": {
                "entity_column": "product",
                "stock_metric": {
                    "column": {"column_name": "stock_on_hand"},
                    "aggregate": "SUM"
                },
                "consumption_metric": {
                    "column": {"column_name": "consumption"},
                    "aggregate": "SUM"
                },
                "understock_threshold": 2,
                "overstock_threshold": 6,
                "number_format": ",.0f"
            }
        }
    },

    # ── Cascade Analysis Examples ──
    {
        "prompt": "HIV 90-90-90 cascade by district",
        "dataset_hint": "columns: district, plhiv_know_status (indicator), "
                       "on_art (indicator), viral_suppression (indicator)",
        "output": {
            "slice_name": "HIV 90-90-90 Cascade by District",
            "viz_type": "cohort_cascade",
            "description": "Patient progression through HIV care stages",
            "params": {
                "groupby": ["district"],
                "stages": [
                    {"label": "Know Status", "column": "plhiv_know_status"},
                    {"label": "On ART", "column": "on_art"},
                    {"label": "Virally Suppressed", "column": "viral_suppression"}
                ],
                "show_retention": True,
                "show_dropoff": True,
                "number_format": ",.0f"
            }
        }
    },

    # ── Geographic Examples ──
    {
        "prompt": "Choropleth map of indicators by region with drill-down",
        "dataset_hint": "columns: region (ou_level_2), district (ou_level_3), "
                       "coverage_rate (indicator)",
        "output": {
            "slice_name": "Coverage Rate by Region",
            "viz_type": "dhis2_map",
            "description": "Regional coverage with drill-down to district level",
            "params": {
                "org_unit_column": "region",
                "metric": {
                    "label": "Coverage Rate",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "coverage_rate"},
                    "aggregate": "NONE"
                },
                "boundary_levels": [2, 3],
                "aggregation_method": "none",
                "enable_drill": True,
                "show_all_boundaries": True,
                "linear_color_scheme": "superset_seq_1"
            }
        }
    },

    # ── KPI/Summary Examples ──
    {
        "prompt": "Create summary KPI cards for total cases, tests, and positivity rate",
        "dataset_hint": "columns: period, confirmed_cases (data_element), "
                       "tests_done (data_element), positivity_rate (indicator)",
        "output": {
            "slice_name": "Disease Surveillance Summary",
            "viz_type": "summary",
            "description": "Key indicators overview with sparklines",
            "params": {
                "metrics": [
                    {
                        "label": "Confirmed Cases",
                        "column": {"column_name": "confirmed_cases"},
                        "aggregate": "SUM",
                        "number_format": ",.0f"
                    },
                    {
                        "label": "Tests Done",
                        "column": {"column_name": "tests_done"},
                        "aggregate": "SUM",
                        "number_format": ",.0f"
                    },
                    {
                        "label": "Positivity Rate",
                        "column": {"column_name": "positivity_rate"},
                        "aggregate": "NONE",
                        "number_format": ",.1%"
                    }
                ],
                "time_column": "period",
                "show_sparklines": True,
                "show_trend": True
            }
        }
    },

    # ── Time Series Examples ──
    {
        "prompt": "Monthly trend of malaria incidence",
        "dataset_hint": "columns: period (dhis2_is_period), incidence_rate (indicator)",
        "output": {
            "slice_name": "Monthly Malaria Incidence Trend",
            "viz_type": "echarts_timeseries_line",
            "description": "Time series showing monthly malaria incidence rate",
            "params": {
                "x_axis": "period",
                "metrics": [{
                    "label": "Incidence Rate",
                    "expressionType": "SIMPLE",
                    "column": {"column_name": "incidence_rate"},
                    "aggregate": "NONE"
                }],
                "time_range": "No filter",
                "number_format": ",.2f",
                "show_legend": True,
                "zoomable": True,
                "markerEnabled": True,
                "x_axis_title": "Reporting Period",
                "y_axis_title": "Incidence per 1000"
            }
        }
    },

    # ── Data Element vs Indicator Aggregation Example ──
    {
        "prompt": "Compare total tests and positivity rate over time",
        "dataset_hint": "columns: period, tests_conducted (data_element, SUM), "
                       "positivity_rate (indicator, NONE)",
        "output": {
            "slice_name": "Testing Volume and Positivity Rate",
            "viz_type": "mixed_timeseries",
            "description": "Dual-axis chart showing test volume (bars) and positivity (line)",
            "params": {
                "x_axis": "period",
                "metrics": [
                    {
                        "label": "Tests Conducted",
                        "expressionType": "SIMPLE",
                        "column": {"column_name": "tests_conducted"},
                        "aggregate": "SUM"
                    }
                ],
                "metrics_b": [
                    {
                        "label": "Positivity Rate",
                        "expressionType": "SIMPLE",
                        "column": {"column_name": "positivity_rate"},
                        "aggregate": "NONE"
                    }
                ],
                "y_axis_format": ",.0f",
                "y_axis_2_format": ",.1%",
                "show_legend": True
            }
        }
    },
]


def build_dhis2_context(columns: list[dict[str, Any]]) -> str:
    """
    Build DHIS2-specific context string from dataset column metadata.

    This context is injected into the AI prompt to help it understand
    which columns are indicators (NONE aggregation) vs data elements (SUM),
    and identify period/OU columns for proper chart configuration.

    Args:
        columns: List of column dicts with 'name', 'type', and optional 'extra' metadata

    Returns:
        Formatted context string for the AI prompt
    """
    context_parts: list[str] = []

    indicators: list[str] = []
    data_elements: list[str] = []
    period_cols: list[str] = []
    ou_cols: list[tuple[str, int]] = []  # (name, level)

    for col in columns:
        extra = col.get("extra") or {}
        name = col.get("name", "")

        # Check for DHIS2 metadata markers
        if extra.get("dhis2_is_indicator"):
            indicators.append(name)
        elif extra.get("dhis2_default_agg") == "SUM":
            data_elements.append(name)

        if extra.get("dhis2_is_period"):
            period_cols.append(name)

        if extra.get("dhis2_is_ou_hierarchy"):
            level = extra.get("dhis2_ou_level", 0)
            ou_cols.append((name, level))

    # Build context string
    if indicators:
        context_parts.append(
            f"INDICATORS (use aggregate: NONE - already calculated): "
            f"{', '.join(indicators)}"
        )

    if data_elements:
        context_parts.append(
            f"DATA ELEMENTS (use aggregate: SUM - raw counts): "
            f"{', '.join(data_elements)}"
        )

    if period_cols:
        context_parts.append(
            f"PERIOD COLUMN: {period_cols[0]} "
            f"(use for x_axis in time series, NOT granularity_sqla)"
        )

    if ou_cols:
        ou_cols_sorted = sorted(ou_cols, key=lambda x: x[1])
        levels_str = ", ".join(f"{name} (level {lvl})" for name, lvl in ou_cols_sorted)
        context_parts.append(f"ORG UNIT HIERARCHY: {levels_str}")

    if not context_parts:
        return ""

    return (
        "\n\n=== DHIS2 DATASET DETECTED ===\n"
        "This is a DHIS2 health analytics dataset. Apply these rules:\n"
        + "\n".join(f"- {part}" for part in context_parts)
        + "\n"
        "CRITICAL: Use NONE aggregation for indicators, SUM for data elements.\n"
        "Use the period column as x_axis (string), NOT as granularity_sqla (datetime).\n"
        "=== END DHIS2 CONTEXT ===\n"
    )


def format_few_shot_examples(max_examples: int = 4) -> str:
    """
    Format few-shot examples for inclusion in the AI prompt.

    Args:
        max_examples: Maximum number of examples to include (to fit context window)

    Returns:
        Formatted examples string for the prompt
    """
    examples_text = ["\n\n=== EXAMPLE CHART CONFIGURATIONS ==="]

    for i, example in enumerate(DHIS2_FEW_SHOT_EXAMPLES[:max_examples]):
        examples_text.append(f"\nExample {i + 1}:")
        examples_text.append(f"User prompt: \"{example['prompt']}\"")
        examples_text.append(f"Dataset has: {example['dataset_hint']}")
        examples_text.append(f"Correct output: {example['output']}")

    examples_text.append("\n=== END EXAMPLES ===\n")

    return "\n".join(examples_text)


# DHIS2-specific rules to append to the system prompt
DHIS2_SYSTEM_PROMPT_RULES = """

=== DHIS2 DATASET RULES ===

When working with DHIS2 datasets (identified by column metadata markers like
dhis2_is_indicator, dhis2_is_period, dhis2_is_ou_hierarchy), apply these rules:

## Aggregation Rules (CRITICAL)

1. **INDICATORS** (columns marked dhis2_is_indicator=true or dhis2_default_agg="NONE"):
   - Use aggregate: "NONE" - these are pre-calculated rates/percentages
   - Examples: coverage rates, positivity rates, mortality rates
   - WRONG: SUM(positivity_rate) or AVG(positivity_rate)
   - CORRECT: positivity_rate with aggregate: "NONE"

2. **DATA ELEMENTS** (columns marked dhis2_default_agg="SUM"):
   - Use aggregate: "SUM" - these are raw counts that should be summed
   - Examples: cases, tests, deaths, stock quantities
   - CORRECT: SUM(confirmed_cases), SUM(tests_done)

## Time Handling

3. **Period Column** (marked dhis2_is_period=true):
   - Use as x_axis for time series charts
   - Period is a STRING (e.g., "202301", "2023Q1"), NOT a datetime
   - Do NOT use as granularity_sqla
   - Set time_range: "No filter" - period filtering is done via DHIS2 filters

## Period Formats
   - 202301 = January 2023 (monthly)
   - 2023Q1 = Q1 2023 (quarterly)
   - 2023 = Year 2023 (yearly)
   - 2023W01 = Week 1 of 2023 (weekly)

## Organization Unit Hierarchy

4. **OU Columns** (marked dhis2_is_ou_hierarchy=true with dhis2_ou_level):
   - Level 1: National
   - Level 2: Region
   - Level 3: District
   - Level 4: County/Municipality
   - Level 5: Sub-county
   - Level 6: Health Facility
   - Level 7: Ward/Department

5. For maps, use org_unit_column and boundary_levels matching the OU level

## Chart Type Selection for DHIS2 Data

- Geographic comparison → dhis2_map (choropleth with drill-down)
- Performance vs target → ranked_variance or comparison_kpi
- Multi-indicator overview → summary (KPI cards with sparklines)
- Trend over periods → echarts_timeseries_line with period on x_axis
- Cascade analysis (90-90-90, treatment) → cohort_cascade
- Compare across OUs → small_multiples with dhis2_split_preset
- Stock management → stock_status with months-of-stock calculation
- Demographic breakdown → age_sex_pyramid

## CRITICAL: Respect User Requests

When the user explicitly asks for a specific chart type, ALWAYS include it:
- "map" / "choropleth" / "geographic" → MUST return dhis2_map
- "trend" / "time series" → MUST return echarts_timeseries_line or similar
- "cascade" → MUST return cohort_cascade
- "KPI" / "summary" → MUST return summary or big_number_total

Do NOT substitute with different chart types when the user makes an explicit request.

## Example: Map Configuration

When user asks for "map by district", return:
```json
{
  "viz_type": "dhis2_map",
  "params": {
    "org_unit_column": "district_city",
    "metric": {"column": {"column_name": "value_col"}, "aggregate": "SUM"},
    "boundary_levels": [3],
    "aggregation_method": "sum",
    "enable_drill": true
  }
}
```

The org_unit_column should match the OU hierarchy column name from the dataset.
boundary_levels should match the dhis2_ou_level value (e.g., level 3 for district).

=== END DHIS2 RULES ===
"""
