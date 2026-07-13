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
import { SupersetTheme } from '@superset-ui/core';
import {
  chartTitleHeight,
  LabelledColumn,
  pickerToCssColor,
  resolveChartTitle,
} from 'src/utils/chartAutoSubtitle';

// pickerToCssColor is re-exported for existing importers; the single
// implementation lives in src/utils/chartAutoSubtitle.
export { pickerToCssColor };

export interface ChartTitleOption {
  text: string;
  subtext: string;
  left: 'left' | 'center';
  top: number;
  textStyle: { fontSize: number; fontWeight: number; color?: string };
  subtextStyle: { fontSize: number; color: string };
}

export interface ChartTitleResult {
  /** ECharts `title` option to spread into echartOptions, or undefined when empty. */
  title?: ChartTitleOption;
  /**
   * Vertical space (px) the title occupies. Cartesian charts should add this to
   * their `grid.top` so the plot isn't drawn under the title.
   */
  topOffset: number;
}

/**
 * Build the shared on-chart title / subtitle ECharts option from the
 * (camelCased) form data. Title is the user's own wording; Subtitle is either
 * their wording or, when "Auto subtitle" is on, a generated description of the
 * chart's active filters. Independent colours, shared alignment. Returns no
 * title when both are blank so the chart stays clean.
 *
 * Used by every ECharts plugin's transformProps so the Title & Subtitle controls
 * behave identically across chart types.
 *
 * @param datasourceColumns Datasource columns, used to resolve a filter's
 *   column into its display label ("Region" rather than "region"). Optional:
 *   without it the auto subtitle falls back to raw column names.
 */
export function getChartTitleOption(
  formData: Record<string, any>,
  theme: SupersetTheme,
  datasourceColumns: LabelledColumn[] = [],
): ChartTitleResult {
  // resolveChartTitle is the single source of truth for title/subtitle/colours
  // (and reads both camelCase and snake_case formData); this just maps its
  // result into the ECharts `title` option.
  const { title, subtitle, titleColor, subtitleColor, align } =
    resolveChartTitle(formData, datasourceColumns);
  if (!title && !subtitle) {
    return { topOffset: 0 };
  }
  return {
    title: {
      text: title,
      subtext: subtitle,
      left: align,
      top: 0,
      textStyle: {
        fontSize: 16,
        fontWeight: 600,
        ...(titleColor && { color: titleColor }),
      },
      subtextStyle: {
        fontSize: 12,
        color: subtitleColor || theme.colorTextSecondary,
      },
    },
    topOffset: chartTitleHeight({ title, subtitle }),
  };
}
