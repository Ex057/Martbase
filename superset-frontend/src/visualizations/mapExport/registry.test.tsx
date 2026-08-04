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

import { render, screen } from 'spec/helpers/testing-library';
import {
  MAP_EXPORT_ID_ATTRIBUTE,
  clearMapExporters,
  findMapExporter,
  registerMapExporter,
  unregisterMapExporter,
  useMapExportId,
} from './registry';
import { MapExportSpec } from './types';

const spec = { metricName: 'Cases' } as MapExportSpec;
const getSpec = () => spec;

const buildTree = (id: string) => {
  const chartContainer = document.createElement('div');
  const intermediate = document.createElement('div');
  const mapRoot = document.createElement('div');
  mapRoot.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, id);
  intermediate.appendChild(mapRoot);
  chartContainer.appendChild(intermediate);
  return { chartContainer, mapRoot };
};

beforeEach(() => {
  clearMapExporters();
});

describe('findMapExporter', () => {
  test('finds a map nested anywhere under the chart container', () => {
    const { chartContainer } = buildTree('map-1');
    registerMapExporter('map-1', getSpec);

    expect(findMapExporter(chartContainer)?.()).toBe(spec);
  });

  test('finds a map when the container is the map root itself', () => {
    const { mapRoot } = buildTree('map-1');
    registerMapExporter('map-1', getSpec);

    expect(findMapExporter(mapRoot)?.()).toBe(spec);
  });

  test('returns null for a chart with no map', () => {
    const table = document.createElement('div');
    table.innerHTML = '<table><tbody><tr><td>1</td></tr></tbody></table>';

    expect(findMapExporter(table)).toBeNull();
  });

  test('returns null once the map unregisters, even though the DOM lingers', () => {
    const { chartContainer } = buildTree('map-1');
    registerMapExporter('map-1', getSpec);
    unregisterMapExporter('map-1');

    expect(findMapExporter(chartContainer)).toBeNull();
  });

  test('supports two maps on one dashboard', () => {
    const container = document.createElement('div');
    const first = document.createElement('div');
    first.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, 'map-1');
    const second = document.createElement('div');
    second.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, 'map-2');
    container.append(first, second);

    const otherSpec = { metricName: 'Deaths' } as MapExportSpec;
    registerMapExporter('map-1', getSpec);
    registerMapExporter('map-2', () => otherSpec);

    expect(findMapExporter(first)?.()).toBe(spec);
    expect(findMapExporter(second)?.()).toBe(otherSpec);
  });

  test('skips a stale marker and uses a registered sibling', () => {
    const container = document.createElement('div');
    const stale = document.createElement('div');
    stale.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, 'gone');
    const live = document.createElement('div');
    live.setAttribute(MAP_EXPORT_ID_ATTRIBUTE, 'map-2');
    container.append(stale, live);
    registerMapExporter('map-2', getSpec);

    expect(findMapExporter(container)?.()).toBe(spec);
  });
});

describe('useMapExportId', () => {
  function Probe({ label }: { label: string }) {
    const id = useMapExportId();
    return <span data-test={label}>{id}</span>;
  }

  test('is stable across re-renders of the same instance', () => {
    const { rerender } = render(<Probe label="a" />);
    const first = screen.getByTestId('a').textContent;

    rerender(<Probe label="a" />);

    expect(screen.getByTestId('a')).toHaveTextContent(first!);
  });

  test('is distinct per instance, so co-located maps do not collide', () => {
    render(
      <>
        <Probe label="a" />
        <Probe label="b" />
      </>,
    );

    // Compared exactly: `toHaveTextContent` matches substrings, so ids like
    // `map-export-1` and `map-export-11` would slip through.
    const idA = screen.getByTestId('a').textContent;
    const idB = screen.getByTestId('b').textContent;

    expect(idA).not.toBe(idB);
  });
});
