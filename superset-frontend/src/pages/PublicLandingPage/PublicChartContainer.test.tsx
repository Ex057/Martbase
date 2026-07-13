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
import PublicChartContainer, {
  buildPublicChartEmbedUrl,
  buildEmbeddedChartCss,
  isMapLikeViz,
} from './PublicChartContainer';

test('buildPublicChartEmbedUrl applies horizontal legend overrides for embedded public charts', () => {
  const nextUrl = buildPublicChartEmbedUrl(
    '/superset/explore/?slice_id=12&standalone=true',
    { legendPreset: 'horizontal_top' },
  );
  const parsed = new URL(nextUrl, 'http://localhost');
  const formData = JSON.parse(parsed.searchParams.get('form_data') || '{}');

  expect(parsed.pathname).toBe('/superset/explore/public/');
  expect(formData.slice_id).toBe(12);
  expect(formData.show_legend).toBe(true);
  expect(formData.legendOrientation).toBe('top');
  expect(formData.legendType).toBe('scroll');
});

test('buildPublicChartEmbedUrl preserves existing form_data and allows hiding legends', () => {
  const nextUrl = buildPublicChartEmbedUrl(
    '/superset/explore/?slice_id=12&standalone=true&form_data=%7B%22slice_id%22%3A12%2C%22metric%22%3A%22value%22%7D',
    { legendPreset: 'hidden' },
  );
  const formData = JSON.parse(
    new URL(nextUrl, 'http://localhost').searchParams.get('form_data') || '{}',
  );

  expect(formData.metric).toBe('value');
  expect(formData.show_legend).toBe(false);
});

test('buildPublicChartEmbedUrl applies public page form data overrides without changing legend settings', () => {
  const nextUrl = buildPublicChartEmbedUrl(
    '/superset/explore/?slice_id=12&standalone=true',
    { formDataOverrides: { hide_quick_filters: true } },
  );
  const formData = JSON.parse(
    new URL(nextUrl, 'http://localhost').searchParams.get('form_data') || '{}',
  );

  expect(formData.slice_id).toBe(12);
  expect(formData.hide_quick_filters).toBe(true);
  expect(formData.show_legend).toBeUndefined();
});

test('buildPublicChartEmbedUrl normalizes public chart routes even without legend overrides', () => {
  const nextUrl = buildPublicChartEmbedUrl(
    '/superset/explore/?slice_id=12&standalone=true',
  );
  const parsed = new URL(nextUrl, 'http://localhost');

  expect(parsed.pathname).toBe('/superset/explore/public/');
  expect(parsed.searchParams.get('slice_id')).toBe('12');
});

test('buildPublicChartEmbedUrl keeps authenticated editor previews on the standard explore route', () => {
  const nextUrl = buildPublicChartEmbedUrl(
    '/superset/explore/public/?slice_id=12&standalone=true',
    { accessMode: 'authenticated' },
  );
  const parsed = new URL(nextUrl, 'http://localhost');

  expect(parsed.pathname).toBe('/superset/explore/');
  expect(parsed.searchParams.get('slice_id')).toBe('12');
});

test('isMapLikeViz detects map-style charts used by public pages', () => {
  expect(isMapLikeViz('dhis2_map')).toBe(true);
  expect(isMapLikeViz('mapbox')).toBe(true);
  expect(isMapLikeViz('line')).toBe(false);
});

test('PublicChartContainer respects explicit map_focus heights', () => {
  render(
    <PublicChartContainer
      title="Facility map"
      url="/superset/explore/?slice_id=12&standalone=true"
      height={320}
      surfacePreset="map_focus"
      vizType="dhis2_map"
      frameOpacity={0.88}
    />,
    { useTheme: true },
  );

  const frame = screen.getByTitle('Facility map');
  const frameShell = frame.parentElement;

  expect(frameShell).toHaveStyle({
    height: '320px',
    minHeight: '320px',
    '--portal-frame-surface-opacity': '0.88',
  });
});

test('buildEmbeddedChartCss hides DHIS2 quick filters on public map embeds', () => {
  const css = buildEmbeddedChartCss('map_focus', 'dhis2_map');

  expect(css).toContain('.dhis2-map-quick-filters');
  expect(css).toContain('.dhis2-map-quick-filters-panel');
  expect(css).toContain('.chart-container > div');
  expect(css).toContain('display: none !important;');
});

test('buildEmbeddedChartCss does not force-size Leaflet layers for dhis2_map', () => {
  // Regression: forcing width/height:100% on .leaflet-layer fights Leaflet's
  // transform-based tile layout and scatters the basemap tiles on the public
  // (iframe) embed. Leaflet must own its own layer/tile sizing.
  const css = buildEmbeddedChartCss('map_focus', 'dhis2_map');

  expect(css).not.toMatch(/\.leaflet-layer\s*(,[^{]*)?\{/);
  expect(css).not.toMatch(/\.leaflet-tile\b/);
});
