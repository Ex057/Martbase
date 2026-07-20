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

import {
  t,
  getCategoricalSchemeRegistry,
  getSequentialSchemeRegistry,
  SequentialScheme,
} from '@superset-ui/core';
import {
  ControlPanelConfig,
} from '@superset-ui/chart-controls';

type DatasourceColumn = {
  column_name?: string;
  verbose_name?: string;
  extra?: unknown;
};

type StagedLegendSet = {
  id?: string;
  displayName?: string;
  name?: string;
  legendDefinition?: {
    items?: Array<unknown>;
    setName?: string;
  };
};

type CachedLegendSetEnvelope = {
  data: StagedLegendSet[];
  timestamp: number;
  status?: string;
};

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

function getLegendSetsCacheKey(databaseId?: number | string): string | null {
  const dbId = databaseId ? Number(databaseId) : undefined;
  if (!dbId || !Number.isFinite(dbId) || dbId <= 0) {
    return null;
  }
  return `dhis2_legend_sets_db${dbId}`;
}

export function readCachedLegendSetEnvelope(
  databaseId?: number | string,
): CachedLegendSetEnvelope | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const cacheKey = getLegendSetsCacheKey(databaseId);
  if (!cacheKey) {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (!cached) {
      return null;
    }
    const parsed = JSON.parse(cached) as CachedLegendSetEnvelope;
    if (!Array.isArray(parsed?.data)) {
      return null;
    }
    return {
      data: parsed.data.filter(
        (item: unknown): item is StagedLegendSet =>
          Boolean(item) && typeof item === 'object',
      ),
      timestamp: Number(parsed.timestamp || 0),
      status: String(parsed.status || '').trim() || undefined,
    };
  } catch {
    return null;
  }
}

function readCachedLegendSets(databaseId?: number | string): StagedLegendSet[] {
  return readCachedLegendSetEnvelope(databaseId)?.data || [];
}

function shouldFetchLegendSets(databaseId?: number | string): boolean {
  const envelope = readCachedLegendSetEnvelope(databaseId);
  if (!envelope) {
    return true;
  }

  if (envelope.status === 'pending' || envelope.status === 'failed') {
    return Date.now() - envelope.timestamp > 30000;
  }

  return false;
}

function getDhis2SourceDatabaseId(datasource: any): number | undefined {
  const extra = parseColumnExtra(datasource?.extra);
  const sourceDatabaseId = Number(
    extra?.dhis2_source_database_id ??
      extra?.source_database_id ??
      extra?.dhis2SourceDatabaseId ??
      datasource?.database?.id ??
      datasource?.database_id ??
      NaN,
  );
  if (Number.isFinite(sourceDatabaseId) && sourceDatabaseId > 0) {
    return sourceDatabaseId;
  }
  return undefined;
}

function isDhis2Datasource(datasource: any): boolean {
  const extra = parseColumnExtra(datasource?.extra) || {};
  const sql = String(datasource?.sql || '');
  return Boolean(
    extra?.dhis2_params ||
      extra?.dhis2_source_database_id ||
      extra?.dhis2SourceDatabaseId ||
      sql.includes('/* DHIS2:') ||
      sql.includes('-- DHIS2:'),
  );
}

function getLegendSetSelectionValue(legendSet: StagedLegendSet): string | null {
  const legendSetId = String(legendSet.id || '').trim();
  const legendSetName = String(
    legendSet.displayName || legendSet.name || '',
  ).trim();
  const identity = legendSetId || legendSetName;
  return identity ? `legendset:${identity}` : null;
}

