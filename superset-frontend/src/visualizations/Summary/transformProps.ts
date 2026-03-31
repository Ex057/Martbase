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
import {
  ChartProps,
  getMetricLabel,
  getNumberFormatter,
  isAdhocMetricSimple,
  QueryFormMetric,
  t,
} from '@superset-ui/core';
import {
  RgbaColor,
  SummaryChartProps,
  SummaryColorState,
  SummaryFormData,
  SummaryItem,
  SummaryLabelPosition,
  SummaryTrendDirection,
  SummaryValuePosition,
} from './types';

function cssRgba(color?: RgbaColor | null): string | null {
  if (!color) {
    return null;
  }
  return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}

function metricLabel(metric: QueryFormMetric | string, index: number): string {
  if (typeof metric === 'string') {
    return metric;
  }

  const adhocColumn = isAdhocMetricSimple(metric) ? metric.column : undefined;

  return (
    getMetricLabel(metric) ||
    metric?.label ||
    adhocColumn?.verbose_name ||
    adhocColumn?.column_name ||
    adhocColumn?.columnName ||
    `${t('Metric')} ${index + 1}`
  );
}

function normalizeAccessor(value?: string | null): string | null {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function resolveFieldValue(row: Record<string, any>, accessor?: string | null) {
  const normalized = normalizeAccessor(accessor);
  if (!normalized) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(row, normalized)) {
    return row[normalized];
  }

  const lowerAccessor = normalized.toLowerCase();
  const matchingKey = Object.keys(row).find(
    key => String(key).trim().toLowerCase() === lowerAccessor,
  );
  return matchingKey ? row[matchingKey] : undefined;
}

function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSparklineValues(value: any): number[] | undefined {
  if (Array.isArray(value)) {
    const parsed = value.map(Number).filter(Number.isFinite);
    return parsed.length > 0 ? parsed : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const values = parsed.map(Number).filter(Number.isFinite);
      return values.length > 0 ? values : undefined;
    }
  } catch {
    // noop
  }

  const values = value
    .split(',')
    .map(part => Number(part.trim()))
    .filter(Number.isFinite);
  return values.length > 0 ? values : undefined;
}

function parseColorOverride(value: any): RgbaColor | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (
    ['r', 'g', 'b', 'a'].every(key =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  ) {
    return value as RgbaColor;
  }
  return null;
}

function formatNumber(
  rawValue: any,
  formatter: (value: number) => string,
  nullText: string,
  prefix = '',
  suffix = '',
): { raw: number | null; formatted: string } {
  const numericValue = parseNumericValue(rawValue);
  if (numericValue === null) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return { raw: null, formatted: nullText };
    }
    return { raw: null, formatted: String(rawValue) };
  }
  return {
    raw: numericValue,
    formatted: `${prefix}${formatter(numericValue)}${suffix}`,
  };
}

function resolveDirection(
  explicitDirection: any,
  changeValue: number | null,
  higherIsBetter: boolean,
): SummaryTrendDirection {
  const normalized = String(explicitDirection || '')
    .trim()
    .toLowerCase();
  if (['up', 'increase', 'positive', 'good', 'higher'].includes(normalized)) {
    return 'up';
  }
  if (['down', 'decrease', 'negative', 'bad', 'lower'].includes(normalized)) {
    return 'down';
  }
  if (changeValue === null || changeValue === 0) {
    return 'neutral';
  }

  if (higherIsBetter) {
    return changeValue > 0 ? 'up' : 'down';
  }
  return changeValue > 0 ? 'down' : 'up';
}

function computeColorState(
  value: number | null,
  trendDirection: SummaryTrendDirection,
  thresholdMode: SummaryFormData['threshold_mode'],
  thresholdLow?: number | null,
  thresholdHigh?: number | null,
  higherIsBetter = true,
): SummaryColorState {
  if (thresholdMode === 'simple' && value !== null) {
    if (thresholdHigh !== null && thresholdHigh !== undefined) {
      if (higherIsBetter && value >= thresholdHigh) {
        return 'positive';
      }
      if (!higherIsBetter && value >= thresholdHigh) {
        return 'critical';
      }
    }
    if (thresholdLow !== null && thresholdLow !== undefined) {
      if (higherIsBetter && value <= thresholdLow) {
        return 'critical';
      }
      if (!higherIsBetter && value <= thresholdLow) {
        return 'positive';
      }
    }
    return 'warning';
  }

  if (trendDirection === 'up') {
    return higherIsBetter ? 'positive' : 'negative';
  }
  if (trendDirection === 'down') {
    return higherIsBetter ? 'negative' : 'positive';
  }
  return 'neutral';
}

function itemSortValue(
  item: SummaryItem,
  sortByField?: string | null,
): number | string {
  const accessor = normalizeAccessor(sortByField);
  if (!accessor) {
    return item.rawValue ?? item.label;
  }
  switch (accessor) {
    case '__label__':
      return item.label;
    case '__value__':
      return item.rawValue ?? Number.NEGATIVE_INFINITY;
    case '__change__':
      return item.changeValue ?? Number.NEGATIVE_INFINITY;
    case '__percent__':
      return item.percentValue ?? Number.NEGATIVE_INFINITY;
    default:
      return item.rawValue ?? item.label;
  }
}

