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
  getMetricLabel,
  getCategoricalSchemeRegistry,
  getSequentialSchemeRegistry,
} from '@superset-ui/core';
import {
  SmallMultiplesFormData,
  SmallMultiplesChartProps,
  PanelData,
  PanelSeries,
  ReferenceLineMode,
} from './types';
import { resolvePresetColumn } from './dhis2Presets';
import { formatDhis2Period, getDhis2PeriodSortKey } from './periodUtils';

const DEFAULT_COLORS = [
  '#1976D2',
  '#E53935',
  '#43A047',
  '#FB8C00',
  '#8E24AA',
  '#00ACC1',
  '#D81B60',
  '#3949AB',
  '#00897B',
  '#F4511E',
];

function resolveDatabaseId(datasource: any, formData: any): number | undefined {
  const dsAny = datasource || {};
  const extra = dsAny.extra
    ? typeof dsAny.extra === 'string'
      ? JSON.parse(dsAny.extra)
      : dsAny.extra
    : {};
  return (
    extra.dhis2_source_database_id ||
    extra.dhis2SourceDatabaseId ||
    extra.source_database_id ||
    dsAny.database?.id ||
    dsAny.database_id ||
    formData?.dhis2SourceDatabaseId ||
    formData?.dhis2_source_database_id ||
    formData?.database_id ||
    undefined
  );
}

function fdValue<T = any>(
  formData: any,
  camelKey: string,
  snakeKey: string,
): T {
  return formData?.[camelKey] ?? formData?.[snakeKey];
}

function fdArrayValue<T = any>(
  formData: any,
  camelKey: string,
  snakeKey: string,
): T[] {
  const value = fdValue<T | T[]>(formData, camelKey, snakeKey);
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function metricValueKeys(metric: any, label: string): string[] {
  return [
    label,
    metric?.label,
    metric?.column?.columnName,
    metric?.column?.column_name,
    metric?.sqlExpression,
    metric?.optionName,
  ].filter(Boolean);
}

function getRowMetricValue(row: Record<string, any>, keys: string[]): number {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = Number(row[key]);
      return Number.isFinite(value) ? value : 0;
    }
  }
  return 0;
}

