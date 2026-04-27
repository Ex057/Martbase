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

import { useEffect, useMemo, useRef, useState } from 'react';
import { styled, t } from '@superset-ui/core';

export type ChartSurfacePreset = 'default' | 'borderless' | 'map_focus';
export type ChartLegendPreset =
  | 'default'
  | 'horizontal_top'
  | 'horizontal_bottom'
  | 'vertical_right'
  | 'hidden';
export type ChartEmbedAccessMode = 'public' | 'authenticated';

const MAP_VIZ_TYPES = new Set([
  'mapbox',
  'deck_polygon',
  'deck_scatter',
  'deck_geojson',
  'deck_grid',
  'deck_hex',
  'deck_path',
  'deck_arc',
  'country_map',
  'world_map',
  'dhis2_map',
]);

const FrameShell = styled.div<{
  $height: number;
  $surfacePreset: ChartSurfacePreset;
  $surfaceOpacity?: number;
}>`
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: ${({ $height }) => $height}px;
  height: ${({ $height }) => $height}px;
  --portal-frame-surface-opacity: ${({ $surfaceOpacity = 1 }) => $surfaceOpacity};
  overflow: hidden;
  border-radius: ${({ $surfacePreset }) =>
    $surfacePreset === 'default' ? 'var(--portal-radius-md, 0)' : '0'};
  border: ${({ $surfacePreset }) =>
    $surfacePreset === 'default' ? '1px solid rgba(148, 163, 184, 0.24)' : '0'};
  background: transparent;

  &::before {
    position: absolute;
    inset: 0;
    content: '';
    pointer-events: none;
    z-index: 0;
    background: ${({ $surfacePreset }) =>
      $surfacePreset === 'default'
        ? 'var(--portal-surface-card, var(--portal-surface, #ffffff))'
        : 'var(--portal-chart-frame-background, rgba(255, 255, 255, 1))'};
    opacity: var(--portal-frame-surface-opacity);
  }
`;

const FrameOverlay = styled.div<{ $surfacePreset: ChartSurfacePreset }>`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: ${({ $surfacePreset }) =>
    $surfacePreset === 'default'
      ? 'var(--portal-surface, rgba(255, 255, 255, 0.96))'
      : 'rgba(255, 255, 255, 0.72)'};
  z-index: 2;
`;

const Frame = styled.iframe`
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: transparent;
`;

function getBaseOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function serializeRelativeUrl(urlObject: URL) {
  return `${urlObject.pathname}${urlObject.search}${urlObject.hash}`;
}

function normalizeChartPath(
  pathname: string,
  accessMode: ChartEmbedAccessMode,
) {
  if (
    accessMode === 'public' &&
    (pathname === '/superset/explore/' || pathname === '/superset/explore')
  ) {
    return '/superset/explore/public/';
  }
  if (
    accessMode === 'authenticated' &&
    (pathname === '/superset/explore/public/' ||
      pathname === '/superset/explore/public')
  ) {
    return '/superset/explore/';
  }
  return pathname;
}

function buildLegendOverrides(
  legendPreset: ChartLegendPreset,
): Record<string, unknown> {
  switch (legendPreset) {
    case 'horizontal_top':
      return {
        show_legend: true,
        legendOrientation: 'top',
        legendType: 'scroll',
      };
    case 'horizontal_bottom':
      return {
        show_legend: true,
        legendOrientation: 'bottom',
        legendType: 'scroll',
      };
    case 'vertical_right':
      return {
        show_legend: true,
        legendOrientation: 'right',
        legendType: 'scroll',
      };
    case 'hidden':
      return {
        show_legend: false,
      };
    case 'default':
    default:
      return {};
  }
}

