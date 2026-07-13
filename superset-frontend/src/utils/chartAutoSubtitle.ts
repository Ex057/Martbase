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
 * Auto subtitle: a one-line description of the filters a chart is showing.
 *
 *   "Region: Bukedi, Busoga · Last 12 months · Year > 2020"
 *
 * Shared by every chart type. The rule is that the subtitle describes the
 * ACTIVE FILTERS and nothing else — not the metric, not the dimensions, which
 * the axes, legend and title already say. A chart may prepend its own context
 * segments (the DHIS2 map leads with its org-unit scope) but the filter
 * segments themselves are built identically everywhere.
 *
 * Two filter sources are understood:
 *   - `adhoc_filters`, the standard control every chart has;
 *   - `dhis2_column_filters`, the DHIS2 Data Filters control, whose period
 *     values may be relative tokens ("REL::LAST_12_MONTHS" → "Last 12 months").
 *
 * IMPORTANT: `ChartProps` camelCases top-level formData keys (`rawFormData`
 * keeps the originals), so a chart's transformProps sees `adhocFilters` and
 * `dhis2ColumnFilters`. The readers below accept either spelling — reading only
 * the snake_case name silently yields an empty subtitle.
 */
import { formatDHIS2Period, t } from '@superset-ui/core';
import {
  isRelativeValue,
  relativeTokenLabel,
  relativeTokenOf,
} from 'src/explore/components/controls/DHIS2ColumnFilterControl/relativePeriods';

/** How many values to name before collapsing into "+N more". */
export const DEFAULT_MAX_VALUES = 3;

/** The separator between subtitle segments. */
export const SEGMENT_SEPARATOR = ' · ';

/** One filter, as the subtitle sees it. */
export interface SubtitleFilter {
  /** Column display label, e.g. "Data element". */
  label: string;
  values: string[];
  /** Values are DHIS2 periods (relative tokens or period codes). */
  isPeriod?: boolean;
  /** Legacy display label for charts saved before relative tokens were stored. */
  relativeLabel?: string;
  /**
   * Rendered verbatim in place of "label: values". Used for operators that
   * don't read as a list, e.g. "Year > 2020" or "Region is not null".
   */
  text?: string;
}

/** Minimal shape of a datasource column, for resolving display labels. */
export interface LabelledColumn {
  column_name?: string;
  verbose_name?: string | null;
  /** JSON string or object; `parseColumnExtra` handles either. */
  extra?: unknown;
}

