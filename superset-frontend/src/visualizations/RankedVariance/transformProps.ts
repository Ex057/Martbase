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
/* eslint-disable theme-colors/no-literal-colors */
import { getMetricLabel, getNumberFormatter } from '@superset-ui/core';
import { resolveChartTitle } from 'src/utils/chartAutoSubtitle';
import { RankedVarianceFormData, RankedVarianceChartProps, SortOrder } from './types';

interface VarianceBand {
  threshold: number;
  color: string;
}

function parseVarianceBands(raw: string): VarianceBand[] {
  if (!raw?.trim()) return [{ threshold: 100, color: '#6B7280' }];
  return raw
    .split(';')
    .map(pair => {
      const [v, c] = pair.split(':');
      const threshold = parseFloat(v);
      if (Number.isNaN(threshold) || !c) return null;
      return { threshold, color: c.trim() };
    })
    .filter(Boolean)
    .sort((a, b) => a!.threshold - b!.threshold) as VarianceBand[];
}

function resolveColor(absVariance: number, bands: VarianceBand[]): string {
  for (const band of bands) {
    if (absVariance <= band.threshold) return band.color;
  }
  return bands[bands.length - 1]?.color ?? '#6B7280';
}

export default function transformProps(chartProps: any): RankedVarianceChartProps {
  const { width, height, formData, queriesData } = chartProps;
  const fd = formData as RankedVarianceFormData;
  const data = queriesData?.[0]?.data || [];

  const entityCol = fd.entity_column;
  const actualLabel = fd.actual_metric ? getMetricLabel(fd.actual_metric) : '';
  const targetLabel = fd.target_metric ? getMetricLabel(fd.target_metric) : '';
  const valueFmt = getNumberFormatter(fd.y_axis_format || '+,.1%');
  const bands = parseVarianceBands(fd.variance_thresholds || '5:#2E7D32;15:#F9A825;100:#D32F2F');
  const maxEntities = fd.max_entities ?? 20;

  const varianceMode = (fd as any).variance_mode || 'absolute';
  const chartType = (fd as any).chart_type || 'bar';
  const comparisonBasis = (fd as any).comparison_basis || 'target';
  const showCenterline = (fd as any).show_centerline ?? true;
  const showBenchmarkBand = (fd as any).show_benchmark_band ?? false;
  const rawLower = (fd as any).benchmark_lower;
  const rawUpper = (fd as any).benchmark_upper;
  const benchmarkLower = rawLower !== '' && rawLower != null ? Number(rawLower) : null;
  const benchmarkUpper = rawUpper !== '' && rawUpper != null ? Number(rawUpper) : null;
  const showLegend = (fd as any).show_legend ?? false;

  // Compute variance for each entity. A missing ACTUAL means the entity has no
  // data — drop it rather than read it as 0 (which would rank a no-data district
  // as a huge shortfall). A missing target is kept but its % severity is
  // undefined (see pctSeverity below).
  let entities = data
    .map((row: any) => {
      const entity = String(row[entityCol] ?? '');
      const actualRaw = row[actualLabel];
      const targetRaw = row[targetLabel];
      const actual = actualRaw == null ? NaN : Number(actualRaw);
      const target = targetRaw == null ? NaN : Number(targetRaw);
      return { entity, actual, target };
    })
    .filter((e: any) => Number.isFinite(e.actual))
    .map((e: any) => {
      const hasTarget = Number.isFinite(e.target);
      const diff = e.actual - (hasTarget ? e.target : 0);
      const variance =
        varianceMode === 'relative'
          ? hasTarget && e.target !== 0
            ? (diff / Math.abs(e.target)) * 100
            : 0
          : diff;
      // Colour by percentage deviation so the (percentage) severity bands apply
      // regardless of display mode — the previous code coloured absolute mode by
      // raw magnitude against percentage thresholds, painting everything green.
      const pctSeverity =
        hasTarget && e.target !== 0
          ? Math.abs((diff / Math.abs(e.target)) * 100)
          : Math.abs(diff);
      return { entity: e.entity, actual: e.actual, target: e.target, variance, pctSeverity };
    });

  // Sort
  const sortOrder: SortOrder = fd.sort_order || 'worst-first';
  if (sortOrder === 'worst-first') {
    entities.sort((a: any, b: any) => a.variance - b.variance);
  } else if (sortOrder === 'best-first') {
    entities.sort((a: any, b: any) => b.variance - a.variance);
  } else {
    entities.sort((a: any, b: any) => a.entity.localeCompare(b.entity));
  }
  entities = entities.slice(0, maxEntities);

  // Reverse for ECharts horizontal bar (bottom-to-top)
  entities.reverse();

  const entityNames = entities.map((e: any) => e.entity);
  const varianceValues = entities.map((e: any) => e.variance);
  const barColors = entities.map((e: any) => resolveColor(e.pctSeverity, bands));

  const echartOptions = {
    grid: {
      top: 16,
      right: fd.show_values !== false ? 80 : 16,
      bottom: 32,
      left: fd.show_entity_labels !== false ? 140 : 16,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'var(--pro-bg-card, #fff)',
      borderColor: 'var(--pro-border, #E5EAF0)',
      textStyle: {
        fontFamily: 'var(--pro-font-family, Inter, sans-serif)',
        fontSize: 12,
      },
      formatter: (params: any) => {
        const p = params[0];
        const e = entities[p.dataIndex];
        return `<strong>${e.entity}</strong><br/>` +
          `Actual: ${valueFmt(e.actual)}<br/>` +
          `Target: ${valueFmt(e.target)}<br/>` +
          `Variance: <strong>${valueFmt(e.variance)}</strong>`;
      },
    },
    xAxis: {
      type: 'value',
      position: 'bottom',
      axisLabel: {
        fontSize: 10,
        color: 'var(--pro-text-muted, #9CA3AF)',
        formatter: (v: number) => valueFmt(v),
      },
      splitLine: {
        lineStyle: { color: 'var(--pro-border, #E5EAF0)', type: 'dashed' },
      },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: entityNames,
      axisLabel: {
        show: fd.show_entity_labels !== false,
        fontSize: 11,
        color: 'var(--pro-text-secondary, #6B7280)',
        width: 120,
        overflow: 'truncate',
      },
      axisLine: { lineStyle: { color: 'var(--pro-border, #E5EAF0)' } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: varianceValues.map((v: number, i: number) => ({
          value: v,
          itemStyle: { color: barColors[i], borderRadius: [2, 2, 2, 2] },
        })),
        barWidth: fd.bar_height ?? 20,
        label: {
          show: fd.show_values !== false,
          position: 'right',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--pro-text-secondary, #6B7280)',
          formatter: (p: any) => valueFmt(p.value),
        },
        markLine: showCenterline
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: 'var(--pro-text-muted, #9CA3AF)',
                type: 'solid',
                width: 1,
              },
              data: [{ xAxis: 0 }],
              label: { show: false },
            }
          : undefined,
        markArea:
          showBenchmarkBand && benchmarkLower != null && benchmarkUpper != null
            ? {
                silent: true,
                itemStyle: {
                  color: 'rgba(0,0,0,0.04)',
                  borderColor: 'var(--pro-border, #E5EAF0)',
                  borderType: 'dashed',
                  borderWidth: 1,
                },
                data: [
                  [{ xAxis: benchmarkLower }, { xAxis: benchmarkUpper }],
                ],
              }
            : undefined,
      },
    ],
    ...(showLegend ? { legend: { show: true } } : {}),
  };

  return {
    width,
    height,
    echartOptions,
    chartType,
    comparisonBasis,
    varianceMode,
    showCenterline,
    showBenchmarkBand,
    benchmarkLower,
    benchmarkUpper,
    showLegend,
    title: resolveChartTitle(
      chartProps.formData,
      chartProps.datasource?.columns,
    ),
  };
}
