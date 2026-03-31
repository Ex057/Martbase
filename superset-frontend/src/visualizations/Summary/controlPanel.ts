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
import { t } from '@superset-ui/core';
import { ControlPanelConfig } from '@superset-ui/chart-controls';

const columnChoices = (state: any) => ({
  choices: (state.datasource?.columns || []).map((column: any) => [
    column.column_name,
    column.verbose_name || column.column_name,
  ]),
});

function fieldSelectControl(name: string, label: string, description: string) {
  return {
    name,
    config: {
      type: 'SelectControl',
      freeForm: true,
      clearable: true,
      label: t(label),
      description: t(description),
      mapStateToProps: columnChoices,
      renderTrigger: true,
    },
  };
}

const controlPanel: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Data'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'display_mode',
            config: {
              type: 'SelectControl',
              label: t('Display Mode'),
              default: 'metrics_as_items',
              choices: [
                ['metrics_as_items', t('Metrics as items')],
                ['rows_as_items', t('Rows as items')],
              ],
              description: t(
                'Use one aggregated row with many metrics, or one rendered item per result row.',
              ),
            },
          },
          {
            name: 'query_mode',
            config: {
              type: 'SelectControl',
              label: t('Query Mode'),
              default: 'aggregate',
              choices: [
                ['aggregate', t('Aggregate')],
                ['raw', t('Raw records')],
              ],
              description: t(
                'Aggregate mode uses metrics and optional groupings. Raw mode renders directly from selected columns.',
              ),
            },
          },
        ],
        ['metrics'],
        ['groupby'],
        [
          fieldSelectControl(
            'label_field',
            'Label Field',
            'Primary label column or result field. In aggregate mode this can also be a metric label typed manually.',
          ),
          fieldSelectControl(
            'value_field',
            'Value Field',
            'Primary value field for row-based summaries.',
          ),
        ],
        [
          fieldSelectControl(
            'secondary_value_field',
            'Secondary Value Field',
            'Optional secondary value or comparison text.',
          ),
          fieldSelectControl(
            'percent_field',
            'Percent Field',
            'Optional percent or ratio field.',
          ),
        ],
        [
          fieldSelectControl(
            'change_field',
            'Change Field',
            'Optional absolute change value used for trend indicators.',
          ),
          fieldSelectControl(
            'direction_field',
            'Direction Field',
            'Optional explicit direction field such as up, down, positive, or negative.',
          ),
        ],
        [
          fieldSelectControl(
            'target_field',
            'Target Field',
            'Optional target field used by progress and bullet visuals.',
          ),
          fieldSelectControl(
            'sparkline_field',
            'Sparkline Field',
            'Optional field containing a JSON array or comma-separated numbers for sparkline rendering.',
          ),
        ],
        [
          fieldSelectControl(
            'note_field',
            'Note Field',
            'Optional note, subtitle, or target text field.',
          ),
          fieldSelectControl(
            'badge_field',
            'Badge Field',
            'Optional badge or tag text field.',
          ),
        ],
        [
          {
            name: 'summary_row_limit',
            config: {
              type: 'SliderControl',
              label: t('Summary Item Limit'),
              min: 1,
              max: 50,
              step: 1,
              default: 12,
              description: t('Maximum number of summary items to render.'),
            },
          },
          fieldSelectControl(
            'sort_by_field',
            'Sort By',
            'Sort by __label__, __value__, __change__, __percent__, or leave empty to keep query order.',
          ),
        ],
        [
          {
            name: 'sort_desc',
            config: {
              type: 'CheckboxControl',
              label: t('Sort Descending'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Layout'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'layout_mode',
            config: {
              type: 'SelectControl',
              label: t('Layout Mode'),
              default: 'vertical_list',
              choices: [
                ['vertical_list', t('Vertical List')],
                ['horizontal_row', t('Horizontal Row')],
                ['grid', t('Grid')],
                ['compact_matrix', t('Compact KPI Matrix')],
                ['split_summary', t('Split Summary')],
                ['micro_card', t('Micro Card Summary')],
                ['mixed_summary', t('Mixed Summary')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'density',
            config: {
              type: 'SelectControl',
              label: t('Density'),
              default: 'compact',
              choices: [
                ['micro', t('Micro')],
                ['compact', t('Compact')],
                ['standard', t('Standard')],
                ['comfortable', t('Comfortable')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'columns_count',
            config: {
              type: 'SliderControl',
              label: t('Columns Count'),
              min: 1,
              max: 4,
              step: 1,
              default: 3,
              renderTrigger: true,
            },
          },
          {
            name: 'auto_columns',
            config: {
              type: 'CheckboxControl',
              label: t('Auto Responsive Columns'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'label_position',
            config: {
              type: 'SelectControl',
              label: t('Label Position'),
              default: 'above',
              choices: [
                ['above', t('Above value')],
                ['below', t('Below value')],
                ['left', t('Left of value')],
                ['right', t('Right of value')],
                ['inline', t('Inline with value')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'value_position',
            config: {
              type: 'SelectControl',
              label: t('Value Position'),
              default: 'justified',
              choices: [
                ['right', t('Right of label')],
                ['left', t('Left of label')],
                ['below', t('Below label')],
                ['above', t('Above label')],
                ['inline', t('Inline')],
                ['stacked', t('Stacked')],
                ['justified', t('Justified opposite edge')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          fieldSelectControl(
            'label_position_field',
            'Label Position Override Field',
            'Optional per-item label position override.',
          ),
          fieldSelectControl(
            'value_position_field',
            'Value Position Override Field',
            'Optional per-item value position override.',
          ),
        ],
        [
          {
            name: 'card_mode',
            config: {
              type: 'CheckboxControl',
              label: t('Card Mode'),
              default: true,
              renderTrigger: true,
            },
          },
          {
            name: 'show_dividers',
            config: {
              type: 'CheckboxControl',
              label: t('Show Dividers'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'shaded_rows',
            config: {
              type: 'CheckboxControl',
              label: t('Shaded Rows'),
              default: false,
              renderTrigger: true,
            },
          },
          {
            name: 'spacing_scale',
            config: {
              type: 'SliderControl',
              label: t('Spacing Scale'),
              min: 0.7,
              max: 1.5,
              step: 0.1,
              default: 1,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Typography'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'label_font_size',
            config: {
              type: 'SliderControl',
              label: t('Label Font Size'),
              min: 10,
              max: 22,
              step: 1,
              default: 12,
              renderTrigger: true,
            },
          },
          {
            name: 'value_font_size',
            config: {
              type: 'SliderControl',
              label: t('Value Font Size'),
              min: 16,
              max: 48,
              step: 1,
              default: 28,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'secondary_font_size',
            config: {
              type: 'SliderControl',
              label: t('Secondary Font Size'),
              min: 10,
              max: 20,
              step: 1,
              default: 12,
              renderTrigger: true,
            },
          },
          {
            name: 'truncate_label',
            config: {
              type: 'CheckboxControl',
              label: t('Truncate Labels'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'wrap_label',
            config: {
              type: 'CheckboxControl',
              label: t('Wrap Labels'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Formatting'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'value_format',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Value Format'),
              default: 'SMART_NUMBER',
              choices: [
                ['SMART_NUMBER', t('Smart')],
                [',.0f', t('Integer')],
                [',.2f', t('Two decimals')],
                ['.1%', t('Percent')],
              ],
            },
          },
          {
            name: 'change_format',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Change Format'),
              default: 'SMART_NUMBER',
              choices: [
                ['SMART_NUMBER', t('Smart')],
                [',.0f', t('Integer')],
                [',.2f', t('Two decimals')],
                ['.1%', t('Percent')],
              ],
            },
          },
        ],
        [
          {
            name: 'prefix',
            config: {
              type: 'TextControl',
              label: t('Value Prefix'),
              default: '',
              renderTrigger: true,
            },
          },
          {
            name: 'suffix',
            config: {
              type: 'TextControl',
              label: t('Value Suffix'),
              default: '',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'null_text',
            config: {
              type: 'TextControl',
              label: t('Null Text'),
              default: t('N/A'),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Trend & Indicators'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'delta_display',
            config: {
              type: 'SelectControl',
              label: t('Delta Display'),
              default: 'value',
              choices: [
                ['none', t('None')],
                ['value', t('Arrow + value')],
                ['percent', t('Arrow + percent')],
                ['value_and_percent', t('Arrow + value + percent')],
                ['direction_only', t('Direction only')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'higher_is_better',
            config: {
              type: 'CheckboxControl',
              label: t('Higher Is Better'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'threshold_mode',
            config: {
              type: 'SelectControl',
              label: t('Threshold Mode'),
              default: 'none',
              choices: [
                ['none', t('None')],
                ['simple', t('Low / High thresholds')],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'threshold_low',
            config: {
              type: 'TextControl',
              label: t('Low Threshold'),
              default: '',
              isFloat: true,
              renderTrigger: true,
            },
          },
          {
            name: 'threshold_high',
            config: {
              type: 'TextControl',
              label: t('High Threshold'),
              default: '',
              isFloat: true,
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Micro Visuals'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'micro_visual_type',
            config: {
              type: 'SelectControl',
              label: t('Micro Visual'),
              default: 'none',
              choices: [
                ['none', t('None')],
                ['sparkline', t('Sparkline')],
                ['mini_bar', t('Mini bar')],
                ['progress', t('Progress')],
                ['bullet', t('Bullet / progress')],
              ],
              renderTrigger: true,
            },
          },
          {
            name: 'micro_visual_position',
            config: {
              type: 'SelectControl',
              label: t('Micro Visual Position'),
              default: 'right',
              choices: [
                ['left', t('Left')],
                ['right', t('Right')],
                ['bottom', t('Bottom')],
              ],
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Styling'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'border_radius',
            config: {
              type: 'SliderControl',
              label: t('Corner Radius'),
              min: 0,
              max: 24,
              step: 1,
              default: 14,
              renderTrigger: true,
            },
          },
          {
            name: 'border_width',
            config: {
              type: 'SliderControl',
              label: t('Border Width'),
              min: 0,
              max: 4,
              step: 1,
              default: 1,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'shadow_size',
            config: {
              type: 'SelectControl',
              label: t('Shadow'),
              default: 'small',
              choices: [
                ['none', t('None')],
                ['small', t('Small')],
                ['medium', t('Medium')],
              ],
              renderTrigger: true,
            },
          },
          fieldSelectControl(
            'item_color_field',
            'Item Color Override Field',
            'Optional per-item RGBA object override field.',
          ),
        ],
        [
          {
            name: 'background_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Background Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'item_background_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Item Background Color'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'border_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Border Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'divider_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Divider Color'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'label_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Label Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'value_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Value Color'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'secondary_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Secondary Text Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'micro_visual_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Micro Visual Color'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'positive_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Positive Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'negative_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Negative Color'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'warning_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Warning Color'),
              renderTrigger: true,
            },
          },
          {
            name: 'critical_color',
            config: {
              type: 'ColorPickerControl',
              label: t('Critical Color'),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Header'),
      expanded: false,
      controlSetRows: [
        [
          {
            name: 'show_group_header',
            config: {
              type: 'CheckboxControl',
              label: t('Show Group Header'),
              default: false,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'group_header_text',
            config: {
              type: 'TextControl',
              label: t('Header Text'),
              default: '',
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default controlPanel;
