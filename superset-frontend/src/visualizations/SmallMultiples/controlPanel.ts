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
  t,
  getCategoricalSchemeRegistry,
  getSequentialSchemeRegistry,
  SequentialScheme,
} from '@superset-ui/core';
import {
  ControlPanelConfig,
  D3_FORMAT_OPTIONS,
  sharedControls,
} from '@superset-ui/chart-controls';
import { detectAvailablePresets, resolvePresetColumn } from './dhis2Presets';
import { getDatasourceBoundaryLevels } from '../DHIS2Map/boundaryLevels';
import { dhis2DataFiltersSection } from 'src/explore/components/controls/DHIS2ColumnFilterControl/shared';
import { chartAutoSubtitleSection } from 'src/components/ChartTitleBlock';

const categoricalSchemeRegistry = getCategoricalSchemeRegistry();
const sequentialSchemeRegistry = getSequentialSchemeRegistry();

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

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'dhis2_split_preset',
            config: {
              type: 'SelectControl',
              label: t('Split Dimension'),
              description: t(
                'Column that creates panels. Each unique value becomes one panel. ' +
                  'DHIS2 presets auto-detect OU levels and period columns. ' +
                  'Choose "Custom Column" to pick any column manually.',
              ),
              default: 'custom',
              choices: [['custom', t('Custom Column')]],
              mapStateToProps: (state: any) => {
                const columns = state.datasource?.columns || [];
                const presets = detectAvailablePresets(columns);
                const choices: [string, string][] = [
                  ['custom', t('Custom Column')],
                  ...presets.map(
                    p => [p.presetKey, t(p.label)] as [string, string],
                  ),
                ];
                return { choices };
              },
              renderTrigger: false,
            },
          },
        ],
        [
          {
            name: 'dhis2_source_database_id',
            config: {
              type: 'HiddenControl',
              hidden: true,
              mapStateToProps: (state: any) => ({
                value: getDhis2SourceDatabaseId(state.datasource),
              }),
            },
          },
        ],
        [
          {
            name: '_resolved_split_col',
            config: {
              type: 'HiddenControl',
              hidden: true,
              mapStateToProps: (state: any) => {
                const preset = state.controls?.dhis2_split_preset?.value;
                const dsColumns = state.datasource?.columns || [];
                const dataColumns = dsColumns.map((c: any) =>
                  String(c.column_name || ''),
                );
                const resolved = resolvePresetColumn(
                  preset,
                  dsColumns,
                  dataColumns,
                );
                return { value: resolved || null };
              },
            },
          },
        ],
        [
          {
            name: 'groupby',
            config: {
              ...sharedControls.groupby,
              label: t('Custom Split Column'),
              description: t(
                'Column to split data into panels (e.g. District or Period). ' +
                  'Only used when "Custom Column" is selected above.',
              ),
              multi: false,
              visibility: ({ controls }: any) =>
                !controls?.dhis2_split_preset?.value ||
                controls?.dhis2_split_preset?.value === 'custom',
            },
          },
        ],
        [
          {
            name: 'x_axis',
            config: {
              ...sharedControls.groupby,
              label: t('X-Axis / Category'),
              description: t(
                'Column for the X-axis within each panel (e.g. Period for charts, ' +
                  'Region name for maps).',
              ),
              multi: false,
            },
          },
        ],
        [
          {
            name: 'metrics',
            config: {
              ...sharedControls.metrics,
              label: t('Metrics'),
              description: t(
                'One or more metrics. Multiple metrics show as overlaid series in each panel.',
              ),
              multi: true,
            },
          },
        ],
        [
          {
            name: 'boundary_level',
            config: {
              type: 'SelectControl',
              label: t('DHIS2 Boundary Level'),
              description: t(
                'Organization unit level for the map. Loads boundaries and ' +
                  'disaggregates data by the matching OU column.',
              ),
              default: '',
              choices: [['', t('Select boundary level')]],
              mapStateToProps: (state: any) => {
                const dsColumns = state.datasource?.columns || [];
                const levels = getDatasourceBoundaryLevels(dsColumns);
                const existingValue = state.controls?.boundary_level?.value;
                if (levels.length > 0) {
                  const choices = levels.map(l => [
                    `${l.level}:${l.columnName || ''}`,
                    `Level ${l.level} (${l.label})`,
                  ]);
                  const hasExistingChoice = choices.some(
                    ([value]) => value === existingValue,
                  );
                  return {
                    choices,
                    value: hasExistingChoice ? existingValue : choices[0][0],
                  };
                }
                return {
                  choices: [
                    ['', t('No DHIS2 boundary levels detected in dataset metadata')],
                  ],
                  value: '',
                };
              },
              renderTrigger: false,
              visibility: ({ controls }: any) =>
                controls?.mini_chart_type?.value === 'mini_map',
            },
          },
        ],
        ['adhoc_filters'],
      ],
    },
    chartAutoSubtitleSection,
    dhis2DataFiltersSection,
    {
      label: t('Layout'),
      tabOverride: 'customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'grid_columns',
            config: {
              type: 'SliderControl',
              label: t('Grid Columns'),
              description: t(
                'Number of columns in the grid. When responsive mode is on, ' +
                  'columns auto-reduce on smaller widths.',
              ),
              default: 4,
              min: 1,
              max: 12,
              step: 1,
              renderTrigger: true,
            },
          },
          {
            name: 'panel_padding',
            config: {
              type: 'SliderControl',
              label: t('Panel Gap'),
              default: 8,
              min: 0,
              max: 24,
              step: 2,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'panel_height',
            config: {
              type: 'SliderControl',
              label: t('Panel Height (px)'),
              description: t(
                'Fixed height for each panel chart area. Set to 0 for auto-sizing.',
              ),
              default: 0,
              min: 0,
              max: 800,
              step: 10,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'show_panel_icon',
            config: {
              type: 'CheckboxControl',
              label: t('Show Panel Icon'),
              description: t(
                'Show an image URL or short icon text in each panel header.',
              ),
              default: false,
              renderTrigger: true,
            },
          },
          {
            name: 'panel_icon_size',
            config: {
              type: 'SliderControl',
              label: t('Icon Size'),
              default: 28,
              min: 16,
              max: 64,
              step: 2,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                Boolean(controls?.show_panel_icon?.value),
            },
          },
        ],
        [
          {
            name: 'panel_icon_url',
            config: {
              type: 'TextControl',
              label: t('Panel Icon Image URL'),
              description: t(
                'Optional image used as the icon on every small multiple panel.',
              ),
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                Boolean(controls?.show_panel_icon?.value),
            },
          },
          {
            name: 'panel_icon_text',
            config: {
              type: 'TextControl',
              label: t('Panel Icon Text'),
              description: t(
                'Fallback short text or symbol when no icon image URL is set.',
              ),
              default: '',
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                Boolean(controls?.show_panel_icon?.value),
            },
          },
        ],
        [
          {
            name: 'responsive_columns',
            config: {
              type: 'CheckboxControl',
              label: t('Responsive Columns'),
              description: t(
                'Auto-reduce columns on smaller screen widths based on minimum panel width.',
              ),
              default: true,
              renderTrigger: true,
            },
          },
          {
            name: 'min_panel_width',
            config: {
              type: 'SliderControl',
              label: t('Min Panel Width (px)'),
              description: t(
                'Minimum width for each panel before reducing column count.',
              ),
              default: 180,
              min: 100,
              max: 400,
              step: 10,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                Boolean(controls?.responsive_columns?.value),
            },
          },
        ],
      ],
    },
    {
      label: t('Chart Style'),
      tabOverride: 'customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'mini_chart_type',
            config: {
              type: 'SelectControl',
              label: t('Chart Type'),
              default: 'line',
              choices: [
                ['line', t('Line')],
                ['bar', t('Bar')],
                ['area', t('Area')],
                ['pie', t('Pie')],
                ['donut', t('Donut')],
                ['scatter', t('Scatter (needs 2+ metrics)')],
                ['heatmap', t('Heatmap (needs 2+ metrics)')],
                ['big_number', t('Big Number / KPI')],
                ['gauge', t('Gauge')],
                ['mini_map', t('Map (Choropleth)')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'line_width',
            config: {
              type: 'SliderControl',
              label: t('Line Width'),
              default: 1.5,
              min: 0.5,
              max: 4,
              step: 0.5,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                ['line', 'area'].includes(controls?.mini_chart_type?.value),
            },
          },
          {
            name: 'sync_y_axis',
            config: {
              type: 'CheckboxControl',
              label: t('Synchronize Y-Axes'),
              description: t(
                'Use the same Y-axis range across all panels for fair comparison.',
              ),
              default: true,
              renderTrigger: true,
              visibility: ({ controls }: any) => {
                const ct = controls?.mini_chart_type?.value;
                return ['line', 'bar', 'area', 'scatter', 'gauge'].includes(ct);
              },
            },
          },
        ],
      ],
    },
    {
      label: t('Color Schemes'),
      tabOverride: 'customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'color_scheme',
            config: {
              type: 'ColorSchemeControl',
              label: t('Color Scheme'),
              description: t(
                'Categorical and sequential palettes merged. ' +
                  'Selecting any scheme auto-applies to all chart types.',
              ),
              default: categoricalSchemeRegistry.getDefaultKey(),
              renderTrigger: true,
              choices: () => {
                const cat: [string, string][] = categoricalSchemeRegistry
                  .keys()
                  .map(key => [key, key]);
                const seq: [string, string][] = (
                  sequentialSchemeRegistry.values() as SequentialScheme[]
                ).map(s => [s.id, s.label || s.id]);
                return [...cat, ...seq];
              },
              schemes: () => {
                const merged: Record<string, any> = {};
                categoricalSchemeRegistry.keys().forEach(key => {
                  merged[key] = categoricalSchemeRegistry.get(key);
                });
                (
                  sequentialSchemeRegistry.values() as SequentialScheme[]
                ).forEach(s => {
                  merged[s.id] = s;
                });
                return merged;
              },
            },
          },
        ],
        [
          {
            name: 'legend_classes',
            config: {
              type: 'SliderControl',
              label: t('Color Classes'),
              description: t(
                'Number of color steps for mini-map panels. More classes show finer gradations.',
              ),
              default: 7,
              min: 2,
              max: 9,
              step: 1,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'legend_reverse_colors',
            config: {
              type: 'CheckboxControl',
              label: t('Reverse Colors'),
              description: t(
                'Invert the color ramp so low values get dark colors and high values get light colors.',
              ),
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
              label: t('No Data Color'),
              description: t('Color for areas with missing or null values.'),
              default: { r: 204, g: 204, b: 204, a: 1 },
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Tooltip & Legend'),
      tabOverride: 'customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'sync_tooltips',
            config: {
              type: 'CheckboxControl',
              label: t('Synchronize Tooltips'),
              description: t(
                'Hovering one panel highlights the same position in all other panels.',
              ),
              default: true,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                ['line', 'bar', 'area'].includes(
                  controls?.mini_chart_type?.value,
                ),
            },
          },
          {
            name: 'show_legend',
            config: {
              type: 'CheckboxControl',
              label: t('Show Shared Legend'),
              description: t(
                'Show a shared legend below the grid (once) for all panels.',
              ),
              default: true,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Sorting & Filtering'),
      tabOverride: 'customize',
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'sort_panels',
            config: {
              type: 'SelectControl',
              label: t('Sort Panels'),
              default: 'alphabetical',
              choices: [
                ['alphabetical', t('Alphabetical')],
                ['latest-value', t('Latest Value')],
                ['highest-first', t('Highest First')],
                ['lowest-first', t('Lowest First')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'top_n',
            config: {
              type: 'SliderControl',
              label: t('Top N Panels (0 = all)'),
              default: 0,
              min: 0,
              max: 50,
              step: 1,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Reference Line'),
      tabOverride: 'customize',
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'reference_line_mode',
            config: {
              type: 'SelectControl',
              label: t('Reference Line'),
              default: 'none',
              choices: [
                ['none', t('None')],
                ['global', t('Global Value')],
                ['per-panel-mean', t('Panel Mean')],
                ['per-panel-target', t('Panel Target Value')],
              ],
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                ['line', 'bar', 'area'].includes(
                  controls?.mini_chart_type?.value,
                ),
            },
          },
          {
            name: 'reference_value',
            config: {
              type: 'TextControl',
              isFloat: true,
              label: t('Reference Value'),
              default: '',
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                ['global', 'per-panel-target'].includes(
                  controls?.reference_line_mode?.value,
                ),
            },
          },
        ],
        [
          {
            name: 'reference_color',
            config: {
              type: 'TextControl',
              label: t('Reference Line Color'),
              default: '#E53935',
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                controls?.reference_line_mode?.value !== 'none',
            },
          },
        ],
      ],
    },
    {
      label: t('Display'),
      tabOverride: 'customize',
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'show_panel_title',
            config: {
              type: 'CheckboxControl',
              label: t('Show Panel Titles'),
              default: true,
              renderTrigger: true,
            },
          },
          {
            name: 'show_panel_subtitle',
            config: {
              type: 'CheckboxControl',
              label: t('Show Panel Subtitle'),
              description: t('Show subtitle with latest metric values'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'show_x_axis',
            config: {
              type: 'CheckboxControl',
              label: t('Show X-Axis Labels'),
              default: true,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                !['pie', 'donut', 'big_number', 'gauge', 'mini_map'].includes(
                  controls?.mini_chart_type?.value,
                ),
            },
          },
          {
            name: 'show_y_axis',
            config: {
              type: 'CheckboxControl',
              label: t('Show Y-Axis Labels'),
              default: false,
              renderTrigger: true,
              visibility: ({ controls }: any) =>
                !['pie', 'donut', 'big_number', 'gauge', 'mini_map'].includes(
                  controls?.mini_chart_type?.value,
                ),
            },
          },
        ],
        [
          {
            name: 'density_tier',
            config: {
              type: 'SelectControl',
              label: t('Density Tier'),
              default: 'compact',
              choices: [
                ['micro', t('Micro')],
                ['compact', t('Compact')],
                ['standard', t('Standard')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'panel_border_radius',
            config: {
              type: 'SliderControl',
              label: t('Panel Border Radius'),
              default: 8,
              min: 0,
              max: 16,
              step: 2,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'y_axis_format',
            config: {
              type: 'SelectControl',
              freeform: true,
              label: t('Value Format'),
              default: 'SMART_NUMBER',
              choices: D3_FORMAT_OPTIONS,
              renderTrigger: true,
            },
          },
          {
            name: 'null_value_text',
            config: {
              type: 'TextControl',
              label: t('Null Value Text'),
              description: t('Text to display for null or missing values'),
              default: '–',
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default config;
