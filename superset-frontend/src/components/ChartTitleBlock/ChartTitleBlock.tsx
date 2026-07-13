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

/**
 * ChartTitleBlock — the on-chart title + subtitle, for CUSTOM (non-ECharts)
 * chart types.
 *
 * ECharts plugins render their title via `getChartTitleOption` (an ECharts
 * `title` option). Custom React charts have no such mechanism, so this renders
 * the same title/subtitle as a DOM header that sits above the chart body. Both
 * paths resolve their text through `resolveChartTitle`, so a manual subtitle,
 * an auto subtitle, and the colours/alignment behave identically everywhere.
 *
 * The block is a fixed height (see `chartTitleHeight`) so a chart can subtract
 * it from the height it hands its plot area — call `resolveChartTitle` in
 * transformProps, pass the result here, and size the body to
 * `height - chartTitleHeight(resolved)`.
 */
import { styled } from '@superset-ui/core';
import { ResolvedChartTitle } from 'src/utils/chartAutoSubtitle';

export type ChartTitleBlockProps = ResolvedChartTitle;

const Block = styled.div<{ $align: 'left' | 'center' }>`
  ${({ theme, $align }) => `
    display: flex;
    flex-direction: column;
    align-items: ${$align === 'left' ? 'flex-start' : 'center'};
    text-align: ${$align};
    gap: ${theme.sizeUnit / 2}px;
    padding: ${theme.sizeUnit}px ${theme.sizeUnit * 2}px 0;
    width: 100%;
    overflow: hidden;
  `}
`;

const TitleText = styled.div<{ $color?: string }>`
  ${({ theme, $color }) => `
    font-size: ${theme.fontSizeLG}px;
    font-weight: ${theme.fontWeightStrong};
    line-height: 1.2;
    color: ${$color || theme.colorText};
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  `}
`;

const SubtitleText = styled.div<{ $color?: string }>`
  ${({ theme, $color }) => `
    font-size: ${theme.fontSize}px;
    line-height: 1.2;
    color: ${$color || theme.colorTextSecondary};
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  `}
`;

/**
 * Renders the title block, or nothing when both title and subtitle are empty
 * (so a chart with no title is unaffected).
 */
export default function ChartTitleBlock({
  title,
  subtitle,
  titleColor,
  subtitleColor,
  align,
}: ChartTitleBlockProps) {
  if (!title && !subtitle) {
    return null;
  }
  return (
    <Block $align={align} className="chart-title-block">
      {title && <TitleText $color={titleColor}>{title}</TitleText>}
      {subtitle && (
        <SubtitleText $color={subtitleColor}>{subtitle}</SubtitleText>
      )}
    </Block>
  );
}
