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
import { rgbToHex, SupersetTheme } from '@superset-ui/core';
import {
  buildFilterSubtitle,
  isAutoSubtitleEnabled,
  LabelledColumn,
} from 'src/utils/chartAutoSubtitle';

/** RGBA colour object as stored by ColorPickerControl. */
type ColorObj = { r: number; g: number; b: number; a?: number };

/**
 * Convert a ColorPickerControl value ({ r, g, b, a }) to a CSS colour string,
 * or undefined when unset so the chart theme colour is used instead.
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
  return typeof a === 'number' && a < 1
    ? `rgba(${r}, ${g}, ${b}, ${a})`
    : rgbToHex(r, g, b);
}

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
  const text =
    (formData?.chartTitle && String(formData.chartTitle).trim()) || '';
  const subtext = isAutoSubtitleEnabled(formData)
    ? buildFilterSubtitle(formData, datasourceColumns)
    : (formData?.chartSubtitle && String(formData.chartSubtitle).trim()) || '';
  if (!text && !subtext) {
    return { topOffset: 0 };
  }
  const titleColor = pickerToCssColor(formData?.chartTitleColor);
  const subtitleColor = pickerToCssColor(formData?.chartSubtitleColor);
  return {
    title: {
      text,
      subtext,
      left: formData?.chartTitleAlign === 'left' ? 'left' : 'center',
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
    topOffset: subtext ? 48 : 30,
  };
}
