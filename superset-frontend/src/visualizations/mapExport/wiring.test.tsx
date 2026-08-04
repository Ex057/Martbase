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

/*
 * Guards the seam between a map viz and the exporter: the marker attribute has
 * to survive emotion's prop filtering, the ref has to reach the DOM node, and
 * the registration has to see fresh state. Any of these failing silently sends
 * "Download as image" back to the generic screenshot.
 */

import { useEffect, useRef } from 'react';
import { styled } from '@superset-ui/core';
import { render } from 'spec/helpers/testing-library';
import {
  MAP_EXPORT_ID_ATTRIBUTE,
  clearMapExporters,
  findMapExporter,
  registerMapExporter,
  unregisterMapExporter,
  useMapExportId,
} from './registry';
import { MapExportSpec } from './types';

// Mirrors DHIS2Map's MapWrapper: an emotion styled.div taking transient props.
const MapWrapper = styled.div<{ $transparentCardContainer?: boolean }>`
  width: 100%;
`;

function FakeMapViz({ title }: { title: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const exportId = useMapExportId();

  const exportSpec = { rootElement: null, title } as unknown as MapExportSpec;
  const specRef = useRef(exportSpec);
  useEffect(() => {
    specRef.current = exportSpec;
  });

  useEffect(() => {
    registerMapExporter(exportId, () => ({
      ...specRef.current,
      rootElement: rootRef.current,
    }));
    return () => unregisterMapExporter(exportId);
  }, [exportId]);

  return (
    <MapWrapper
      ref={rootRef}
      {...{ [MAP_EXPORT_ID_ATTRIBUTE]: exportId }}
      $transparentCardContainer
    >
      <div className="leaflet-container" />
    </MapWrapper>
  );
}

const chartContainer = () =>
  document.querySelector('.chart-container') as HTMLElement;

const renderInChart = (title = 'Map 1') =>
  render(
    <div className="panel-body">
      <div className="chart-container">
        <FakeMapViz title={title} />
      </div>
    </div>,
  );

beforeEach(() => {
  clearMapExporters();
});

describe('map export wiring', () => {
  test('emotion keeps the marker attribute on the rendered element', () => {
    renderInChart();

    expect(
      chartContainer().querySelector(`[${MAP_EXPORT_ID_ATTRIBUTE}]`),
    ).not.toBeNull();
  });

  test('the download path finds the map from the chart container', () => {
    renderInChart();

    expect(findMapExporter(chartContainer())).not.toBeNull();
  });

  test('the registered getter resolves the root element via the ref', () => {
    renderInChart();

    const spec = findMapExporter(chartContainer())!();
    expect(spec.rootElement).toBe(
      chartContainer().querySelector(`[${MAP_EXPORT_ID_ATTRIBUTE}]`),
    );
    expect(
      spec.rootElement?.querySelector('.leaflet-container'),
    ).not.toBeNull();
  });

  test('the getter sees current state, not the first render', () => {
    const { rerender } = renderInChart('Map 1');

    rerender(
      <div className="panel-body">
        <div className="chart-container">
          <FakeMapViz title="Map 2" />
        </div>
      </div>,
    );

    expect(findMapExporter(chartContainer())!().title).toBe('Map 2');
  });

  test('unmounting deregisters, so a stale marker cannot be matched', () => {
    const { unmount } = renderInChart();
    const container = chartContainer();
    expect(findMapExporter(container)).not.toBeNull();

    unmount();

    expect(findMapExporter(container)).toBeNull();
  });
});
