/*
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

import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactElement,
  FC,
} from 'react';
import { styled, SupersetClient, t } from '@superset-ui/core';
import { Spin } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { MapContainer, GeoJSON, useMap } from 'react-leaflet';
// @ts-ignore - react-leaflet types
import L from 'leaflet';
// @ts-ignore - leaflet styles
import 'leaflet/dist/leaflet.css';

// Ensure critical Leaflet CSS is injected at runtime (fixes production build issue
// where entry CSS may not load, causing panes to have position:static instead of absolute)
if (typeof document !== 'undefined') {
  const leafletStyles = document.getElementById('leaflet-critical-css');
  if (!leafletStyles) {
    const style = document.createElement('style');
    style.id = 'leaflet-critical-css';
    style.textContent = `
      .leaflet-pane, .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow,
      .leaflet-tile-container, .leaflet-pane > svg, .leaflet-pane > canvas,
      .leaflet-zoom-box, .leaflet-image-layer, .leaflet-layer {
        position: absolute;
        left: 0;
        top: 0;
      }
      .leaflet-container {
        overflow: hidden;
      }
      .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow {
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      .leaflet-tile-pane { z-index: 200; }
      .leaflet-overlay-pane { z-index: 400; }
      .leaflet-shadow-pane { z-index: 500; }
      .leaflet-marker-pane { z-index: 600; }
      .leaflet-tooltip-pane { z-index: 650; }
      .leaflet-popup-pane { z-index: 700; }
      .leaflet-map-pane canvas { z-index: 100; }
      .leaflet-map-pane svg { z-index: 200; }

      /* Interaction + tooltip rules from leaflet.css that this critical subset
         omitted. Without them the SVG boundary paths don't receive mouse events
         (so hover never fires even though a tooltip is bound), and an opened
         tooltip has no box styling. */
      .leaflet-pane > svg path.leaflet-interactive,
      .leaflet-pane > canvas {
        pointer-events: auto;
        pointer-events: visiblePainted;
      }
      .leaflet-interactive {
        cursor: pointer;
      }
      .leaflet-tooltip {
        position: absolute;
        padding: 6px 8px;
        background-color: #fff;
        border: 1px solid #fff;
        border-radius: 3px;
        color: #222;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      }
      .leaflet-tooltip-pane { pointer-events: none; }
    `;
    document.head.appendChild(style);
  }
}
import {
  AggregationMethod,
  BoundaryFocusMaskStyle,
  CompassStyle,
  DHIS2DatasourceColumn,
  DHIS2LegendDefinition,
  DHIS2MapProps,
  BoundaryFeature,
  DHIS2LoaderColumnDefinition,
  DrillState,
  LegendDisplayType,
} from './types';
import { DHIS2DataLoader } from './dhis2DataLoader';
import {
  clearGeoFeatureCache,
  DHIS2GeoJSONFeature,
} from 'src/utils/dhis2GeoFeatureLoader';
import ugandaCountryMapGeoJson from '../../../plugins/legacy-plugin-chart-country-map/src/countries/uganda.geojson';
import {
  resolveEffectiveBoundaryLevels,
  resolvePrimaryBoundaryLevel,
} from './boundaryLevels';
import {
  FocusedBoundaryRequest,
  resolveFocusedBoundaryRequest,
  resolveFocusedDataLevel,
} from './focusMode';
import LegendPanel from './components/LegendPanel';
import MapCompass from './components/MapCompass';
import DrillControls from './components/DrillControls';
import DataPreviewPanel from './components/DataPreviewPanel';
import FiltersPanel from './components/FiltersPanel';
import {
  BASE_MAPS,
  BaseMapLayer,
  BaseMapSelector,
  BaseMapType,
} from './components/BaseMaps';
import {
  buildLegendEntries,
  getColorScale,
  formatValue,
  calculateBounds,
  getMapFitViewportConfig,
  filterValidFeatures,
  darkenColor,
  buildOrgUnitMatchKeys,
  getLegendRangeFromDefinition,
  normalizeOrgUnitMatchKey,
} from './utils';
import {
  syncDHIS2LegendSchemesForDatabase,
  readCachedLegendSets,
} from 'src/utils/dhis2LegendColorSchemes';
import {
  getStagedDatasetIdFromSql,
  hasDHIS2SqlComment,
  hasStagedLocalServingSql,
  resolveDHIS2MapData,
  resolveDisplayedBoundaries,
  shouldLoadStagedLocalFocusData,
  shouldResolveDHIS2DatasetSql,
  shouldUseDHIS2LoaderData,
} from './dataMode';
import {
  buildFocusedStagedLocalAggregateQuery,
  buildFocusedStagedLocalQueryFilters,
  buildHierarchyColumns,
  serializeStagedLocalQueryFilters,
} from './stagedLocalFilters';
import {
  resolveLoaderDimensionColumnName,
  resolveLoaderMetricColumnName,
  resolveQueryDimensionColumnName,
  resolveQueryMetricColumnName,
} from './loaderColumns';
import { sanitizeDHIS2ColumnName } from '../../features/datasets/AddDataset/DHIS2ParameterBuilder/sanitize';

/* eslint-disable theme-colors/no-literal-colors */

function parseColumnExtra(extra: unknown): Record<string, any> | undefined {
  if (!extra) return undefined;
  if (typeof extra === 'string') {
    try {
      return JSON.parse(extra);
    } catch {
      return undefined;
    }
  }
  if (typeof extra === 'object') return extra as Record<string, any>;
  return undefined;
}

// Use hardcoded values for map styling to avoid theme context issues
// These are legitimate map styling values, not UI theming
const MapWrapper = styled.div<{ $transparentCardContainer?: boolean }>`
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  isolation: isolate;
  z-index: 0;
  background: ${({ $transparentCardContainer }) =>
    $transparentCardContainer ? 'transparent' : 'inherit'};
  border: ${({ $transparentCardContainer }) =>
    $transparentCardContainer ? 'none' : 'inherit'};
  box-shadow: ${({ $transparentCardContainer }) =>
    $transparentCardContainer ? 'none' : 'inherit'};
`;

const MapCanvas = styled.div<{ $backgroundColor?: string }>`
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background: ${({ $backgroundColor }) => $backgroundColor || '#ffffff'};

  .leaflet-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: ${({ $backgroundColor }) => $backgroundColor || '#ffffff'};
  }

  .leaflet-container .leaflet-interactive:focus,
  .leaflet-container .leaflet-interactive:focus-visible,
  .leaflet-container svg path:focus,
  .leaflet-container svg path:focus-visible {
    outline: none;
  }

  .map-label {
    background: transparent;
    border: none;
    box-shadow: none;
    font-weight: 500;
    pointer-events: none;
    text-shadow:
      1px 1px 1px #ffffff,
      -1px -1px 1px #ffffff,
      1px -1px 1px #ffffff,
      -1px 1px 1px #ffffff;
  }

  .dhis2-map-tooltip-container {
    pointer-events: none;
  }

  .map-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
    z-index: 4;
  }

  .map-error-message {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--pro-error);
    color: #ffffff;
    padding: 8px 16px;
    border-radius: var(--pro-radius-sm, 6px);
    z-index: 4;
    font-family: var(--pro-font-family, 'Inter', sans-serif);
    font-size: 13px;
    box-shadow: var(--pro-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.15));
  }

  .map-zoom-controls {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 1002;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
  }

  .map-aim-button {
    position: absolute;
    top: 102px;
    left: 14px;
    z-index: 1002;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
  }

  .map-zoom-button {
    width: 38px;
    height: 38px;
    border: 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: rgba(241, 245, 249, 0.95);
    }
  }

  .map-aim-button.map-zoom-button {
    border-bottom: 0;
  }

  .map-aim-icon {
    width: 18px;
    height: 18px;
    color: #0f172a;
  }

  .map-interaction-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    background: rgba(255, 255, 255, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    font-size: 12px;
    font-weight: 500;
    color: var(--pro-text-primary);
    font-family: var(--pro-font-family, 'Inter', sans-serif);
  }
`;

const FloatingActionButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid
    ${({ $active }) => ($active ? 'var(--pro-accent)' : 'var(--pro-border)')};
  background: ${({ $active }) =>
    $active ? 'var(--pro-accent)' : 'var(--pro-bg-card)'};
  color: ${({ $active }) =>
    $active ? '#ffffff' : 'var(--pro-text-secondary)'};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  box-shadow: var(--pro-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.06));
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    background: ${({ $active }) =>
      $active ? 'var(--pro-accent-hover)' : 'var(--pro-bg-canvas)'};
    box-shadow: var(--pro-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
  }
`;

const FloatingControls = styled.div`
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 1003;
  display: flex;
  gap: 8px;
`;

const QuickFiltersOverlay = styled.div`
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 48px;
  z-index: 1004;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`;
/* eslint-enable theme-colors/no-literal-colors */

function fitMapToBoundaries(
  map: L.Map,
  boundaries: BoundaryFeature[],
  viewportWidth: number,
  viewportHeight: number,
  animate: boolean = true,
): boolean {
  const bounds = calculateBounds(boundaries);

  if (!bounds || !bounds.isValid()) {
    return false;
  }

  const applyFit = (shouldAnimate: boolean) => {
    const size = map.getSize();
    // Use actual map canvas dimensions. Fall back to viewport props only
    // when the map container has no size yet (e.g. first render before layout).
    const fitConfig = getMapFitViewportConfig(
      size.x > 0 ? size.x : viewportWidth,
      size.y > 0 ? size.y : viewportHeight,
      {},
    );

    map.fitBounds(bounds, {
      paddingTopLeft: fitConfig.paddingTopLeft,
      paddingBottomRight: fitConfig.paddingBottomRight,
      maxZoom: fitConfig.maxZoom,
      animate: shouldAnimate,
      duration: shouldAnimate ? 0.35 : undefined,
    });
  };

  map.invalidateSize({ pan: false });
  applyFit(animate);

  requestAnimationFrame(() => {
    map.invalidateSize({ pan: false });
    applyFit(false);
  });

  return true;
}

// Component to auto-fit map bounds when boundaries change
interface MapAutoFocusProps {
  boundaries: BoundaryFeature[];
  enabled: boolean;
  viewportWidth: number;
  viewportHeight: number;
  layoutSignature?: string;
}

function MapAutoFocus({
  boundaries,
  enabled,
  viewportWidth,
  viewportHeight,
  layoutSignature,
}: MapAutoFocusProps): ReactElement | null {
  const map = useMap();
  // Use refs to track state without causing re-renders
  const lastFocusSignatureRef = useRef<string>('');
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create a stable key from boundary IDs to detect actual changes
  const boundaryIdsKey = useMemo(
    () =>
      boundaries
        .map(b => b.id)
        .sort()
        .join(','),
    [boundaries],
  );
  const viewportSignature = useMemo(
    () =>
      `${Math.max(0, Math.round(viewportWidth || 0))}x${Math.max(
        0,
        Math.round(viewportHeight || 0),
      )}`,
    [viewportHeight, viewportWidth],
  );
  const focusSignature = useMemo(
    () =>
      `${boundaryIdsKey}|${viewportSignature}|${layoutSignature || 'default'}`,
    [boundaryIdsKey, layoutSignature, viewportSignature],
  );

  useEffect(() => {
    // Only auto-focus if:
    // 1. We're enabled (not loading)
    // 2. We have boundaries
    // 3. The boundary set or viewport size has actually changed
    // 4. We haven't already focused on this exact combination
    const boundariesChanged = focusSignature !== lastFocusSignatureRef.current;
    const shouldFocus =
      enabled && boundaries.length > 0 && map && boundariesChanged;

    if (!shouldFocus) {
      return undefined;
    }

    // Clear any pending timeout
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }

    // Small delay to ensure map is fully initialized
    focusTimeoutRef.current = setTimeout(() => {
      try {
        if (
          fitMapToBoundaries(map, boundaries, viewportWidth, viewportHeight)
        ) {
          // Mark that we've focused on this boundary set + viewport size
          lastFocusSignatureRef.current = focusSignature;
        } else {
          // eslint-disable-next-line no-console
          console.warn('[MapAutoFocus] Calculated bounds are invalid');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[MapAutoFocus] Failed to auto-focus map:', err);
      }
    }, 100);

    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
    // Use stable signatures instead of raw arrays to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, focusSignature, map, viewportHeight, viewportWidth]);

  return null;
}

interface BoundaryMaskProps {
  boundaries: BoundaryFeature[];
  enabled: boolean;
  maskStyle?: BoundaryFocusMaskStyle;
}

function MapInstanceBridge({
  onReady,
}: {
  onReady: (map: L.Map) => void;
}): ReactElement | null {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  useEffect(() => {
    const container = map.getContainer();
    let animationFrame: number | null = null;
    const invalidate = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        animationFrame = null;
      });
    };

    invalidate();
    const timeout = window.setTimeout(invalidate, 250);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(invalidate)
        : null;
    resizeObserver?.observe(container);

    return () => {
      window.clearTimeout(timeout);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
    };
  }, [map]);

  return null;
}

function BoundaryMask({
  boundaries,
  enabled,
  maskStyle = 'light',
}: BoundaryMaskProps): ReactElement | null {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(false);

  const extractOuterRings = useCallback(
    (feature: BoundaryFeature): number[][][] => {
      const { geometry } = feature;
      if (!geometry || !geometry.coordinates) {
        return [];
      }
      if (geometry.type === 'Polygon') {
        const coords = geometry.coordinates as number[][][];
        return coords && coords[0] ? [coords[0]] : [];
      }
      if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates as unknown as number[][][][];
        return coords.map(poly => poly[0]).filter(Boolean);
      }
      return [];
    },
    [],
  );

  const maskFeature = useMemo(() => {
    if (!enabled || boundaries.length === 0) {
      return null;
    }

    const outerRing = [
      [-180, 90],
      [180, 90],
      [180, -90],
      [-180, -90],
      [-180, 90],
    ];

    const innerRings = boundaries.flatMap(feature =>
      extractOuterRings(feature),
    );
    if (innerRings.length === 0) {
      return null;
    }

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [outerRing, ...innerRings],
      },
      properties: {},
    };
  }, [boundaries, enabled, extractOuterRings]);

  useEffect(() => {
    if (!enabled || !map) {
      setPaneReady(false);
      return;
    }

    const paneName = 'dhis2MaskPane';
    let pane = map.getPane(paneName);
    if (!pane) {
      pane = map.createPane(paneName);
      pane.style.zIndex = '250';
      pane.style.pointerEvents = 'none';
    }
    setPaneReady(true);
  }, [enabled, map]);

  if (!maskFeature || !paneReady) {
    return null;
  }

  return (
    <GeoJSON
      data={maskFeature as any}
      style={() => {
        if (maskStyle === 'transparent') {
          return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: 'transparent',
            weight: 0,
          };
        }
        if (maskStyle === 'dark') {
          return {
            fillColor: '#0f172a',
            fillOpacity: 0.45,
            color: 'transparent',
            weight: 0,
          };
        }
        return {
          fillColor: '#ffffff',
          fillOpacity: 0.45,
          color: 'transparent',
          weight: 0,
        };
      }}
      pane="dhis2MaskPane"
    />
  );
}

