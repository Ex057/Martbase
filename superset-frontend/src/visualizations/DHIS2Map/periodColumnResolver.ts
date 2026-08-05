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
import { sanitizeDHIS2ColumnName } from '../../features/datasets/AddDataset/DHIS2ParameterBuilder/sanitize';

export type PeriodColumnLike = {
  column_name?: string | null;
  extra?: unknown;
};

function parseExtra(extra: unknown): Record<string, any> | undefined {
  if (!extra) return undefined;
  if (typeof extra === 'string') {
    try {
      return JSON.parse(extra);
    } catch {
      return undefined;
    }
  }
  if (typeof extra === 'object') return extra as Record<string, any>;
  return undefined;
}

/**
 * Resolve the PRIMARY DHIS2 period column for the map's period slider.
 *
 * DHIS2 serving datasets can expose two period-ish columns: the real `period`
 * (e.g. 202501, 202502, …) and a `period_variant` hierarchy helper that is
 * frequently blank. The slider must always lock onto the real one, or it
 * silently does nothing (an empty column yields zero distinct periods).
 *
 * Resolution order, most authoritative first:
 *   1. The datasource column explicitly marked as the primary period —
 *      `dhis2_period_key === 'period'`, or `dhis2_is_period === true` while NOT
 *      being a hierarchy variant. This is marker-driven, so it is deterministic
 *      regardless of column ordering or which columns happen to have loaded into
 *      the data rows yet (the root cause of the intermittent "slider sometimes
 *      doesn't work" behaviour on serving-schema datasets).
 *   2. An explicitly configured `periodColumns` entry that is present in the
 *      data.
 *   3. A name heuristic that prefers an EXACT `period` over any `*period*`
 *      variant, so the blank `period_variant` column can never win by ordering.
 *
 * Returns the actual key as it appears in `dataKeys`, or undefined when no
 * period column can be resolved.
 */
export function resolveDhis2PeriodColumn(
  dataKeys: string[],
  datasourceColumns: PeriodColumnLike[] = [],
  periodColumns: string[] = [],
): string | undefined {
  if (!dataKeys || !dataKeys.length) return undefined;

  const resolveInKeys = (name?: string | null): string | undefined => {
    if (!name) return undefined;
    const raw = String(name);
    if (dataKeys.includes(raw)) return raw;
    const sanitized = sanitizeDHIS2ColumnName(raw);
    return dataKeys.find(
      key => sanitizeDHIS2ColumnName(String(key)) === sanitized,
    );
  };

  // 1. Canonical primary-period marker.
  const primaryMeta = datasourceColumns.find(column => {
    const extra = parseExtra(column?.extra);
    if (!extra) return false;
    if (extra.dhis2_period_key === 'period') return true;
    return (
      extra.dhis2_is_period === true &&
      extra.dhis2_is_period_hierarchy !== true
    );
  });
  const primary = resolveInKeys(primaryMeta?.column_name);
  if (primary) return primary;

  // 2. Explicitly configured period columns.
  for (const column of periodColumns) {
    const hit = resolveInKeys(column);
    if (hit) return hit;
  }

  // 3. Name heuristic — an exact `period` beats any `*period*` variant.
  const exact = dataKeys.find(
    key => sanitizeDHIS2ColumnName(String(key)) === 'period',
  );
  if (exact) return exact;
  return dataKeys.find(key =>
    sanitizeDHIS2ColumnName(String(key)).includes('period'),
  );
}
