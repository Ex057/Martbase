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
import { css, styled } from '@superset-ui/core';
import {
  SummaryDensity,
  SummaryLabelPosition,
  SummaryLayoutMode,
  SummaryValuePosition,
} from './types';

type DensityConfig = {
  gap: number;
  itemPadding: number;
  rowGap: number;
  minColumnWidth: number;
  microHeight: number;
};

const densityConfig: Record<SummaryDensity, DensityConfig> = {
  micro: {
    gap: 6,
    itemPadding: 8,
    rowGap: 4,
    minColumnWidth: 120,
    microHeight: 22,
  },
  compact: {
    gap: 10,
    itemPadding: 12,
    rowGap: 6,
    minColumnWidth: 160,
    microHeight: 26,
  },
  standard: {
    gap: 14,
    itemPadding: 16,
    rowGap: 8,
    minColumnWidth: 180,
    microHeight: 30,
  },
  comfortable: {
    gap: 18,
    itemPadding: 20,
    rowGap: 10,
    minColumnWidth: 220,
    microHeight: 34,
  },
};

const valuePositionCss = (position: SummaryValuePosition) => {
  switch (position) {
    case 'above':
      return css`
        flex-direction: column-reverse;
        align-items: flex-start;
      `;
    case 'below':
    case 'stacked':
      return css`
        flex-direction: column;
        align-items: flex-start;
      `;
    case 'left':
      return css`
        flex-direction: row-reverse;
        align-items: baseline;
      `;
    case 'right':
    case 'inline':
      return css`
        flex-direction: row;
        align-items: baseline;
      `;
    case 'justified':
      return css`
        flex-direction: row;
        align-items: baseline;
        justify-content: space-between;
      `;
    default:
      return '';
  }
};

const labelPositionCss = (position: SummaryLabelPosition) => {
  switch (position) {
    case 'below':
      return css`
        flex-direction: column-reverse;
      `;
    case 'left':
      return css`
        flex-direction: row;
        align-items: baseline;
      `;
    case 'right':
      return css`
        flex-direction: row-reverse;
        align-items: baseline;
      `;
    case 'inline':
      return css`
        flex-direction: row;
        align-items: baseline;
        gap: 8px;
      `;
    case 'above':
    default:
      return css`
        flex-direction: column;
      `;
  }
};

export const SummaryRoot = styled.div<{
  $backgroundColor?: string | null;
  $borderColor?: string | null;
  $borderRadius: number;
  $borderWidth: number;
  $shadowSize: 'none' | 'small' | 'medium';
}>`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${({ $backgroundColor, theme }) =>
    $backgroundColor || theme.colorBgContainer || '#ffffff'};
  border: ${({ $borderWidth, $borderColor, theme }) =>
    `${$borderWidth}px solid ${
      $borderColor || theme.colorBorder || '#d9d9d9'
    }`};
  border-radius: ${({ $borderRadius }) => `${$borderRadius}px`};
  box-shadow: ${({ $shadowSize, theme }) => {
    if ($shadowSize === 'medium') {
      return theme.boxShadowSecondary || '0 10px 30px rgba(15, 23, 42, 0.12)';
    }
    if ($shadowSize === 'small') {
      return theme.boxShadowTertiary || '0 4px 12px rgba(15, 23, 42, 0.08)';
    }
    return 'none';
  }};
`;

export const SummaryHeader = styled.div<{ $padding: number }>`
  padding: ${({ $padding }) => `${$padding}px ${$padding}px 0 ${$padding}px`};
  font-weight: 600;
  color: ${({ theme }) => theme.colorText || '#1f1f1f'};
  line-height: 1.25;
`;

export const SummaryBody = styled.div<{
  $layoutMode: SummaryLayoutMode;
  $density: SummaryDensity;
  $columnsCount: number;
  $autoColumns: boolean;
  $spacingScale: number;
}>`
  flex: 1;
  min-height: 0;
  display: ${({ $layoutMode }) =>
    $layoutMode === 'grid' ||
    $layoutMode === 'compact_matrix' ||
    $layoutMode === 'micro_card'
      ? 'grid'
      : 'flex'};
  ${({ $layoutMode }) =>
    $layoutMode === 'horizontal_row'
      ? css`
          flex-direction: row;
          flex-wrap: wrap;
        `
      : $layoutMode === 'vertical_list' || $layoutMode === 'split_summary'
        ? css`
            flex-direction: column;
          `
        : $layoutMode === 'mixed_summary'
          ? css`
              flex-direction: column;
            `
          : ''}
  gap: ${({ $density, $spacingScale }) =>
    `${densityConfig[$density].gap * $spacingScale}px`};
  padding: ${({ $density, $spacingScale }) =>
    `${densityConfig[$density].itemPadding * $spacingScale}px`};
  overflow: auto;
  ${({ $layoutMode, $density, $columnsCount, $autoColumns }) =>
    ($layoutMode === 'grid' ||
      $layoutMode === 'compact_matrix' ||
      $layoutMode === 'micro_card') &&
    css`
      grid-template-columns: repeat(
        ${$autoColumns ? 'auto-fit' : $columnsCount},
        minmax(${densityConfig[$density].minColumnWidth}px, 1fr)
      );
      align-content: start;
    `}
`;

