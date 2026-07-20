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
import { ControlPanelSectionConfig } from '@superset-ui/chart-controls';

/**
 * Shared "Title & Subtitle" control section for CUSTOM chart types.
 *
 * Mirrors the ECharts plugin's `chartTitleSection` (control names are identical,
 * so a chart keeps its title if it ever moves between the two) and drives the
 * same `resolveChartTitle`. Spread it into a custom chart's
 * `controlPanelSections` to get Title, an Auto-subtitle checkbox, a manual
 * Subtitle, colours and alignment — adjust it here once and every chart follows.
 */
export const chartAutoSubtitleSection: ControlPanelSectionConfig = {
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
          description: t(
            'Title shown on the chart, above the plot area — your own wording.',
          ),
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
            'Prepend metric names to the auto subtitle (e.g. "Malaria Cases - Last 12 months").',
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
          description: t('Text color for the chart title.'),
        },
      },
      {
        name: 'chart_subtitle_color',
        config: {
          type: 'ColorPickerControl',
          label: t('Subtitle color'),
          renderTrigger: true,
          description: t('Text color for the chart subtitle.'),
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
};

export default chartAutoSubtitleSection;