export function isMapLikeViz(vizType?: string | null) {
  const normalized = (vizType || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return MAP_VIZ_TYPES.has(normalized) || normalized.includes('map');
}

export function buildPublicChartEmbedUrl(
  url: string,
  {
    legendPreset = 'default',
    accessMode = 'public',
    formDataOverrides = {},
  }: {
    legendPreset?: ChartLegendPreset;
    accessMode?: ChartEmbedAccessMode;
    formDataOverrides?: Record<string, unknown>;
  } = {},
) {
  if (!url) {
    return url;
  }
  const urlObject = new URL(url, getBaseOrigin());
  urlObject.pathname = normalizeChartPath(urlObject.pathname, accessMode);
  const legendOverrides = buildLegendOverrides(legendPreset);
  const hasFormDataOverrides = Object.keys(formDataOverrides).length > 0;
  if (!Object.keys(legendOverrides).length && !hasFormDataOverrides) {
    return serializeRelativeUrl(urlObject);
  }

  const params = urlObject.searchParams;
  const sliceId = Number(params.get('slice_id'));
  const rawFormData = params.get('form_data');

  let formData: Record<string, unknown> = {};
  if (rawFormData) {
    try {
      formData = JSON.parse(rawFormData);
    } catch {
      formData = {};
    }
  }
  if (Number.isFinite(sliceId) && !formData.slice_id) {
    formData.slice_id = sliceId;
  }

  params.set(
    'form_data',
    JSON.stringify({
      ...formData,
      ...legendOverrides,
      ...formDataOverrides,
    }),
  );
  return serializeRelativeUrl(urlObject);
}

function resolveFrameHeight(height: number) {
  return height;
}

export function buildEmbeddedChartCss(
  surfacePreset: ChartSurfacePreset,
  vizType?: string,
) {
  const mapLike = isMapLikeViz(vizType);
  const sharedCss = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: transparent !important;
      overflow: hidden !important;
    }
    body.background-transparent {
      background: transparent !important;
    }
    #app,
    [data-test="standalone-app"] {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }
  `;
  if (surfacePreset === 'default' && !mapLike) {
    return sharedCss;
  }
  return `
    ${sharedCss}
    body > div,
    #app > div,
    [data-test="standalone-app"] > div,
    [data-test="standalone-app"] > div > div,
    .chart-container,
    .dashboard-chart,
    .slice_container,
    .chart-holder,
    .chart-slice {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }
    .header-with-actions,
    .slice-header,
    .chart-header,
    [data-test="chart-title"],
    [data-test="slice-header"],
    [data-test="page-header"] {
      display: none !important;
    }
    ${
      mapLike || surfacePreset === 'map_focus'
        ? `
        body > div > div,
        #app > div > div,
        [data-test="standalone-app"] > div > div > div,
        .chart-container > div,
        .dashboard-chart > div,
        .slice_container > div,
        .chart-holder > div,
        .chart-slice > div {
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }
        .deckgl-wrapper,
        .deckgl-overlay,
        .viewport,
        .leaflet-container,
        .leaflet-map-pane,
        .leaflet-pane,
        .leaflet-overlay-pane,
        .leaflet-tile-pane,
        .leaflet-shadow-pane,
        .leaflet-marker-pane,
        .leaflet-tooltip-pane,
        .leaflet-popup-pane,
        .mapboxgl-map,
        .mapboxgl-canvas-container,
        .mapboxgl-canvas,
        canvas {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
        }
        .leaflet-container svg,
        .leaflet-overlay-pane svg {
          width: auto !important;
          height: auto !important;
          max-width: none !important;
        }
        .leaflet-container,
        .leaflet-pane,
        .leaflet-overlay-pane,
        .leaflet-tile-pane,
        .leaflet-shadow-pane,
        .leaflet-marker-pane,
        .leaflet-tooltip-pane,
        .leaflet-popup-pane,
        .leaflet-layer,
        .leaflet-image-layer,
        .leaflet-tile,
        .mapboxgl-map,
        .mapboxgl-canvas-container {
          background: transparent !important;
        }
        .leaflet-control-container {
          z-index: 3 !important;
        }
        .dhis2-map-quick-filters,
        .dhis2-map-quick-filters-panel {
          display: none !important;
        }
      `
        : ''
    }
  `;
}

function applyEmbeddedChartDocumentStyles(
  frame: HTMLIFrameElement | null,
  surfacePreset: ChartSurfacePreset,
  vizType?: string,
) {
  if (!frame) {
    return;
  }
  try {
    const doc = frame.contentDocument;
    if (!doc?.head) {
      return;
    }
    const styleId = 'cms-public-chart-overrides';
    let styleTag = doc.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = doc.createElement('style');
      styleTag.id = styleId;
      doc.head.appendChild(styleTag);
    }
    styleTag.textContent = buildEmbeddedChartCss(surfacePreset, vizType);
  } catch {
    // Standalone charts should remain usable even if iframe styling is inaccessible.
  }
}

type PublicChartContainerProps = {
  title: string;
  url: string;
  height?: number;
  loadingLabel?: string;
  surfacePreset?: ChartSurfacePreset;
  legendPreset?: ChartLegendPreset;
  vizType?: string;
  accessMode?: ChartEmbedAccessMode;
  formDataOverrides?: Record<string, unknown>;
  frameOpacity?: number;
};

export default function PublicChartContainer({
  title,
  url,
  height = 360,
  loadingLabel = t('Loading analytics...'),
  surfacePreset = 'default',
  legendPreset = 'default',
  vizType,
  accessMode = 'public',
  formDataOverrides,
  frameOpacity,
}: PublicChartContainerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const resolvedUrl = useMemo(
    () =>
      buildPublicChartEmbedUrl(url, {
        legendPreset,
        accessMode,
        formDataOverrides,
      }),
    [accessMode, formDataOverrides, legendPreset, url],
  );
  const resolvedHeight = resolveFrameHeight(height);

  useEffect(() => {
    setIsLoading(true);
  }, [resolvedUrl]);

  return (
    <FrameShell
      $height={resolvedHeight}
      $surfacePreset={surfacePreset}
      $surfaceOpacity={frameOpacity}
    >
      {isLoading && (
        <FrameOverlay $surfacePreset={surfacePreset}>
          {loadingLabel}
        </FrameOverlay>
      )}
      <Frame
        ref={frameRef}
        src={resolvedUrl}
        title={title}
        loading="lazy"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        onLoad={() => {
          applyEmbeddedChartDocumentStyles(
            frameRef.current,
            surfacePreset,
            vizType,
          );
          setIsLoading(false);
        }}
      />
    </FrameShell>
  );
}
