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
import { buildQueryContext, QueryFormData } from '@superset-ui/core';
import { resolvePresetColumn } from './dhis2Presets';

const FALLBACK_PRESET_COLUMNS: Record<string, string[]> = {
  by_national: ['national'],
  by_region: ['region'],
  by_district: ['district_city', 'district'],
  by_county: ['county'],
  by_subcounty: ['subcounty', 'sub_county'],
  by_parish: ['parish'],
  by_facility: ['facility', 'facility_name', 'organisationunitname'],
  by_period_monthly: ['month', 'period'],
  by_period_quarterly: ['quarter', 'period'],
  by_period_yearly: ['year', 'period'],
};

const DEFAULT_SMALL_MULTIPLES_ROW_LIMIT = 50000;

function getSmallMultiplesExtras(fd: Record<string, any>) {
  return {
    ...(fd.extras || {}),
    dhis2_terminal_hierarchy_filtering: false,
  };
}

function getSmallMultiplesRowLimit(fd: Record<string, any>) {
  const currentLimit = Number(fd.row_limit ?? fd.rowLimit ?? 0);
  if (
    Number.isFinite(currentLimit) &&
    currentLimit >= DEFAULT_SMALL_MULTIPLES_ROW_LIMIT
  ) {
    return currentLimit;
  }
  return DEFAULT_SMALL_MULTIPLES_ROW_LIMIT;
}

function applySmallMultiplesRowLimit(query: Record<string, any>) {
  return {
    ...query,
    row_limit: getSmallMultiplesRowLimit(query),
  };
}

function resolveSplitColumn(fd: Record<string, any>): string | null {
  const { _resolved_split_col: resolvedSplitCol = null } = fd;
  if (resolvedSplitCol) {
    return resolvedSplitCol;
  }

  const preset = String(fd.dhis2_split_preset || '');
  if (preset && preset !== 'custom') {
    const datasourceColumns = fd.datasource?.columns || fd.columns || [];
    const dataColumns = datasourceColumns.map((column: any) =>
      String(column.column_name || column.name || ''),
    );
    const resolvedPresetCol = resolvePresetColumn(
      preset,
      datasourceColumns,
      dataColumns,
    );
    if (resolvedPresetCol) {
      return resolvedPresetCol;
    }

    const fallback = FALLBACK_PRESET_COLUMNS[preset]?.[0];
    if (fallback) {
      return fallback;
    }

    const levelMatch = preset.match(/^by_level_(\d+)$/);
    if (levelMatch) {
      const level = Number(levelMatch[1]);
      const levelColumn = datasourceColumns.find((column: any) => {
        let extra: Record<string, any> = {};
        if (typeof column.extra === 'string') {
          try {
            extra = JSON.parse(column.extra || '{}');
          } catch {
            extra = {};
          }
        } else {
          extra = column.extra || {};
        }
        return (
          Number(extra.dhis2_ou_level ?? extra.dhis2OuLevel ?? 0) === level
        );
      });
      if (levelColumn) {
        return String(levelColumn.column_name || levelColumn.name || '');
      }
    }
  }

  return Array.isArray(fd.groupby) ? fd.groupby[0] : fd.groupby || null;
}

export default function buildQuery(formData: QueryFormData) {
  const originalFd = formData as Record<string, any>;
  const safeRowLimit = getSmallMultiplesRowLimit(originalFd);
  const normalizedFormData = {
    ...originalFd,
    extras: getSmallMultiplesExtras(originalFd),
    row_limit: safeRowLimit,
    rowLimit: safeRowLimit,
  } as unknown as QueryFormData;
  const fd = normalizedFormData as Record<string, any>;

  return buildQueryContext(normalizedFormData, baseQueryObject => {
    const query = { ...baseQueryObject } as Record<string, any>;
    query.extras = getSmallMultiplesExtras(query);

    // NOTE: buildQuery receives raw formData with snake_case keys (control names).
    // camelCase conversion only happens in ChartProps for transformProps.

    // ── Resolve the split column ──
    const splitCol = resolveSplitColumn(fd);

    // ── Resolve X-axis column ──
    let xAxisCol = Array.isArray(fd.x_axis) ? fd.x_axis[0] : fd.x_axis;

    // For mini_map: boundary_level value is "level:columnName" (e.g. "3:district_city").
    // Extract the column name and use it as the OU disaggregation column,
    // REPLACING the manual x_axis.
    const isMiniMap = fd.mini_chart_type === 'mini_map';
    if (isMiniMap) {
      const blValue = String(fd.boundary_level || '');
      const colonIdx = blValue.indexOf(':');
      const ouCol = colonIdx >= 0 ? blValue.slice(colonIdx + 1) : null;
      if (ouCol) {
        xAxisCol = ouCol;
      }
    }

    // ── Build the columns list ──
    const columns: string[] = [];
    if (splitCol) columns.push(splitCol);
    if (xAxisCol) columns.push(xAxisCol);

    // Deduplicate
    const uniqueColumns = [...new Set(columns.filter(Boolean))];

    // If we have columns, this is a grouped query: columns are the GROUP BY
    // dimensions and metrics are the aggregations.
    if (uniqueColumns.length > 0) {
      query.columns = uniqueColumns;
    }
    const queryWithRowLimit = applySmallMultiplesRowLimit(query);

    return [queryWithRowLimit];
  });
}