export function sortItems(
  items: SummaryItem[],
  sortByField?: string | null,
  sortDesc = false,
): SummaryItem[] {
  return [...items].sort((left, right) => {
    const leftValue = itemSortValue(left, sortByField);
    const rightValue = itemSortValue(right, sortByField);
    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
    return sortDesc ? comparison * -1 : comparison;
  });
}

function resolveOverrideValuePosition(
  row: Record<string, any>,
  accessor?: string | null,
  fallback: SummaryValuePosition = 'justified',
): SummaryValuePosition {
  const value = String(resolveFieldValue(row, accessor) || '').trim();
  const valid: SummaryValuePosition[] = [
    'right',
    'left',
    'below',
    'above',
    'inline',
    'stacked',
    'justified',
  ];
  return valid.includes(value as SummaryValuePosition)
    ? (value as SummaryValuePosition)
    : fallback;
}

function resolveOverrideLabelPosition(
  row: Record<string, any>,
  accessor?: string | null,
  fallback: SummaryLabelPosition = 'above',
): SummaryLabelPosition {
  const value = String(resolveFieldValue(row, accessor) || '').trim();
  const valid: SummaryLabelPosition[] = [
    'above',
    'below',
    'left',
    'right',
    'inline',
  ];
  return valid.includes(value as SummaryLabelPosition)
    ? (value as SummaryLabelPosition)
    : fallback;
}

function buildMetricsAsItems(
  row: Record<string, any>,
  formData: SummaryFormData,
): SummaryItem[] {
  const valueFormatter = getNumberFormatter(
    formData.value_format || 'SMART_NUMBER',
  );
  const items = (formData.metrics || []).map((metric, index) => {
    const label = metricLabel(metric, index);
    const { raw, formatted } = formatNumber(
      resolveFieldValue(row, label) ??
        resolveFieldValue(row, metricLabel(metric, index)),
      valueFormatter,
      formData.null_text || t('N/A'),
      formData.prefix || '',
      formData.suffix || '',
    );

    return {
      id: `summary-metric-${index}`,
      label,
      formattedValue: formatted,
      rawValue: raw,
      trendDirection: 'neutral' as SummaryTrendDirection,
      colorState: 'neutral' as SummaryColorState,
      valuePosition: formData.value_position || 'justified',
      labelPosition: formData.label_position || 'above',
    };
  });

  return items;
}

function buildRowsAsItems(
  rows: Record<string, any>[],
  formData: SummaryFormData,
): SummaryItem[] {
  const valueFormatter = getNumberFormatter(
    formData.value_format || 'SMART_NUMBER',
  );
  const secondaryFormatter = getNumberFormatter(
    formData.secondary_format || formData.value_format || 'SMART_NUMBER',
  );
  const percentFormatter = getNumberFormatter(formData.percent_format || '.1%');
  const changeFormatter = getNumberFormatter(
    formData.change_format || formData.value_format || 'SMART_NUMBER',
  );
  const nullText = formData.null_text || t('N/A');

  return rows.map((row, index) => {
    const labelField = formData.label_field || formData.groupby?.[0];
    const rawLabel = resolveFieldValue(row, labelField);
    const label = String(rawLabel ?? `${t('Indicator')} ${index + 1}`);

    const { raw: rawValue, formatted: formattedValue } = formatNumber(
      resolveFieldValue(row, formData.value_field),
      valueFormatter,
      nullText,
      formData.prefix || '',
      formData.suffix || '',
    );
    const { raw: rawSecondaryValue, formatted: formattedSecondary } =
      formatNumber(
        resolveFieldValue(row, formData.secondary_value_field),
        secondaryFormatter,
        nullText,
        formData.secondary_prefix || '',
        formData.secondary_suffix || '',
      );
    const { raw: rawTargetValue, formatted: formattedTargetValue } =
      formatNumber(
        resolveFieldValue(row, formData.target_field),
        valueFormatter,
        nullText,
      );

    const percentRaw = resolveFieldValue(row, formData.percent_field);
    const percentValue = parseNumericValue(percentRaw);
    const formattedPercent =
      percentValue === null ? undefined : percentFormatter(percentValue);

    const changeRaw = resolveFieldValue(row, formData.change_field);
    const changeValue = parseNumericValue(changeRaw);
    const formattedChange =
      changeValue === null
        ? undefined
        : `${changeValue >= 0 ? '+' : ''}${changeFormatter(changeValue)}`;

    const trendDirection = resolveDirection(
      resolveFieldValue(row, formData.direction_field),
      changeValue,
      formData.higher_is_better ?? true,
    );
    const colorState = computeColorState(
      rawValue,
      trendDirection,
      formData.threshold_mode,
      formData.threshold_low,
      formData.threshold_high,
      formData.higher_is_better ?? true,
    );

    const progressPercent =
      rawValue !== null && rawTargetValue !== null && rawTargetValue !== 0
        ? Math.max(0, Math.min((rawValue / rawTargetValue) * 100, 100))
        : null;

    return {
      id: `summary-row-${index}`,
      label,
      formattedValue,
      rawValue,
      formattedSecondary:
        normalizeAccessor(formData.secondary_value_field) !== null
          ? formattedSecondary
          : undefined,
      rawSecondaryValue,
      formattedPercent,
      percentValue,
      formattedChange,
      changeValue,
      trendDirection,
      note:
        String(resolveFieldValue(row, formData.note_field) || '').trim() ||
        undefined,
      subtitle:
        String(resolveFieldValue(row, formData.note_field) || '').trim() ||
        undefined,
      targetLabel:
        normalizeAccessor(formData.target_field) !== null
          ? t('Target')
          : undefined,
      rawTargetValue,
      formattedTargetValue:
        normalizeAccessor(formData.target_field) !== null
          ? formattedTargetValue
          : undefined,
      icon:
        String(resolveFieldValue(row, formData.icon_field) || '').trim() ||
        undefined,
      badge:
        String(resolveFieldValue(row, formData.badge_field) || '').trim() ||
        undefined,
      itemColor: cssRgba(
        parseColorOverride(resolveFieldValue(row, formData.item_color_field)),
      ),
      colorState,
      valuePosition: resolveOverrideValuePosition(
        row,
        formData.value_position_field,
        formData.value_position || 'justified',
      ),
      labelPosition: resolveOverrideLabelPosition(
        row,
        formData.label_position_field,
        formData.label_position || 'above',
      ),
      sparklineValues: normalizeSparklineValues(
        resolveFieldValue(row, formData.sparkline_field),
      ),
      progressPercent,
    };
  });
}

