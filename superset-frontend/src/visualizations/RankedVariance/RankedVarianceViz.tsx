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
import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { styled } from '@superset-ui/core';
import { resolveCssVarColors } from 'src/utils/resolveCssVarColors';
import {
  ChartTitleBlock,
  chartTitleHeight,
} from 'src/components/ChartTitleBlock';
import { RankedVarianceChartProps } from './types';

const Container = styled.div`
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
`;

export default function RankedVarianceViz(props: RankedVarianceChartProps) {
  const { width, height, echartOptions, title } = props;
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  const titleHeight = chartTitleHeight(title);
  const chartHeight = Math.max(0, height - titleHeight);

  useEffect(() => {
    if (!chartRef.current) return undefined;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    // Canvas can't parse var(--x); resolve to concrete themed colours first.
    instanceRef.current.setOption(
      resolveCssVarColors(echartOptions, chartRef.current),
      true,
    );
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [echartOptions]);

  useEffect(() => {
    instanceRef.current?.resize();
  }, [width, chartHeight]);

  return (
    <Container style={{ width, height }}>
      <ChartTitleBlock {...title} />
      <div ref={chartRef} style={{ width: '100%', height: chartHeight }} />
    </Container>
  );
}
