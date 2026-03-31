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
import { styled, t, useTheme } from '@superset-ui/core';
import {
  Badge,
  EmptyState,
  LabelLine,
  MetaRow,
  MicroVisualShell,
  SummaryBody,
  SummaryHeader,
  SummaryItemCard,
  SummaryItemTop,
  SummaryRoot,
  ValueLine,
} from './styles';
import {
  SummaryChartProps,
  SummaryColorState,
  SummaryDeltaDisplay,
  SummaryItem,
  SummaryMicroVisualType,
} from './types';

const IconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: ${({ theme }) => theme.colorFillSecondary || '#e5e7eb'};
`;

const ProgressFill = styled.div<{ $width: number; $color: string }>`
  width: ${({ $width }) => `${$width}%`};
  height: 100%;
  background: ${({ $color }) => $color};
  border-radius: inherit;
`;

function stateColor(
  colorState: SummaryColorState,
  props: SummaryChartProps,
  theme: ReturnType<typeof useTheme>,
) {
  if (colorState === 'positive') {
    return props.positiveColor || theme.colorSuccess;
  }
  if (colorState === 'negative') {
    return props.negativeColor || theme.colorError;
  }
  if (colorState === 'warning') {
    return props.warningColor || theme.colorWarning;
  }
  if (colorState === 'critical') {
    return props.criticalColor || theme.colorErrorText;
  }
  if (colorState === 'info') {
    return props.infoColor || theme.colorPrimary;
  }
  return props.neutralColor || theme.colorTextSecondary || '#6b7280';
}

function directionGlyph(direction: SummaryItem['trendDirection']) {
  if (direction === 'up') {
    return '▲';
  }
  if (direction === 'down') {
    return '▼';
  }
  return '•';
}

function renderSparkline(
  values: number[] | undefined,
  color: string,
): React.ReactNode {
  if (!values || values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 24 - ((value - min) / range) * 20;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 24"
      width="100%"
      height="24"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function renderMicroVisual(
  item: SummaryItem,
  type: SummaryMicroVisualType,
  color: string,
) {
  if (type === 'none') {
    return null;
  }

  if (type === 'sparkline') {
    return renderSparkline(item.sparklineValues, color);
  }

  if (type === 'mini_bar') {
    return (
      <ProgressTrack aria-hidden>
        <ProgressFill
          $width={Math.max(4, item.progressPercent || 0)}
          $color={color}
        />
      </ProgressTrack>
    );
  }

  if (type === 'progress' || type === 'bullet') {
    return (
      <ProgressTrack
        role="img"
        aria-label={t(
          'Progress %s percent',
          Math.round(item.progressPercent || 0),
        )}
      >
        <ProgressFill $width={item.progressPercent || 0} $color={color} />
      </ProgressTrack>
    );
  }

  return null;
}

function renderDelta(
  item: SummaryItem,
  deltaDisplay: SummaryDeltaDisplay,
  color: string,
) {
  if (deltaDisplay === 'none') {
    return null;
  }

  const hasChange = Boolean(item.formattedChange);
  const hasPercent = Boolean(item.formattedPercent);
  const direction = directionGlyph(item.trendDirection);

  if (deltaDisplay === 'direction_only') {
    return (
      <Badge $background={`${color}1A`} $color={color}>
        {direction} {item.trendDirection}
      </Badge>
    );
  }

  if (deltaDisplay === 'percent' && hasPercent) {
    return (
      <Badge $background={`${color}1A`} $color={color}>
        {direction} {item.formattedPercent}
      </Badge>
    );
  }

  if (deltaDisplay === 'value' && hasChange) {
    return (
      <Badge $background={`${color}1A`} $color={color}>
        {direction} {item.formattedChange}
      </Badge>
    );
  }

  if (deltaDisplay === 'value_and_percent' && (hasChange || hasPercent)) {
    return (
      <Badge $background={`${color}1A`} $color={color}>
        {direction}{' '}
        {[item.formattedChange, item.formattedPercent]
          .filter(Boolean)
          .join(' · ')}
      </Badge>
    );
  }

  return null;
}

export default function SummaryViz(props: SummaryChartProps) {
  const theme = useTheme();

  if (props.items.length === 0) {
    return (
      <SummaryRoot
        $backgroundColor={props.backgroundColor}
        $borderColor={props.borderColor}
        $borderRadius={props.borderRadius}
        $borderWidth={props.borderWidth}
        $shadowSize={props.shadowSize}
      >
        <EmptyState>{t('No summary items to display')}</EmptyState>
      </SummaryRoot>
    );
  }

  return (
    <SummaryRoot
      $backgroundColor={props.backgroundColor}
      $borderColor={props.borderColor}
      $borderRadius={props.borderRadius}
      $borderWidth={props.borderWidth}
      $shadowSize={props.shadowSize}
    >
      {props.showGroupHeader && props.groupHeaderText ? (
        <SummaryHeader $padding={props.density === 'micro' ? 8 : 12}>
          {props.groupHeaderText}
        </SummaryHeader>
      ) : null}
      <SummaryBody
        $layoutMode={props.layoutMode}
        $density={props.density}
        $columnsCount={props.columnsCount}
        $autoColumns={props.autoColumns}
        $spacingScale={props.spacingScale}
      >
        {props.items.map((item, index) => {
          const semanticColor = stateColor(item.colorState, props, theme);
          const deltaColor = props.deltaColor || semanticColor;
          const microVisual = renderMicroVisual(
            item,
            props.microVisualType,
            props.microVisualColor || semanticColor,
          );
          const mixed = props.layoutMode === 'mixed_summary';

          return (
            <SummaryItemCard
              key={item.id}
              $density={props.density}
              $cardMode={props.cardMode || props.layoutMode === 'micro_card'}
              $showDivider={
                props.showDividers && index !== props.items.length - 1
              }
              $itemBackgroundColor={props.itemBackgroundColor}
              $dividerColor={props.dividerColor}
              $borderColor={props.borderColor}
              $borderRadius={props.borderRadius}
              $shaded={props.shadedRows && index % 2 === 0}
              $layoutMode={props.layoutMode}
              $itemColor={item.itemColor}
            >
              <SummaryItemTop
                $labelPosition={item.labelPosition || props.labelPosition}
                $valuePosition={item.valuePosition || props.valuePosition}
                $mixed={mixed}
              >
                <div className="summary-text-stack">
                  <div className="summary-value-stack">
                    <LabelLine
                      $fontSize={props.labelFontSize}
                      $fontWeight={props.labelFontWeight}
                      $color={props.labelColor}
                      $truncateLabel={props.truncateLabel}
                      $wrapLabel={props.wrapLabel}
                    >
                      {item.icon ? (
                        <IconWrap aria-hidden>{item.icon}</IconWrap>
                      ) : null}
                      {item.label}
                    </LabelLine>
                    <ValueLine
                      $fontSize={props.valueFontSize}
                      $fontWeight={props.valueFontWeight}
                      $color={props.valueColor || item.itemColor}
                    >
                      {item.formattedValue}
                    </ValueLine>
                  </div>
                  <MetaRow
                    $fontSize={props.secondaryFontSize}
                    $fontWeight={props.secondaryFontWeight}
                    $color={props.secondaryColor}
                  >
                    {item.badge ? (
                      <Badge
                        $background={`${semanticColor}14`}
                        $color={semanticColor}
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                    {item.formattedSecondary ? (
                      <span>{item.formattedSecondary}</span>
                    ) : null}
                    {item.formattedTargetValue ? (
                      <span>
                        {item.targetLabel || t('Target')}:{' '}
                        {item.formattedTargetValue}
                      </span>
                    ) : null}
                    {item.note ? <span>{item.note}</span> : null}
                    {renderDelta(item, props.deltaDisplay, deltaColor)}
                  </MetaRow>
                </div>
                {microVisual && props.microVisualPosition !== 'bottom' ? (
                  <MicroVisualShell $density={props.density}>
                    {microVisual}
                  </MicroVisualShell>
                ) : null}
              </SummaryItemTop>
              {microVisual && props.microVisualPosition === 'bottom' ? (
                <MicroVisualShell $density={props.density}>
                  {microVisual}
                </MicroVisualShell>
              ) : null}
            </SummaryItemCard>
          );
        })}
      </SummaryBody>
    </SummaryRoot>
  );
}