// Component for manual focus button
function FocusButton({
  boundaries,
}: {
  boundaries: BoundaryFeature[];
}): ReactElement | null {
  const map = useMap();

  const handleFocus = () => {
    if (boundaries.length > 0 && map) {
      try {
        fitMapToBoundaries(
          map,
          boundaries,
          map.getSize().x,
          map.getSize().y,
          true,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to focus map:', err);
      }
    }
  };

  return (
    <button
      className="map-aim-button map-zoom-button"
      onClick={handleFocus}
      aria-label={t('Aim map at visible boundaries')}
      title={t('Aim map at visible boundaries')}
      type="button"
    >
      <svg
        className="map-aim-icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        <path
          d="M12 2.5V6.25M12 17.75V21.5M2.5 12H6.25M17.75 12H21.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function MapZoomButtons(): ReactElement | null {
  const map = useMap();

  return (
    <div className="map-zoom-controls">
      <button
        className="map-zoom-button"
        title="Zoom in"
        type="button"
        onClick={() => map.zoomIn(1)}
      >
        +
      </button>
      <button
        className="map-zoom-button"
        title="Zoom out"
        type="button"
        onClick={() => map.zoomOut(1)}
      >
        -
      </button>
    </div>
  );
}

// Custom GeoJSON component that properly updates styles
// react-leaflet v3 has issues with dynamic style updates, so we manually call setStyle
interface DynamicGeoJSONProps {
  data: any;
  style: (feature: any) => any;
  onEachFeature: (feature: any, layer: any) => void;
  styleKey: string; // Used to detect when style function changes
}

type DHIS2GeoJsonLayer = L.Layer & {
  feature?: BoundaryFeature;
  getTooltip?: () => L.Tooltip | undefined;
  unbindTooltip?: () => void;
};

const labelMarkersByLayer = new WeakMap<L.Layer, L.Marker>();

const DynamicGeoJSON: FC<DynamicGeoJSONProps> = ({
  data,
  style,
  onEachFeature,
  styleKey,
}) => {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const prevStyleKeyRef = useRef<string>(styleKey);
  const prevStyleRef = useRef(style);
  const prevOnEachFeatureRef = useRef(onEachFeature);

  const clearLayerBindings = useCallback((layer: DHIS2GeoJsonLayer) => {
    layer.off();
    if (layer.getTooltip?.()) {
      layer.unbindTooltip?.();
    }
    labelMarkersByLayer.get(layer)?.remove();
    labelMarkersByLayer.delete(layer);
  }, []);

  // Update styles when styleKey changes
  useEffect(() => {
    const styleChanged =
      prevStyleKeyRef.current !== styleKey || prevStyleRef.current !== style;
    // Rebind handlers/tooltips only when the binding callback identity changes.
    // Hover/selection style updates should not churn layer bindings, otherwise
    // tooltips can flicker due to repeated unbind/rebind cycles.
    const bindingsChanged = prevOnEachFeatureRef.current !== onEachFeature;
    if (geoJsonRef.current && (styleChanged || bindingsChanged)) {
      prevStyleKeyRef.current = styleKey;
      prevStyleRef.current = style;
      prevOnEachFeatureRef.current = onEachFeature;

      // Force style re-application
      geoJsonRef.current.setStyle(style as any);

      if (bindingsChanged) {
        // Also update tooltips and event handlers by re-creating them
        geoJsonRef.current.eachLayer((layer: DHIS2GeoJsonLayer) => {
          const { feature } = layer;
          if (feature && onEachFeature) {
            clearLayerBindings(layer);
            onEachFeature(feature, layer);
          }
        });
      }
    }
  }, [clearLayerBindings, styleKey, style, onEachFeature]);

  useEffect(
    () => () => {
      geoJsonRef.current?.eachLayer((layer: DHIS2GeoJsonLayer) => {
        clearLayerBindings(layer);
      });
    },
    [clearLayerBindings],
  );

  return (
    <GeoJSON
      ref={geoJsonRef}
      data={data}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
};

function convertToBoundaryFeatures(
  geoFeatures: DHIS2GeoJSONFeature[],
): BoundaryFeature[] {
  const convertedFeatures: BoundaryFeature[] = geoFeatures
    .filter(
      feature =>
        feature.geometry && feature.geometry.coordinates && feature.properties,
    )
    .map(feature => ({
      type: 'Feature' as const,
      id: feature.id,
      properties: {
        id: feature.properties.id || feature.id,
        name: feature.properties.name || feature.id,
        level: feature.properties.level || 1,
        parentId: feature.properties.parent || '',
        parentName: feature.properties.parentName || '',
        hasChildrenWithCoordinates:
          feature.properties.hasCoordinatesDown ?? true,
        hasParentWithCoordinates: feature.properties.hasCoordinatesUp ?? true,
      },
      geometry: feature.geometry,
    }));

  return filterValidFeatures(convertedFeatures);
}

type StaticGeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties?: Record<string, any>;
    geometry: any;
    id?: string;
  }>;
};

const staticGeoJsonCollectionCache = new Map<
  string,
  StaticGeoJsonFeatureCollection | null
>();

async function loadGeoJsonCollectionFromAsset(
  asset: unknown,
): Promise<StaticGeoJsonFeatureCollection | null> {
  if (
    asset &&
    typeof asset === 'object' &&
    'default' in (asset as Record<string, unknown>)
  ) {
    return loadGeoJsonCollectionFromAsset(
      (asset as Record<string, unknown>).default,
    );
  }

  if (asset && typeof asset === 'object') {
    const asCollection = asset as StaticGeoJsonFeatureCollection;
    return Array.isArray(asCollection.features) ? asCollection : null;
  }

  if (typeof asset !== 'string') {
    return null;
  }

  if (asset.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(asset) as StaticGeoJsonFeatureCollection;
      return Array.isArray(parsed?.features) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (staticGeoJsonCollectionCache.has(asset)) {
    return staticGeoJsonCollectionCache.get(asset) || null;
  }

  try {
    const response = await fetch(asset);
    if (!response.ok) {
      staticGeoJsonCollectionCache.set(asset, null);
      return null;
    }
    const parsed =
      (await response.json()) as Partial<StaticGeoJsonFeatureCollection>;
    const collection = Array.isArray(parsed?.features)
      ? (parsed as StaticGeoJsonFeatureCollection)
      : null;
    staticGeoJsonCollectionCache.set(asset, collection);
    return collection;
  } catch {
    staticGeoJsonCollectionCache.set(asset, null);
    return null;
  }
}

async function loadStaticUgFeatures(levels: number[]): Promise<DHIS2GeoJSONFeature[]> {
  const parseGeoJsonAsset = (
    asset: unknown,
  ) => loadGeoJsonCollectionFromAsset(asset);

  const countryMapCollection = await parseGeoJsonAsset(ugandaCountryMapGeoJson);
  const rawFeatures: any[] = [];
  const requestedLevels = Array.isArray(levels)
    ? levels.filter(level => level === 2 || level === 3)
    : [];
  const normalizedLevels =
    requestedLevels.length > 0 ? requestedLevels : [3];

  if (countryMapCollection?.features?.length) {
    rawFeatures.push(...countryMapCollection.features);
  }

  if (rawFeatures.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[UGMaps] Static GeoJSON load returned no features', {
      normalizedLevels,
      hasCountryMapCollection: Boolean(countryMapCollection),
      countryMapFeatureCount: countryMapCollection?.features?.length || 0,
      countryMapAssetType: typeof ugandaCountryMapGeoJson,
    });
  }

  const normalized = rawFeatures.map((feature, index) => {
    const properties = feature.properties || {};
    const id =
      String(
        properties.id ||
          properties.uid ||
          properties.ISO ||
          properties.code ||
          feature.id ||
          `ug-${index}`,
      ).trim() || `ug-${index}`;
    const name = String(
      properties.name ||
        properties.NAME_1 ||
        properties.NAME ||
        properties.NAME_2 ||
        id,
    ).trim();
    const level = Number.isFinite(Number(properties.level))
      ? Number(properties.level)
      : String(properties.ISO || '').startsWith('UG-')
        ? 3
        : normalizedLevels.includes(2) && !normalizedLevels.includes(3)
          ? 2
          : 3;

    return {
      type: 'Feature',
      id,
      properties: {
        ...properties,
        id,
        name,
        level,
        parent: properties.parent || '',
        parentName: properties.parentName || '',
        hasCoordinatesDown: true,
        hasCoordinatesUp: true,
      },
      geometry: feature.geometry,
    } as DHIS2GeoJSONFeature;
  });
  const invalidCount = normalized.filter(
    feature =>
      !String(feature.properties?.name || '').trim() ||
      !String(feature.properties?.id || '').trim(),
  ).length;
  if (invalidCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[UGMaps] ${invalidCount} boundary features are missing id/name after normalization.`,
    );
  }

  return normalized;
}

function buildAggregatedValueMaps(options: {
  rows: Record<string, any>[];
  requestedOrgUnitColumn: string;
  geoJoinKeyColumn?: string;
  metric: string;
  aggregationMethod: AggregationMethod;
  actualOrgUnitColumn?: string;
  actualMetricColumn?: string;
  datasourceColumns?: DHIS2DatasourceColumn[];
  ouLevelFilter?: number;
}) {
  const {
    rows,
    requestedOrgUnitColumn,
    geoJoinKeyColumn,
    metric,
    aggregationMethod,
    actualOrgUnitColumn,
    actualMetricColumn,
    datasourceColumns = [],
    ouLevelFilter,
  } = options;
  const metricMapById = new Map<string, number>();
  const metricMapByName = new Map<string, number>();
  const metricMapByGeoKey = new Map<string, number>();
  const orgUnitData = new Map<string, number[]>();
  const geoJoinData = new Map<string, number[]>();

  if (!rows.length) {
    return {
      dataMap: metricMapById,
      dataMapByName: metricMapByName,
      dataMapByGeoKey: metricMapByGeoKey,
    };
  }

  const availableColumns = Object.keys(rows[0]);
  const actualOrgUnitCol =
    (actualOrgUnitColumn && availableColumns.includes(actualOrgUnitColumn)
      ? actualOrgUnitColumn
      : undefined) ||
    resolveQueryDimensionColumnName({
      requestedColumn: requestedOrgUnitColumn,
      datasourceColumns,
      availableColumns,
    }) ||
    resolveLoaderDimensionColumnName({
      requestedColumn: requestedOrgUnitColumn,
      datasourceColumns,
      availableColumns,
    });
  const actualMetricCol =
    (actualMetricColumn && availableColumns.includes(actualMetricColumn)
      ? actualMetricColumn
      : undefined) ||
    resolveQueryMetricColumnName({
      metric,
      datasourceColumns,
      availableColumns,
      rows,
    }) ||
    resolveLoaderMetricColumnName({
      metric,
      datasourceColumns,
      availableColumns,
    });
  const actualGeoJoinKeyCol =
    geoJoinKeyColumn && availableColumns.includes(geoJoinKeyColumn)
      ? geoJoinKeyColumn
      : undefined;

  if (!actualOrgUnitCol || !actualMetricCol) {
    return {
      dataMap: metricMapById,
      dataMapByName: metricMapByName,
      dataMapByGeoKey: metricMapByGeoKey,
    };
  }

  // Find ou_level column for filtering
  const ouLevelColName =
    ouLevelFilter !== undefined
      ? availableColumns.find(col => {
          const datasourceCol = datasourceColumns.find(
            c => c.column_name === col,
          );
          const extra = parseColumnExtra(datasourceCol?.extra);
          return extra?.dhis2_is_ou_level === true;
        })
      : undefined;

  rows.forEach(row => {
    // If a level filter is requested and the row has a level, skip rows that
    // don't match the target level. This prevents double-counting across levels
    // when data exists at multiple OU levels.
    // Guard: treat null/undefined ou_level as "unknown level" — include the row
    // rather than filtering it out. NULL ou_level is common in DuckDB serving
    // tables when the DHIS2 analytics API omits the level field. Incorrectly
    // treating null as level 0 would skip ALL rows, producing "No Data".
    if (ouLevelFilter !== undefined && ouLevelColName) {
      const rawLevel = row[ouLevelColName];
      if (rawLevel !== null && rawLevel !== undefined) {
        const rowLevel = Number(rawLevel);
        if (Number.isFinite(rowLevel) && rowLevel !== ouLevelFilter) {
          return;
        }
      }
      // null/undefined ou_level: cannot determine level → include the row
    }

    const orgUnitValue = row[actualOrgUnitCol];
    const metricValue = row[actualMetricCol];
    const geoJoinValue = actualGeoJoinKeyCol ? row[actualGeoJoinKeyCol] : null;

    if (orgUnitValue === undefined || orgUnitValue === null) {
      return;
    }

    const id = String(orgUnitValue).trim();
    const numValue = Number(metricValue);
    if (!id || Number.isNaN(numValue)) {
      return;
    }

    const values = orgUnitData.get(id) || [];
    values.push(numValue);
    orgUnitData.set(id, values);

    if (geoJoinValue !== undefined && geoJoinValue !== null) {
      const normalizedGeoJoinValue = normalizeOrgUnitMatchKey(geoJoinValue);
      if (normalizedGeoJoinValue) {
        const geoValues = geoJoinData.get(normalizedGeoJoinValue) || [];
        geoValues.push(numValue);
        geoJoinData.set(normalizedGeoJoinValue, geoValues);
      }
    }
  });

  orgUnitData.forEach((values, id) => {
    let aggregatedValue: number;
    switch (aggregationMethod) {
      case 'none':
        aggregatedValue = values[values.length - 1];
        break;
      case 'sum':
        aggregatedValue = values.reduce((left, right) => left + right, 0);
        break;
      case 'average':
        aggregatedValue =
          values.reduce((left, right) => left + right, 0) / values.length;
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'latest':
        aggregatedValue = values[values.length - 1];
        break;
      default:
        aggregatedValue = values.reduce((left, right) => left + right, 0);
    }

    metricMapById.set(id, aggregatedValue);
    buildOrgUnitMatchKeys(id).forEach(key => {
      if (!metricMapByName.has(key)) {
        metricMapByName.set(key, aggregatedValue);
      }
    });

  });

  geoJoinData.forEach((values, geoKey) => {
    let aggregatedValue: number;
    switch (aggregationMethod) {
      case 'none':
        aggregatedValue = values[values.length - 1];
        break;
      case 'sum':
        aggregatedValue = values.reduce((left, right) => left + right, 0);
        break;
      case 'average':
        aggregatedValue =
          values.reduce((left, right) => left + right, 0) / values.length;
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'latest':
        aggregatedValue = values[values.length - 1];
        break;
      default:
        aggregatedValue = values.reduce((left, right) => left + right, 0);
    }
    metricMapByGeoKey.set(geoKey, aggregatedValue);
  });

  return {
    dataMap: metricMapById,
    dataMapByName: metricMapByName,
    dataMapByGeoKey: metricMapByGeoKey,
  };
}

function resolveFeatureValueFromMaps(
  feature: BoundaryFeature,
  dataMap: Map<string, number>,
  dataMapByName: Map<string, number>,
  dataMapByGeoKey: Map<string, number>,
  geoJoinFeatureProperty?: string,
): number | undefined {
  const featureProperties = (feature.properties || {}) as Record<string, any>;
  const resolvedGeoJoinProperty = String(
    geoJoinFeatureProperty || 'name',
  ).trim();
  if (resolvedGeoJoinProperty) {
    const rawGeoJoinValue = featureProperties[resolvedGeoJoinProperty];
    const normalizedGeoJoinValue = normalizeOrgUnitMatchKey(rawGeoJoinValue);
    if (normalizedGeoJoinValue) {
      const joinedValue = dataMapByGeoKey.get(normalizedGeoJoinValue);
      if (joinedValue !== undefined) {
        return joinedValue;
      }
    }
  }

  let value = dataMap.get(feature.id);
  if (value !== undefined) {
    return value;
  }

  const matchKeys = [
    ...buildOrgUnitMatchKeys(feature.id),
    ...buildOrgUnitMatchKeys(feature.properties?.name),
  ];

  for (const key of matchKeys) {
    value = dataMapByName.get(key);
    if (value !== undefined) {
      return value;
    }
  }

  const normalizedFeatureName = normalizeOrgUnitMatchKey(
    feature.properties?.name,
  );
  if (normalizedFeatureName) {
    for (const [key, val] of dataMap.entries()) {
      const normalizedKey = normalizeOrgUnitMatchKey(key);
      if (
        normalizedKey === normalizedFeatureName ||
        normalizedKey.includes(normalizedFeatureName) ||
        normalizedFeatureName.includes(normalizedKey)
      ) {
        return val;
      }
    }
  }

  return undefined;
}

const EMPTY_NUMERIC_MAP = new Map<string, number>();

function resolveFallbackFocusHierarchyColumn(options: {
  currentOrgUnitColumn: string;
  requestedChildColumn: string;
  availableColumns: string[];
}): string | undefined {
  const { currentOrgUnitColumn, requestedChildColumn, availableColumns } =
    options;
  if (!availableColumns.length) {
    return undefined;
  }

  const normalizeColumn = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  const hierarchyCandidates = availableColumns.filter(columnName => {
    const normalized = normalizeColumn(columnName);
    return (
      normalized !== 'period' &&
      normalized !== 'dhis2_instance' &&
      !normalized.startsWith('c_')
    );
  });

  if (!hierarchyCandidates.length) {
    return undefined;
  }

  if (hierarchyCandidates.includes(requestedChildColumn)) {
    return requestedChildColumn;
  }

  const currentIndex = hierarchyCandidates.indexOf(currentOrgUnitColumn);
  if (currentIndex >= 0 && currentIndex < hierarchyCandidates.length - 1) {
    return hierarchyCandidates[currentIndex + 1];
  }

  return undefined;
}

function DHIS2Map({
  data,
  width,
  height,
  chartTitle,
  chartSubtitle,
  chartTitleColor,
  chartSubtitleColor,
  chartTitleAlign = 'center',
  databaseId,
  isStagedLocalDataset = false,
  stagedDatasetId,
  sourceInstanceIds = [],
  orgUnitColumn,
  metric,
  metricLabel,
  primaryBoundaryLevel,
  aggregationMethod = 'sum',
  boundaryLevels,
  boundaryLevelLabels = {},
  boundaryLevelColumns = {},
  levelBorderColors,
  enableDrill,
  colorScheme,
  linearColorScheme,
  useLinearColorScheme = true,
  chartBackgroundColor,
  transparentCardContainer = false,
  boundaryFocusMaskStyle = 'off',
  basemapStyle = 'osmLight',
  labelTextColor,
  opacity,
  strokeColor,
  strokeWidth,
  autoThemeBorders = false,
  showAllBoundaries = false,
  focusSelectedBoundaryWithChildren = false,
  styleUnselectedAreas = true,
  unselectedAreaFillColor = { r: 241, g: 245, b: 249, a: 1 },
  unselectedAreaFillOpacity = 0.45,
  unselectedAreaBorderColor = { r: 148, g: 163, b: 184, a: 1 },
  unselectedAreaBorderWidth = 0.75,
  showLabels,
  labelType,
  labelFontSize,
  showLegend,
  legendPosition,
  legendDisplayType = 'vertical_list',
  legendClasses,
  legendType = 'auto',
  legendMin,
  legendMax,
  manualBreaks,
  manualColors,
  stagedLegendDefinition,
  legendReverseColors = false,
  legendNoDataColor = { r: 204, g: 204, b: 204, a: 1 },
  compassVisible = false,
  compassPosition = 'topright',
  compassStyle = 'north_badge',
  tooltipColumns,
  hideQuickFilters = false,
  activeFilters = [],
  datasetSql = '',
  isDHIS2Dataset = false,
  datasetId,
  chartId,
  dashboardId,
  datasourceColumns = [],
  geoJoinKeyColumn,
  geoJoinFeatureProperty = 'NAME_1',
  boundaryLoadMethod = 'geoFeatures',
  ouHierarchyColumns = [],
  periodColumns = [],
}: DHIS2MapProps): ReactElement {
  const metricDisplayName = metricLabel || metric;
  const hasQueryData = data.length > 0;
  const sourceInstanceIdsInputKey = useMemo(
    () =>
      (Array.isArray(sourceInstanceIds) ? sourceInstanceIds : [])
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right)
        .join(','),
    [sourceInstanceIds],
  );
  const normalizedSourceInstanceIds = useMemo(
    () =>
      sourceInstanceIdsInputKey
        ? sourceInstanceIdsInputKey
            .split(',')
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value > 0)
        : [],
    [sourceInstanceIdsInputKey],
  );
  // Live legend definition fetched directly from the API when the chart is
  // rendered in a dashboard (where the control-panel never runs and localStorage
  // may be empty).  Used as a fallback when stagedLegendDefinition is undefined.
  const [liveLegendDefinition, setLiveLegendDefinition] = useState<
    DHIS2LegendDefinition | undefined
  >(undefined);
  const shouldSyncDhis2LegendSets = useMemo(
    () =>
      (legendType === 'staged' || Boolean(stagedLegendDefinition)) &&
      (isDHIS2Dataset || hasDHIS2SqlComment(datasetSql || '')),
    [datasetSql, isDHIS2Dataset, legendType, stagedLegendDefinition],
  );

  useEffect(() => {
    if (!databaseId || !shouldSyncDhis2LegendSets) return;
    let cancelled = false;

    syncDHIS2LegendSchemesForDatabase(databaseId, { chartId, dashboardId })
      .then(() => {
        if (cancelled) return;
        const cachedSets = readCachedLegendSets(databaseId);
        if (!cachedSets.length) return;

        // Prefer the metric column's inline dhis2_legend definition
        const metricCol = datasourceColumns.find(c => {
          const colName = String(c.column_name || '').trim();
          return (
            colName === metric || sanitizeDHIS2ColumnName(colName) === metric
          );
        });
        let colExtra: Record<string, any> | null = null;
        if (metricCol?.extra) {
          try {
            colExtra =
              typeof metricCol.extra === 'string'
                ? JSON.parse(metricCol.extra as string)
                : (metricCol.extra as Record<string, any>);
          } catch {
            colExtra = null;
          }
        }
        const inlineDef = colExtra?.dhis2_legend ?? colExtra?.dhis2Legend;
        if (
          inlineDef &&
          Array.isArray(inlineDef.items) &&
          inlineDef.items.length > 0
        ) {
          setLiveLegendDefinition(inlineDef as DHIS2LegendDefinition);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    databaseId,
    datasourceColumns,
    metric,
    shouldSyncDhis2LegendSets,
    chartId,
    dashboardId,
  ]);

  const effectiveStagedLegendDefinition = useMemo(() => {
    // Use staged DHIS2 legend ranges by default, but leave explicit manual
    // algorithm choice in control of the chart author.
    // liveLegendDefinition is a fallback populated via useEffect for dashboard
    // views where the control-panel never pre-populates localStorage.
    const resolved = stagedLegendDefinition ?? liveLegendDefinition;
    if (!resolved?.items?.length) {
      return undefined;
    }
    if (legendType === 'manual') {
      return undefined;
    }
    return resolved as DHIS2LegendDefinition;
  }, [legendType, stagedLegendDefinition, liveLegendDefinition]);

  const inferredPrimaryBoundaryLevel = useMemo(
    () =>
      Number.isFinite(primaryBoundaryLevel) && Number(primaryBoundaryLevel) > 0
        ? Number(primaryBoundaryLevel)
        : undefined,
    [primaryBoundaryLevel],
  );

  const resolvedPrimaryBoundaryLevel = useMemo(
    () =>
      resolvePrimaryBoundaryLevel(inferredPrimaryBoundaryLevel, boundaryLevels),
    [boundaryLevels, inferredPrimaryBoundaryLevel],
  );

  const effectiveBoundaryLevels = useMemo(() => {
    const configuredLevels = resolveEffectiveBoundaryLevels(
      inferredPrimaryBoundaryLevel,
      boundaryLevels,
    );

    // By default the map should render the thematic OU level only.
    // Extra configured levels are preserved when the user explicitly keeps
    // outer boundaries visible.
    if (!showAllBoundaries) {
      return [resolvedPrimaryBoundaryLevel];
    }

    return configuredLevels;
  }, [
    boundaryLevels,
    inferredPrimaryBoundaryLevel,
    resolvedPrimaryBoundaryLevel,
    showAllBoundaries,
  ]);

  const maxAvailableBoundaryLevel = useMemo(() => {
    const knownLevels = [
      ...Object.keys(boundaryLevelLabels || {}).map(value => Number(value)),
      ...effectiveBoundaryLevels,
      resolvedPrimaryBoundaryLevel,
    ].filter(value => Number.isFinite(value) && value > 0);
    return knownLevels.length ? Math.max(...knownLevels) : undefined;
  }, [
    boundaryLevelLabels,
    effectiveBoundaryLevels,
    resolvedPrimaryBoundaryLevel,
  ]);

  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);
  const [focusedParentBoundaries, setFocusedParentBoundaries] = useState<
    BoundaryFeature[]
  >([]);
  const [activeFocusedBoundaryRequest, setActiveFocusedBoundaryRequest] =
    useState<FocusedBoundaryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boundaryPendingRetryCount, setBoundaryPendingRetryCount] = useState(0);
  const [boundaryPendingStalled, setBoundaryPendingStalled] = useState(false);
  const [drillState, setDrillState] = useState<DrillState>({
    currentLevel: resolvedPrimaryBoundaryLevel,
    parentId: null,
    parentName: null,
    breadcrumbs: [],
  });
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null,
  );
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [dhis2Data, setDhis2Data] = useState<Record<string, any>[] | null>(
    null,
  );
  const [stagedLocalData, setStagedLocalData] = useState<
    Record<string, any>[] | null
  >(null);
  const [stagedLocalDataColumns, setStagedLocalDataColumns] = useState<
    string[] | null
  >(null);
  const [dhis2DataColumns, setDhis2DataColumns] = useState<
    DHIS2LoaderColumnDefinition[] | null
  >(null);
  const [dhis2DataLoading, setDhis2DataLoading] = useState(false);
  const [stagedLocalDataLoading, setStagedLocalDataLoading] = useState(false);
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, string[]>>(
    {},
  );
  const [interactionEnabled, setInteractionEnabled] = useState(true);
  const [currentBasemap, setCurrentBasemap] = useState<BaseMapType>(() => {
    if (typeof window !== 'undefined' && chartId) {
      try {
        const stored = window.localStorage.getItem(
          `dhis2_map_basemap_chart_${chartId}`,
        );
        if (stored && stored in BASE_MAPS) {
          return stored as BaseMapType;
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
    return basemapStyle as BaseMapType;
  });
  const [resolvedDatasetSql, setResolvedDatasetSql] = useState(datasetSql);
  const [resolvedIsDHIS2Dataset, setResolvedIsDHIS2Dataset] =
    useState(isDHIS2Dataset);
  const lastLoadedDhis2RequestKeyRef = useRef<string | null>(null);
  const lastLoadedBoundaryRequestKeyRef = useRef<string | null>(null);
  const lastNoMatchBoundaryRefreshKeyRef = useRef<string | null>(null);
  const boundaryPendingRetryTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  // Track whether we've had a successful databaseId at least once — while it
  // has never been set, we suppress the "no database" error (the datasource
  // may still be loading).
  const lastLoadedStagedLocalRequestKeyRef = useRef<string | null>(null);
  const inFlightStagedLocalRequestKeyRef = useRef<string | null>(null);
  const stagedLocalFocusCacheRef = useRef<
    Map<string, { rows: Record<string, any>[]; columns: string[] }>
  >(new Map());
  const effectiveStagedDatasetId = useMemo(
    () =>
      stagedDatasetId ||
      getStagedDatasetIdFromSql(resolvedDatasetSql) ||
      getStagedDatasetIdFromSql(datasetSql),
    [datasetSql, resolvedDatasetSql, stagedDatasetId],
  );
  const effectiveIsStagedLocalDataset = useMemo(
    () =>
      isStagedLocalDataset ||
      Boolean(effectiveStagedDatasetId) ||
      hasStagedLocalServingSql(resolvedDatasetSql) ||
      hasStagedLocalServingSql(datasetSql),
    [
      datasetSql,
      effectiveStagedDatasetId,
      isStagedLocalDataset,
      resolvedDatasetSql,
    ],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && chartId) {
      try {
        const stored = window.localStorage.getItem(
          `dhis2_map_basemap_chart_${chartId}`,
        );
        if (stored && stored in BASE_MAPS) {
          setCurrentBasemap(stored as BaseMapType);
          return;
        }
      } catch {
        // Ignore localStorage read errors
      }
    }
    setCurrentBasemap(basemapStyle as BaseMapType);
  }, [basemapStyle, chartId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && chartId) {
      try {
        window.localStorage.setItem(
          `dhis2_map_basemap_chart_${chartId}`,
          currentBasemap,
        );
      } catch {
        // Ignore localStorage write errors
      }
    }
  }, [currentBasemap, chartId]);
  const effectiveDataBoundaryLevel = useMemo(
    () =>
      resolveFocusedDataLevel(
        drillState.currentLevel,
        activeFocusedBoundaryRequest,
      ),
    [activeFocusedBoundaryRequest, drillState.currentLevel],
  );
  const parentSelectionColumn = useMemo(
    () => boundaryLevelColumns?.[resolvedPrimaryBoundaryLevel] || orgUnitColumn,
    [boundaryLevelColumns, orgUnitColumn, resolvedPrimaryBoundaryLevel],
  );
  const hierarchyColumns = useMemo(
    () => buildHierarchyColumns(boundaryLevelColumns),
    [boundaryLevelColumns],
  );
  const prefetchFocusedChildLevel = useMemo(() => {
    if (
      activeFocusedBoundaryRequest?.childLevel &&
      Number.isFinite(activeFocusedBoundaryRequest.childLevel)
    ) {
      return activeFocusedBoundaryRequest.childLevel;
    }
    if (
      !focusSelectedBoundaryWithChildren ||
      !Number.isFinite(resolvedPrimaryBoundaryLevel) ||
      resolvedPrimaryBoundaryLevel <= 0
    ) {
      return undefined;
    }
    if (
      Number.isFinite(maxAvailableBoundaryLevel) &&
      Number(maxAvailableBoundaryLevel) > 0 &&
      resolvedPrimaryBoundaryLevel >= Number(maxAvailableBoundaryLevel)
    ) {
      return undefined;
    }
    return resolvedPrimaryBoundaryLevel + 1;
  }, [
    activeFocusedBoundaryRequest,
    focusSelectedBoundaryWithChildren,
    maxAvailableBoundaryLevel,
    resolvedPrimaryBoundaryLevel,
  ]);
  const effectiveOrgUnitColumn = useMemo(
    () =>
      geoJoinKeyColumn ||
      boundaryLevelColumns?.[effectiveDataBoundaryLevel] ||
      (Number.isFinite(effectiveDataBoundaryLevel)
        ? `ou_level_${effectiveDataBoundaryLevel}`
        : orgUnitColumn),
    [
      boundaryLevelColumns,
      effectiveDataBoundaryLevel,
      geoJoinKeyColumn,
      orgUnitColumn,
    ],
  );
  const prefetchFocusedOrgUnitColumn = useMemo(
    () =>
      boundaryLevelColumns?.[prefetchFocusedChildLevel || 0] ||
      (Number.isFinite(prefetchFocusedChildLevel)
        ? `ou_level_${prefetchFocusedChildLevel}`
        : effectiveOrgUnitColumn),
    [boundaryLevelColumns, effectiveOrgUnitColumn, prefetchFocusedChildLevel],
  );
  const effectiveDataParentId = useMemo(() => {
    if (activeFocusedBoundaryRequest?.parentIds?.length === 1) {
      return activeFocusedBoundaryRequest.parentIds[0];
    }
    return drillState.parentId;
  }, [activeFocusedBoundaryRequest, drillState.parentId]);
  const shouldUseLoaderData = useMemo(
    () =>
      shouldUseDHIS2LoaderData({
        databaseId,
        datasetSql: resolvedDatasetSql,
        isDHIS2Dataset: resolvedIsDHIS2Dataset,
        isStagedLocalDataset: effectiveIsStagedLocalDataset,
      }),
    [
      databaseId,
      effectiveIsStagedLocalDataset,
      resolvedDatasetSql,
      resolvedIsDHIS2Dataset,
    ],
  );
  const dhis2DataRequestKey = useMemo(
    () =>
      [
        databaseId ?? 'none',
        resolvedDatasetSql ?? '',
        effectiveDataBoundaryLevel ?? 'none',
        activeFocusedBoundaryRequest?.parentIds?.sort().join(',') ||
          effectiveDataParentId ||
          'root',
      ].join('|'),
    [
      activeFocusedBoundaryRequest,
      databaseId,
      effectiveDataBoundaryLevel,
      effectiveDataParentId,
      resolvedDatasetSql,
    ],
  );
  const handleMapInstanceReady = useCallback((map: L.Map) => {
    setMapInstance(currentMap => (currentMap === map ? currentMap : map));
  }, []);

  useEffect(() => {
    setDrillState(previousState => {
      if (
        previousState.breadcrumbs.length > 0 ||
        previousState.parentId !== null ||
        previousState.currentLevel === resolvedPrimaryBoundaryLevel
      ) {
        return previousState;
      }
      return {
        ...previousState,
        currentLevel: resolvedPrimaryBoundaryLevel,
      };
    });
  }, [resolvedPrimaryBoundaryLevel]);

  // Resolve dataset SQL/params when missing (e.g., production payload lacks SQL)
  useEffect(() => {
    let mounted = true;

    const hasComment =
      hasDHIS2SqlComment(datasetSql) || datasetSql?.includes('-- DHIS2:');
    const shouldResolveDatasetSql = shouldResolveDHIS2DatasetSql({
      datasetId,
      datasetSql,
      isDHIS2Dataset,
      isStagedLocalDataset: effectiveIsStagedLocalDataset,
      databaseId,
      sourceInstanceIds: normalizedSourceInstanceIds,
    });

    if (!shouldResolveDatasetSql) {
      setResolvedDatasetSql(datasetSql);
      setResolvedIsDHIS2Dataset(isDHIS2Dataset || hasComment);
      return () => {
        mounted = false;
      };
    }

    SupersetClient.get({
      endpoint: `/api/v1/dataset/${datasetId}`,
      ignoreUnauthorized: true,
    })
      .then(response => {
        if (!mounted) return;
        const ds = response.json?.result || {};
        let sql: string = ds.sql || '';
        let isDHIS2 = sql.includes('/* DHIS2:') || sql.includes('-- DHIS2:');

        if (!isDHIS2) {
          const extraRaw = ds.extra;
          let extraParsed: any;
          try {
            extraParsed =
              typeof extraRaw === 'string' ? JSON.parse(extraRaw) : extraRaw;
          } catch {
            extraParsed = null;
          }

          const dhis2ParamsMap = extraParsed?.dhis2_params;
          if (dhis2ParamsMap) {
            const tableName = ds.table_name || ds.table?.name || ds.name;
            let dhis2Params: string | undefined =
              (tableName && dhis2ParamsMap[tableName]) || undefined;
            if (!dhis2Params) {
              const values = Object.values(dhis2ParamsMap);
              if (values.length === 1) {
                dhis2Params = String(values[0]);
              }
            }
            if (dhis2Params) {
              const safeTable = tableName || 'analytics';
              sql = `SELECT * FROM ${safeTable}\n/* DHIS2: ${dhis2Params} */`;
              isDHIS2 = true;
            }
          }
        }

        setResolvedDatasetSql(sql);
        setResolvedIsDHIS2Dataset(isDHIS2);
      })
      .catch(() => {
        if (!mounted) return;
        setResolvedDatasetSql(datasetSql);
        setResolvedIsDHIS2Dataset(isDHIS2Dataset);
      });

    return () => {
      mounted = false;
    };
  }, [
    databaseId,
    datasetId,
    chartId,
    dashboardId,
    datasetSql,
    hasQueryData,
    isDHIS2Dataset,
    effectiveIsStagedLocalDataset,
    effectiveStagedDatasetId,
    normalizedSourceInstanceIds,
  ]);

  // Fetch DHIS2 data using the preview endpoint when standard data is empty
  // This uses the same approach as DataPreview which successfully loads DHIS2 data
  useEffect(() => {
    if (
      !shouldUseLoaderData ||
      !databaseId ||
      !resolvedDatasetSql ||
      lastLoadedDhis2RequestKeyRef.current === dhis2DataRequestKey
    ) {
      if (!shouldUseLoaderData) {
        setDhis2DataColumns(null);
      }
      return;
    }

    setDhis2DataLoading(true);
    setError(null);
    setDhis2DataColumns(null);

    DHIS2DataLoader.fetchChartData(
      databaseId,
      resolvedDatasetSql,
      10000,
      effectiveDataBoundaryLevel,
      effectiveDataParentId,
    )
      .then(result => {
        if (result && result.rows.length > 0) {
          setDhis2Data(result.rows);
          setDhis2DataColumns(result.columns || []);
          setLoading(false);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[DHIS2Map] Empty data returned from DHIS2');
          setError(
            'No data returned from DHIS2. Verify: 1) DHIS2 database connection, 2) Dataset has DHIS2 parameters in SQL comment /* DHIS2: ... */, 3) Selected period and org units have data in DHIS2',
          );
          setDhis2DataColumns(result?.columns || []);
          setLoading(false);
        }
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('[DHIS2Map] Failed to fetch DHIS2 data:', err);
        const errorMessage = err.message || 'Unknown error';

        let displayError = `Failed to load DHIS2 data: ${errorMessage}`;
        if (errorMessage.includes('DHIS2 SQL format')) {
          displayError = `Invalid dataset SQL. Expected format: /* DHIS2: dx=id1;id2&pe=period&ou=ouId&ouMode=DESCENDANTS */`;
        }
        setError(displayError);
        setDhis2DataColumns(null);
        setLoading(false);
      })
      .finally(() => {
        lastLoadedDhis2RequestKeyRef.current = dhis2DataRequestKey;
        setDhis2DataLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    databaseId,
    resolvedDatasetSql,
    shouldUseLoaderData,
    dhis2DataRequestKey,
    // dhis2DataLoading intentionally excluded — including it caused the effect
    // to re-run on every load-state toggle, generating spurious fetches.
    // The lastLoadedDhis2RequestKeyRef guard is sufficient to deduplicate.
    // data (queriesData) intentionally excluded — SQL query rows should not
    // retrigger the DHIS2 API fetch; the request key captures all meaningful changes.
    effectiveDataBoundaryLevel,
    effectiveDataParentId,
    activeFocusedBoundaryRequest,
  ]);

  const chartData = useMemo(
    () => resolveDHIS2MapData(data, dhis2Data, shouldUseLoaderData),
    [data, dhis2Data, shouldUseLoaderData],
  );

  const chartDataColumns = useMemo(
    () =>
      Array.from(
        new Set(
          chartData.flatMap(row => Object.keys(row || {})).filter(Boolean),
        ),
      ),
    [chartData],
  );

  const stagedLocalFocusParentValues = useMemo(() => {
    const selectedParentValues = Array.from(
      new Set(
        (activeFocusedBoundaryRequest?.selectedParents || [])
          .map(feature => String(feature.properties?.name || '').trim())
          .filter(Boolean),
      ),
    );
    if (selectedParentValues.length > 0) {
      return selectedParentValues;
    }
    if (
      !effectiveIsStagedLocalDataset ||
      !focusSelectedBoundaryWithChildren ||
      !parentSelectionColumn ||
      !chartData.length
    ) {
      return [];
    }

    const resolvedParentColumn = resolveQueryDimensionColumnName({
      requestedColumn: parentSelectionColumn,
      datasourceColumns,
      availableColumns: chartDataColumns,
    });
    if (!resolvedParentColumn) {
      return [];
    }

    return Array.from(
      new Set(
        chartData
          .map(row => String(row?.[resolvedParentColumn] ?? '').trim())
          .filter(Boolean),
      ),
    );
  }, [
    activeFocusedBoundaryRequest,
    chartData,
    chartDataColumns,
    datasourceColumns,
    effectiveIsStagedLocalDataset,
    focusSelectedBoundaryWithChildren,
    parentSelectionColumn,
  ]);

  const shouldFetchStagedLocalFocusData = useMemo(
    () =>
      shouldLoadStagedLocalFocusData({
        isStagedLocalDataset: effectiveIsStagedLocalDataset,
        stagedDatasetId: effectiveStagedDatasetId,
        focusSelectedBoundaryWithChildren,
        focusedChildLevel: prefetchFocusedChildLevel,
        chartRows: chartData,
        chartColumns: chartDataColumns,
        requestedChildColumn: prefetchFocusedOrgUnitColumn,
        requestedMetric: metric,
        datasourceColumns,
        hierarchyColumns,
      }),
    [
      chartData,
      chartDataColumns,
      datasourceColumns,
      effectiveIsStagedLocalDataset,
      effectiveStagedDatasetId,
      focusSelectedBoundaryWithChildren,
      hierarchyColumns,
      metric,
      prefetchFocusedChildLevel,
      prefetchFocusedOrgUnitColumn,
    ],
  );

  const stagedLocalFocusSelectedColumns = useMemo(
    () =>
      Array.from(
        new Set(
          [
            parentSelectionColumn,
            prefetchFocusedOrgUnitColumn,
            metric,
            ...tooltipColumns,
            ...activeFilters.map(filter => String(filter.col || '').trim()),
          ].filter(Boolean),
        ),
      ),
    [
      activeFilters,
      metric,
      parentSelectionColumn,
      prefetchFocusedOrgUnitColumn,
      tooltipColumns,
    ],
  );

  const stagedLocalFocusAggregateQuery = useMemo(
    () =>
      buildFocusedStagedLocalAggregateQuery({
        aggregationMethod,
        metric,
        selectedOrgUnitColumn: prefetchFocusedOrgUnitColumn,
        parentSelectionColumn,
        tooltipColumns,
        datasourceColumns,
      }),
    [
      aggregationMethod,
      datasourceColumns,
      metric,
      parentSelectionColumn,
      prefetchFocusedOrgUnitColumn,
      tooltipColumns,
    ],
  );

  const stagedLocalFocusRequestFilters = useMemo(
    () =>
      buildFocusedStagedLocalQueryFilters({
        parentSelectionColumn,
        parentValues: stagedLocalFocusParentValues,
        activeFilters,
        selectedOrgUnitColumn: prefetchFocusedOrgUnitColumn,
        hierarchyColumns,
      }),
    [
      activeFilters,
      hierarchyColumns,
      parentSelectionColumn,
      prefetchFocusedOrgUnitColumn,
      stagedLocalFocusParentValues,
    ],
  );

  const stagedLocalFocusRequestKey = useMemo(
    () =>
      [
        effectiveStagedDatasetId ?? 'none',
        parentSelectionColumn || 'none',
        prefetchFocusedOrgUnitColumn || 'none',
        metric || 'none',
        stagedLocalFocusAggregateQuery
          ? JSON.stringify(stagedLocalFocusAggregateQuery)
          : 'raw',
        stagedLocalFocusParentValues.join(',') || 'all',
        stagedLocalFocusSelectedColumns.join(',') || 'default',
        serializeStagedLocalQueryFilters(stagedLocalFocusRequestFilters),
      ].join('|'),
    [
      effectiveStagedDatasetId,
      metric,
      parentSelectionColumn,
      prefetchFocusedOrgUnitColumn,
      stagedLocalFocusAggregateQuery,
      stagedLocalFocusParentValues,
      stagedLocalFocusRequestFilters,
      stagedLocalFocusSelectedColumns,
    ],
  );

  useEffect(() => {
    if (!shouldFetchStagedLocalFocusData || !effectiveStagedDatasetId) {
      lastLoadedStagedLocalRequestKeyRef.current = null;
      inFlightStagedLocalRequestKeyRef.current = null;
      setStagedLocalData(null);
      setStagedLocalDataColumns(null);
      setStagedLocalDataLoading(false);
      return;
    }

    if (
      inFlightStagedLocalRequestKeyRef.current === stagedLocalFocusRequestKey ||
      lastLoadedStagedLocalRequestKeyRef.current === stagedLocalFocusRequestKey
    ) {
      return;
    }

    let cancelled = false;

    const cachedResult = stagedLocalFocusCacheRef.current.get(
      stagedLocalFocusRequestKey,
    );
    if (cachedResult) {
      setStagedLocalData(cachedResult.rows);
      setStagedLocalDataColumns(cachedResult.columns);
      lastLoadedStagedLocalRequestKeyRef.current = stagedLocalFocusRequestKey;
      return;
    }

    const loadAllStagedLocalRows = async () => {
      setStagedLocalData(null);
      setStagedLocalDataColumns(null);
      inFlightStagedLocalRequestKeyRef.current = stagedLocalFocusRequestKey;
      setStagedLocalDataLoading(true);
      try {
        const collectedRows: Record<string, any>[] = [];
        let resolvedColumns: string[] = [];
        let page = 1;
        let totalPages = 1;
        const requestFilters = stagedLocalFocusRequestFilters.length
          ? stagedLocalFocusRequestFilters
          : undefined;

        do {
          const response = await SupersetClient.post({
            endpoint: `/api/v1/dhis2/staged-datasets/${effectiveStagedDatasetId}/query`,
            jsonPayload: {
              columns: stagedLocalFocusAggregateQuery
                ? undefined
                : stagedLocalFocusSelectedColumns,
              filters: requestFilters,
              limit: 1000,
              page,
              group_by: stagedLocalFocusAggregateQuery?.groupByColumns,
              metric_column: stagedLocalFocusAggregateQuery?.metricColumn,
              metric_alias: stagedLocalFocusAggregateQuery?.metricAlias,
              aggregation_method:
                stagedLocalFocusAggregateQuery?.aggregationMethod,
            },
          });

          const result = response.json?.result || {};
          if (page === 1 && Array.isArray(result.columns)) {
            resolvedColumns = result.columns.filter(
              (value: unknown): value is string =>
                Boolean(String(value || '').trim()),
            );
          }
          if (Array.isArray(result.rows)) {
            collectedRows.push(...result.rows);
          }

          const nextTotalPages = Number(result.total_pages || 1);
          totalPages =
            Number.isFinite(nextTotalPages) && nextTotalPages > 0
              ? nextTotalPages
              : 1;
          page += 1;
        } while (page <= totalPages);

        if (cancelled) {
          return;
        }

        setStagedLocalData(collectedRows);
        const finalColumns = resolvedColumns.length
          ? resolvedColumns
          : Array.from(
              new Set(
                collectedRows
                  .flatMap(row => Object.keys(row || {}))
                  .filter(Boolean),
              ),
            );
        setStagedLocalDataColumns(finalColumns);
        stagedLocalFocusCacheRef.current.set(stagedLocalFocusRequestKey, {
          rows: collectedRows,
          columns: finalColumns,
        });
        lastLoadedStagedLocalRequestKeyRef.current = stagedLocalFocusRequestKey;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[DHIS2Map] Failed to load staged-local focus rows:', err);
      } finally {
        // Only reset loading when we are still the current in-flight request.
        // This covers both the normal case (fetch completes) and the cancellation
        // case where the effect re-ran with the same key (guard returned early):
        // the old fetch's finally will still clear loading, and since no new fetch
        // was started for the same key, the overlay correctly disappears.
        // If a NEW key's fetch is now in-flight, its ref won't match, so we do
        // NOT clear loading — that fetch's own finally will handle it.
        if (
          inFlightStagedLocalRequestKeyRef.current ===
          stagedLocalFocusRequestKey
        ) {
          inFlightStagedLocalRequestKeyRef.current = null;
          setStagedLocalDataLoading(false);
        }
      }
    };

    void loadAllStagedLocalRows();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveStagedDatasetId,
    shouldFetchStagedLocalFocusData,
    stagedLocalFocusAggregateQuery,
    stagedLocalFocusRequestKey,
    stagedLocalFocusRequestFilters,
    stagedLocalFocusSelectedColumns,
  ]);

  const shouldUseStagedLocalFocusRows = useMemo(
    () =>
      Boolean(activeFocusedBoundaryRequest?.childLevel) &&
      shouldFetchStagedLocalFocusData &&
      Array.isArray(stagedLocalData),
    [
      activeFocusedBoundaryRequest,
      shouldFetchStagedLocalFocusData,
      stagedLocalData,
    ],
  );

  // Prefer staged-local serving rows for focused child rendering when the
  // saved chart query only returned the placeholder parent-level payload.
  const unfilteredEffectiveData = useMemo(() => {
    if (shouldUseStagedLocalFocusRows) {
      return stagedLocalData || [];
    }
    return chartData;
  }, [chartData, shouldUseStagedLocalFocusRows, stagedLocalData]);

  const unfilteredEffectiveDataColumns = useMemo(
    () =>
      shouldUseStagedLocalFocusRows && stagedLocalDataColumns?.length
        ? stagedLocalDataColumns
        : Array.from(
            new Set(
              unfilteredEffectiveData
                .flatMap(row => Object.keys(row || {}))
                .filter(Boolean),
            ),
          ),
    [
      shouldUseStagedLocalFocusRows,
      stagedLocalDataColumns,
      unfilteredEffectiveData,
    ],
  );

  const quickFilterColumns = useMemo(() => {
    const resolveAvailableColumn = (
      requestedColumn?: string,
    ): string | undefined => {
      if (!requestedColumn) {
        return undefined;
      }

      if (unfilteredEffectiveDataColumns.includes(requestedColumn)) {
        return requestedColumn;
      }

      const sanitizedRequested = sanitizeDHIS2ColumnName(requestedColumn);
      return unfilteredEffectiveDataColumns.find(
        columnName =>
          sanitizeDHIS2ColumnName(String(columnName || '')) ===
          sanitizedRequested,
      );
    };

    const explicitPeriodCandidates = periodColumns
      .map(columnName => resolveAvailableColumn(columnName))
      .filter((columnName): columnName is string => Boolean(columnName));

    const metadataPeriodCandidates = datasourceColumns
      .filter(column => {
        const extra = parseColumnExtra(column?.extra);
        return extra?.dhis2_is_period === true || extra?.dhis2IsPeriod === true;
      })
      .map(column => resolveAvailableColumn(String(column?.column_name || '')))
      .filter((columnName): columnName is string => Boolean(columnName));

    const heuristicPeriodCandidates = unfilteredEffectiveDataColumns.filter(
      columnName => {
        const normalized = sanitizeDHIS2ColumnName(String(columnName || ''));
        return (
          normalized === 'period' ||
          normalized === 'pe' ||
          normalized.includes('period')
        );
      },
    );

    const resolvedHierarchyColumns = ouHierarchyColumns
      .map(columnName => resolveAvailableColumn(columnName))
      .filter((columnName): columnName is string => Boolean(columnName));

    const explicitTooltipCandidates = (tooltipColumns || [])
      .map(columnName => resolveAvailableColumn(String(columnName || '')))
      .filter((columnName): columnName is string => Boolean(columnName));

    const semanticDimensionCandidates = unfilteredEffectiveDataColumns.filter(
      columnName => {
        const normalized = sanitizeDHIS2ColumnName(String(columnName || ''));
        return (
          normalized.includes('disease') ||
          normalized.includes('metric_type') ||
          normalized === 'metric_type' ||
          normalized.includes('source_system') ||
          normalized === 'year' ||
          normalized === 'week'
        );
      },
    );

    return Array.from(
      new Set([
        ...explicitPeriodCandidates,
        ...metadataPeriodCandidates,
        ...heuristicPeriodCandidates,
        ...resolvedHierarchyColumns,
        ...explicitTooltipCandidates,
        ...semanticDimensionCandidates,
      ]),
    );
  }, [
    datasourceColumns,
    ouHierarchyColumns,
    periodColumns,
    tooltipColumns,
    unfilteredEffectiveDataColumns,
  ]);

  const effectiveData = useMemo(() => {
    const filterEntries = Object.entries(localFilters).filter(
      ([, values]) => values && values.length > 0,
    );
    if (filterEntries.length === 0) {
      return unfilteredEffectiveData;
    }

    return unfilteredEffectiveData.filter(row =>
      filterEntries.every(([col, values]) => {
        const rowVal = String(row[col] ?? '');
        return values.includes(rowVal);
      }),
    );
  }, [localFilters, unfilteredEffectiveData]);

  const effectiveDataColumns = useMemo(
    () =>
      shouldUseStagedLocalFocusRows && stagedLocalDataColumns?.length
        ? stagedLocalDataColumns
        : Array.from(
            new Set(
              effectiveData
                .flatMap(row => Object.keys(row || {}))
                .filter(Boolean),
            ),
          ),
    [effectiveData, shouldUseStagedLocalFocusRows, stagedLocalDataColumns],
  );

  const fallbackFocusedOrgUnitColumn = useMemo(
    () =>
      activeFocusedBoundaryRequest?.childLevel && shouldUseStagedLocalFocusRows
        ? resolveFallbackFocusHierarchyColumn({
            currentOrgUnitColumn: orgUnitColumn,
            requestedChildColumn: effectiveOrgUnitColumn,
            availableColumns: effectiveDataColumns,
          })
        : undefined,
    [
      activeFocusedBoundaryRequest,
      effectiveDataColumns,
      effectiveOrgUnitColumn,
      orgUnitColumn,
      shouldUseStagedLocalFocusRows,
    ],
  );

  const fallbackSparseOrgUnitColumn = useMemo(() => {
    if (!effectiveOrgUnitColumn || !effectiveData.length) {
      return undefined;
    }

    const candidateColumns = Array.from(
      new Set(
        [
          effectiveOrgUnitColumn,
          parentSelectionColumn,
          orgUnitColumn,
          ...hierarchyColumns,
        ].filter(Boolean),
      ),
    ).filter(column => effectiveDataColumns.includes(column));

    if (!candidateColumns.includes(effectiveOrgUnitColumn)) {
      return undefined;
    }

    const sample = effectiveData.slice(0, 500);
    const fillRate = (columnName: string) => {
      let populated = 0;
      sample.forEach(row => {
        const value = row?.[columnName];
        const text = String(value ?? '').trim();
        if (text.length > 0 && text.toLowerCase() !== 'null') {
          populated += 1;
        }
      });
      return sample.length > 0 ? populated / sample.length : 0;
    };

    const currentFill = fillRate(effectiveOrgUnitColumn);
    if (currentFill >= 0.15) {
      return undefined;
    }

    let bestColumn = effectiveOrgUnitColumn;
    let bestFill = currentFill;
    candidateColumns.forEach(columnName => {
      const rate = fillRate(columnName);
      if (rate > bestFill) {
        bestFill = rate;
        bestColumn = columnName;
      }
    });

    if (bestColumn !== effectiveOrgUnitColumn && bestFill >= 0.25) {
      // eslint-disable-next-line no-console
      console.warn(
        `[DHIS2Map] Fallback org unit column: "${effectiveOrgUnitColumn}" appears sparse (${(
          currentFill * 100
        ).toFixed(1)}%). Using "${bestColumn}" (${(bestFill * 100).toFixed(
          1,
        )}%) for boundary matching.`,
      );
      return bestColumn;
    }

    return undefined;
  }, [
    effectiveData,
    effectiveDataColumns,
    effectiveOrgUnitColumn,
    hierarchyColumns,
    orgUnitColumn,
    parentSelectionColumn,
  ]);

  const effectiveOrgUnitDataColumn = useMemo(
    () =>
      fallbackFocusedOrgUnitColumn ||
      fallbackSparseOrgUnitColumn ||
      effectiveOrgUnitColumn,
    [
      effectiveOrgUnitColumn,
      fallbackFocusedOrgUnitColumn,
      fallbackSparseOrgUnitColumn,
    ],
  );

  const resolveDimensionDataColumnName = useCallback(
    (requestedColumn: string): string | undefined => {
      if (!requestedColumn) {
        return undefined;
      }
      if (!shouldUseLoaderData) {
        return resolveQueryDimensionColumnName({
          requestedColumn,
          datasourceColumns,
          availableColumns: effectiveDataColumns,
        });
      }
      return resolveLoaderDimensionColumnName({
        requestedColumn,
        datasourceColumns,
        availableColumns: effectiveDataColumns,
      });
    },
    [datasourceColumns, effectiveDataColumns, shouldUseLoaderData],
  );

  const resolveMetricDataColumnName = useCallback(
    (requestedMetric: string): string | undefined => {
      if (!requestedMetric) {
        return undefined;
      }
      if (!shouldUseLoaderData) {
        return resolveQueryMetricColumnName({
          metric: requestedMetric,
          datasourceColumns,
          availableColumns: effectiveDataColumns,
          rows: effectiveData,
        });
      }
      return resolveLoaderMetricColumnName({
        metric: requestedMetric,
        datasourceColumns,
        loaderColumns: dhis2DataColumns || [],
        availableColumns: effectiveDataColumns,
      });
    },
    [
      datasourceColumns,
      dhis2DataColumns,
      effectiveData,
      effectiveDataColumns,
      shouldUseLoaderData,
    ],
  );

  const getRowColumnValue = useCallback(
    (
      row: Record<string, any>,
      requestedColumn: string,
      columnType: 'metric' | 'dimension' = 'dimension',
    ) => {
      let actualColumn =
        columnType === 'metric'
          ? resolveMetricDataColumnName(requestedColumn)
          : resolveDimensionDataColumnName(requestedColumn);
      if (!actualColumn && columnType === 'dimension') {
        actualColumn = resolveMetricDataColumnName(requestedColumn);
      }
      if (!actualColumn) {
        return undefined;
      }
      return row?.[actualColumn];
    },
    [resolveDimensionDataColumnName, resolveMetricDataColumnName],
  );

  const applyFilters = useCallback(
    (sourceData: Record<string, any>[]): Record<string, any>[] => {
      let result = [...sourceData];

      if (activeFilters && activeFilters.length > 0) {
        result = result.filter(row =>
          activeFilters.every(filter => {
            const cellValue = getRowColumnValue(
              row,
              String(filter.col || ''),
              'dimension',
            );
            const filterValues = Array.isArray(filter.val)
              ? filter.val
              : [filter.val];

            switch (filter.op) {
              case 'IN':
                return filterValues.includes(cellValue);
              case 'NOT IN':
                return !filterValues.includes(cellValue);
              case '==':
              case 'eq':
                return cellValue === filter.val;
              case '!=':
              case 'neq':
                return cellValue !== filter.val;
              case '>':
              case 'gt':
                return cellValue > filter.val;
              case '<':
              case 'lt':
                return cellValue < filter.val;
              case '>=':
              case 'gte':
                return cellValue >= filter.val;
              case '<=':
              case 'lte':
                return cellValue <= filter.val;
              default:
                return true;
            }
          }),
        );
      }

      // nativeFilters (filterState) is intentionally NOT applied client-side:
      // dashboard native filters and cross-chart filters are applied server-side
      // via extraFormData.filters → combinedFilters in buildQuery.ts.
      // filterState keys are metadata fields ("value", "label"), not column names,
      // so any attempt to use them as column identifiers incorrectly filters all rows.

      return result;
    },
    [activeFilters, getRowColumnValue],
  );

  const matchesFeatureOrgUnit = useCallback(
    (value: unknown, feature: BoundaryFeature): boolean => {
      const rowKeys = new Set(buildOrgUnitMatchKeys(value));
      const featureKeys = new Set([
        ...buildOrgUnitMatchKeys(feature.id),
        ...buildOrgUnitMatchKeys(feature.properties?.name),
      ]);

      if (rowKeys.size === 0 || featureKeys.size === 0) {
        return false;
      }

      return Array.from(rowKeys).some(key => featureKeys.has(key));
    },
    [],
  );

  const baseFilteredData = useMemo(
    () => applyFilters(effectiveData),
    [applyFilters, effectiveData],
  );

  const filteredData = useMemo(() => {
    if (
      !activeFocusedBoundaryRequest?.selectedParents?.length ||
      !parentSelectionColumn
    ) {
      return baseFilteredData;
    }

    return baseFilteredData.filter(row =>
      activeFocusedBoundaryRequest.selectedParents.some(feature =>
        matchesFeatureOrgUnit(
          getRowColumnValue(row, parentSelectionColumn, 'dimension'),
          feature,
        ),
      ),
    );
  }, [
    activeFocusedBoundaryRequest,
    baseFilteredData,
    getRowColumnValue,
    matchesFeatureOrgUnit,
    parentSelectionColumn,
  ]);

  const tooltipRowByOrgUnitKey = useMemo(() => {
    const index = new Map<string, Record<string, any>>();
    if (!filteredData.length) {
      return index;
    }

    filteredData.forEach(row => {
      const rowOrgUnitValue = getRowColumnValue(
        row,
        effectiveOrgUnitDataColumn,
        'dimension',
      );
      buildOrgUnitMatchKeys(rowOrgUnitValue).forEach(key => {
        if (key && !index.has(key)) {
          index.set(key, row);
        }
      });
    });

    return index;
  }, [effectiveOrgUnitDataColumn, filteredData, getRowColumnValue]);

  const getTooltipRowForFeature = useCallback(
    (feature: BoundaryFeature): Record<string, any> | undefined => {
      const matchKeys = [
        ...buildOrgUnitMatchKeys(feature.id),
        ...buildOrgUnitMatchKeys(feature.properties?.name),
      ];

      for (const key of matchKeys) {
        const row = tooltipRowByOrgUnitKey.get(key);
        if (row) {
          return row;
        }
      }

      // Fallback for uncommon fuzzy matches not covered by exact keys.
      return filteredData.find(row =>
        matchesFeatureOrgUnit(
          getRowColumnValue(row, effectiveOrgUnitDataColumn, 'dimension'),
          feature,
        ),
      );
    },
    [
      effectiveOrgUnitDataColumn,
      filteredData,
      getRowColumnValue,
      matchesFeatureOrgUnit,
      tooltipRowByOrgUnitKey,
    ],
  );

  const resolvedParentSelectionColumn = useMemo(
    () => resolveDimensionDataColumnName(parentSelectionColumn),
    [parentSelectionColumn, resolveDimensionDataColumnName],
  );

  const resolvedEffectiveOrgUnitColumn = useMemo(
    () => resolveDimensionDataColumnName(effectiveOrgUnitDataColumn),
    [effectiveOrgUnitDataColumn, resolveDimensionDataColumnName],
  );

  const resolvedMetricColumn = useMemo(
    () => resolveMetricDataColumnName(metric),
    [metric, resolveMetricDataColumnName],
  );

  const {
    dataMap: parentSelectionDataMap,
    dataMapByName: parentSelectionDataMapByName,
  } = useMemo(
    () =>
      buildAggregatedValueMaps({
        rows: baseFilteredData,
        requestedOrgUnitColumn: parentSelectionColumn,
        metric,
        aggregationMethod,
        actualOrgUnitColumn: resolvedParentSelectionColumn,
        actualMetricColumn: resolvedMetricColumn,
        datasourceColumns,
      }),
    [
      aggregationMethod,
      baseFilteredData,
      datasourceColumns,
      metric,
      parentSelectionColumn,
      resolvedMetricColumn,
      resolvedParentSelectionColumn,
    ],
  );
  const getParentSelectionValue = useCallback(
    (feature: BoundaryFeature): number | undefined =>
      resolveFeatureValueFromMaps(
        feature,
        parentSelectionDataMap,
        parentSelectionDataMapByName,
        EMPTY_NUMERIC_MAP,
        geoJoinFeatureProperty,
      ),
    [geoJoinFeatureProperty, parentSelectionDataMap, parentSelectionDataMapByName],
  );
  // Keep a ref so fetchBoundaries can read the latest value without it
  // becoming a reactive dependency.  If getParentSelectionValue were in the
  // fetchBoundaries useCallback deps, every data load would recreate the
  // callback → trigger the boundary-load effect → set loading=true again,
  // making the map appear permanently loading.
  const getParentSelectionValueRef = useRef(getParentSelectionValue);
  useEffect(() => {
    getParentSelectionValueRef.current = getParentSelectionValue;
  }, [getParentSelectionValue]);

  // Aggregate data by OrgUnit using the selected aggregation method
  // Build maps by both ID and name to support different data formats
  const { dataMap, dataMapByName, dataMapByGeoKey } = useMemo(() => {
    // Determine the target OU level from the resolved hierarchy column's metadata
    const colMeta = datasourceColumns.find(
      c => c.column_name === resolvedEffectiveOrgUnitColumn,
    );
    const colExtra = parseColumnExtra(colMeta?.extra);
    const targetLevel = colExtra?.dhis2_ou_level;

    const aggregatedMaps = buildAggregatedValueMaps({
      rows: filteredData,
      requestedOrgUnitColumn: effectiveOrgUnitDataColumn,
      geoJoinKeyColumn,
      metric,
      aggregationMethod,
      actualOrgUnitColumn: resolvedEffectiveOrgUnitColumn,
      actualMetricColumn: resolvedMetricColumn,
      datasourceColumns,
      ouLevelFilter:
        targetLevel && Number.isFinite(Number(targetLevel))
          ? Number(targetLevel)
          : undefined,
    });

    return aggregatedMaps;
  }, [
    activeFocusedBoundaryRequest,
    aggregationMethod,
    datasourceColumns,
    effectiveOrgUnitDataColumn,
    filteredData,
    geoJoinKeyColumn,
    metric,
    parentSelectionColumn,
    resolvedEffectiveOrgUnitColumn,
    resolvedMetricColumn,
  ]);

  // Resolve the thematic value for a rendered boundary. In focused-child mode
  // the map must color each child by its own child-row contribution rather than
  // inheriting the selected parent total.
  const getFeatureValue = useCallback(
    (feature: BoundaryFeature): number | undefined =>
      resolveFeatureValueFromMaps(
        feature,
        dataMap,
        dataMapByName,
        dataMapByGeoKey,
        geoJoinFeatureProperty,
      ),
    [dataMap, dataMapByGeoKey, dataMapByName, geoJoinFeatureProperty],
  );

  // Calculate value range from actual data for proper legend scaling
  const valueRange = useMemo(() => {
    const values = Array.from(dataMap.values()).filter(
      v => typeof v === 'number' && Number.isFinite(v),
    );

    // Use manual min/max if provided and legend type is manual
    if (legendType === 'manual') {
      const manualMin =
        legendMin !== undefined && !Number.isNaN(Number(legendMin))
          ? Number(legendMin)
          : 0;
      const manualMax =
        legendMax !== undefined && !Number.isNaN(Number(legendMax))
          ? Number(legendMax)
          : 100;
      return { min: manualMin, max: manualMax, hasData: values.length > 0 };
    }

    const stagedLegendRange = getLegendRangeFromDefinition(
      effectiveStagedLegendDefinition,
    );
    if (stagedLegendRange) {
      return {
        min: stagedLegendRange.min,
        max: stagedLegendRange.max,
        hasData: values.length > 0,
      };
    }

    if (values.length === 0) {
      return { min: 0, max: 100, hasData: false };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      min,
      max,
      hasData: true,
    };
  }, [
    dataMap,
    effectiveStagedLegendDefinition,
    legendType,
    legendMin,
    legendMax,
  ]);

  const legendDataValues = useMemo(
    () =>
      Array.from(dataMap.values()).filter(
        value => typeof value === 'number' && Number.isFinite(value),
      ),
    [dataMap],
  );

  // Determine which color scheme to use based on useLinearColorScheme setting
  const activeColorScheme = useMemo(() => {
    if (useLinearColorScheme) {
      return linearColorScheme || 'superset_seq_1';
    }
    return colorScheme || 'supersetColors';
  }, [useLinearColorScheme, linearColorScheme, colorScheme]);

  const colorScale = useMemo(
    () =>
      getColorScale(
        activeColorScheme,
        valueRange.min,
        valueRange.max,
        legendClasses,
        legendReverseColors,
        useLinearColorScheme ? 'sequential' : 'categorical',
        manualBreaks,
        manualColors,
        effectiveStagedLegendDefinition,
        legendType,
        legendDataValues,
      ),
    [
      activeColorScheme,
      effectiveStagedLegendDefinition,
      legendDataValues,
      legendType,
      valueRange,
      legendClasses,
      legendReverseColors,
      useLinearColorScheme,
      manualBreaks,
      manualColors,
    ],
  );

  const computedLegendEntries = useMemo(
    () =>
      buildLegendEntries({
        schemeName: activeColorScheme,
        min: valueRange.min,
        max: valueRange.max,
        classes: legendClasses,
        reverseColors: legendReverseColors,
        schemeType: useLinearColorScheme ? 'sequential' : 'categorical',
        legendType,
        manualBreaks,
        manualColors,
        stagedLegendDefinition: effectiveStagedLegendDefinition,
        dataValues: legendDataValues,
      }),
    [
      activeColorScheme,
      effectiveStagedLegendDefinition,
      legendDataValues,
      legendType,
      valueRange.max,
      valueRange.min,
      legendClasses,
      legendReverseColors,
      useLinearColorScheme,
      manualBreaks,
      manualColors,
    ],
  );

  const fetchBoundaries = useCallback(async () => {
    if (!effectiveBoundaryLevels || effectiveBoundaryLevels.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[DHIS2Map] No boundary levels provided:',
        effectiveBoundaryLevels,
      );
      setError(
        t(
          'Please select at least one boundary level in the chart configuration',
        ),
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setBoundaryPendingStalled(false);
    setFocusedParentBoundaries([]);

    try {
      let requestedLevels = effectiveBoundaryLevels;
      let selectedParents: BoundaryFeature[] = [];
      let focusedRequest: FocusedBoundaryRequest | null = null;

      requestedLevels =
        requestedLevels
          ?.map(level => Number(level))
          .filter(level => level === 2 || level === 3) || [];
      if (requestedLevels.length === 0) {
        if (resolvedPrimaryBoundaryLevel === 2 || resolvedPrimaryBoundaryLevel === 3) {
          requestedLevels = [resolvedPrimaryBoundaryLevel];
        } else if (
          String(geoJoinKeyColumn || '')
            .toLowerCase()
            .includes('region')
        ) {
          requestedLevels = [2];
        } else {
          requestedLevels = [3];
        }
      }

      if (
        focusSelectedBoundaryWithChildren &&
        resolvedPrimaryBoundaryLevel > 0
      ) {
        const parentResult = {
          allFeatures: await loadStaticUgFeatures([resolvedPrimaryBoundaryLevel]),
        };
        const parentFeatures = convertToBoundaryFeatures(
          parentResult.allFeatures,
        );
        focusedRequest = resolveFocusedBoundaryRequest({
          enabled: true,
          currentLevel: resolvedPrimaryBoundaryLevel,
          maxAvailableLevel: maxAvailableBoundaryLevel,
          parentFeatures,
          getFeatureValue: getParentSelectionValueRef.current,
        });

        if (focusedRequest.childLevel && focusedRequest.parentIds.length > 0) {
          requestedLevels = [focusedRequest.childLevel];
          selectedParents = focusedRequest.selectedParents;
          setActiveFocusedBoundaryRequest(focusedRequest);
          setFocusedParentBoundaries(selectedParents);
        } else {
          setActiveFocusedBoundaryRequest(null);
          setFocusedParentBoundaries([]);
        }
      } else {
        setActiveFocusedBoundaryRequest(null);
        setFocusedParentBoundaries([]);
      }

      const result = {
        allFeatures: await loadStaticUgFeatures(requestedLevels),
        totalCount: 0,
      };
      result.totalCount = result.allFeatures.length;

      if (
        result.totalCount === 0 &&
        requestedLevels.length > 0 &&
        resolvedPrimaryBoundaryLevel > 0 &&
        !requestedLevels.includes(resolvedPrimaryBoundaryLevel)
      ) {
        // If selected levels return no boundaries, retry once with the
        // resolved primary level. This guards against stale/misaligned
        // metadata level mappings in some DHIS2 sources.
        // eslint-disable-next-line no-console
        console.warn(
          `[DHIS2Map] No boundaries for selected levels (${requestedLevels.join(
            ',',
          )}). Retrying with primary level ${resolvedPrimaryBoundaryLevel}.`,
        );
        result.allFeatures = await loadStaticUgFeatures([
          resolvedPrimaryBoundaryLevel,
        ]);
        result.totalCount = result.allFeatures.length;
      }

      if (focusedRequest?.parentIds?.length && result.totalCount === 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[DHIS2Map] No child boundaries returned for focused selection. Falling back to selected parent boundaries.`,
        );
        setActiveFocusedBoundaryRequest(null);
        setBoundaries(selectedParents);
        return;
      }

      setBoundaryPendingRetryCount(0);
      setBoundaryPendingStalled(false);

      if (result.totalCount === 0) {
        setError(t('No boundary data found for selected levels'));
        setLoading(false);
        return;
      }
      const validFeatures = convertToBoundaryFeatures(result.allFeatures);

      setBoundaries(validFeatures);
    } catch (err: any) {
      const message = err?.message || '';

      // eslint-disable-next-line no-console
      console.error('[DHIS2Map] Boundary fetch error:', err);

      if (message.includes('timed out') || message.includes('timeout')) {
        setError(
          t(
            'Request timed out - the DHIS2 server may be slow. Try refreshing.',
          ),
        );
      } else if (
        message.includes('401') ||
        message.includes('authentication')
      ) {
        setError(t('Authentication failed - check DHIS2 credentials'));
      } else if (message.includes('404')) {
        setError(t('Database not found'));
      } else if (message.includes('500')) {
        setError(t('Server error while fetching boundaries'));
      } else {
        setError(t('Failed to load map boundaries: ') + message);
      }
    } finally {
      setLoading(false);
    }
  }, [
    boundaryPendingRetryCount,
    effectiveBoundaryLevels,
    focusSelectedBoundaryWithChildren,
    geoJoinKeyColumn,
    maxAvailableBoundaryLevel,
    resolvedPrimaryBoundaryLevel,
    // getParentSelectionValue is intentionally excluded — it's accessed via
    // getParentSelectionValueRef so data changes don't recreate this callback
    // and retrigger the boundary-load effect (which would set loading=true again).
  ]);

  // Create a stable string representation of boundary levels for change detection
  const boundaryLevelsKey = useMemo(
    () => (effectiveBoundaryLevels || []).sort((a, b) => a - b).join(','),
    [effectiveBoundaryLevels],
  );
  const sourceInstanceIdsKey = useMemo(
    () => normalizedSourceInstanceIds.join(','),
    [normalizedSourceInstanceIds],
  );

  // Fetch boundaries when levels change
  useEffect(() => {
    // Build a stable key from the config values that actually matter for
    // boundary fetching.  If fetchBoundaries is recreated (e.g. because a
    // prop array got a new reference with the same content) but the
    // meaningful config hasn't changed, the guard below prevents a redundant
    // setLoading(true) + re-fetch cycle that would make the map appear
    // permanently loading.
    const boundaryRequestKey = [
      boundaryLevelsKey,
      sourceInstanceIdsKey,
    ].join('|');

    if (lastLoadedBoundaryRequestKeyRef.current === boundaryRequestKey) {
      return; // same config — do not re-fetch
    }

    if (effectiveBoundaryLevels && effectiveBoundaryLevels.length > 0) {
      // Cancel any pending retry when the config itself changes.
      if (boundaryPendingRetryTimerRef.current) {
        clearTimeout(boundaryPendingRetryTimerRef.current);
        boundaryPendingRetryTimerRef.current = null;
      }
      // Optimistically mark config as loaded so concurrent/duplicate invocations
      // of this effect (triggered by fetchBoundaries being recreated) are ignored.
      lastLoadedBoundaryRequestKeyRef.current = boundaryRequestKey;
      // Reset loading state and fetch new boundaries
      setLoading(true);
      fetchBoundaries();
    } else {
      // Always clear loading when we've decided not to fetch boundaries — the
      // map should not remain stuck on the loading overlay indefinitely.
      setLoading(false);
    }
    return () => {
      if (boundaryPendingRetryTimerRef.current) {
        clearTimeout(boundaryPendingRetryTimerRef.current);
        boundaryPendingRetryTimerRef.current = null;
      }
    };
  }, [boundaryLevelsKey, sourceInstanceIdsKey, fetchBoundaries]);

  const handleDrillUp = useCallback(
    (toIndex?: number) => {
      if (drillState.breadcrumbs.length === 0) {
        return;
      }

      let newBreadcrumbs: typeof drillState.breadcrumbs;
      let newLevel: number;
      let newParentId: string | null;
      let newParentName: string | null;

      const defaultLevel = resolvedPrimaryBoundaryLevel;

      if (toIndex !== undefined && toIndex >= 0) {
        newBreadcrumbs = drillState.breadcrumbs.slice(0, toIndex);
        const targetCrumb = drillState.breadcrumbs[toIndex - 1];
        newLevel = targetCrumb?.level + 1 || defaultLevel;
        newParentId = targetCrumb?.id || null;
        newParentName = targetCrumb?.name || null;
      } else {
        newBreadcrumbs = drillState.breadcrumbs.slice(0, -1);
        const lastCrumb = newBreadcrumbs[newBreadcrumbs.length - 1];
        newLevel = lastCrumb?.level + 1 || defaultLevel;
        newParentId = lastCrumb?.id || null;
        newParentName = lastCrumb?.name || null;
      }

      setDrillState({
        currentLevel: newLevel,
        parentId: newParentId,
        parentName: newParentName,
        breadcrumbs: newBreadcrumbs,
      });
    },
    [drillState, resolvedPrimaryBoundaryLevel],
  );

  const selectedBoundaryIds = useMemo(() => {
    const ids = new Set<string>();
    boundaries.forEach(feature => {
      if (getFeatureValue(feature) !== undefined) {
        ids.add(feature.id);
      }
    });
    return ids;
  }, [boundaries, getFeatureValue]);

  useEffect(() => {
    const hasBoundaryData = boundaries.length > 0;
    const hasMetricData =
      dataMap.size > 0 || dataMapByName.size > 0 || dataMapByGeoKey.size > 0;
    const hasRows = filteredData.length > 0;

    if (
      !databaseId ||
      loading ||
      !hasBoundaryData ||
      !hasMetricData ||
      !hasRows ||
      selectedBoundaryIds.size > 0
    ) {
      return;
    }

    const noMatchKey = [
      databaseId,
      boundaryLevelsKey,
      sourceInstanceIdsKey,
      effectiveOrgUnitDataColumn || '',
      resolvedEffectiveOrgUnitColumn || '',
      metric || '',
      Array.from(dataMap.keys()).slice(0, 20).join(','),
      Array.from(dataMapByName.keys()).slice(0, 20).join(','),
      Array.from(dataMapByGeoKey.keys()).slice(0, 20).join(','),
    ].join('|');

    if (lastNoMatchBoundaryRefreshKeyRef.current === noMatchKey) {
      setError(
        t(
          'Map boundaries loaded, but none matched dataset rows. Check Boundary Join Column, GeoJSON Property, and Boundary level.',
        ),
      );
      return;
    }

    lastNoMatchBoundaryRefreshKeyRef.current = noMatchKey;
    setError(
      t(
        'Refreshing map boundaries because cached boundaries did not match dataset rows.',
      ),
    );

    clearGeoFeatureCache(databaseId, 'dhis2map_boundaries')
      .catch(error => {
        // eslint-disable-next-line no-console
        console.warn('[DHIS2Map] Failed to clear boundary cache:', error);
      })
      .finally(() => {
        lastLoadedBoundaryRequestKeyRef.current = null;
        fetchBoundaries();
      });
  }, [
    boundaries,
    boundaryLevelsKey,
    dataMap,
    dataMapByGeoKey,
    dataMapByName,
    databaseId,
    effectiveOrgUnitDataColumn,
    fetchBoundaries,
    filteredData.length,
    loading,
    metric,
    resolvedEffectiveOrgUnitColumn,
    selectedBoundaryIds.size,
    sourceInstanceIdsKey,
  ]);

  useEffect(() => {
    if (
      loading ||
      boundaries.length === 0 ||
      filteredData.length === 0 ||
      selectedBoundaryIds.size > 0
    ) {
      return;
    }

    const boundaryNameKeys = new Set<string>();
    boundaries.forEach(feature => {
      const key = normalizeOrgUnitMatchKey(
        (feature.properties as Record<string, any>)?.[geoJoinFeatureProperty] ??
          feature.properties?.name,
      );
      if (key) {
        boundaryNameKeys.add(key);
      }
    });

    const unmatchedGeoKeys = Array.from(dataMapByGeoKey.keys())
      .filter(key => !boundaryNameKeys.has(key))
      .slice(0, 20);
    const sampleBoundaryKeys = Array.from(boundaryNameKeys).slice(0, 20);

    // eslint-disable-next-line no-console
    console.warn('[UGMaps Join Diagnostics]', {
      geoJoinFeatureProperty,
      geoJoinKeyColumn,
      dataRows: filteredData.length,
      rawBoundaries: boundaries.length,
      boundaries: boundaries.length,
      matchedBoundaries: selectedBoundaryIds.size,
      dataMapByGeoKeySize: dataMapByGeoKey.size,
      unmatchedGeoKeys,
      sampleBoundaryKeys,
    });
  }, [
    boundaries,
    dataMapByGeoKey,
    filteredData.length,
    geoJoinFeatureProperty,
    geoJoinKeyColumn,
    loading,
    selectedBoundaryIds.size,
  ]);

  const displayBoundaries = useMemo(() => {
    if (boundaries.length === 0) {
      return [];
    }

    const visibleBoundaries = resolveDisplayedBoundaries({
      boundaries,
      selectedBoundaryIds,
      showAllBoundaries,
    });

    return visibleBoundaries;
  }, [boundaries, selectedBoundaryIds, showAllBoundaries]);

  const displayBoundaryIdsSignature = useMemo(
    () =>
      displayBoundaries
        .map(boundary => boundary.id)
        .sort()
        .join(','),
    [displayBoundaries],
  );

  const levelBorderColorSignature = useMemo(
    () =>
      (levelBorderColors || [])
        .map(
          levelColor =>
            `${levelColor.level}:${levelColor.color.r},${levelColor.color.g},${levelColor.color.b},${levelColor.color.a}`,
        )
        .join('|'),
    [levelBorderColors],
  );

  useEffect(() => {
    const firstFiveBoundaries = displayBoundaries.slice(0, 5).map(boundary => ({
      id: boundary.id,
      name: boundary.properties?.name ?? null,
      level: boundary.properties?.level ?? null,
    }));

    const firstFiveDistrictCityValues = filteredData.slice(0, 5).map(row => ({
      district_city:
        row?.district_city ??
        row?.districtCity ??
        row?.[effectiveOrgUnitDataColumn || ''] ??
        null,
      region: row?.region ?? null,
      national: row?.national ?? null,
      metric:
        row?.[metric as string] ??
        row?.[resolvedMetricColumn || ''] ??
        row?.value ??
        null,
    }));

    // eslint-disable-next-line no-console
    console.info('[DHIS2Map] Boundary/data diagnostics', {
      displayBoundariesLength: displayBoundaries.length,
      firstFiveBoundaries,
      effectiveDataLength: filteredData.length,
      firstFiveDistrictCityValues,
      effectiveOrgUnitDataColumn,
      resolvedEffectiveOrgUnitColumn,
      resolvedMetricColumn,
      dataMapSize: dataMap.size,
      dataMapSample: Array.from(dataMap.entries()).slice(0, 5),
      dataMapByNameSize: dataMapByName.size,
      dataMapByNameSample: Array.from(dataMapByName.entries()).slice(0, 5),
    });
  }, [
    dataMap,
    dataMapByName,
    displayBoundaries,
    effectiveOrgUnitDataColumn,
    filteredData,
    metric,
    resolvedEffectiveOrgUnitColumn,
    resolvedMetricColumn,
  ]);

  const shouldStyleUnselectedAreas = useMemo(
    () =>
      showAllBoundaries &&
      styleUnselectedAreas &&
      selectedBoundaryIds.size > 0 &&
      selectedBoundaryIds.size < displayBoundaries.length,
    [
      displayBoundaries.length,
      selectedBoundaryIds.size,
      showAllBoundaries,
      styleUnselectedAreas,
    ],
  );

  const getFeatureStyle = useCallback(
    (feature: BoundaryFeature) => {
      // Debug: Log that we're styling (only for first feature to avoid spam)
      const value = getFeatureValue(feature);
      const noDataColorRgb = `rgba(${legendNoDataColor.r},${legendNoDataColor.g},${legendNoDataColor.b},${legendNoDataColor.a})`;
      const unselectedFillRgb = `rgba(${unselectedAreaFillColor.r},${unselectedAreaFillColor.g},${unselectedAreaFillColor.b},${unselectedAreaFillColor.a})`;
      const unselectedBorderRgb = `rgba(${unselectedAreaBorderColor.r},${unselectedAreaBorderColor.g},${unselectedAreaBorderColor.b},${unselectedAreaBorderColor.a})`;
      const isSelectedArea = value !== undefined;

      // Determine fill color based on data
      let fillColor = noDataColorRgb;
      let fillOpacityValue = opacity;
      let borderColor = `rgba(${strokeColor.r},${strokeColor.g},${strokeColor.b},${strokeColor.a})`;
      let borderWidth = strokeWidth;

      if (isSelectedArea) {
        // Areas with data: use color scale
        fillColor = colorScale(value);
        // Default selected-area borders should stay visually tied to the
        // thematic key color unless a more specific border mode overrides it.
        borderColor = darkenColor(fillColor, 0.3);
      } else if (shouldStyleUnselectedAreas) {
        fillColor = unselectedFillRgb;
        fillOpacityValue = unselectedAreaFillOpacity;
        borderColor = unselectedBorderRgb;
        borderWidth = unselectedAreaBorderWidth;
      } else {
        // Areas without data: make clearly visible, not almost transparent
        fillOpacityValue = Math.max(opacity * 0.6, 0.3);
      }

      const isSelected = selectedFeatureId === feature.id;

      // Auto-theme and level border colors only apply to selected/thematic areas.
      if (isSelectedArea && autoThemeBorders) {
        borderColor = darkenColor(fillColor, 0.4);
      } else if (
        isSelectedArea &&
        levelBorderColors &&
        levelBorderColors.length > 0
      ) {
        // Convert level to number (API returns string like '3')
        const rawLevel = feature.properties.level;
        const level =
          typeof rawLevel === 'string' ? parseInt(rawLevel, 10) : rawLevel || 1;
        const levelColor = levelBorderColors.find(l => l.level === level);

        if (levelColor) {
          borderColor = `rgba(${levelColor.color.r},${levelColor.color.g},${levelColor.color.b},${levelColor.color.a})`;
        }
      }

      if (isSelected) {
        borderWidth = Math.max(borderWidth + 1.5, strokeWidth + 2);
        borderColor = darkenColor(borderColor, 0.25);
        fillOpacityValue = Math.min(fillOpacityValue + 0.1, 1);
      }

      return {
        color: borderColor,
        weight: borderWidth,
        fillColor,
        fillOpacity: fillOpacityValue,
      };
    },
    [
      getFeatureValue,
      legendNoDataColor,
      opacity,
      strokeColor,
      strokeWidth,
      autoThemeBorders,
      levelBorderColors,
      colorScale,
      selectedFeatureId,
      shouldStyleUnselectedAreas,
      unselectedAreaFillColor,
      unselectedAreaFillOpacity,
      unselectedAreaBorderColor,
      unselectedAreaBorderWidth,
    ],
  );

  const getFocusedParentStyle = useCallback(
    () => ({
      color: darkenColor(
        `rgba(${strokeColor.r},${strokeColor.g},${strokeColor.b},${strokeColor.a})`,
        0.15,
      ),
      weight: Math.max(strokeWidth + 1.25, 2),
      fillOpacity: 0,
      opacity: 1,
      dashArray: '6 3',
    }),
    [strokeColor, strokeWidth],
  );

  const onEachFeature = useCallback(
    (feature: BoundaryFeature, layer: L.Layer) => {
      const vectorLayer = layer as L.Path & {
        getElement?: () => SVGElement | null;
      };
      const value = getFeatureValue(feature);
      const tooltipRow = getTooltipRowForFeature(feature);
      const tooltipContent = `
        <div class="dhis2-map-tooltip">
          <strong>${feature.properties.name}</strong>
          <br/>
          ${metricDisplayName}: ${value !== undefined ? formatValue(value) : 'No data'}
          ${
            tooltipColumns
              ?.map(col =>
                tooltipRow
                  ? `<br/>${col}: ${String(
                      getRowColumnValue(tooltipRow, col, 'dimension') ?? '',
                    )}`
                  : '',
              )
              .join('') || ''
          }
        </div>
      `;

      layer.bindTooltip(tooltipContent, {
        sticky: true,
        permanent: false,
        direction: 'auto',
        className: 'dhis2-map-tooltip-container',
      });

      const handlers: Record<string, () => void> = {};

      handlers.click = () => {
        setSelectedFeatureId(null);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      };

      layer.on(handlers);

      const element = vectorLayer.getElement?.() as SVGElement | undefined;
      if (element) {
        element.setAttribute('tabindex', '-1');
        element.setAttribute('focusable', 'false');
        element.style.outline = 'none';
      }

      if (showLabels && feature.geometry.type !== 'Point') {
        const center = L.geoJSON(feature).getBounds().getCenter();
        let labelText = '';

        switch (labelType) {
          case 'name':
            labelText = feature.properties.name;
            break;
          case 'value':
            labelText = value !== undefined ? formatValue(value) : '';
            break;
          case 'name_value':
            labelText = `${feature.properties.name}\n${
              value !== undefined ? formatValue(value) : ''
            }`;
            break;
          case 'percent': {
            const total = Array.from(dataMap.values()).reduce(
              (a, b) => a + b,
              0,
            );
            labelText =
              value !== undefined
                ? `${((value / total) * 100).toFixed(1)}%`
                : '';
            break;
          }
          default:
            break;
        }

        if (labelText && mapInstance) {
          const labelMarker = L.marker(center, {
            icon: L.divIcon({
              className: 'map-label',
              html: `<div style="font-size: ${labelFontSize}px; text-align: center; white-space: nowrap; color: ${
                labelTextColor || '#1f2937'
              };">${labelText}</div>`,
            }),
          }).addTo(mapInstance);
          labelMarkersByLayer.set(layer, labelMarker);
        }
      }
    },
    [
      getFeatureValue,
      getTooltipRowForFeature,
      dataMap,
      metric,
      metricDisplayName,
      getRowColumnValue,
      resolvedEffectiveOrgUnitColumn,
      tooltipColumns,
      showLabels,
      labelType,
      labelFontSize,
      labelTextColor,
      enableDrill,
      mapInstance,
    ],
  );

  // Only block the full overlay on data loading — boundary loading is
  // progressive and the chart can render data immediately once available.
  const showMapLoadingOverlay = dhis2DataLoading || stagedLocalDataLoading;
  const boundaryLoading = loading;
  const isMaskEnabled =
    boundaryFocusMaskStyle !== 'off' &&
    (showAllBoundaries || focusSelectedBoundaryWithChildren);

  const handleRetryBoundariesNow = useCallback(() => {
    setBoundaryPendingStalled(false);
    setBoundaryPendingRetryCount(0);
    setError(null);
    lastLoadedBoundaryRequestKeyRef.current = null;
    setLoading(true);
    fetchBoundaries();
  }, [fetchBoundaries]);

  const rgbaCss = (
    c?: { r: number; g: number; b: number; a?: number },
    fallback?: string,
  ) =>
    c && typeof c.r === 'number'
      ? `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a ?? 1})`
      : fallback;
  const titleColorCss = rgbaCss(chartTitleColor, '#1f2937');
  const subtitleColorCss = rgbaCss(chartSubtitleColor, '#6b7280');
  const hasChartTitle = Boolean(chartTitle || chartSubtitle);

  return (
    <MapWrapper
      $transparentCardContainer={transparentCardContainer}
      style={{ width, height }}
    >
      <MapCanvas $backgroundColor={chartBackgroundColor}>
        {/*
          Always render the overlay wrapper (toggled with `display`) so the
          MapContainer keeps a stable child position — otherwise React would
          remount the Leaflet map when the title appears/disappears, leaving the
          tiles half-rendered.
        */}
        <div
          className="dhis2-map-title-overlay"
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            right: 0,
            zIndex: 1000,
            pointerEvents: 'none',
            display: hasChartTitle ? 'block' : 'none',
            textAlign: chartTitleAlign === 'left' ? 'left' : 'center',
            padding: chartTitleAlign === 'left' ? '0 12px' : 0,
          }}
        >
          {chartTitle && (
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: titleColorCss,
                lineHeight: 1.3,
              }}
            >
              {chartTitle}
            </div>
          )}
          {chartSubtitle && (
            <div
              style={{
                fontSize: 12,
                color: subtitleColorCss,
                lineHeight: 1.3,
              }}
            >
              {chartSubtitle}
            </div>
          )}
        </div>
        {/* @ts-ignore - React 19 compatibility */}
        <MapContainer
          key="dhis2-map-container"
          center={[1.3733, 32.2903]}
          zoom={7}
          zoomSnap={0.25}
          zoomDelta={0.25}
          zoomControl={false}
          scrollWheelZoom={false}
          dragging={interactionEnabled}
          doubleClickZoom={interactionEnabled}
          boxZoom={interactionEnabled}
          keyboard={interactionEnabled}
          touchZoom={interactionEnabled}
        >
          {/* @ts-ignore - React 19 compatibility */}
          <BaseMapLayer mapType={currentBasemap as any} />
          <MapInstanceBridge onReady={handleMapInstanceReady} />

          {/* Auto-focus map when boundaries load */}
          {/* @ts-ignore - React 19 compatibility */}
          <MapAutoFocus
            boundaries={displayBoundaries}
            enabled={!loading}
            viewportWidth={width}
            viewportHeight={height}
            layoutSignature={showFilters ? 'filters-open' : 'filters-closed'}
          />

          {/* Light basemap focus mask to de-emphasize areas outside boundaries */}
          {/* @ts-ignore - React 19 compatibility */}
          <BoundaryMask
            boundaries={displayBoundaries}
            enabled={isMaskEnabled}
            maskStyle={boundaryFocusMaskStyle}
          />

          {/* Explicit in-map zoom controls */}
          {/* @ts-ignore - React 19 compatibility */}
          <MapZoomButtons />
          {displayBoundaries.length > 0 && (
            <FocusButton boundaries={displayBoundaries} />
          )}

          {displayBoundaries.length > 0 &&
            /* @ts-ignore - React 19 compatibility */
            focusSelectedBoundaryWithChildren &&
            focusedParentBoundaries.length > 0 && (
              <DynamicGeoJSON
                data={
                  {
                    type: 'FeatureCollection',
                    features: focusedParentBoundaries,
                  } as any
                }
                style={getFocusedParentStyle as any}
                onEachFeature={() => undefined}
                styleKey={`focus-parents-${focusedParentBoundaries
                  .map(feature => feature.id)
                  .sort()
                  .join(',')}-${strokeWidth}-${JSON.stringify(strokeColor)}`}
              />
            )}
          {displayBoundaries.length > 0 && (
            /* @ts-ignore - React 19 compatibility */
            <DynamicGeoJSON
              data={
                {
                  type: 'FeatureCollection',
                  features: displayBoundaries,
                } as any
              }
              style={getFeatureStyle as any}
              onEachFeature={onEachFeature as any}
              styleKey={`levels-${boundaryLevelsKey}-drill-${drillState.currentLevel}-${drillState.parentId}-colors-${levelBorderColorSignature}-boundaries-${displayBoundaryIdsSignature}`}
            />
          )}
        </MapContainer>

        {!interactionEnabled && (
          <div
            className="map-interaction-overlay"
            role="button"
            tabIndex={0}
            onClick={() => setInteractionEnabled(true)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                setInteractionEnabled(true);
              }
            }}
          >
            {t('Click to interact with map')}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 1002,
          }}
        >
          <BaseMapSelector
            currentMap={currentBasemap}
            onMapChange={setCurrentBasemap}
          />
        </div>

        {enableDrill && drillState.breadcrumbs.length > 0 && (
          /* @ts-ignore - React 19 compatibility */
          <DrillControls
            breadcrumbs={drillState.breadcrumbs}
            onDrillUp={() => handleDrillUp()}
            onBreadcrumbClick={index => handleDrillUp(index)}
          />
        )}

        {showMapLoadingOverlay && (
          <div className="map-loading-overlay">
            <Spin size="large" />
            <span>{t('Loading map data...')}</span>
          </div>
        )}

        {!showMapLoadingOverlay && boundaryLoading && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              zIndex: 1000,
              background: 'rgba(255,255,255,0.85)',
              borderRadius: 6,
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              pointerEvents: 'none',
            }}
          >
            <Spin size="small" />
            <span>{t('Loading boundaries…')}</span>
          </div>
        )}

        {error && <div className="map-error-message">{error}</div>}
        {boundaryPendingStalled && (
          <div
            style={{
              position: 'absolute',
              top: 46,
              right: 8,
              zIndex: 1001,
              background: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <button
              type="button"
              onClick={handleRetryBoundariesNow}
              style={{
                border: '1px solid #94a3b8',
                background: '#f8fafc',
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {t('Retry boundaries now')}
            </button>
          </div>
        )}

        {/* Show message when no data is available (possibly due to query timeout) */}
        {!showMapLoadingOverlay && !error && effectiveData.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '20px 30px',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              zIndex: 1000,
              textAlign: 'center',
              maxWidth: '400px',
            }}
          >
            <div
              style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}
            >
              {t('No data available')}
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {t('The query returned no results. This could be due to:')}
              <ul
                style={{
                  textAlign: 'left',
                  margin: '10px 0',
                  paddingLeft: '20px',
                }}
              >
                <li>{t('Query timeout (try reducing date range)')}</li>
                <li>{t('No data for selected filters')}</li>
                <li>{t('Missing data in the source system')}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Legend overlay — floats over the map */}
        {showLegend && (
          <LegendPanel
            colorScale={colorScale}
            valueRange={valueRange}
            position={(legendPosition as any) || 'bottomright'}
            displayType={
              (legendDisplayType as LegendDisplayType) || 'vertical_list'
            }
            classes={legendClasses}
            metricName={metricDisplayName}
            noDataColor={legendNoDataColor}
            levelBorderColors={levelBorderColors}
            levelLabels={boundaryLevelLabels}
            showBoundaryLegend={boundaryLevels && boundaryLevels.length > 1}
            manualBreaks={manualBreaks}
            manualColors={manualColors}
            stagedLegendDefinition={effectiveStagedLegendDefinition}
            legendEntries={computedLegendEntries}
          />
        )}

        {/* Compass overlay */}
        {compassVisible && (
          <MapCompass
            position={(compassPosition as any) || 'topright'}
            style={(compassStyle as CompassStyle) || 'north_badge'}
          />
        )}

        {!hideQuickFilters && quickFilterColumns.length > 0 && !loading && (
          <FloatingControls className="dhis2-map-quick-filters">
            <FloatingActionButton
              type="button"
              $active={showFilters}
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle filters panel"
            >
              <FilterOutlined /> {t('Quick Filters')}
            </FloatingActionButton>
          </FloatingControls>
        )}
      </MapCanvas>

      {dhis2Data && dhis2Data.length > 0 && !loading && (
        <button
          onClick={() => setShowDataPreview(!showDataPreview)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: showDataPreview ? '#0066cc' : '#ffffff',
            color: showDataPreview ? '#ffffff' : '#333333',
            border: '2px solid #0066cc',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            zIndex: 1001,
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
          }}
          title="Toggle data preview panel"
        >
          📊 Data Preview
        </button>
      )}

      {showDataPreview && (
        /* @ts-ignore - React 19 compatibility */
        <DataPreviewPanel
          data={dhis2Data}
          loading={dhis2DataLoading}
          onClose={() => setShowDataPreview(false)}
        />
      )}

      {!hideQuickFilters && showFilters && (
        <QuickFiltersOverlay className="dhis2-map-quick-filters-panel">
          <FiltersPanel
            data={unfilteredEffectiveData}
            columns={quickFilterColumns}
            filters={localFilters}
            onChange={(col, values) => {
              setLocalFilters(prev => ({
                ...prev,
                [col]: values,
              }));
            }}
            onClose={() => setShowFilters(false)}
          />
        </QuickFiltersOverlay>
      )}
    </MapWrapper>
  );
}

export default DHIS2Map;