function getStagedLegendChoices(
  columns: DatasourceColumn[] = [],
  legendSets: StagedLegendSet[] = [],
) {
  const seenValues = new Set<string>();
  const choices: Array<[string, string]> = [
    ['__metric__', t('Selected metric legend')],
  ];

  const pushChoice = (value: string | null | undefined, label: string) => {
    if (!value || !label || seenValues.has(value)) {
      return;
    }
    seenValues.add(value);
    choices.push([value, label]);
  };

  columns.forEach(column => {
    const columnName = String(column.column_name || '').trim();
    if (!columnName) {
      return;
    }
    const extra = parseColumnExtra(column.extra);
    const legendDefinition = extra?.dhis2_legend ?? extra?.dhis2Legend;
    if (
      !Array.isArray(legendDefinition?.items) ||
      !legendDefinition.items.length
    ) {
      return;
    }

    const legendLabel = String(
      legendDefinition?.setName || column.verbose_name || columnName,
    ).trim();
    const columnLabel = String(column.verbose_name || columnName).trim();
    pushChoice(columnName, `${legendLabel} (${columnLabel})`);
  });

  legendSets.forEach(legendSet => {
    const { legendDefinition } = legendSet;
    if (
      !Array.isArray(legendDefinition?.items) ||
      !legendDefinition.items.length
    ) {
      return;
    }
    const selectionValue = getLegendSetSelectionValue(legendSet);
    const legendLabel = String(
      legendDefinition?.setName ||
        legendSet.displayName ||
        legendSet.name ||
        legendSet.id ||
        '',
    ).trim();
    pushChoice(selectionValue, `${legendLabel} (${t('DHIS2 legend set')})`);
  });

  return choices;
}