export default function transformProps(
  chartProps: ChartProps,
): SummaryChartProps {
  const { width, height, queriesData, formData, hooks } = chartProps;
  const fd = formData as SummaryFormData;
  const rows = (queriesData?.[0]?.data || []) as Record<string, any>[];
  const displayMode = fd.display_mode || 'metrics_as_items';
  const items =
    displayMode === 'rows_as_items'
      ? buildRowsAsItems(rows, fd)
      : buildMetricsAsItems(rows[0] || {}, fd);

  return {
    width,
    height,
    items: sortItems(items, fd.sort_by_field, fd.sort_desc ?? true),
    displayMode,
    layoutMode: fd.layout_mode || 'vertical_list',
    density: fd.density || 'compact',
    columnsCount: fd.columns_count || 3,
    autoColumns: fd.auto_columns ?? true,
    itemAlignment: fd.item_alignment || 'stretch',
    labelPosition: fd.label_position || 'above',
    valuePosition: fd.value_position || 'justified',
    showDividers: fd.show_dividers ?? true,
    cardMode: fd.card_mode ?? true,
    shadedRows: fd.shaded_rows ?? false,
    labelFontSize: fd.label_font_size || 12,
    valueFontSize: fd.value_font_size || 28,
    secondaryFontSize: fd.secondary_font_size || 12,
    labelFontWeight: fd.label_font_weight || '500',
    valueFontWeight: fd.value_font_weight || '700',
    secondaryFontWeight: fd.secondary_font_weight || '500',
    truncateLabel: fd.truncate_label ?? false,
    wrapLabel: fd.wrap_label ?? true,
    microVisualType: fd.micro_visual_type || 'none',
    microVisualPosition: fd.micro_visual_position || 'right',
    deltaDisplay: fd.delta_display || 'value',
    higherIsBetter: fd.higher_is_better ?? true,
    positiveColor: cssRgba(fd.positive_color),
    negativeColor: cssRgba(fd.negative_color),
    neutralColor: cssRgba(fd.neutral_color),
    warningColor: cssRgba(fd.warning_color),
    criticalColor: cssRgba(fd.critical_color),
    infoColor: cssRgba(fd.info_color),
    valueColor: cssRgba(fd.value_color),
    labelColor: cssRgba(fd.label_color),
    secondaryColor: cssRgba(fd.secondary_color),
    deltaColor: cssRgba(fd.delta_color),
    backgroundColor: cssRgba(fd.background_color),
    itemBackgroundColor: cssRgba(fd.item_background_color),
    borderColor: cssRgba(fd.border_color),
    dividerColor: cssRgba(fd.divider_color),
    microVisualColor: cssRgba(fd.micro_visual_color),
    borderRadius: fd.border_radius ?? 14,
    borderWidth: fd.border_width ?? 1,
    shadowSize: fd.shadow_size || 'small',
    spacingScale: fd.spacing_scale ?? 1,
    showGroupHeader: fd.show_group_header ?? false,
    groupHeaderText: fd.group_header_text || '',
    onContextMenu: hooks?.onContextMenu,
  };
}

export {
  buildMetricsAsItems,
  buildRowsAsItems,
  computeColorState,
  normalizeSparklineValues,
  resolveDirection,
};
