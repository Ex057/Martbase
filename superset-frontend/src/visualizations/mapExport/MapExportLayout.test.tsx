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
import MapExportLayout, {
  MAP_WIDTH,
  SIDEBAR_WIDTH,
  attributionToText,
} from './MapExportLayout';
import { MapExportSpec } from './types';

const MAP_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

const baseSpec: MapExportSpec = {
  rootElement: null,
  mapInstance: null,
  boundaries: [],
  title: 'Malaria positivity last month',
  subtitle: 'MOH - Uganda District Cities · Last 3 months',
  metricName: 'MAL TEST POSITIVITY RATE',
  legendItems: [
    { key: 'a', color: '#ffffcc', label: '3 – 19' },
    { key: 'b', color: '#fd8d3c', label: '19 – 28' },
  ],
  noDataColor: 'rgba(204,204,204,1)',
};

const renderLayout = (spec: Partial<MapExportSpec> = {}, scaleBar = null) =>
  render(
    <MapExportLayout
      spec={{ ...baseSpec, ...spec }}
      mapImage={MAP_IMAGE}
      scaleBar={scaleBar}
    />,
  );

describe('attributionToText', () => {
  test('decodes the entity-encoded attribution from the basemap config', () => {
    expect(attributionToText('&copy; OpenStreetMap &copy; CARTO')).toBe(
      '© OpenStreetMap © CARTO',
    );
  });

  test('strips markup rather than rendering it', () => {
    expect(attributionToText('<a href="/x">&copy; Esri</a>')).toBe('© Esri');
  });
});

describe('MapExportLayout', () => {
  test('puts the title, subtitle and legend in the side panel', () => {
    renderLayout();

    expect(
      screen.getByText('Malaria positivity last month'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('MOH - Uganda District Cities · Last 3 months'),
    ).toBeInTheDocument();
    expect(screen.getByText('MAL TEST POSITIVITY RATE')).toBeInTheDocument();
    expect(screen.getByText('3 – 19')).toBeInTheDocument();
    expect(screen.getByText('19 – 28')).toBeInTheDocument();
  });

  test('always appends a No data row', () => {
    renderLayout();

    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  test('renders the captured map', () => {
    const { container } = renderLayout();

    expect(container.querySelector('img')).toHaveAttribute('src', MAP_IMAGE);
  });

  test('renders the scale bar label when one was computed', () => {
    renderLayout({}, { label: '50 km', widthPx: 200 } as any);

    expect(screen.getByText('50 km')).toBeInTheDocument();
  });

  test('omits the attribution for a basemap that has none', () => {
    const { container } = renderLayout({ attributionHtml: '' });

    expect(container).not.toHaveTextContent(/©/);
  });

  test('shows the decoded attribution for a tiled basemap', () => {
    renderLayout({ attributionHtml: '&copy; OpenStreetMap &copy; CARTO' });

    expect(screen.getByText('© OpenStreetMap © CARTO')).toBeInTheDocument();
  });

  test('shows the period under the metric only when one is supplied', () => {
    const { queryByText } = renderLayout();
    expect(queryByText('This year')).not.toBeInTheDocument();

    renderLayout({ periodLabel: 'This year' });
    expect(screen.getByText('This year')).toBeInTheDocument();
  });

  test('appends per-class counts in parentheses, as DHIS2 does', () => {
    renderLayout({
      legendItems: [
        { key: 'a', color: '#ffffcc', label: '14 - 121.8', count: 3 },
        { key: 'b', color: '#fd8d3c', label: '121.8 - 229.6', count: 0 },
      ],
    });

    expect(screen.getByText('14 - 121.8 (3)')).toBeInTheDocument();
    // An empty class still reports 0 rather than going blank.
    expect(screen.getByText('121.8 - 229.6 (0)')).toBeInTheDocument();
  });

  test('omits the count when a class has none, rather than printing "()"', () => {
    renderLayout({
      legendItems: [{ key: 'a', color: '#ffffcc', label: 'Uncounted' }],
    });

    expect(screen.getByText('Uncounted')).toBeInTheDocument();
  });

  test('never puts a count on the No data row', () => {
    renderLayout({
      legendItems: [
        { key: 'a', color: '#ffffcc', label: '14 - 121.8', count: 3 },
      ],
    });

    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  test('renders the boundary-level key only when levels are present', () => {
    const { queryByText } = renderLayout();
    expect(queryByText('Boundary Levels')).not.toBeInTheDocument();

    renderLayout({
      levelsHeading: 'Organisation units',
      levelItems: [
        { key: '2', color: 'rgba(0,0,0,1)', width: 1, label: 'District' },
      ],
    });
    expect(screen.getByText('Organisation units')).toBeInTheDocument();
    expect(screen.getByText('District')).toBeInTheDocument();
  });

  test('draws org units as a stroked outline, not a filled bar', () => {
    const { container } = renderLayout({
      levelsHeading: 'Organisation units',
      levelItems: [
        { key: '2', color: 'rgb(20, 30, 40)', width: 1, label: 'District' },
      ],
    });

    const outline = container.querySelector('svg path[stroke]');
    expect(outline).toHaveAttribute('stroke', 'rgb(20, 30, 40)');
    expect(outline).not.toHaveAttribute('fill', expect.stringContaining('rgb'));
  });

  test("renders the viz's own compass node inside the map frame", () => {
    renderLayout({
      compassNode: <div data-test="compass">N</div>,
    });

    expect(screen.getByTestId('compass')).toBeInTheDocument();
  });

  test('puts the map first and the panel second, so the panel is on the right', () => {
    const { container } = renderLayout();
    const [first, second] = Array.from(
      container.firstElementChild!.children,
    ) as HTMLElement[];

    expect(first).toHaveStyle({ width: `${MAP_WIDTH}px` });
    expect(first.querySelector('img')).not.toBeNull();
    expect(second).toHaveStyle({ width: `${SIDEBAR_WIDTH}px` });
  });

  test('keeps the title, subtitle and legend together in the right panel', () => {
    const { container } = renderLayout();
    const panel = container.firstElementChild!.children[1];

    expect(panel).toHaveTextContent('Malaria positivity last month');
    expect(panel).toHaveTextContent('MOH - Uganda District Cities');
    expect(panel).toHaveTextContent('MAL TEST POSITIVITY RATE');
    expect(panel).toHaveTextContent('3 – 19');
    expect(panel).toHaveTextContent('No data');
  });
});
