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
 * Relative-period support for the DHIS2 column filter.
 *
 * A relative period (e.g. "Last 12 months", "This year") maps to a date WINDOW,
 * and resolves to every period code that OVERLAPS that window — regardless of
 * the code's own granularity. So "This year" over monthly data selects that
 * year's months, "Last quarter" over monthly data selects the previous
 * quarter's three months, and "Last 5 years" over yearly data selects the five
 * year codes.
 *
 * There are two ways to anchor the window:
 *
 *   - {@link expandRelativePeriod} anchors on the most recent period PRESENT IN
 *     THE DATA and picks from the codes the data actually has. It never selects
 *     an empty period, which makes it right for previews.
 *   - {@link expandRelativeTokenByCalendar} anchors on TODAY and generates the
 *     codes itself. This is what queries use: the token is stored in the chart
 *     and re-resolved on every query, so a chart follows the data as it syncs
 *     instead of freezing the codes that existed when it was saved.
 *
 * Periods are compared in "month units": ym = year * 12 + (monthIndex 0-11).
 */

export type PeriodGranularity = 'month' | 'quarter' | 'year';

/** Prefix distinguishing a relative token from a concrete period code in the Select. */
export const RELATIVE_PERIOD_PREFIX = 'REL::';

export interface PeriodRange {
  granularity: PeriodGranularity;
  /** First month covered, in ym units (year * 12 + monthIndex). */
  startYM: number;
  /** Last month covered, in ym units (inclusive). */
  endYM: number;
}

/**
 * Convert a DHIS2 period code to the month-range it spans, or undefined for
 * codes we don't handle (daily, weekly, six-monthly…).
 */
export function periodToRange(code: string): PeriodRange | undefined {
  const value = String(code || '').trim();
  // Yearly: yyyy (e.g. 2024)
  if (/^\d{4}$/.test(value)) {
    const year = Number(value);
    return { granularity: 'year', startYM: year * 12, endYM: year * 12 + 11 };
  }
  // Monthly: yyyyMM (e.g. 202401)
  if (/^\d{6}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    if (month >= 1 && month <= 12) {
      const ym = year * 12 + (month - 1);
      return { granularity: 'month', startYM: ym, endYM: ym };
    }
    return undefined;
  }
  // Quarterly: yyyyQn (e.g. 2024Q1)
  const quarter = value.match(/^(\d{4})Q([1-4])$/);
  if (quarter) {
    const year = Number(quarter[1]);
    const startMonth = (Number(quarter[2]) - 1) * 3;
    const start = year * 12 + startMonth;
    return { granularity: 'quarter', startYM: start, endYM: start + 2 };
  }
  return undefined;
}

/** The granularity + a sortable order for a period code (order = start month). */
export function classifyPeriodCode(
  code: string,
): { granularity: PeriodGranularity; order: number } | undefined {
  const range = periodToRange(code);
  return range
    ? { granularity: range.granularity, order: range.startYM }
    : undefined;
}

/** The set of granularities that appear among the given concrete period codes. */
export function availableGranularities(
  codes: string[],
): Set<PeriodGranularity> {
  const result = new Set<PeriodGranularity>();
  codes.forEach(code => {
    const info = classifyPeriodCode(code);
    if (info) result.add(info.granularity);
  });
  return result;
}

// Each token maps the anchor month (ym of the most recent period) to an
// inclusive [start, end] month window.
const quarterStartOf = (ym: number): number => {
  const year = Math.floor(ym / 12);
  const month = ym % 12;
  return year * 12 + Math.floor(month / 3) * 3;
};
const yearStartOf = (ym: number): number => Math.floor(ym / 12) * 12;

const RELATIVE_TOKEN_WINDOWS: Record<
  string,
  (anchorEndYM: number) => [number, number]
> = {
  THIS_MONTH: e => [e, e],
  LAST_MONTH: e => [e - 1, e - 1],
  LAST_3_MONTHS: e => [e - 2, e],
  LAST_6_MONTHS: e => [e - 5, e],
  LAST_12_MONTHS: e => [e - 11, e],
  THIS_QUARTER: e => [quarterStartOf(e), quarterStartOf(e) + 2],
  LAST_QUARTER: e => [quarterStartOf(e) - 3, quarterStartOf(e) - 1],
  LAST_4_QUARTERS: e => [quarterStartOf(e) - 9, quarterStartOf(e) + 2],
  THIS_YEAR: e => [yearStartOf(e), yearStartOf(e) + 11],
  LAST_YEAR: e => [yearStartOf(e) - 12, yearStartOf(e) - 1],
  LAST_5_YEARS: e => [yearStartOf(e) - 48, yearStartOf(e) + 11],
};