const categoricalSchemeRegistry = getCategoricalSchemeRegistry();
const sequentialSchemeRegistry = getSequentialSchemeRegistry();

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'select_country',
            config: {
              type: 'SelectControl',
              label: t('Country'),
              default: 'uganda',
              clearable: false,
              choices: [['uganda', t('Uganda')]],
              description: t('Country boundary pack used for this map.'),
            },
          },
        ],
        [
          {
            name: 'geo_boundary_level',
            config: {
              type: 'SelectControl',
              label: t('Area Geometry'),
              default: 3,
              choices: [[3, t('Uganda District Geometry')]],
              clearable: false,
              description: t(
                'Geometry source used for rendering Uganda boundaries.',
              ),
            },
          },
        ],
        [
        ],
        ['entity'],
        [
          {
            name: 'geo_join_feature_property',
            config: {
              type: 'TextControl',
              label: t('GeoJSON Property'),
              description: t(
                'Feature property to join on (default: NAME_1).',
              ),
              default: 'NAME_1',
            },
          },
        ],
        ['metric'],
        ['adhoc_filters'],
      ],
    },
    {
      label: t('Color schemes'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'use_linear_color_scheme',
            config: {
              type: 'CheckboxControl',
              label: t('Use sequential palette'),
              description: t(
                'When checked, the map uses a sequential palette. When unchecked, it uses a categorical palette.',
              ),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'linear_color_scheme',
            config: {
              type: 'ColorSchemeControl',
              label: t('Sequential color scheme'),
              description: t(
                'Gradient color scheme for choropleth maps. Select from available sequential palettes.',
              ),
              default: sequentialSchemeRegistry.getDefaultKey(),
              choices: () =>
                (sequentialSchemeRegistry.values() as SequentialScheme[]).map(
                  value => [value.id, value.label],
                ),
              schemes: () => sequentialSchemeRegistry.getMap(),
              isLinear: true,
              clearable: false,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.use_linear_color_scheme?.value !== false,
            },
          },
        ],
        [
          {
            name: 'color_scheme',
            config: {
              type: 'ColorSchemeControl',
              label: t('Categorical color scheme'),
              default: categoricalSchemeRegistry.getDefaultKey(),
              renderTrigger: true,
              choices: () =>
                categoricalSchemeRegistry.keys().map(key => [key, key]),
              description: t('The categorical palette for rendering chart'),
              schemes: () => categoricalSchemeRegistry.getMap(),
              visibility: ({ controls }: any) =>
                controls?.use_linear_color_scheme?.value === false,
            },
          },
        ],
        [
          {
            name: 'legend_type',
            config: {
              type: 'SelectControl',
              label: t('Data range colors'),
              description: t(
                'Auto uses staged DHIS2 legend ranges when available, otherwise it calculates ranges from data. Manual allows custom break points and colors.',
              ),
              default: 'auto',
              choices: [
                ['auto', t('Auto (from data)')],
                ['staged', t('DHIS2 Staged Legend')],
                ['equal_interval', t('Equal Interval')],
                ['quantile', t('Quantile')],
                ['manual', t('Manual Breaks')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'staged_legend_column',
            config: {
              type: 'SelectControl',
              label: t('DHIS2 staged legend'),
              description: t(
                'Choose which staged DHIS2 legend set to apply. "Selected metric legend" keeps the legend attached to the current metric column.',
              ),
              default: '__metric__',
              clearable: false,
              renderTrigger: true,
              mapStateToProps: (state: any) => {
                const datasourceColumns = Array.isArray(
                  state.datasource?.columns,
                )
                  ? state.datasource.columns
                  : [];
                const databaseId = getDhis2SourceDatabaseId(state.datasource);
                const cachedLegendSets = readCachedLegendSets(databaseId);
                const cacheKey = getLegendSetsCacheKey(databaseId);
                const shouldSync =
                  databaseId && cacheKey && isDhis2Datasource(state.datasource);

                if (
                  shouldSync &&
                  typeof window !== 'undefined' &&
                  shouldFetchLegendSets(databaseId)
                ) {
                  setTimeout(() => {
                    import('src/utils/dhis2LegendColorSchemes').then(
                      ({ syncDHIS2LegendSchemesForDatabase }) => {
                        syncDHIS2LegendSchemesForDatabase(databaseId).catch(
                          () => {
                            // Fallback to column-attached legends until staged legend sets arrive.
                          },
                        );
                      },
                    );
                  }, 0);
                }

                return {
                  choices: getStagedLegendChoices(
                    datasourceColumns,
                    cachedLegendSets,
                  ),
                };
              },
              visibility: ({ controls }: any) =>
                controls?.legend_type?.value === 'staged',
            },
          },
        ],
        [
          {
            name: 'legend_classes',
            config: {
              type: 'SliderControl',
              label: t('Number of classes'),
              description: t(
                'Number of color classes/intervals in the legend (affects color distribution)',
              ),
              default: 5,
              min: 2,
              max: 9,
              step: 1,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.legend_type?.value !== 'staged' &&
                controls?.legend_type?.value !== 'manual',
            },
          },
        ],
        [
          {
            name: 'manual_breaks',
            config: {
              type: 'TextControl',
              label: t('Manual break points'),
              description: t(
                'Comma-separated break values for manual legend. E.g., "0,100,500,1000,5000" creates 4 intervals.',
              ),
              default: '',
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.legend_type?.value === 'manual',
            },
          },
        ],
        [
          {
            name: 'manual_colors',
            config: {
              type: 'TextControl',
              label: t('Manual colors'),
              description: t(
                'Comma-separated hex colors for each interval. E.g., "#ffffcc,#a1dab4,#41b6c4,#225ea8". Must match number of intervals.',
              ),
              default: '',
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.legend_type?.value === 'manual',
            },
          },
        ],
        [
          {
            name: 'legend_reverse_colors',
            config: {
              type: 'CheckboxControl',
              label: t('Reverse color scheme'),
              description: t('Reverse the order of colors in the legend'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'legend_no_data_color',
            config: {
              type: 'ColorPickerControl',
              label: t('No data color'),
              description: t('Color for areas with no data'),
              default: { r: 204, g: 204, b: 204, a: 1 },
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Map Style'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'opacity',
            config: {
              type: 'SliderControl',
              label: t('Fill Opacity'),
              description: t(
                'Transparency of filled regions (0 = transparent, 1 = solid)',
              ),
              default: 0.7,
              min: 0,
              max: 1,
              step: 0.1,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'chart_background_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Background color'),
              description: t('Background behind the map viewport'),
              default: { r: 255, g: 255, b: 255, a: 1 },
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'chart_background_color_hex',
            config: {
              type: 'TextControl',
              label: t('Background color (HEX)'),
              description: t(
                'Enter a 6- or 8-digit hex color code, e.g. #F2EBEB or #F2EBEB00. ' +
                  'This raw value overrides the color picker.',
              ),
              default: '',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'chart_background_opacity',
            config: {
              type: 'SliderControl',
              label: t('Background Opacity'),
              description: t(
                'Transparency of background (0 = transparent, 1 = solid)',
              ),
              default: 1,
              min: 0,
              max: 1,
              step: 0.1,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'basemap_style',
            config: {
              type: 'SelectControl',
              label: t('Basemap'),
              description: t('Tile layer shown under boundaries'),
              default: 'osmLight',
              choices: [
                ['none', t('Transparent Background')],
                ['osmLight', t('Light CARTO Positron')],
                ['dark', t('Dark CARTO Dark Matter')],
                ['terrain', t('Vegetation / Topo (OpenTopoMap)')],
                ['naturalEsri', t('Desert / Natural (Esri NatGeo)')],
                ['satellite', t('Satellite (Esri World Imagery)')],
                ['osm', t('OpenStreetMap')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'transparent_card_container',
            config: {
              type: 'CheckboxControl',
              label: t('Transparent Card Container'),
              description: t(
                'Make the chart container/card background transparent for this DHIS2 map.',
              ),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'boundary_focus_mask_style',
            config: {
              type: 'SelectControl',
              label: t('Outside Boundary Mask'),
              description: t(
                'Shade areas outside selected boundaries. Useful to de-emphasize non-focus regions.',
              ),
              default: 'off',
              choices: [
                ['off', t('Off')],
                ['light', t('Light')],
                ['dark', t('Dark')],
                ['transparent', t('Transparent')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'stroke_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Border Color'),
              description: t('Default border color for boundaries'),
              default: { r: 255, g: 255, b: 255, a: 1 },
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'auto_theme_borders',
            config: {
              type: 'CheckboxControl',
              label: t('Auto Theme Borders'),
              description: t(
                'Automatically derive border colors from the color scheme (darker shade of fill color)',
              ),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'stroke_width',
            config: {
              type: 'SliderControl',
              label: t('Border Width'),
              description: t('Width of boundary borders in pixels'),
              default: 1,
              min: 0,
              max: 5,
              step: 0.5,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'show_all_boundaries',
            config: {
              type: 'CheckboxControl',
              label: t('Show All Boundaries'),
              description: t(
                'Display all boundary outlines, including areas without data. When unchecked, only boundaries that match your data will be shown (recommended for multi-country DHIS2 instances).',
              ),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'style_unselected_areas',
            config: {
              type: 'CheckboxControl',
              label: t('Style unselected areas'),
              description: t(
                'When showing the full map with only a subset selected, apply a separate border and fill style to the unselected areas.',
              ),
              default: true,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.show_all_boundaries?.value === true,
            },
          },
        ],
        [
          {
            name: 'unselected_area_fill_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Unselected Area Fill'),
              description: t(
                'Fill color for boundaries outside the selected area',
              ),
              default: { r: 241, g: 245, b: 249, a: 1 },
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.show_all_boundaries?.value === true &&
                controls?.style_unselected_areas?.value !== false,
            },
          },
          {
            name: 'unselected_area_fill_opacity',
            config: {
              type: 'SliderControl',
              label: t('Unselected Fill Opacity'),
              description: t(
                'Opacity for boundaries outside the selected area',
              ),
              default: 0.45,
              min: 0,
              max: 1,
              step: 0.05,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.show_all_boundaries?.value === true &&
                controls?.style_unselected_areas?.value !== false,
            },
          },
        ],
        [
          {
            name: 'unselected_area_border_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Unselected Area Border'),
              description: t(
                'Border color for boundaries outside the selected area',
              ),
              default: { r: 148, g: 163, b: 184, a: 1 },
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.show_all_boundaries?.value === true &&
                controls?.style_unselected_areas?.value !== false,
            },
          },
          {
            name: 'unselected_area_border_width',
            config: {
              type: 'SliderControl',
              label: t('Unselected Border Width'),
              description: t(
                'Border width for boundaries outside the selected area',
              ),
              default: 0.75,
              min: 0,
              max: 4,
              step: 0.25,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.show_all_boundaries?.value === true &&
                controls?.style_unselected_areas?.value !== false,
            },
          },
        ],
      ],
    },
    {
      label: t('Labels'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'show_labels',
            config: {
              type: 'CheckboxControl',
              label: t('Show Labels'),
              description: t('Display org unit names on the map'),
              default: true,
            },
          },
        ],
        [
          {
            name: 'label_type',
            config: {
              type: 'SelectControl',
              label: t('Label Content'),
              default: 'name_value',
              choices: [
                ['name', t('Name Only')],
                ['value', t('Value Only')],
                ['name_value', t('Name and Value')],
                ['percent', t('Percentage')],
              ],
            },
          },
        ],
        [
          {
            name: 'label_font_size',
            config: {
              type: 'SliderControl',
              label: t('Label Font Size'),
              default: 12,
              min: 8,
              max: 24,
              step: 1,
            },
          },
        ],
      ],
    },
    {
      label: t('Legend'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'show_legend',
            config: {
              type: 'CheckboxControl',
              label: t('Show Legend'),
              default: true,
            },
          },
        ],
        [
          {
            name: 'legend_position',
            config: {
              type: 'SelectControl',
              label: t('Legend Position'),
              default: 'bottomright',
              choices: [
                ['topleft', t('Top Left')],
                ['top', t('Top Center')],
                ['topright', t('Top Right')],
                ['left', t('Left')],
                ['right', t('Right')],
                ['bottomleft', t('Bottom Left')],
                ['bottom', t('Bottom Center')],
                ['bottomright', t('Bottom Right')],
              ],
            },
          },
        ],
        [
          {
            name: 'legend_display_type',
            config: {
              type: 'SelectControl',
              label: t('Legend Display'),
              default: 'vertical_list',
              renderTrigger: true,
              choices: [
                ['vertical_list', t('Vertical List')],
                ['horizontal_chips', t('Horizontal Chips')],
                ['compact', t('Compact')],
              ],
            },
          },
        ],
      ],
    },
    {
      label: t('Compass'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'compass_visible',
            config: {
              type: 'CheckboxControl',
              label: t('Show Compass'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'compass_position',
            config: {
              type: 'SelectControl',
              label: t('Compass Position'),
              default: 'topright',
              renderTrigger: true,
              choices: [
                ['topleft', t('Top Left')],
                ['topright', t('Top Right')],
                ['bottomleft', t('Bottom Left')],
                ['bottomright', t('Bottom Right')],
              ],
              visibility: ({ controls }: any) =>
                controls?.compass_visible?.value === true,
            },
          },
        ],
        [
          {
            name: 'compass_style',
            config: {
              type: 'SelectControl',
              label: t('Compass Style'),
              default: 'north_badge',
              renderTrigger: true,
              choices: [
                ['north_badge', t('North Badge (N▲)')],
                ['arrow_north', t('Arrow + N')],
                ['minimal_n', t('Minimal N')],
              ],
              visibility: ({ controls }: any) =>
                controls?.compass_visible?.value === true,
            },
          },
        ],
      ],
    },
    {
      label: t('Filters'),
      expanded: true,
      controlSetRows: [
        // DHIS2ColumnFilterControl — unified column filter for staged datasets.
        // Pick any dataset column; its distinct values are fetched immediately
        // from the backend so users can select from real data (not free-form).
        // Multiple column filters are supported simultaneously.
        // buildQuery.ts translates each {column, values} entry to WHERE col IN (...).
        // For non-staged datasets, standard adhoc_filters is still available below.
        [
          {
            name: 'dhis2_column_filters',
            config: {
              type: 'DHIS2ColumnFilterControl',
              label: t('Data Filters'),
              description: t(
                'Add one or more column filters. ' +
                  'Select a column, then choose from its actual values in the data. ' +
                  'Period column: values like 2024Q1, 2024, 202401. ' +
                  'Multiple filters are combined with AND.',
              ),
              default: [],
              mapStateToProps: (state: any) => ({
                datasource: state.datasource,
              }),
            },
          },
        ],
      ],
    },
    {
      label: t('Tooltip'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'tooltip_columns',
            config: {
              type: 'SelectControl',
              label: t('Tooltip Columns'),
              description: t('Additional columns to show in tooltip'),
              multi: true,
              mapStateToProps: (state: any) => ({
                choices:
                  state.datasource?.columns?.map((col: any) => [
                    col.column_name,
                    col.column_name,
                  ]) || [],
              }),
            },
          },
        ],
      ],
    },
    {
      label: t('Title & Subtitle'),
      tabOverride: 'customize',
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'chart_title',
            config: {
              type: 'TextControl',
              label: t('Title'),
              renderTrigger: true,
              default: '',
              description: t('Title shown on the map, above the plot area.'),
            },
          },
        ],
        [
          {
            name: 'chart_auto_subtitle',
            config: {
              type: 'CheckboxControl',
              label: t('Auto subtitle'),
              renderTrigger: true,
              default: false,
              description: t(
                "Automatically build the subtitle from the chart's active filters, " +
                  'e.g. "Region: Bukedi, Busoga - Year > 2020". Uncheck to type your own subtitle.',
              ),
            },
          },
        ],
        [
          {
            name: 'chart_auto_subtitle_metrics',
            config: {
              type: 'CheckboxControl',
              label: t('Include metrics in subtitle'),
              renderTrigger: true,
              default: true,
              description: t(
                'Prepend metric names to the auto subtitle (e.g. "Malaria Cases · Last 12 months").',
              ),
              visibility: ({ controls }: any) =>
                Boolean(controls?.chart_auto_subtitle?.value),
            },
          },
        ],
        [
          {
            name: 'chart_subtitle',
            config: {
              type: 'TextControl',
              label: t('Subtitle'),
              renderTrigger: true,
              default: '',
              description: t('Optional subtitle shown beneath the title.'),
              visibility: ({ controls }: any) =>
                !controls?.chart_auto_subtitle?.value,
            },
          },
        ],
        [
          {
            name: 'chart_title_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Title color'),
              renderTrigger: true,
              description: t('Text color for the title.'),
            },
          },
          {
            name: 'chart_subtitle_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Subtitle color'),
              renderTrigger: true,
              description: t('Text color for the subtitle.'),
            },
          },
        ],
        [
          {
            name: 'chart_title_align',
            config: {
              type: 'SelectControl',
              label: t('Title alignment'),
              renderTrigger: true,
              clearable: false,
              default: 'center',
              choices: [
                ['center', t('Center')],
                ['left', t('Left')],
              ],
            },
          },
        ],
      ],
    },
  ],
  controlOverrides: {
    entity: {
      label: t('Boundary Join Column'),
      description: t(
        'Column that matches Uganda GeoJSON boundary values (for example: district or region).',
      ),
    },
    metric: {
      label: t('Metric'),
      description: t('Metric to color the map.'),
    },
  },
};

export default config;
