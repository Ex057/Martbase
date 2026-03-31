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
  ContextMenuFilters,
  QueryFormData,
  QueryFormMetric,
} from '@superset-ui/core';

export type SummaryDisplayMode = 'metrics_as_items' | 'rows_as_items';
export type SummaryQueryMode = 'aggregate' | 'raw';
export type SummaryLayoutMode =
  | 'vertical_list'
  | 'horizontal_row'
  | 'grid'
  | 'compact_matrix'
  | 'split_summary'
  | 'micro_card'
  | 'mixed_summary';
export type SummaryDensity = 'micro' | 'compact' | 'standard' | 'comfortable';
export type SummaryValuePosition =
  | 'right'
  | 'left'
  | 'below'
  | 'above'
  | 'inline'
  | 'stacked'
  | 'justified';
export type SummaryLabelPosition =
  | 'above'
  | 'below'
  | 'left'
  | 'right'
  | 'inline';
export type SummaryMicroVisualType =
  | 'none'
  | 'sparkline'
  | 'mini_bar'
  | 'progress'
  | 'bullet';
export type SummaryDeltaDisplay =
  | 'none'
  | 'value'
  | 'percent'
  | 'value_and_percent'
  | 'direction_only';
export type SummaryTrendDirection = 'up' | 'down' | 'neutral';
export type SummaryColorState =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'warning'
  | 'critical'
  | 'info';

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SummaryItem {
  id: string;
  label: string;
  formattedValue: string;
  rawValue: number | null;
  formattedSecondary?: string;
  rawSecondaryValue?: number | null;
  formattedPercent?: string;
  percentValue?: number | null;
  formattedChange?: string;
  changeValue?: number | null;
  trendDirection: SummaryTrendDirection;
  note?: string;
  subtitle?: string;
  targetLabel?: string;
  rawTargetValue?: number | null;
  formattedTargetValue?: string;
  icon?: string;
  badge?: string;
  itemColor?: string | null;
  colorState: SummaryColorState;
  valuePosition?: SummaryValuePosition;
  labelPosition?: SummaryLabelPosition;
  sparklineValues?: number[];
  progressPercent?: number | null;
}

export type SummaryFormData = QueryFormData & {
  metrics?: QueryFormMetric[];
  groupby?: string[];
  display_mode?: SummaryDisplayMode;
  query_mode?: SummaryQueryMode;
  summary_row_limit?: number;
  label_field?: string;
  value_field?: string;
  secondary_value_field?: string;
  percent_field?: string;
  change_field?: string;
  direction_field?: string;
  note_field?: string;
  target_field?: string;
  icon_field?: string;
  badge_field?: string;
  item_color_field?: string;
  value_position_field?: string;
  label_position_field?: string;
  sparkline_field?: string;
  sort_by_field?: string;
  sort_desc?: boolean;
  layout_mode?: SummaryLayoutMode;
  columns_count?: number;
  item_alignment?: 'start' | 'center' | 'end' | 'stretch';
  label_position?: SummaryLabelPosition;
  value_position?: SummaryValuePosition;
  density?: SummaryDensity;
  show_dividers?: boolean;
  card_mode?: boolean;
  shaded_rows?: boolean;
  auto_columns?: boolean;
  label_font_size?: number;
  value_font_size?: number;
  secondary_font_size?: number;
  label_font_weight?: string;
  value_font_weight?: string;
  secondary_font_weight?: string;
  truncate_label?: boolean;
  wrap_label?: boolean;
  value_format?: string;
  secondary_format?: string;
  percent_format?: string;
  change_format?: string;
  prefix?: string;
  suffix?: string;
  secondary_prefix?: string;
  secondary_suffix?: string;
  null_text?: string;
  micro_visual_type?: SummaryMicroVisualType;
  micro_visual_position?: 'left' | 'right' | 'bottom';
  delta_display?: SummaryDeltaDisplay;
  higher_is_better?: boolean;
  threshold_mode?: 'none' | 'simple';
  threshold_low?: number | null;
  threshold_high?: number | null;
  positive_color?: RgbaColor | null;
  negative_color?: RgbaColor | null;
  neutral_color?: RgbaColor | null;
  warning_color?: RgbaColor | null;
  critical_color?: RgbaColor | null;
  info_color?: RgbaColor | null;
  value_color?: RgbaColor | null;
  label_color?: RgbaColor | null;
  secondary_color?: RgbaColor | null;
  delta_color?: RgbaColor | null;
  background_color?: RgbaColor | null;
  item_background_color?: RgbaColor | null;
  border_color?: RgbaColor | null;
  divider_color?: RgbaColor | null;
  micro_visual_color?: RgbaColor | null;
  border_radius?: number;
  border_width?: number;
  shadow_size?: 'none' | 'small' | 'medium';
  spacing_scale?: number;
  show_group_header?: boolean;
  group_header_text?: string;
};

export interface SummaryChartProps {
  width: number;
  height: number;
  items: SummaryItem[];
  displayMode: SummaryDisplayMode;
  layoutMode: SummaryLayoutMode;
  density: SummaryDensity;
  columnsCount: number;
  autoColumns: boolean;
  itemAlignment: 'start' | 'center' | 'end' | 'stretch';
  labelPosition: SummaryLabelPosition;
  valuePosition: SummaryValuePosition;
  showDividers: boolean;
  cardMode: boolean;
  shadedRows: boolean;
  labelFontSize: number;
  valueFontSize: number;
  secondaryFontSize: number;
  labelFontWeight: string;
  valueFontWeight: string;
  secondaryFontWeight: string;
  truncateLabel: boolean;
  wrapLabel: boolean;
  microVisualType: SummaryMicroVisualType;
  microVisualPosition: 'left' | 'right' | 'bottom';
  deltaDisplay: SummaryDeltaDisplay;
  higherIsBetter: boolean;
  positiveColor?: string | null;
  negativeColor?: string | null;
  neutralColor?: string | null;
  warningColor?: string | null;
  criticalColor?: string | null;
  infoColor?: string | null;
  valueColor?: string | null;
  labelColor?: string | null;
  secondaryColor?: string | null;
  deltaColor?: string | null;
  backgroundColor?: string | null;
  itemBackgroundColor?: string | null;
  borderColor?: string | null;
  dividerColor?: string | null;
  microVisualColor?: string | null;
  borderRadius: number;
  borderWidth: number;
  shadowSize: 'none' | 'small' | 'medium';
  spacingScale: number;
  showGroupHeader: boolean;
  groupHeaderText?: string;
  onContextMenu?: (
    clientX: number,
    clientY: number,
    filters?: ContextMenuFilters,
  ) => void;
}