/** Relative-period options grouped by granularity, for the Select dropdown. */
export const RELATIVE_PERIOD_GROUPS: Array<{
  granularity: PeriodGranularity;
  label: string;
  tokens: Array<{ token: string; label: string }>;
}> = [
  {
    granularity: 'month',
    label: 'Relative · Monthly',
    tokens: [
      { token: 'THIS_MONTH', label: 'This month' },
      { token: 'LAST_MONTH', label: 'Last month' },
      { token: 'LAST_3_MONTHS', label: 'Last 3 months' },
      { token: 'LAST_6_MONTHS', label: 'Last 6 months' },
      { token: 'LAST_12_MONTHS', label: 'Last 12 months' },
    ],
  },
  {
    granularity: 'quarter',
    label: 'Relative · Quarterly',
    tokens: [
      { token: 'THIS_QUARTER', label: 'This quarter' },
      { token: 'LAST_QUARTER', label: 'Last quarter' },
      { token: 'LAST_4_QUARTERS', label: 'Last 4 quarters' },
    ],
  },
  {
    granularity: 'year',
    label: 'Relative · Yearly',
    tokens: [
      { token: 'THIS_YEAR', label: 'This year' },
      { token: 'LAST_YEAR', label: 'Last year' },
      { token: 'LAST_5_YEARS', label: 'Last 5 years' },
    ],
  },
];

const RELATIVE_TOKEN_LABELS: Record<string, string> = {};
RELATIVE_PERIOD_GROUPS.forEach(group =>
  group.tokens.forEach(({ token, label }) => {
    RELATIVE_TOKEN_LABELS[token] = label;
  }),
);

/** The human label for a relative token, e.g. "Last 4 quarters". */
export function relativeTokenLabel(token: string): string {
  return RELATIVE_TOKEN_LABELS[token] || '';
}

/**
 * Which relative-period groups to offer for the given data. Coarser granularities
 * roll up from finer ones, so monthly data unlocks month + quarter + year, and
 * quarterly data unlocks quarter + year.
 */
export function getVisibleRelativeGroups(
  codes: string[],
): typeof RELATIVE_PERIOD_GROUPS {
  const grans = availableGranularities(codes);
  const hasMonth = grans.has('month');
  const hasQuarter = grans.has('quarter');
  const hasYear = grans.has('year');
  return RELATIVE_PERIOD_GROUPS.filter(group => {
    if (group.granularity === 'month') return hasMonth;
    if (group.granularity === 'quarter') return hasMonth || hasQuarter;
    return hasMonth || hasQuarter || hasYear; // year
  });
}

/**
 * Expand a relative token into the concrete period codes it selects, drawn from
 * the codes present in the data (most-recent-first). Any code whose month-range
 * overlaps the token's window is included, so tokens resolve across
 * granularities (e.g. a "This year" token selects that year's monthly codes).
 */
export function expandRelativePeriod(
  token: string,
  availableCodes: string[],
): string[] {
  const window = RELATIVE_TOKEN_WINDOWS[token];
  if (!window) return [];
  const ranges = availableCodes
    .map(code => ({ code, range: periodToRange(code) }))
    .filter(
      (entry): entry is { code: string; range: PeriodRange } =>
        entry.range !== undefined,
    );
  if (!ranges.length) return [];
  const anchorEndYM = Math.max(...ranges.map(entry => entry.range.endYM));
  const [windowStart, windowEnd] = window(anchorEndYM);
  return ranges
    .filter(
      entry =>
        entry.range.endYM >= windowStart && entry.range.startYM <= windowEnd,
    )
    .sort((a, b) => b.range.startYM - a.range.startYM)
    .map(entry => entry.code);
}

/** True when a stored filter value is a relative token rather than a period code. */
export function isRelativeValue(value: string): boolean {
  return String(value || '').startsWith(RELATIVE_PERIOD_PREFIX);
}