export const SummaryItemCard = styled.div<{
  $density: SummaryDensity;
  $cardMode: boolean;
  $showDivider: boolean;
  $itemBackgroundColor?: string | null;
  $dividerColor?: string | null;
  $borderColor?: string | null;
  $borderRadius: number;
  $shaded: boolean;
  $layoutMode: SummaryLayoutMode;
  $itemColor?: string | null;
}>`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ $density }) => `${densityConfig[$density].rowGap}px`};
  padding: ${({ $density, $cardMode }) =>
    $cardMode ? `${densityConfig[$density].itemPadding}px` : '0'};
  border-radius: ${({ $borderRadius }) => `${$borderRadius}px`};
  background: ${({ $cardMode, $itemBackgroundColor, $shaded, theme }) => {
    if ($itemBackgroundColor) return $itemBackgroundColor;
    if ($cardMode || $shaded) {
      return theme.colorFillAlter || '#fafafa';
    }
    return 'transparent';
  }};
  border-bottom: ${({ $showDivider, $layoutMode, $dividerColor, theme }) =>
    $showDivider &&
    !['grid', 'compact_matrix', 'micro_card'].includes($layoutMode)
      ? `1px solid ${
          $dividerColor ||
          theme.colorBorderSecondary ||
          theme.colorBorder ||
          '#e5e7eb'
        }`
      : 'none'};
  border: ${({ $cardMode, $borderColor, theme }) =>
    $cardMode
      ? `1px solid ${$borderColor || theme.colorBorder || '#e5e7eb'}`
      : 'none'};
  color: ${({ $itemColor }) => $itemColor || 'inherit'};
`;

export const SummaryItemTop = styled.div<{
  $labelPosition: SummaryLabelPosition;
  $valuePosition: SummaryValuePosition;
  $mixed: boolean;
}>`
  display: flex;
  min-width: 0;
  gap: 8px;
  ${({ $mixed }) =>
    $mixed
      ? css`
          align-items: stretch;
          justify-content: space-between;
        `
      : css`
          align-items: flex-start;
        `}

  .summary-text-stack {
    display: flex;
    min-width: 0;
    flex: 1;
    ${({ $labelPosition }) => labelPositionCss($labelPosition)}
  }

  .summary-value-stack {
    display: flex;
    min-width: 0;
    gap: 8px;
    ${({ $valuePosition }) => valuePositionCss($valuePosition)}
  }
`;

export const LabelLine = styled.div<{
  $fontSize: number;
  $fontWeight: string;
  $color?: string | null;
  $truncateLabel: boolean;
  $wrapLabel: boolean;
}>`
  min-width: 0;
  font-size: ${({ $fontSize }) => `${$fontSize}px`};
  font-weight: ${({ $fontWeight }) => $fontWeight};
  color: ${({ $color, theme }) =>
    $color || theme.colorTextSecondary || '#6b7280'};
  line-height: 1.25;
  ${({ $truncateLabel, $wrapLabel }) =>
    $truncateLabel && !$wrapLabel
      ? css`
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `
      : css`
          white-space: normal;
          word-break: break-word;
        `}
`;

export const ValueLine = styled.div<{
  $fontSize: number;
  $fontWeight: string;
  $color?: string | null;
}>`
  min-width: 0;
  font-size: ${({ $fontSize }) => `${$fontSize}px`};
  font-weight: ${({ $fontWeight }) => $fontWeight};
  color: ${({ $color, theme }) => $color || theme.colorText || '#111827'};
  line-height: 1.1;
  letter-spacing: -0.02em;
`;

export const MetaRow = styled.div<{
  $fontSize: number;
  $fontWeight: string;
  $color?: string | null;
}>`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  font-size: ${({ $fontSize }) => `${$fontSize}px`};
  font-weight: ${({ $fontWeight }) => $fontWeight};
  color: ${({ $color, theme }) =>
    $color || theme.colorTextSecondary || '#6b7280'};
  line-height: 1.2;
`;

export const Badge = styled.span<{ $background: string; $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ $background }) => $background};
  color: ${({ $color }) => $color};
  font-size: 11px;
  font-weight: 600;
  line-height: 1.15;
`;

export const MicroVisualShell = styled.div<{
  $density: SummaryDensity;
}>`
  min-width: ${({ $density }) =>
    `${densityConfig[$density].minColumnWidth / 2}px`};
  width: 100%;
  max-width: 140px;
  height: ${({ $density }) => `${densityConfig[$density].microHeight}px`};
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;

export const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  color: ${({ theme }) => theme.colorTextSecondary || '#6b7280'};
`;
