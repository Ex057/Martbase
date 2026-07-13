/*
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

import { ChartProps, QueryFormData } from '@superset-ui/core';
import { colorValueToCss } from 'src/utils/colorValue';
import {
  adhocFilterSegments,
  buildAutoSubtitle,
  datasourcePeriodColumns as readDatasourcePeriodColumns,
  dhis2FilterSegments,
  formatPeriodList,
  looksLikeDHIS2Period,
  makeColumnLabeller,
  SubtitleFilter,
} from 'src/utils/chartAutoSubtitle';
import {
  sanitizeDHIS2ColumnName,
  findMetricColumn,
} from '../../features/datasets/AddDataset/DHIS2ParameterBuilder/sanitize';
import { resolveDHIS2MetricLabel } from '../../utils/dhis2MetricLabel';
import {
  DHIS2LegendDefinition,
  DHIS2MapProps,
  LevelBorderColor,
} from './types';
import {
  buildBoundaryLevelLabelMap,
  getDatasourceBoundaryLevels,
  inferBoundaryLevelFromOrgUnitColumn,
} from './boundaryLevels';

type RGBAColor = { r: number; g: number; b: number; a: number };
type DatasourceColumn = {
  column_name?: string;
  verbose_name?: string;
  extra?: unknown;
};

type StagedOrgUnitLevel = {
  level?: number | string;
  displayName?: string;
  name?: string;
};

function parseHexColorString(value: string): RGBAColor | null {
  const normalized = value.trim().replace(/^#/, '');
  if (![3, 4, 6, 8].includes(normalized.length)) {
    return null;
  }

  const expand = (hex: string) => (hex.length === 1 ? `${hex}${hex}` : hex);
  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  if (normalized.length === 3 || normalized.length === 4) {
    r = parseInt(expand(normalized[0]), 16);
    g = parseInt(expand(normalized[1]), 16);
    b = parseInt(expand(normalized[2]), 16);
    if (normalized.length === 4) {
      a = parseInt(expand(normalized[3]), 16) / 255;
    }
  } else {
    r = parseInt(normalized.slice(0, 2), 16);
    g = parseInt(normalized.slice(2, 4), 16);
    b = parseInt(normalized.slice(4, 6), 16);
    if (normalized.length === 8) {
      a = parseInt(normalized.slice(6, 8), 16) / 255;
    }
  }

  if ([r, g, b].some(value => Number.isNaN(value))) {
    return null;
  }

  return { r, g, b, a };
}

function parseRgbColorString(value: string): RGBAColor | null {
  const match = value
    .trim()
    .match(
      /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i,
    );
  if (!match) {
    return null;
  }

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] !== undefined ? Number(match[4]) : 1;

  if ([r, g, b, a].some(value => Number.isNaN(value))) {
    return null;
  }

  return { r, g, b, a };
}

function parseCssColorString(value: string): RGBAColor | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) {
    return parseHexColorString(trimmed);
  }
  if (trimmed.startsWith('rgb')) {
    return parseRgbColorString(trimmed);
  }
  return null;
}

function applyOpacityToColor(value: unknown, opacity?: number): unknown {
  if (value && typeof value === 'object') {
    return opacity !== undefined ? { ...value, a: opacity } : value;
  }

  if (typeof value === 'string') {
    const parsed = parseCssColorString(value);
    if (!parsed) {
      return value;
    }
    return opacity !== undefined ? { ...parsed, a: opacity } : parsed;
  }

  return value;
}

type StagedLegendColumnDefinition = {
  columnName: string;
  definition: DHIS2LegendDefinition;
};

type StagedLegendSetMetadata = {
  id?: string;
  displayName?: string;
  name?: string;
  legendDefinition?: unknown;
};

function generateLevelBorderColors(
  levels: number[],
  customColors?: Record<number, RGBAColor>,
): LevelBorderColor[] {
  // Distinct, vibrant colors for different boundary levels
  // Colors chosen for high visual contrast when overlaid
  const defaultColors: RGBAColor[] = [
    { r: 0, g: 0, b: 0, a: 1 }, // Level 1: Black (National) - highest visibility
    { r: 220, g: 53, b: 69, a: 1 }, // Level 2: Red (Region) - bold, stands out
    { r: 40, g: 167, b: 69, a: 1 }, // Level 3: Green (District) - contrasts with red
    { r: 0, g: 123, b: 255, a: 1 }, // Level 4: Blue (Sub-county)
    { r: 255, g: 193, b: 7, a: 1 }, // Level 5: Yellow/Gold (Parish)
    { r: 111, g: 66, b: 193, a: 1 }, // Level 6: Purple (Facility)
    { r: 23, g: 162, b: 184, a: 1 }, // Level 7: Cyan (if needed)
  ];

  // Border widths decrease with level (higher admin level = broader boundaries)
  const widths = [4, 3, 2.5, 2, 1.5, 1, 0.5];

  return levels.map(level => ({
    level,
    color:
      customColors?.[level] ||
      defaultColors[Math.min(level - 1, defaultColors.length - 1)],
    width: widths[Math.min(level - 1, widths.length - 1)],
  }));
}

function parseColumnExtra(extra: unknown): Record<string, any> | undefined {
  if (!extra) {
    return undefined;
  }
  if (typeof extra === 'string') {
    try {
      return JSON.parse(extra);
    } catch {
      return undefined;
    }
  }
  if (typeof extra === 'object') {
    return extra as Record<string, any>;
  }
  return undefined;
}

function resolveHierarchyLevelFromDatasourceColumn(
  datasourceColumns: DatasourceColumn[],
  hierarchyLevelColumn: string,
  stagedOrgUnitLevels: StagedOrgUnitLevel[] = [],
): number | undefined {
  const exactMatch = datasourceColumns.find(
    column => column.column_name === hierarchyLevelColumn,
  );
  const sanitizedMatch = datasourceColumns.find(
    column =>
      column.column_name &&
      sanitizeDHIS2ColumnName(column.column_name) === hierarchyLevelColumn,
  );
  const matchedColumn = exactMatch || sanitizedMatch;
  const extra = parseColumnExtra(matchedColumn?.extra);
  const explicitLevel = Number(
    extra?.dhis2_ou_level ?? extra?.dhis2OuLevel ?? NaN,
  );
  if (Number.isFinite(explicitLevel) && explicitLevel > 0) {
    return explicitLevel;
  }
  return inferBoundaryLevelFromOrgUnitColumn(
    hierarchyLevelColumn,
    datasourceColumns,
    stagedOrgUnitLevels,
  );
}

function resolveBestFallbackHierarchyColumn(params: {
  allColumns: string[];
  data: Record<string, any>[];
  datasourceColumns: DatasourceColumn[];
  stagedOrgUnitLevels?: StagedOrgUnitLevel[];
  requestedPrimaryLevel?: number;
}): string {
  const {
    allColumns,
    data,
    datasourceColumns,
    stagedOrgUnitLevels = [],
    requestedPrimaryLevel,
  } = params;

  if (!data.length || !allColumns.length) {
    return '';
  }

  const firstRow = data[0] || {};
  const hierarchyCandidates = allColumns.reduce<
    Array<{ column: string; level: number }>
  >((result, column) => {
    const columnName = String(column || '').trim();
    if (!columnName) {
      return result;
    }

    const columnLower = columnName.toLowerCase();
    if (
      columnLower.includes('period') ||
      columnLower.includes('year') ||
      columnLower.includes('month') ||
      columnLower.includes('quarter') ||
      typeof firstRow[columnName] === 'number'
    ) {
      return result;
    }

    const resolvedLevel = resolveHierarchyLevelFromDatasourceColumn(
      datasourceColumns,
      columnName,
      stagedOrgUnitLevels,
    );
    if (resolvedLevel) {
      result.push({ column: columnName, level: resolvedLevel });
    }
    return result;
  }, []);

  if (hierarchyCandidates.length > 0) {
    const exactLevelMatch = requestedPrimaryLevel
      ? hierarchyCandidates.find(
          candidate => candidate.level === requestedPrimaryLevel,
        )
      : undefined;
    if (exactLevelMatch) {
      return exactLevelMatch.column;
    }

    return hierarchyCandidates.sort(
      (left, right) => right.level - left.level,
    )[0].column;
  }

  for (const column of allColumns) {
    const columnLower = column.toLowerCase();
    if (
      columnLower.includes('period') ||
      columnLower.includes('year') ||
      columnLower.includes('month') ||
      columnLower.includes('quarter') ||
      typeof firstRow[column] === 'number'
    ) {
      continue;
    }
    if (typeof firstRow[column] === 'string') {
      return column;
    }
  }

  return '';
}

function parseLegendDefinition(
  value: unknown,
): DHIS2LegendDefinition | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, any>;
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
    return undefined;
  }

  const items = candidate.items.reduce<DHIS2LegendDefinition['items']>(
    (result, item) => {
      if (!item || typeof item !== 'object') {
        return result;
      }
      const rawItem = item as Record<string, any>;
      const color = String(rawItem.color ?? '').trim();
      if (!color) {
        return result;
      }

      const startValue =
        rawItem.startValue == null || rawItem.startValue === ''
          ? undefined
          : Number(rawItem.startValue);
      const endValue =
        rawItem.endValue == null || rawItem.endValue === ''
          ? undefined
          : Number(rawItem.endValue);

      result.push({
        id:
          rawItem.id === undefined || rawItem.id === null
            ? undefined
            : String(rawItem.id),
        label:
          rawItem.label === undefined || rawItem.label === null
            ? undefined
            : String(rawItem.label),
        startValue: Number.isFinite(startValue) ? startValue : undefined,
        endValue: Number.isFinite(endValue) ? endValue : undefined,
        color,
      });
      return result;
    },
    [],
  );

  if (!items.length) {
    return undefined;
  }

  const minCandidate =
    candidate.min == null || candidate.min === ''
      ? undefined
      : Number(candidate.min);
  const maxCandidate =
    candidate.max == null || candidate.max === ''
      ? undefined
      : Number(candidate.max);

  return {
    source:
      candidate.source === undefined || candidate.source === null
        ? undefined
        : String(candidate.source),
    setId:
      candidate.setId === undefined || candidate.setId === null
        ? undefined
        : String(candidate.setId),
    setName:
      candidate.setName === undefined || candidate.setName === null
        ? undefined
        : String(candidate.setName),
    min: Number.isFinite(minCandidate) ? minCandidate : undefined,
    max: Number.isFinite(maxCandidate) ? maxCandidate : undefined,
    items,
  };
}

function resolveMetricLegendDefinition(
  datasourceColumns: DatasourceColumn[],
  metricColumnName: string,
): DHIS2LegendDefinition | undefined {
  if (!metricColumnName) {
    return undefined;
  }

  const matchedColumn = datasourceColumns.find(column => {
    const colName = String(column.column_name || '').trim();
    return (
      colName === metricColumnName ||
      sanitizeDHIS2ColumnName(colName) === metricColumnName
    );
  });
  const extra = parseColumnExtra(matchedColumn?.extra);
  return parseLegendDefinition(extra?.dhis2_legend ?? extra?.dhis2Legend);
}

function collectStagedLegendDefinitions(
  datasourceColumns: DatasourceColumn[],
): StagedLegendColumnDefinition[] {
  return datasourceColumns.reduce<StagedLegendColumnDefinition[]>(
    (result, column) => {
      const colName = String(column.column_name || '').trim();
      const columnName = sanitizeDHIS2ColumnName(colName);
      if (!columnName) {
        return result;
      }

      const extra = parseColumnExtra(column.extra);
      const definition = parseLegendDefinition(
        extra?.dhis2_legend ?? extra?.dhis2Legend,
      );
      if (definition) {
        result.push({
          columnName,
          definition,
        });
      }
      return result;
    },
    [],
  );
}

function readCachedLegendSets(databaseId?: number): StagedLegendSetMetadata[] {
  if (!databaseId || typeof window === 'undefined') {
    return [];
  }

  try {
    const cached = window.localStorage.getItem(
      `dhis2_legend_sets_db${databaseId}`,
    );
    if (!cached) {
      return [];
    }

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed?.data)) {
      return [];
    }

    return parsed.data.filter(
      (item: unknown): item is StagedLegendSetMetadata =>
        Boolean(item) && typeof item === 'object',
    );
  } catch {
    return [];
  }
}

function resolveCachedLegendSetDefinition(
  stagedLegendSets: StagedLegendSetMetadata[],
  selectedLegendColumn?: string,
): DHIS2LegendDefinition | undefined {
  if (
    !selectedLegendColumn ||
    !selectedLegendColumn.startsWith('legendset:') ||
    !stagedLegendSets.length
  ) {
    return undefined;
  }

  const requestedLegendIdentity = selectedLegendColumn
    .slice('legendset:'.length)
    .trim();
  if (!requestedLegendIdentity) {
    return undefined;
  }

  const matchedLegendSet = stagedLegendSets.find(legendSet => {
    const legendSetId = String(legendSet.id || '').trim();
    const legendSetName = String(
      legendSet.displayName || legendSet.name || '',
    ).trim();
    return (
      legendSetId === requestedLegendIdentity ||
      legendSetName === requestedLegendIdentity
    );
  });

  if (!matchedLegendSet) {
    return undefined;
  }

  return parseLegendDefinition(
    matchedLegendSet.legendDefinition || matchedLegendSet,
  );
}

function resolveSelectedStagedLegendDefinition(
  datasourceColumns: DatasourceColumn[],
  metricColumnName: string,
  selectedLegendColumn?: string,
  stagedLegendSets: StagedLegendSetMetadata[] = [],
): DHIS2LegendDefinition | undefined {
  const availableDefinitions =
    collectStagedLegendDefinitions(datasourceColumns);

  const cachedLegendSetDefinition = resolveCachedLegendSetDefinition(
    stagedLegendSets,
    selectedLegendColumn,
  );
  if (cachedLegendSetDefinition) {
    return cachedLegendSetDefinition;
  }

  if (!availableDefinitions.length) {
    return undefined;
  }

  if (
    selectedLegendColumn &&
    selectedLegendColumn !== '__metric__' &&
    !selectedLegendColumn.startsWith('legendset:') &&
    selectedLegendColumn.trim()
  ) {
    const matched = availableDefinitions.find(
      definition => definition.columnName === selectedLegendColumn,
    );
    if (matched) {
      return matched.definition;
    }
  }

  return resolveMetricLegendDefinition(datasourceColumns, metricColumnName);
}

function readCachedOrgUnitLevels(databaseId?: number): StagedOrgUnitLevel[] {
  if (!databaseId || typeof window === 'undefined') {
    return [];
  }

  try {
    const cached = window.localStorage.getItem(
      `dhis2_org_unit_levels_db${databaseId}`,
    );
    if (!cached) {
      return [];
    }

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed?.data)) {
      return [];
    }

    return parsed.data.filter(
      (item: unknown): item is StagedOrgUnitLevel =>
        Boolean(item) && typeof item === 'object',
    );
  } catch {
    return [];
  }
}

function isPeriodColumn(col: DatasourceColumn): boolean {
  const extra = parseColumnExtra(col.extra);
  return (
    (extra as any)?.dhis2_is_period === true ||
    (extra as any)?.dhis2IsPeriod === true
  );
}

function mergeBoundaryLevels(
  primaryBoundaryLevel: number | undefined,
  configuredLevels: number[],
): number[] {
  if (!Number.isFinite(primaryBoundaryLevel) || !primaryBoundaryLevel) {
    return configuredLevels;
  }
  return [
    primaryBoundaryLevel,
    ...configuredLevels.filter(level => level !== primaryBoundaryLevel),
  ];
}

function coercePositiveInteger(value: unknown): number | undefined {
  const parsedValue = Number(value);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }
  return undefined;
}

// Turn a raw boundary-level label (often a snake_case column name like
// "distict_cities") into a human label: "Distict Cities". Levels typically read
// as National / Regional / District once humanised.
function humanizeLevelLabel(label: string): string {
  const cleaned = String(label || '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, char => char.toUpperCase());
}

function pluralizeLevel(word: string, count: number): string {
  if (count === 1 || !word) return word;
  if (/s$/i.test(word)) return word; // already plural (e.g. "Cities")
  if (/y$/i.test(word)) return word.replace(/y$/i, 'ies');
  return `${word}s`;
}

// Fallback period detection: find a data column whose values all look like DHIS2
// period codes, so the subtitle can show the period even when metadata doesn't
// flag the column and no explicit period filter was set. Metric / org-unit
// columns are excluded to avoid mistaking a 4-digit metric for a year.
function detectPeriodColumnFromData(
  data: Record<string, any>[],
  excludeColumns: Set<string>,
): string {
  if (!data.length) return '';
  const keys = Object.keys(data[0] || {}).filter(
    key => !excludeColumns.has(key),
  );
  const sampleSize = Math.min(25, data.length);
  return (
    keys.find(key => {
      const sample = data
        .slice(0, sampleSize)
        .map(row => String(row?.[key] ?? '').trim())
        .filter(Boolean);
      return (
        sample.length >= Math.min(2, data.length) &&
        sample.every(looksLikeDHIS2Period)
      );
    }) || ''
  );
}

// Build the map's auto subtitle so it reads like a real heading:
//   "<scope> <Level>s · <period> · <other filters>"
//   e.g. "Uganda Districts · Last 4 quarters · Data element: Precipitation"
//
// The filter segments come from the shared builder in src/utils/chartAutoSubtitle
// so they read identically on every chart type. What the map adds is the SCOPE
// prefix — the nearest parent org unit that resolves to a single value (e.g. the
// country), so many areas read as "Uganda Districts" rather than "146 districts"
// — and a fallback to the periods present in the data when no period filter is
// set, since a map without a period is ambiguous in a way a bar chart isn't.
function buildMapAutoSubtitle(params: {
  data: Record<string, any>[];
  periodColumns: string[];
  orgUnitColumn: string;
  boundaryLevelLabels: Record<number, string>;
  boundaryLevelColumns: Record<number, string>;
  primaryBoundaryLevel?: number;
  filters?: SubtitleFilter[];
}): string {
  const {
    data,
    periodColumns,
    orgUnitColumn,
    boundaryLevelLabels,
    boundaryLevelColumns,
    primaryBoundaryLevel,
    filters,
  } = params;
  const parts: string[] = [];

  const distinct = (column: string): string[] =>
    column && data.length
      ? Array.from(
          new Set(
            data.map(row => String(row?.[column] ?? '').trim()).filter(Boolean),
          ),
        )
      : [];

  const levelLabel = humanizeLevelLabel(
    primaryBoundaryLevel != null
      ? boundaryLevelLabels?.[primaryBoundaryLevel] || ''
      : '',
  );

  // Nearest parent hierarchy level that resolves to a single value → the scope
  // (e.g. "Uganda", or a single region when drilled in).
  const scope = (() => {
    if (primaryBoundaryLevel == null) return '';
    const parentLevels = Object.keys(boundaryLevelColumns)
      .map(Number)
      .filter(level => Number.isFinite(level) && level < primaryBoundaryLevel)
      .sort((a, b) => b - a);
    // eslint-disable-next-line no-restricted-syntax
    for (const level of parentLevels) {
      const values = distinct(boundaryLevelColumns[level]);
      if (values.length === 1) return values[0];
    }
    return '';
  })();

  // 1) Scope + boundary level.
  const areas = distinct(orgUnitColumn);
  if (areas.length === 1) {
    parts.push(levelLabel ? `${areas[0]} (${levelLabel})` : areas[0]);
  } else if (areas.length > 1) {
    const levelPlural = levelLabel ? pluralizeLevel(levelLabel, 2) : 'areas';
    parts.push(scope ? `${scope} ${levelPlural}` : levelPlural);
  } else if (levelLabel) {
    parts.push(levelLabel);
  }

  // 2) No period filter? Fall back to the periods present in the data, so the
  // reader still knows what window they're looking at. It sits with the scope,
  // ahead of the other filters.
  const activeFilters = (filters || []).filter(
    entry => entry.text || entry.values?.length,
  );
  if (!activeFilters.some(entry => entry.isPeriod)) {
    const column = periodColumns.find(col => distinct(col).length);
    const dataPeriods = column ? formatPeriodList(distinct(column)) : '';
    if (dataPeriods) parts.push(dataPeriods);
  }

  // 3) The filter segments, rendered exactly as any other chart renders them.
  return buildAutoSubtitle({ prefix: parts, filters: activeFilters });
}

export default function transformProps(chartProps: ChartProps): DHIS2MapProps {
  const {
    width,
    height,
    formData,
    queriesData,
    datasource,
    hooks,
    filterState,
  } = chartProps;

  const formDataAny = formData as any;

  const {
    metric,
    org_unit_column,
    aggregation_method,
    boundary_levels,
    boundary_level,
    enable_drill,
    tooltip_columns,
  } = formData as QueryFormData;

  // Extract style props with camelCase fallback (formData is camelCase, controls are snake_case)
  const color_scheme = formDataAny?.colorScheme || formDataAny?.color_scheme;
  const linear_color_scheme =
    formDataAny?.linearColorScheme || formDataAny?.linear_color_scheme;
  const use_linear_color_scheme =
    formDataAny?.useLinearColorScheme ?? formDataAny?.use_linear_color_scheme;
  const chart_background_opacity =
    formDataAny?.chartBackgroundOpacity ??
    formDataAny?.chart_background_opacity;

  const chart_background_color_hex =
    formDataAny?.chartBackgroundColorHex ||
    formDataAny?.chart_background_color_hex;
  const rawBackgroundColor =
    chart_background_color_hex ??
    (formDataAny?.chartBackgroundColor || formDataAny?.chart_background_color);
  const chart_background_color = colorValueToCss(
    applyOpacityToColor(rawBackgroundColor, chart_background_opacity),
  );
  const transparent_card_container =
    formDataAny?.transparentCardContainer ??
    formDataAny?.transparent_card_container;
  const boundary_focus_mask_style =
    formDataAny?.boundaryFocusMaskStyle ??
    formDataAny?.boundary_focus_mask_style;
  const basemap_style = formDataAny?.basemapStyle ?? formDataAny?.basemap_style;

  const opacity = formDataAny?.opacity;
  const stroke_color = formDataAny?.strokeColor || formDataAny?.stroke_color;
  const stroke_width = formDataAny?.strokeWidth ?? formDataAny?.stroke_width;
  const auto_theme_borders =
    formDataAny?.autoThemeBorders ?? formDataAny?.auto_theme_borders;
  const level_border_colors =
    formDataAny?.levelBorderColors || formDataAny?.level_border_colors;
  const show_all_boundaries =
    formDataAny?.showAllBoundaries ?? formDataAny?.show_all_boundaries;
  const focus_selected_boundary_with_children =
    formDataAny?.focusSelectedBoundaryWithChildren ??
    formDataAny?.focus_selected_boundary_with_children;
  const style_unselected_areas =
    formDataAny?.styleUnselectedAreas ?? formDataAny?.style_unselected_areas;
  const unselected_area_fill_color =
    formDataAny?.unselectedAreaFillColor ||
    formDataAny?.unselected_area_fill_color;
  const unselected_area_fill_opacity =
    formDataAny?.unselectedAreaFillOpacity ??
    formDataAny?.unselected_area_fill_opacity;
  const unselected_area_border_color =
    formDataAny?.unselectedAreaBorderColor ||
    formDataAny?.unselected_area_border_color;
  const unselected_area_border_width =
    formDataAny?.unselectedAreaBorderWidth ??
    formDataAny?.unselected_area_border_width;
  const show_labels = formDataAny?.showLabels ?? formDataAny?.show_labels;
  const label_type = formDataAny?.labelType || formDataAny?.label_type;
  const label_font_size =
    formDataAny?.labelFontSize ?? formDataAny?.label_font_size;
  const show_legend = formDataAny?.showLegend ?? formDataAny?.show_legend;
  const hide_quick_filters =
    formDataAny?.hideQuickFilters ?? formDataAny?.hide_quick_filters;
  const legend_position =
    formDataAny?.legendPosition || formDataAny?.legend_position;
  const legend_classes =
    formDataAny?.legendClasses ?? formDataAny?.legend_classes;
  const legend_type = formDataAny?.legendType || formDataAny?.legend_type;
  const staged_legend_column =
    formDataAny?.stagedLegendColumn || formDataAny?.staged_legend_column;
  const legend_min = formDataAny?.legendMin ?? formDataAny?.legend_min;
  const legend_max = formDataAny?.legendMax ?? formDataAny?.legend_max;
  const manual_breaks = formDataAny?.manualBreaks || formDataAny?.manual_breaks;
  const manual_colors = formDataAny?.manualColors || formDataAny?.manual_colors;
  const legend_reverse_colors =
    formDataAny?.legendReverseColors ?? formDataAny?.legend_reverse_colors;
  const legend_no_data_color =
    formDataAny?.legendNoDataColor || formDataAny?.legend_no_data_color;
  const legend_display_type =
    formDataAny?.legendDisplayType || formDataAny?.legend_display_type;
  // Compass
  const compass_visible =
    formDataAny?.compassVisible ?? formDataAny?.compass_visible;
  const compass_position =
    formDataAny?.compassPosition || formDataAny?.compass_position;
  const compass_style = formDataAny?.compassStyle || formDataAny?.compass_style;
  // Custom level colors - check both camelCase and snake_case
  const level_1_color = formDataAny?.level1Color || formDataAny?.level_1_color;
  const level_2_color = formDataAny?.level2Color || formDataAny?.level_2_color;
  const level_3_color = formDataAny?.level3Color || formDataAny?.level_3_color;
  const level_4_color = formDataAny?.level4Color || formDataAny?.level_4_color;
  const level_5_color = formDataAny?.level5Color || formDataAny?.level_5_color;
  const level_6_color = formDataAny?.level6Color || formDataAny?.level_6_color;

  const data = queriesData[0]?.data || [];
  const datasourceAny = datasource as any;
  const datasourceColumns = Array.isArray(datasourceAny?.columns)
    ? (datasourceAny.columns as DatasourceColumn[])
    : [];

  const allColumns = data.length > 0 ? Object.keys(data[0]) : [];

  const ouHierarchyColumns = getDatasourceBoundaryLevels(datasourceColumns)
    .map(level => level.columnName)
    .filter(
      (columnName): columnName is string =>
        typeof columnName === 'string' && allColumns.includes(columnName),
    );

  const periodColumns = datasourceColumns
    .filter(
      c =>
        isPeriodColumn(c) &&
        c.column_name &&
        allColumns.includes(c.column_name),
    )
    .map(c => c.column_name as string);

  // Every period column the DATASOURCE declares, whether or not the query
  // returned it. An aggregated map query groups `period` away, but the user's
  // period filter still applies to it — so filter detection must not depend on
  // the column surviving into the result set.
  const datasourcePeriodColumns =
    readDatasourcePeriodColumns(datasourceColumns);

  const extraRaw = datasourceAny?.extra;
  let extraParsed: any;
  try {
    extraParsed =
      typeof extraRaw === 'string' ? JSON.parse(extraRaw) : extraRaw;
  } catch {
    extraParsed = null;
  }

  const sourceDatabaseIdFromExtra =
    extraParsed?.dhis2_source_database_id ??
    extraParsed?.source_database_id ??
    extraParsed?.dhis2SourceDatabaseId;
  const stagedDatasetId =
    coercePositiveInteger(extraParsed?.dhis2_staged_dataset_id) ||
    coercePositiveInteger(extraParsed?.dhis2StagedDatasetId);
  const isStagedLocalDataset =
    extraParsed?.dhis2_staged_local === true ||
    extraParsed?.dhis2StagedLocal === true ||
    (formData as any)?.dhis2_staged_local_dataset === true ||
    (formData as any)?.dhis2_staged_local_dataset === 'true' ||
    (formData as any)?.dhis2StagedLocalDataset === true;
  const rawSourceInstanceIds = Array.isArray(
    extraParsed?.dhis2_source_instance_ids,
  )
    ? extraParsed.dhis2_source_instance_ids
    : Array.isArray(extraParsed?.dhis2SourceInstanceIds)
      ? extraParsed.dhis2SourceInstanceIds
      : Array.isArray((formData as any)?.dhis2_source_instance_ids)
        ? (formData as any).dhis2_source_instance_ids
        : [];
  const sourceInstanceIdsFromExtra = rawSourceInstanceIds
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  // Extract database ID used for DHIS2 metadata/boundaries.
  // For staged-local datasets this must be the original DHIS2 source database,
  // not the local serving database attached to the SQL dataset itself.
  let databaseId = sourceDatabaseIdFromExtra || datasourceAny?.database?.id;

  // Fallback: Check if database_id is directly on datasource
  if (!databaseId) {
    databaseId = datasourceAny?.database_id;
  }

  // Fallback: Try to get from formData (also check DHIS2-specific formData keys
  // that buildQuery writes — these are present in dashboard context where
  // datasource.extra fields may be absent)
  if (!databaseId && formData) {
    databaseId =
      (formData as any)?.dhis2_source_database_id ||
      (formData as any)?.dhis2SourceDatabaseId ||
      (formData as any)?.database_id ||
      (formData as any)?.database?.id;
  }

  const cachedOrgUnitLevels = readCachedOrgUnitLevels(databaseId);
  const cachedLegendSets = readCachedLegendSets(databaseId);
  const datasourceHierarchyLevels = getDatasourceBoundaryLevels(
    datasourceColumns,
    cachedOrgUnitLevels,
  );

  const activeFilters = formData?.filters || [];
  const nativeFilters =
    filterState && Object.keys(filterState).length > 0 ? filterState : {};

  // Get dataset SQL for fallback DHIS2 data fetching (used early for org unit detection)
  // If SQL is missing DHIS2 comment, try to reconstruct from datasource.extra.dhis2_params
  let datasetSql = datasourceAny?.sql || '';
  let isDHIS2Dataset =
    datasetSql.includes('/* DHIS2:') || datasetSql.includes('-- DHIS2:');

  if (
    !isDHIS2Dataset &&
    (sourceDatabaseIdFromExtra || sourceInstanceIdsFromExtra.length > 0)
  ) {
    isDHIS2Dataset = true;
  }

  if (!isDHIS2Dataset && formDataAny?.viz_type === 'dhis2_map' && !datasetSql) {
    isDHIS2Dataset = true;
  }

  if (!isDHIS2Dataset) {
    const dhis2ParamsMap = extraParsed?.dhis2_params;
    if (dhis2ParamsMap) {
      const tableName =
        datasourceAny?.table_name ||
        datasourceAny?.table?.name ||
        datasourceAny?.name;
      let dhis2Params: string | undefined =
        (tableName && dhis2ParamsMap[tableName]) || undefined;

      if (!dhis2Params) {
        const values = Object.values(dhis2ParamsMap);
        if (values.length === 1) {
          dhis2Params = String(values[0]);
        }
      }

      if (dhis2Params) {
        const safeTable = tableName || 'analytics';
        datasetSql = `SELECT * FROM ${safeTable}\n/* DHIS2: ${dhis2Params} */`;
        isDHIS2Dataset = true;
      }
    }
  }

  // Get metric - could be string or object with column_name
  const metricString =
    typeof metric === 'string'
      ? metric
      : (metric as any)?.column?.column_name ||
        (metric as any)?.label ||
        (metric as any)?.expressionType ||
        'value';
  const metricDisplayLabel =
    (typeof metric === 'string'
      ? undefined
      : resolveDHIS2MetricLabel(metric as any)) || metricString;
  // Sanitize org_unit_column for matching
  const sanitizedOrgUnitColumn = org_unit_column
    ? sanitizeDHIS2ColumnName(org_unit_column)
    : undefined;

  const sanitizedTooltipColumns = (tooltip_columns || []).map((col: any) => {
    const colString =
      typeof col === 'string' ? col : col?.label || col?.name || String(col);
    return sanitizeDHIS2ColumnName(colString);
  });

  // Convert boundary_levels to array, supporting backward compatibility with boundary_level.
  const rawBoundaryLevels =
    boundary_levels ?? (formData as any)?.boundaryLevels;
  const rawBoundaryLevel = boundary_level ?? (formData as any)?.boundaryLevel;
  const normalizeLevels = (
    levels: number | string | (number | string)[] | undefined,
  ): number[] => {
    if (!levels) return [];
    if (Array.isArray(levels)) {
      return levels
        .map(l => (typeof l === 'string' ? parseInt(String(l), 10) : l))
        .filter(l => !Number.isNaN(l) && l > 0);
    }
    const parsed = typeof levels === 'string' ? parseInt(levels, 10) : levels;
    return !Number.isNaN(parsed) && parsed > 0 ? [parsed] : [];
  };
  const requestedBoundaryLevels = normalizeLevels(rawBoundaryLevels);
  const requestedBoundaryLevelFallback = normalizeLevels(rawBoundaryLevel);
  const requestedPrimaryLevel =
    requestedBoundaryLevels[0] || requestedBoundaryLevelFallback[0];

  // Backend returns WIDE/PIVOTED format with hierarchy levels as columns
  // Detect hierarchy level columns dynamically from first row
  let hierarchyLevelColumn = '';

  // Look for hierarchy level columns
  // Priority 1: Use org_unit_column if explicitly set (try both original and sanitized)
  if (org_unit_column && allColumns.includes(org_unit_column)) {
    hierarchyLevelColumn = org_unit_column;
  } else if (
    sanitizedOrgUnitColumn &&
    allColumns.includes(sanitizedOrgUnitColumn)
  ) {
    hierarchyLevelColumn = sanitizedOrgUnitColumn;
  }

  // Priority 2: Use staged hierarchy metadata carried on the dataset columns.
  if (!hierarchyLevelColumn) {
    const levelColumnsFound = datasourceHierarchyLevels
      .map(level => level.columnName)
      .filter((columnName): columnName is string => Boolean(columnName))
      .filter(columnName => allColumns.includes(columnName));

    if (levelColumnsFound.length > 0) {
      const preferredHierarchyLevel =
        datasourceHierarchyLevels.find(
          level =>
            level.level === requestedPrimaryLevel &&
            level.columnName &&
            allColumns.includes(level.columnName),
        ) ||
        datasourceHierarchyLevels
          .filter(
            level => level.columnName && allColumns.includes(level.columnName),
          )
          .slice(-1)[0];

      hierarchyLevelColumn = preferredHierarchyLevel?.columnName || '';
    }
  }

  // Priority 3: If still no match, try to find any non-metric column
  // Prefer the deepest recognizable hierarchy column present in the result rows.
  if (!hierarchyLevelColumn && data.length > 0) {
    hierarchyLevelColumn = resolveBestFallbackHierarchyColumn({
      allColumns,
      data,
      datasourceColumns,
      stagedOrgUnitLevels: cachedOrgUnitLevels,
      requestedPrimaryLevel,
    });
  }

  // Priority 4: If we STILL have no hierarchy column and this is DHIS2, use first column as fallback
  if (!hierarchyLevelColumn && isDHIS2Dataset && allColumns.length > 0) {
    hierarchyLevelColumn = resolveBestFallbackHierarchyColumn({
      allColumns,
      data,
      datasourceColumns,
      stagedOrgUnitLevels: cachedOrgUnitLevels,
      requestedPrimaryLevel,
    });
  }

  // Find the metric column dynamically using improved matching logic
  // Backend returns data element columns with IDs and names, all sanitized
  // Example: "105_EP01b_Malaria_Total" (ID_CODE_Name format)
  let metricColumn: string | undefined;

  const metricCandidates = Array.from(
    new Set(
      [
        metricDisplayLabel,
        metricString,
        typeof metric === 'string' ? undefined : (metric as any)?.sqlExpression,
        typeof metric === 'string'
          ? undefined
          : (metric as any)?.column?.verbose_name,
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  for (const candidate of metricCandidates) {
    metricColumn = findMetricColumn(candidate, allColumns);
    if (metricColumn) {
      break;
    }
  }

  // Fallback: First numeric column if metric not found
  if (!metricColumn && data.length > 0) {
    const firstRow = data[0];
    for (const col of allColumns) {
      const colLower = col.toLowerCase();
      if (
        !colLower.includes('period') &&
        !colLower.includes('level') &&
        (typeof firstRow[col] === 'number' || firstRow[col] !== null)
      ) {
        metricColumn = col;
        break;
      }
    }
  }

  // Final fallback: Use first column if nothing found (should not happen with valid data)
  if (!metricColumn && allColumns.length > 0) {
    metricColumn = allColumns[0];
  }

  // Default to 'value' if absolutely no columns available
  if (!metricColumn) {
    metricColumn = 'value';
  }

  const stagedLegendDefinition = resolveSelectedStagedLegendDefinition(
    datasourceColumns,
    metricColumn,
    staged_legend_column,
    cachedLegendSets,
  );
  const boundaryLevelLabels = buildBoundaryLevelLabelMap(
    datasourceColumns,
    cachedOrgUnitLevels,
  );
  const boundaryLevelColumns = datasourceHierarchyLevels.reduce<
    Record<number, string>
  >((result, definition) => {
    if (definition.columnName) {
      result[definition.level] = definition.columnName;
    }
    return result;
  }, {});

  const primaryBoundaryLevel = hierarchyLevelColumn
    ? resolveHierarchyLevelFromDatasourceColumn(
        datasourceColumns,
        hierarchyLevelColumn,
        cachedOrgUnitLevels,
      )
    : requestedPrimaryLevel;

  // Try boundary_levels first, then boundary_level for backward compatibility
  let selectedLevels = requestedBoundaryLevels;
  if (selectedLevels.length === 0) {
    selectedLevels = requestedBoundaryLevelFallback;
  }

  // Keep the selected OU hierarchy column as the primary boundary level so stale
  // saved boundary config does not request the wrong administrative geometry.
  if (selectedLevels.length === 0 && primaryBoundaryLevel) {
    selectedLevels = [primaryBoundaryLevel];
  } else if (primaryBoundaryLevel) {
    selectedLevels = mergeBoundaryLevels(primaryBoundaryLevel, selectedLevels);
  }

  // Final fallback: Default to Level 2 if nothing is specified
  if (selectedLevels.length === 0) {
    selectedLevels = [2];
  }

  // Build custom colors map from individual level color controls
  const customLevelColors: Record<
    number,
    { r: number; g: number; b: number; a: number }
  > = {};

  if (level_1_color) customLevelColors[1] = level_1_color;
  if (level_2_color) customLevelColors[2] = level_2_color;
  if (level_3_color) customLevelColors[3] = level_3_color;
  if (level_4_color) customLevelColors[4] = level_4_color;
  if (level_5_color) customLevelColors[5] = level_5_color;
  if (level_6_color) customLevelColors[6] = level_6_color;

  // Generate distinct border colors for each boundary level
  let levelBorderColors: LevelBorderColor[];
  if (
    level_border_colors &&
    Array.isArray(level_border_colors) &&
    level_border_colors.length > 0
  ) {
    levelBorderColors = level_border_colors;
  } else if (Object.keys(customLevelColors).length > 0) {
    levelBorderColors = generateLevelBorderColors(
      selectedLevels,
      customLevelColors,
    );
  } else {
    levelBorderColors = generateLevelBorderColors(selectedLevels);
  }

  // Parse manual breaks from comma-separated string to number array
  const parsedManualBreaks: number[] | undefined = manual_breaks
    ? manual_breaks
        .split(',')
        .map((v: string) => parseFloat(v.trim()))
        .filter((v: number) => !Number.isNaN(v))
    : undefined;

  // Parse manual colors from comma-separated string to string array
  const parsedManualColors: string[] | undefined = manual_colors
    ? manual_colors
        .split(',')
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 0)
    : undefined;

  const usesLegacyDefaultCategoricalScale =
    use_linear_color_scheme === false &&
    (!color_scheme || color_scheme === 'supersetColors') &&
    legend_type !== 'staged' &&
    legend_type !== 'manual' &&
    !parsedManualColors?.length;
  const effectiveUseLinearColorScheme =
    usesLegacyDefaultCategoricalScale || use_linear_color_scheme !== false;

  // Derive datasetId if datasource payload is minimal (e.g., dashboards)
  const datasetId =
    (datasource as any)?.id ||
    (typeof (formData as any)?.datasource === 'string'
      ? parseInt((formData as any).datasource.split('__')[0], 10)
      : undefined);
  const chartId =
    coercePositiveInteger(formDataAny?.slice_id) ||
    coercePositiveInteger(formDataAny?.sliceId) ||
    (typeof window !== 'undefined'
      ? coercePositiveInteger(
          new URLSearchParams(window.location.search).get('slice_id'),
        )
      : undefined);
  const dashboardId =
    coercePositiveInteger(formDataAny?.dashboard_id) ||
    coercePositiveInteger(formDataAny?.dashboardId);

  const effectiveAggregationMethod = (() => {
    if (aggregation_method) {
      return aggregation_method;
    }
    const metricCol = datasourceColumns.find(
      c =>
        c.column_name === metricColumn ||
        (c.column_name &&
          sanitizeDHIS2ColumnName(c.column_name) === metricColumn),
    );
    const extra = parseColumnExtra(metricCol?.extra);
    if (extra?.dhis2_is_indicator === true) {
      return 'average';
    }
    return 'sum';
  })();

  // The filters the user applied. ChartProps camelCases formData keys
  // (rawFormData keeps the original), so the controls arrive as
  // `dhis2ColumnFilters` / `adhocFilters` at runtime. Read both — the
  // snake_case form is what tests and buildQuery see.
  const rawColumnFilters =
    formDataAny?.dhis2ColumnFilters ?? formDataAny?.dhis2_column_filters;
  const rawAdhocFilters =
    formDataAny?.adhocFilters ?? formDataAny?.adhoc_filters;
  const timeColumn =
    formDataAny?.granularitySqla ?? formDataAny?.granularity_sqla;

  const columnLabel = makeColumnLabeller(datasourceAny?.columns || []);
  const subtitleFilters: SubtitleFilter[] = [
    ...dhis2FilterSegments(
      Array.isArray(rawColumnFilters) ? rawColumnFilters : [],
      {
        columnLabel,
        periodColumns: datasourcePeriodColumns,
        timeColumn: typeof timeColumn === 'string' ? timeColumn : undefined,
      },
    ),
    ...adhocFilterSegments(
      Array.isArray(rawAdhocFilters) ? rawAdhocFilters : [],
      columnLabel,
    ),
  ];

  // Detect a period column from the data itself as a last resort, so the period
  // shows in the subtitle even when it isn't flagged in metadata.
  const detectedPeriodColumn = detectPeriodColumnFromData(
    data,
    new Set(
      [
        metricColumn,
        hierarchyLevelColumn,
        ...Object.values(boundaryLevelColumns),
      ].filter(Boolean) as string[],
    ),
  );

  return {
    width,
    height,
    data,
    databaseId,
    isStagedLocalDataset,
    stagedDatasetId,
    sourceInstanceIds: sourceInstanceIdsFromExtra,
    datasetId,
    datasourceColumns,
    orgUnitColumn: hierarchyLevelColumn,
    metric: metricColumn,
    metricLabel: metricDisplayLabel || metricColumn,
    aggregationMethod: effectiveAggregationMethod,
    primaryBoundaryLevel,
    boundaryLevels: selectedLevels,
    boundaryLevelLabels,
    boundaryLevelColumns,
    levelBorderColors,
    enableDrill: enable_drill !== false,
    colorScheme: color_scheme || 'supersetColors',
    linearColorScheme: linear_color_scheme || 'superset_seq_1',
    useLinearColorScheme: effectiveUseLinearColorScheme,
    chartBackgroundColor: chart_background_color,
    transparentCardContainer: transparent_card_container === true,
    boundaryFocusMaskStyle: boundary_focus_mask_style || 'off',
    basemapStyle: basemap_style || 'none',
    opacity: opacity ?? 0.7,
    strokeColor: stroke_color || { r: 255, g: 255, b: 255, a: 1 },
    strokeWidth: stroke_width ?? 1,
    autoThemeBorders: auto_theme_borders ?? false,
    showAllBoundaries: show_all_boundaries ?? false,
    focusSelectedBoundaryWithChildren:
      focus_selected_boundary_with_children ?? false,
    styleUnselectedAreas: style_unselected_areas ?? true,
    unselectedAreaFillColor: unselected_area_fill_color || {
      r: 241,
      g: 245,
      b: 249,
      a: 1,
    },
    unselectedAreaFillOpacity: unselected_area_fill_opacity ?? 0.45,
    unselectedAreaBorderColor: unselected_area_border_color || {
      r: 148,
      g: 163,
      b: 184,
      a: 1,
    },
    unselectedAreaBorderWidth: unselected_area_border_width ?? 0.75,
    showLabels: show_labels !== false,
    labelType: label_type || 'name_value',
    labelFontSize: label_font_size || 12,
    showLegend: show_legend !== false,
    legendPosition: legend_position || 'bottomright',
    legendDisplayType: legend_display_type || 'vertical_list',
    legendClasses: legend_classes || 5,
    legendType: legend_type || 'auto',
    legendMin: legend_min ? Number(legend_min) : undefined,
    legendMax: legend_max ? Number(legend_max) : undefined,
    manualBreaks: parsedManualBreaks,
    manualColors: parsedManualColors,
    stagedLegendDefinition,
    legendReverseColors: legend_reverse_colors ?? false,
    legendNoDataColor: legend_no_data_color || { r: 204, g: 204, b: 204, a: 1 },
    compassVisible: compass_visible === true,
    compassPosition: compass_position || 'topright',
    compassStyle: compass_style || 'north_badge',
    chartTitle: formDataAny?.chartTitle ?? formDataAny?.chart_title ?? '',
    chartSubtitle:
      (formDataAny?.chartAutoSubtitle ?? formDataAny?.chart_auto_subtitle)
        ? buildMapAutoSubtitle({
            data,
            // Prefer period columns detected from metadata; fall back to the
            // selected Time Period Column so the period still shows.
            periodColumns: [
              ...periodColumns,
              ...(typeof timeColumn === 'string' ? [timeColumn] : []),
              ...(detectedPeriodColumn ? [detectedPeriodColumn] : []),
            ],
            orgUnitColumn: hierarchyLevelColumn,
            boundaryLevelLabels,
            boundaryLevelColumns,
            primaryBoundaryLevel,
            filters: subtitleFilters,
          })
        : (formDataAny?.chartSubtitle ?? formDataAny?.chart_subtitle ?? ''),
    chartTitleColor:
      formDataAny?.chartTitleColor ?? formDataAny?.chart_title_color,
    chartSubtitleColor:
      formDataAny?.chartSubtitleColor ?? formDataAny?.chart_subtitle_color,
    chartTitleAlign:
      formDataAny?.chartTitleAlign ??
      formDataAny?.chart_title_align ??
      'center',
    tooltipColumns: sanitizedTooltipColumns,
    hideQuickFilters: hide_quick_filters === true,
    setDataMask: hooks?.setDataMask,
    activeFilters,
    nativeFilters,
    // DHIS2 specific props for fallback data fetching
    datasetSql,
    isDHIS2Dataset,
    // Boundary loading method - default to geoJSON for better multi-level support
    boundaryLoadMethod: formData.boundary_load_method || 'geoJSON',
    chartId,
    dashboardId,
    ouHierarchyColumns,
    periodColumns,
  };
}