export function parseColumnExtra(
  extra: unknown,
): Record<string, any> | undefined {
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

/** Does a value look like a DHIS2 period code (202401, 2024Q1, 2024, …)? */
export function looksLikeDHIS2Period(value: string): boolean {
  const v = String(value || '').trim();
  return (
    /^\d{4}$/.test(v) ||
    /^\d{6}$/.test(v) ||
    /^\d{8}$/.test(v) ||
    /^\d{4}Q[1-4]$/.test(v) ||
    /^\d{4}W\d{1,2}$/.test(v) ||
    /^\d{4}S[12]$/.test(v) ||
    /^\d{4}(April|July|Oct|Nov|Sep)$/.test(v)
  );
}

/**
 * List a filter's values, keeping the subtitle to one line:
 * "NDVI, Heat stress, Precipitation +3 more".
 */
export function summarizeValues(
  values: string[],
  max = DEFAULT_MAX_VALUES,
): string {
  const shown = values.slice(0, max).join(', ');
  const extra = values.length - max;
  return extra > 0 ? `${shown} +${extra} more` : shown;
}

/**
 * Format period codes: one as-is, several as an earliest – latest range.
 * Relative tokens are skipped — they render from their label, not their codes.
 */
export function formatPeriodList(codes: string[]): string {
  const sorted = Array.from(
    new Set(codes.filter(code => code && !isRelativeValue(code))),
  ).sort();
  if (!sorted.length) return '';
  const format = (code: string) => formatDHIS2Period(code) || code;
  if (sorted.length === 1) return format(sorted[0]);
  return `${format(sorted[0])} – ${format(sorted[sorted.length - 1])}`;
}

/** The combined label of every relative token in a set of values. */
export function relativeLabelOf(values: string[]): string {
  return (values || [])
    .map(value => relativeTokenOf(value))
    .filter((token): token is string => Boolean(token))
    .map(relativeTokenLabel)
    .filter(Boolean)
    .join(', ');
}

/**
 * Render a period filter's values. It can hold relative tokens, fixed codes, or
 * both, and the query filters on all of them — so name all of them.
 */
export function describePeriodValues(
  values: string[],
  relativeLabel?: string,
): string {
  const selected = (values || []).filter(Boolean);
  const tokenLabel = relativeLabelOf(selected);
  const fixedCodes = selected.filter(value => !isRelativeValue(value));

  if (tokenLabel) {
    // Fixed codes alongside a token are extra periods the user added.
    const extras = formatPeriodList(fixedCodes);
    return extras ? `${tokenLabel}, ${extras}` : tokenLabel;
  }
  if (relativeLabel) {
    // Saved before tokens were persisted: `values` IS the expansion of
    // `relativeLabel`, so listing the codes would just repeat the label.
    return relativeLabel;
  }
  return formatPeriodList(fixedCodes) || summarizeValues(fixedCodes);
}

/** Render one filter as a subtitle segment. */
export function renderFilterSegment(filter: SubtitleFilter): string {
  if (filter.text) return filter.text;
  if (!filter.values?.length) return '';
  if (filter.isPeriod) {
    // A period reads as a heading on its own — no column label.
    return describePeriodValues(filter.values, filter.relativeLabel);
  }
  const values = summarizeValues(filter.values);
  return values && filter.label ? `${filter.label}: ${values}` : values;
}

/**
 * Join context and filter segments into the final subtitle.
 * Empty segments are dropped, so a chart with no filters gets its prefix alone.
 */
export function buildAutoSubtitle({
  prefix = [],
  filters = [],
  suffix = [],
}: {
  prefix?: string[];
  filters?: SubtitleFilter[];
  suffix?: string[];
}): string {
  return [...prefix, ...filters.map(renderFilterSegment), ...suffix]
    .map(segment => String(segment || '').trim())
    .filter(Boolean)
    .join(SEGMENT_SEPARATOR)
    .trim();
}

// ---------------------------------------------------------------------------
// Reading filters out of formData
// ---------------------------------------------------------------------------

/** Read a formData key by either its camelCase or snake_case spelling. */
function readFormDataKey(
  formData: Record<string, any> | undefined,
  camelCase: string,
  snakeCase: string,
): any {
  return formData?.[camelCase] ?? formData?.[snakeCase];
}

/** Resolve a column's display label from the datasource. */
export function makeColumnLabeller(columns: LabelledColumn[] = []) {
  return (columnName: string): string => {
    const match = columns.find(
      column => String(column?.column_name) === columnName,
    );
    return match?.verbose_name || match?.column_name || columnName;
  };
}

const OPERATOR_PHRASES: Record<string, string> = {
  '!=': '≠',
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
};

/**
 * Turn `adhoc_filters` into subtitle segments.
 *
 * An `IN` on a set reads as a list ("Region: Bukedi, Busoga"); comparisons read
 * as an expression ("Year > 2020"); a raw SQL filter shows its own label. A
 * filter marked `isExtra` came from a dashboard filter rather than the chart,
 * and is skipped so the subtitle describes the saved chart.
 */
export function adhocFilterSegments(
  adhocFilters: any[],
  columnLabel: (columnName: string) => string,
): SubtitleFilter[] {
  return (adhocFilters || [])
    .filter(filter => filter && !filter.isExtra)
    .map((filter): SubtitleFilter | null => {
      if (filter.expressionType === 'SQL') {
        const text = String(filter.label || filter.sqlExpression || '').trim();
        return text ? { label: '', values: [], text } : null;
      }
      const { subject, operator, comparator } = filter;
      if (!subject || !operator) return null;
      const label = columnLabel(String(subject));

      if (operator === 'IS NULL') {
        return { label, values: [], text: t('%s is null', label) };
      }
      if (operator === 'IS NOT NULL') {
        return { label, values: [], text: t('%s is not null', label) };
      }

      const values = (Array.isArray(comparator) ? comparator : [comparator])
        .filter(value => value !== undefined && value !== null && value !== '')
        .map(String);
      if (!values.length) return null;

      if (operator === 'IN') return { label, values };
      if (operator === 'NOT IN') {
        return {
          label,
          values,
          text: `${label} ${t('not in')}: ${summarizeValues(values)}`,
        };
      }
      if (operator === 'TEMPORAL_RANGE') {
        return { label, values, text: `${label}: ${values.join(', ')}` };
      }
      if (operator === '==') return { label, values };

      const phrase = OPERATOR_PHRASES[operator] || operator;
      return { label, values, text: `${label} ${phrase} ${values.join(', ')}` };
    })
    .filter((segment): segment is SubtitleFilter => segment !== null);
}

/**
 * Turn `dhis2_column_filters` into subtitle segments.
 *
 * A filter is a period filter when its column is flagged as one on the
 * datasource, or is the chart's time column. Only when the datasource declares
 * no period column at all do we guess from the values — a guess that would
 * otherwise misread a region filter on "2024".
 */
export function dhis2FilterSegments(
  columnFilters: any[],
  {
    columnLabel,
    periodColumns = [],
    timeColumn,
  }: {
    columnLabel: (columnName: string) => string;
    periodColumns?: string[];
    timeColumn?: string;
  },
): SubtitleFilter[] {
  const periodColumnNames = new Set(periodColumns);
  const isPeriodFilter = (filter: { column?: string; values?: string[] }) => {
    if (periodColumnNames.has(String(filter.column))) return true;
    if (typeof timeColumn === 'string' && filter.column === timeColumn) {
      return true;
    }
    if (periodColumnNames.size) return false;
    return (filter.values || []).every(
      value =>
        isRelativeValue(String(value)) || looksLikeDHIS2Period(String(value)),
    );
  };

  return (columnFilters || [])
    .filter(filter => filter?.column && (filter.values?.length ?? 0) > 0)
    .map(filter => ({
      label: columnLabel(String(filter.column)),
      values: (filter.values || []).map(String),
      isPeriod: isPeriodFilter(filter),
      relativeLabel: filter.relativeLabel,
    }));
}

/** The period columns a datasource declares, regardless of the query result. */
export function datasourcePeriodColumns(columns: LabelledColumn[] = []) {
  return columns
    .filter(column => {
      const extra = parseColumnExtra(column?.extra);
      return (
        Boolean(column?.column_name) &&
        (extra?.dhis2_is_period === true || extra?.dhis2IsPeriod === true)
      );
    })
    .map(column => column.column_name as string);
}

/**
 * The subtitle for a chart that has no context of its own: every active filter,
 * in the order the user added them. This is what the shared ECharts title
 * helper calls, so all 22 chart types behave identically.
 */
export function buildFilterSubtitle(
  formData: Record<string, any> | undefined,
  columns: LabelledColumn[] = [],
  extraPrefix: string[] = [],
): string {
  const columnLabel = makeColumnLabeller(columns);
  const timeColumn = readFormDataKey(
    formData,
    'granularitySqla',
    'granularity_sqla',
  );

  const adhoc = readFormDataKey(formData, 'adhocFilters', 'adhoc_filters');
  const dhis2 = readFormDataKey(
    formData,
    'dhis2ColumnFilters',
    'dhis2_column_filters',
  );

  return buildAutoSubtitle({
    prefix: extraPrefix,
    filters: [
      ...dhis2FilterSegments(Array.isArray(dhis2) ? dhis2 : [], {
        columnLabel,
        periodColumns: datasourcePeriodColumns(columns),
        timeColumn: typeof timeColumn === 'string' ? timeColumn : undefined,
      }),
      ...adhocFilterSegments(Array.isArray(adhoc) ? adhoc : [], columnLabel),
    ],
  });
}

/** True when the chart opted into an auto-generated subtitle. */
export function isAutoSubtitleEnabled(
  formData: Record<string, any> | undefined,
): boolean {
  return Boolean(
    readFormDataKey(formData, 'chartAutoSubtitle', 'chart_auto_subtitle'),
  );
}

// ---------------------------------------------------------------------------
// The title block: title + (manual or auto) subtitle, resolved for rendering
// ---------------------------------------------------------------------------

/** RGBA colour object as stored by ColorPickerControl. */
export type ColorObj = { r: number; g: number; b: number; a?: number };

/**
 * Convert a ColorPickerControl value ({ r, g, b, a }) to a CSS colour string,
 * or undefined when unset so the caller's default colour is used instead.
 */
export function pickerToCssColor(color?: ColorObj): string | undefined {
  if (
    !color ||
    typeof color.r !== 'number' ||
    typeof color.g !== 'number' ||
    typeof color.b !== 'number'
  ) {
    return undefined;
  }
  const { r, g, b, a } = color;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return typeof a === 'number' && a < 1
    ? `rgba(${r}, ${g}, ${b}, ${a})`
    : `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Everything a title block needs to render, resolved from formData. */
export interface ResolvedChartTitle {
  title: string;
  subtitle: string;
  titleColor?: string;
  subtitleColor?: string;
  align: 'left' | 'center';
}

/**
 * Resolve the title block from a chart's (camelCased) formData and its
 * datasource columns. Title is the user's wording; subtitle is either their
 * wording or, when Auto subtitle is on, the generated filter description. This
 * is the single bridge every chart type uses — the ECharts helper and the React
 * component both build on it, so they can never drift.
 */
export function resolveChartTitle(
  formData: Record<string, any> | undefined,
  columns: LabelledColumn[] = [],
  extraPrefix: string[] = [],
): ResolvedChartTitle {
  const title =
    (readFormDataKey(formData, 'chartTitle', 'chart_title') &&
      String(readFormDataKey(formData, 'chartTitle', 'chart_title')).trim()) ||
    '';
  const manualSubtitle =
    (readFormDataKey(formData, 'chartSubtitle', 'chart_subtitle') &&
      String(
        readFormDataKey(formData, 'chartSubtitle', 'chart_subtitle'),
      ).trim()) ||
    '';
  const subtitle = isAutoSubtitleEnabled(formData)
    ? buildFilterSubtitle(formData, columns, extraPrefix)
    : manualSubtitle;

  return {
    title,
    subtitle,
    titleColor: pickerToCssColor(
      readFormDataKey(formData, 'chartTitleColor', 'chart_title_color'),
    ),
    subtitleColor: pickerToCssColor(
      readFormDataKey(formData, 'chartSubtitleColor', 'chart_subtitle_color'),
    ),
    align:
      readFormDataKey(formData, 'chartTitleAlign', 'chart_title_align') === 'left'
        ? 'left'
        : 'center',
  };
}

/** Height (px) a rendered title block occupies, for charts that reserve space. */
export function chartTitleHeight(resolved: {
  title: string;
  subtitle: string;
}): number {
  if (!resolved.title && !resolved.subtitle) return 0;
  return resolved.subtitle ? 48 : 30;
}
