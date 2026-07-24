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
 * A DHIS2-style period timeline for the map.
 *
 * The whole period range stays visible as an evenly-spaced bar with `|`
 * dividers between periods and a label under each. Exactly ONE period is
 * selected at a time — clicking a period selects it, and the play button steps
 * through the periods one at a time from the start. The selected period is
 * highlighted and named in a floating label above it.
 *
 * `value` is kept as an inclusive `[start, end]` window for compatibility with
 * the map's aggregation, but this control always reports a single period
 * (`[i, i]`), so the map shows exactly that period.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { styled, t } from '@superset-ui/core';

export interface PeriodDataZoomProps {
  /** Ordered period codes (e.g. ["202401", "202402", …]). */
  periods: string[];
  /** Current window; its start index is the selected period. */
  value: [number, number];
  /** Reports the selected period as an inclusive single-period `[i, i]`. */
  onChange: (range: [number, number]) => void;
  /** Format a period code into a human label. */
  formatLabel?: (code: string) => string;
  /** Milliseconds between steps while playing. */
  playIntervalMs?: number;
  height?: number;
}

const clamp = (index: number, max: number) =>
  Math.max(0, Math.min(max, index));

const Wrapper = styled.div`
  display: flex;
  align-items: stretch;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  width: 100%;
  padding: ${({ theme }) => theme.sizeUnit * 2}px
    ${({ theme }) => theme.sizeUnit * 3}px;
  background: ${({ theme }) => theme.colorBgContainer};
  border-top: 1px solid ${({ theme }) => theme.colorBorderSecondary};
`;

const PlayButton = styled.button`
  flex: 0 0 auto;
  align-self: center;
  width: ${({ theme }) => theme.sizeUnit * 8}px;
  height: ${({ theme }) => theme.sizeUnit * 8}px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colorBorder};
  background: ${({ theme }) => theme.colorBgElevated};
  color: ${({ theme }) => theme.colorText};
  cursor: pointer;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: ${({ theme }) => theme.colorPrimary};
    color: ${({ theme }) => theme.colorPrimary};
  }
`;

const Timeline = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  padding-top: ${({ theme }) => theme.sizeUnit * 5}px; /* room for the label */
`;

const FloatingLabel = styled.div`
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 1px ${({ theme }) => theme.sizeUnit * 2}px;
  border-radius: ${({ theme }) => theme.borderRadius}px;
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  font-weight: 600;
  color: ${({ theme }) => theme.colorText};
  pointer-events: none;
  z-index: 1;
`;

const Track = styled.div`
  display: flex;
  height: ${({ theme }) => theme.sizeUnit * 6}px;
  background: ${({ theme }) => theme.colorFillQuaternary};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  overflow: hidden;
`;

const Cell = styled.button<{ $selected: boolean }>`
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colorBorder};
  background: ${({ theme, $selected }) =>
    $selected ? theme.colorPrimary : 'transparent'};
  cursor: pointer;
  transition: background 0.1s ease;

  &:last-of-type {
    border-right: none;
  }

  &:hover {
    background: ${({ theme, $selected }) =>
      $selected ? theme.colorPrimary : `${theme.colorPrimary}22`};
  }
`;

const Labels = styled.div`
  display: flex;
  margin-top: ${({ theme }) => theme.sizeUnit}px;
`;

const LabelCell = styled.div<{ $selected: boolean }>`
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, $selected }) =>
    $selected ? theme.colorText : theme.colorTextSecondary};
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};
`;

export default function PeriodDataZoom({
  periods,
  value,
  onChange,
  formatLabel = code => code,
  playIntervalMs = 900,
  height,
}: PeriodDataZoomProps) {
  const lastIndex = Math.max(0, periods.length - 1);
  const selectedIdx = clamp(value[0], lastIndex);
  const [playing, setPlaying] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const labels = useMemo(
    () => periods.map(formatLabel),
    [periods, formatLabel],
  );

  // Thin the labels when there are too many to fit without overlapping.
  const labelStep = useMemo(
    () => Math.max(1, Math.ceil(periods.length / 16)),
    [periods.length],
  );

  const select = useCallback((index: number) => {
    onChangeRef.current([index, index]);
  }, []);

  // Play: advance the selected period one step each tick, looping at the end.
  useEffect(() => {
    if (!playing || periods.length < 2) return undefined;
    const id = setInterval(() => {
      const next = selectedIdx + 1 > lastIndex ? 0 : selectedIdx + 1;
      onChangeRef.current([next, next]);
    }, playIntervalMs);
    return () => clearInterval(id);
  }, [playing, selectedIdx, lastIndex, periods.length, playIntervalMs]);

  const togglePlay = useCallback(() => {
    if (!playing) {
      // Restart from the first period.
      onChangeRef.current([0, 0]);
    }
    setPlaying(p => !p);
  }, [playing]);

  if (periods.length < 2) return null;

  const labelLeftPct = ((selectedIdx + 0.5) / periods.length) * 100;

  return (
    <Wrapper className="dhis2-map-period-timeline" style={{ height }}>
      <PlayButton
        type="button"
        onClick={togglePlay}
        aria-label={playing ? t('Pause') : t('Play')}
        title={playing ? t('Pause') : t('Play')}
      >
        {playing ? '❚❚' : '▶'}
      </PlayButton>
      <Timeline>
        <FloatingLabel
          style={{ left: `${labelLeftPct}%` }}
          data-test="period-timeline-label"
        >
          {labels[selectedIdx]}
        </FloatingLabel>
        <Track>
          {periods.map((code, i) => (
            <Cell
              key={`${code}-${i}`}
              type="button"
              $selected={i === selectedIdx}
              onClick={() => select(i)}
              aria-label={labels[i]}
              title={labels[i]}
            />
          ))}
        </Track>
        <Labels>
          {periods.map((code, i) => (
            <LabelCell key={`${code}-label-${i}`} $selected={i === selectedIdx}>
              {i % labelStep === 0 || i === selectedIdx ? labels[i] : ''}
            </LabelCell>
          ))}
        </Labels>
      </Timeline>
    </Wrapper>
  );
}
