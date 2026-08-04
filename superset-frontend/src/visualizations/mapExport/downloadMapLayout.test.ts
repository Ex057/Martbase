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

import exportMapImage from './exportMapImage';
import { downloadMapLayout, isMapVizType } from './downloadMapLayout';
import { MAP_EXPORT_ID_ATTRIBUTE } from './constants';
import { clearMapExporters, registerMapExporter } from './registry';
import { MapExportSpec } from './types';

jest.mock('./exportMapImage', () => ({ __esModule: true, default: jest.fn() }));

const exportMock = exportMapImage as jest.Mock;
const spec = { metricName: 'Cases' } as MapExportSpec;

const mountChart = ({ withMap = true } = {}) => {
  const chart = document.createElement('div');
  chart.className = 'chart-container';
  if (withMap) {
    const mapRoot = document.createElement('div');
    mapRoot.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, 'map-1');
    chart.appendChild(mapRoot);
    registerMapExporter('map-1', () => spec);
  }
  document.body.appendChild(chart);
};

beforeEach(() => {
  jest.clearAllMocks();
  clearMapExporters();
  document.body.innerHTML = '';
  exportMock.mockResolvedValue(undefined);
});

describe('isMapVizType', () => {
  test('recognises the two map visualizations', () => {
    expect(isMapVizType('dhis2_map')).toBe(true);
    expect(isMapVizType('ug_maps')).toBe(true);
  });

  test('rejects everything else, so the item stays hidden', () => {
    [
      'table',
      'echarts_timeseries_bar',
      'deck_scatter',
      '',
      undefined,
      null,
    ].forEach(vizType => expect(isMapVizType(vizType)).toBe(false));
  });
});

describe('downloadMapLayout', () => {
  test('exports the registered map as PNG', async () => {
    mountChart();

    await downloadMapLayout('.chart-container', 'malaria-2026-08-04');

    expect(exportMock).toHaveBeenCalledWith(spec, 'malaria-2026-08-04', 'png');
  });

  test('throws when the chart element is not on the page', async () => {
    await expect(downloadMapLayout('.chart-container', 'stem')).rejects.toThrow(
      'chart element not found',
    );

    expect(exportMock).not.toHaveBeenCalled();
  });

  test('throws when the chart holds no registered map', async () => {
    mountChart({ withMap: false });

    await expect(downloadMapLayout('.chart-container', 'stem')).rejects.toThrow(
      'no map found',
    );

    expect(exportMock).not.toHaveBeenCalled();
  });

  test('propagates an export failure so the caller can report it', async () => {
    mountChart();
    exportMock.mockRejectedValue(
      new Error('Map export failed during "capture": tiles blocked'),
    );

    await expect(downloadMapLayout('.chart-container', 'stem')).rejects.toThrow(
      'during "capture"',
    );
  });
});
