/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Reusable DHIS2 "Data Filters" control — the same period (relative/fixed) and
 * column filter the DHIS2 maps use, packaged so ANY chart type can drop it in.
 *
 * Two pieces:
 *   - `dhis2DataFiltersControlSetRow` / `dhis2DataFiltersSection` — the control
 *     panel entry. Spread the row into an existing section, or add the whole
 *     section to `controlPanelSections`.
 *   - `dhis2ColumnFilterClauses` — call this in the chart's buildQuery to turn
 *     the stored filters into standard query `filters`, expanding any relative
 *     period token (REL::LAST_12_MONTHS) against the calendar so a saved chart
 *     always queries the current window.
 *
 * The map charts (DHIS2Map, UGMaps) keep their own bespoke wiring for now; new
 * chart types should use these helpers.
 */
import { buildQueryContext, QueryFormData, t } from '@superset-ui/core';
import { resolveFilterValues } from './relativePeriods';

/** One entry stored by the control. */
export interface DHIS2ColumnFilter {
  column: string;
  values: string[];
  relativeLabel?: string;
}

/** A standard query filter clause the query pipeline understands. */
export interface QueryFilterClause {
  col: string;
  op: 'IN';
  val: string[];
}

const CONTROL_DESCRIPTION = t(
  'Add one or more column filters. ' +
    'Select a column, then choose from its actual values in the data. ' +
    'Period column: pick a relative range (e.g. "Last 12 months") or fixed ' +
    'periods like 2024Q1, 2024, 202401. Multiple filters are combined with AND.',
);

/**
 * The control-set row, for splicing into an existing control panel section.
 * `renderTrigger` is intentionally omitted: changing a filter must re-run the
 * query, not just re-render.
 */
export const dhis2DataFiltersControlSetRow = [
  {
    name: 'dhis2_column_filters',
    config: {
      type: 'DHIS2ColumnFilterControl',
      label: t('Data Filters'),
      description: CONTROL_DESCRIPTION,
      default: [] as DHIS2ColumnFilter[],
      mapStateToProps: (state: any) => ({
        datasource: state.datasource,
      }),
    },
  },
];

/** A standalone "Data Filters" section, for charts without a natural host. */
export const dhis2DataFiltersSection = {
  label: t('Data Filters'),
  expanded: true,
  controlSetRows: [dhis2DataFiltersControlSetRow],
};

/**
 * Read the control's value from (camelCased or snake_case) formData and turn it
 * into query filter clauses, expanding relative period tokens. Returns [] when
 * the control is unset, so it is safe to spread unconditionally.
 */
export function dhis2ColumnFilterClauses(
  formData: Record<string, any> | undefined,
): QueryFilterClause[] {
  const raw = (formData?.dhis2ColumnFilters ??
    formData?.dhis2_column_filters) as DHIS2ColumnFilter[] | undefined;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      filter =>
        filter?.column &&
        Array.isArray(filter.values) &&
        filter.values.length > 0,
    )
    .map(filter => ({
      col: filter.column,
      op: 'IN' as const,
      val: resolveFilterValues(filter.values),
    }))
    .filter(clause => clause.val.length > 0);
}

/** What a chart contributes to its own DHIS2-aware query. */
export interface Dhis2QuerySpec {
  /** Dimension columns to group by. */
  columns?: string[];
  /** Metrics to aggregate. */
  metrics?: any[];
  /** Column to order the result by (ascending), e.g. the period/time axis. */
  orderByColumn?: string;
  /** Order descending instead of ascending. */
  orderDesc?: boolean;
}

/**
 * Build a query for a chart on a DHIS2 serving dataset.
 *
 * Every DHIS2 chart needs the same three things the map charts already do, and
 * that the default query builder gets wrong:
 *   - `time_range: 'No filter'` — the period column is a STRING ("2024Q1"), not
 *     a SQL datetime, so any time range makes the backend emit invalid
 *     date-range SQL and 500. This is the #1 "chart doesn't load" cause.
 *   - the DHIS2 Data Filters, with relative period tokens expanded.
 *   - an explicit order (default Superset sorts by the metric, which scrambles a
 *     time axis) — pass `orderByColumn` for charts with a period/time axis.
 *
 * The chart passes its own `columns`/`metrics` (custom-named controls don't
 * reach the default builder, so a chart with e.g. `commodity_column` must map
 * them here).
 */
export function buildDhis2ChartQuery(
  formData: QueryFormData,
  spec: (formData: QueryFormData) => Dhis2QuerySpec = () => ({}),
) {
  return buildQueryContext(formData, baseQueryObject => {
    const {
      columns,
      metrics,
      orderByColumn,
      orderDesc = false,
    } = spec(formData);
    const existingFilters = Array.isArray((baseQueryObject as any).filters)
      ? (baseQueryObject as any).filters
      : [];

    // Resolve the group-by columns, then guarantee the order column is among
    // them: ordering an aggregate query by a column that isn't grouped is a SQL
    // error ("not under aggregate function and not in GROUP BY keys").
    let finalColumns = columns ?? (baseQueryObject as any).columns ?? [];
    if (orderByColumn && !finalColumns.includes(orderByColumn)) {
      finalColumns = [...finalColumns, orderByColumn];
    }

    return [
      {
        ...baseQueryObject,
        columns: finalColumns,
        ...(metrics ? { metrics } : {}),
        filters: [...existingFilters, ...dhis2ColumnFilterClauses(formData)],
        ...(orderByColumn
          ? { orderby: [[orderByColumn, !orderDesc] as [string, boolean]] }
          : {}),
        row_limit: (baseQueryObject as any).row_limit || 10000,
        // See the doc comment: never let a time_range through.
        time_range: 'No filter',
      },
    ];
  });
}