/** The bare token behind a `REL::`-prefixed value, or undefined for period codes. */
export function relativeTokenOf(value: string): string | undefined {
  const raw = String(value || '');
  return raw.startsWith(RELATIVE_PERIOD_PREFIX)
    ? raw.slice(RELATIVE_PERIOD_PREFIX.length)
    : undefined;
}

const monthCode = (ym: number): string =>
  `${Math.floor(ym / 12)}${String((ym % 12) + 1).padStart(2, '0')}`;
const quarterCode = (ym: number): string =>
  `${Math.floor(ym / 12)}Q${Math.floor((ym % 12) / 3) + 1}`;
const yearCode = (ym: number): string => String(Math.floor(ym / 12));

/**
 * Windows for the CALENDAR anchor, where the anchor month `e` is the current,
 * in-progress month rather than the newest month that has data.
 *
 * These are NOT the same as RELATIVE_TOKEN_WINDOWS. Under a data anchor,
 * "last 12 months" naturally ends on the newest month with data, so the window
 * is [e-11, e]. Under a calendar anchor, `e` has barely started, and DHIS2
 * defines LAST_N as the last N *completed* periods — so the window ends at e-1
 * and reaches back N. THIS_* tokens still include the current period.
 *
 * This table deliberately mirrors `_expand_relative_period` in
 * superset/dhis2/sync_service.py. If the two disagree, a chart asks for periods
 * the sync never fetches (and skips ones it did), which is exactly the drift
 * this feature exists to eliminate.
 */
const CALENDAR_TOKEN_WINDOWS: Record<
  string,
  (anchorYM: number) => [number, number]
> = {
  THIS_MONTH: e => [e, e],
  LAST_MONTH: e => [e - 1, e - 1],
  LAST_3_MONTHS: e => [e - 3, e - 1],
  LAST_6_MONTHS: e => [e - 6, e - 1],
  LAST_12_MONTHS: e => [e - 12, e - 1],
  THIS_QUARTER: e => [quarterStartOf(e), quarterStartOf(e) + 2],
  LAST_QUARTER: e => [quarterStartOf(e) - 3, quarterStartOf(e) - 1],
  LAST_4_QUARTERS: e => [quarterStartOf(e) - 12, quarterStartOf(e) - 1],
  THIS_YEAR: e => [yearStartOf(e), yearStartOf(e) + 11],
  LAST_YEAR: e => [yearStartOf(e) - 12, yearStartOf(e) - 1],
  LAST_5_YEARS: e => [yearStartOf(e) - 60, yearStartOf(e) - 1],
};

/**
 * Expand a relative token into the period codes it selects, anchored on `today`
 * rather than on the data.
 *
 * Emits a code at every granularity the window overlaps — months, quarters and
 * years — because the caller (a query builder) cannot see which granularity the
 * period column actually uses. Codes the column doesn't contain simply fail to
 * match the resulting `IN` list, so over-generating is safe. The overlap rule is
 * the same one {@link expandRelativePeriod} applies.
 */
export function expandRelativeTokenByCalendar(
  token: string,
  today: Date = new Date(),
): string[] {
  const window = CALENDAR_TOKEN_WINDOWS[token];
  if (!window) return [];
  const anchorYM = today.getFullYear() * 12 + today.getMonth();
  const [windowStart, windowEnd] = window(anchorYM);
  if (windowEnd < windowStart) return [];

  const codes: string[] = [];
  for (let ym = windowStart; ym <= windowEnd; ym += 1) {
    codes.push(monthCode(ym));
  }
  for (let ym = quarterStartOf(windowStart); ym <= windowEnd; ym += 3) {
    codes.push(quarterCode(ym));
  }
  for (let ym = yearStartOf(windowStart); ym <= windowEnd; ym += 12) {
    codes.push(yearCode(ym));
  }
  return codes;
}

/**
 * Resolve stored filter values into the concrete period codes to query with:
 * relative tokens expand against `today`, plain codes pass through. Order is
 * preserved and duplicates are dropped.
 */
export function resolveFilterValues(
  values: string[],
  today: Date = new Date(),
): string[] {
  const resolved: string[] = [];
  (values || []).forEach(value => {
    const token = relativeTokenOf(value);
    if (token) {
      resolved.push(...expandRelativeTokenByCalendar(token, today));
    } else if (value) {
      resolved.push(value);
    }
  });
  return Array.from(new Set(resolved));
}