export default function transformProps(
  chartProps: any,
): SmallMultiplesChartProps {
  const { width, height, formData, queriesData, datasource } = chartProps;
  const fd = formData as SmallMultiplesFormData;
  const data: Record<string, any>[] = queriesData?.[0]?.data || [];

  // Resolve split column — DHIS2 preset takes priority over manual groupby
  const dataColumns = data.length > 0 ? Object.keys(data[0]) : [];
  const dsColumns = datasource?.columns || [];
  let groupCol: string;

  // Hidden control _resolved_split_col → camelCase resolvedSplitCol
  const presetCol =
    fdValue(fd, 'resolvedSplitCol', '_resolved_split_col') ||
    resolvePresetColumn(
      fdValue(fd, 'dhis2SplitPreset', 'dhis2_split_preset'),
      dsColumns,
      dataColumns,
    );
  if (presetCol) {
    groupCol = presetCol;
  } else {
    groupCol = Array.isArray(fd.groupby) ? fd.groupby[0] : fd.groupby;
  }

  const miniChartType =
    fdValue(fd, 'miniChartType', 'mini_chart_type') || 'line';
  const isMiniMap = miniChartType === 'mini_map';
  const xAxis = fdArrayValue<string>(fd, 'xAxis', 'x_axis');
  let xCol = xAxis[0];

  // For mini_map: boundary_level value is "level:columnName" (e.g. "3:district_city").
  // camelCase conversion: boundary_level → boundaryLevel
  // Extract the column name and use it as xCol (replaces manual x_axis).
  if (isMiniMap) {
    const blValue = String(
      fdValue(fd, 'boundaryLevel', 'boundary_level') || '',
    );
    const colonIdx = blValue.indexOf(':');
    if (colonIdx >= 0) {
      const ouCol = blValue.slice(colonIdx + 1);
      if (ouCol && dataColumns.includes(ouCol)) {
        xCol = ouCol;
      }
    }
  }

  // Resolve metric labels
  const rawMetrics = Array.isArray(fd.metrics) ? fd.metrics : [fd.metrics];
  const metricLabels = rawMetrics
    .filter(Boolean)
    .map((m: any) => getMetricLabel(m));
  const metricKeysByLabel = new Map<string, string[]>(
    rawMetrics.filter(Boolean).map((metric: any) => {
      const label = getMetricLabel(metric);
      return [label, metricValueKeys(metric, label)] as [string, string[]];
    }),
  );

  // ── Unified color scheme resolution ──
  // Single merged color_scheme control lists both categorical and sequential schemes.
  // Try categorical registry first, then sequential. The resolved palette is used
  // for ALL chart types automatically.
  const schemeKey =
    fdValue(fd, 'colorScheme', 'color_scheme') || 'supersetColors';

  let schemeColors: string[] = DEFAULT_COLORS;
  let linearColors: string[] = [];
  let resolved = false;

  // Try categorical registry first
  try {
    const catRegistry = getCategoricalSchemeRegistry();
    const catScheme = catRegistry.get(schemeKey);
    if (catScheme && catScheme.colors.length > 0) {
      schemeColors = catScheme.colors;
      // Derive a linear gradient from categorical colors for heatmap/map
      linearColors = schemeColors.slice(0, Math.min(9, schemeColors.length));
      resolved = true;
    }
  } catch {
    /* try sequential */
  }

  // Try sequential registry if not found in categorical
  if (!resolved) {
    try {
      const seqRegistry = getSequentialSchemeRegistry();
      const seqScheme = seqRegistry.get(schemeKey);
      if (seqScheme) {
        linearColors = seqScheme.getColors(9);
        // For series/pie/donut, sample distinct colors from the gradient
        schemeColors = seqScheme.getColors(Math.max(metricLabels.length, 8));
        resolved = true;
      }
    } catch {
      /* use defaults */
    }
  }

  // Fallback linear gradient if still empty
  if (linearColors.length === 0) {
    linearColors =
      schemeColors.length >= 3
        ? schemeColors.slice(0, Math.min(9, schemeColors.length))
        : [
            '#eff3ff',
            '#c6dbef',
            '#9ecae1',
            '#6baed6',
            '#4292c6',
            '#2171b5',
            '#08519c',
            '#08306b',
            '#041733',
          ];
  }

  const metricColors = metricLabels.map(
    (_: string, i: number) => schemeColors[i % schemeColors.length],
  );

  // Group data by split dimension → panels
  const groups = new Map<
    string,
    {
      xValues: string[];
      seriesMap: Map<string, number[]>;
    }
  >();

  for (const row of data) {
    const groupKey = String(row[groupCol] ?? 'All');
    const xVal = String(row[xCol] ?? '');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        xValues: [],
        seriesMap: new Map(metricLabels.map((ml: string) => [ml, []])),
      });
    }

    const group = groups.get(groupKey)!;
    group.xValues.push(xVal);

    for (const ml of metricLabels) {
      const val = getRowMetricValue(row, metricKeysByLabel.get(ml) || [ml]);
      group.seriesMap.get(ml)!.push(val);
    }
  }

  // Build panel data
  let panels: PanelData[] = [];
  let globalYMin = Infinity;
  let globalYMax = -Infinity;

  const refMode = (fdValue(fd, 'referenceLineMode', 'reference_line_mode') ||
    'none') as ReferenceLineMode;
  const referenceValue = fdValue(fd, 'referenceValue', 'reference_value');
  const globalRefVal =
    referenceValue !== '' && referenceValue != null
      ? Number(referenceValue)
      : null;

  for (const [title, group] of groups) {
    const orderedPoints = group.xValues
      .map((xValue, index) => ({
        xValue,
        index,
        sortKey: getDhis2PeriodSortKey(xValue),
      }))
      .sort((a, b) => {
        if (a.sortKey != null && b.sortKey != null) {
          return a.sortKey - b.sortKey;
        }
        if (a.sortKey != null) {
          return -1;
        }
        if (b.sortKey != null) {
          return 1;
        }
        return a.index - b.index;
      });
    const orderedXValues = orderedPoints.map(point => point.xValue);

    const series: PanelSeries[] = metricLabels.map(
      (ml: string, idx: number) => {
        const values = group.seriesMap.get(ml) || [];
        return {
          metricLabel: ml,
          values: orderedPoints.map(point => values[point.index] ?? 0),
          color: metricColors[idx],
        };
      },
    );

    // Track global min/max across all series
    for (const s of series) {
      for (const v of s.values) {
        if (v < globalYMin) globalYMin = v;
        if (v > globalYMax) globalYMax = v;
      }
    }

    // Latest values for subtitle
    const latestValues: Record<string, number | null> = {};
    for (const s of series) {
      const vals = s.values.filter(v => v != null && Number.isFinite(v));
      latestValues[s.metricLabel] =
        vals.length > 0 ? vals[vals.length - 1] : null;
    }

    // Per-panel reference value
    let referenceValue: number | null = null;
    if (refMode === 'global' || refMode === 'per-panel-target') {
      referenceValue = globalRefVal;
    } else if (refMode === 'per-panel-mean' && series.length > 0) {
      const primary = series[0].values.filter(v => Number.isFinite(v));
      referenceValue =
        primary.length > 0
          ? primary.reduce((a, b) => a + b, 0) / primary.length
          : null;
    }

    // mini_map GeoJSON is built client-side from DHIS2 boundaries (in SmallMultiplesViz)
    panels.push({
      title: formatDhis2Period(title),
      xValues: orderedXValues.map(formatDhis2Period),
      rawXValues: orderedXValues,
      yValues: series[0]?.values || [],
      series,
      latestValues,
      referenceValue,
    });
  }

  if (!Number.isFinite(globalYMin)) globalYMin = 0;
  if (!Number.isFinite(globalYMax)) globalYMax = 100;

  // Sort panels
  const sortPanels = (fdValue(fd, 'sortPanels', 'sort_panels') ||
    'alphabetical') as string;
  if (sortPanels === 'alphabetical') {
    panels.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortPanels === 'latest-value') {
    panels.sort(
      (a, b) =>
        (b.yValues[b.yValues.length - 1] ?? 0) -
        (a.yValues[a.yValues.length - 1] ?? 0),
    );
  } else if (sortPanels === 'highest-first') {
    panels.sort(
      (a, b) => Math.max(...b.yValues, 0) - Math.max(...a.yValues, 0),
    );
  } else if (sortPanels === 'lowest-first') {
    panels.sort(
      (a, b) =>
        Math.min(...a.yValues, Infinity) - Math.min(...b.yValues, Infinity),
    );
  }

  // Top N filtering
  const rawTopN = fdValue<number>(fd, 'topN', 'top_n') ?? 0;
  const topN = Number(rawTopN);
  const effectiveTopN = Number.isFinite(topN) ? topN : 0;
  const dhis2SplitPreset = fdValue(
    fd,
    'dhis2SplitPreset',
    'dhis2_split_preset',
  );
  const isDhis2PresetSplit = Boolean(
    dhis2SplitPreset && dhis2SplitPreset !== 'custom',
  );
  if (
    effectiveTopN > 0 &&
    sortPanels !== 'alphabetical' &&
    !isDhis2PresetSplit
  ) {
    panels = panels.slice(0, effectiveTopN);
  }

  return {
    width,
    height,
    panels,
    columns: fdValue<number>(fd, 'gridColumns', 'grid_columns') ?? 4,
    miniChartType,
    syncYAxis: fdValue<boolean>(fd, 'syncYAxis', 'sync_y_axis') ?? true,
    showPanelTitle:
      fdValue<boolean>(fd, 'showPanelTitle', 'show_panel_title') ?? true,
    showXAxis: fdValue<boolean>(fd, 'showXAxis', 'show_x_axis') ?? true,
    showYAxis: fdValue<boolean>(fd, 'showYAxis', 'show_y_axis') ?? false,
    panelPadding: fdValue<number>(fd, 'panelPadding', 'panel_padding') ?? 8,
    lineWidth: fdValue<number>(fd, 'lineWidth', 'line_width') ?? 1.5,
    globalYMin,
    globalYMax,
    yAxisFormat: fdValue(fd, 'yAxisFormat', 'y_axis_format') || 'SMART_NUMBER',
    sortPanels,
    topN: effectiveTopN,
    showReferenceLine: refMode !== 'none',
    referenceValue: globalRefVal,
    referenceLineMode: refMode,
    referenceColor:
      fdValue(fd, 'referenceColor', 'reference_color') || '#E53935',
    showPanelSubtitle:
      fdValue<boolean>(fd, 'showPanelSubtitle', 'show_panel_subtitle') ?? false,
    densityTier: (fdValue(fd, 'densityTier', 'density_tier') ||
      'compact') as string,
    panelBorderRadius:
      fdValue<number>(fd, 'panelBorderRadius', 'panel_border_radius') ?? 8,
    nullValueText: fdValue(fd, 'nullValueText', 'null_value_text') || '–',
    showLegend:
      fdValue<boolean>(fd, 'showLegend', 'show_legend') ??
      metricLabels.length > 1,
    legendPosition: fdValue(fd, 'legendPosition', 'legend_position') || 'top',
    syncTooltips: fdValue<boolean>(fd, 'syncTooltips', 'sync_tooltips') ?? true,
    responsiveColumns:
      fdValue<boolean>(fd, 'responsiveColumns', 'responsive_columns') ?? true,
    minPanelWidth:
      fdValue<number>(fd, 'minPanelWidth', 'min_panel_width') ?? 180,
    fixedPanelHeight: fdValue<number>(fd, 'panelHeight', 'panel_height') ?? 0,
    metricLabels,
    metricColors,
    schemeColors,
    linearColors,
    databaseId: resolveDatabaseId(datasource, formData),
    boundaryLevel: fdValue(fd, 'boundaryLevel', 'boundary_level') || undefined,
    showPanelIcon:
      fdValue<boolean>(fd, 'showPanelIcon', 'show_panel_icon') ?? false,
    panelIconUrl: fdValue(fd, 'panelIconUrl', 'panel_icon_url') || '',
    panelIconText: fdValue(fd, 'panelIconText', 'panel_icon_text') || '',
    panelIconSize:
      fdValue<number>(fd, 'panelIconSize', 'panel_icon_size') ?? 28,
    chartId: fdValue<number>(fd, 'sliceId', 'slice_id')
      ? Number(fdValue<number>(fd, 'sliceId', 'slice_id'))
      : undefined,
    dashboardId: fdValue<number>(fd, 'dashboardId', 'dashboard_id')
      ? Number(fdValue<number>(fd, 'dashboardId', 'dashboard_id'))
      : undefined,
  };
}
