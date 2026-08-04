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

import type { ReactNode } from 'react';
import type L from 'leaflet';

/** A single swatch + label row in the exported legend. */
export interface MapExportLegendItem {
  key: string;
  color: string;
  label: string;
  /** Org units in this class. Omitted when the class has no numeric range. */
  count?: number;
}

/** A boundary-level row (line swatch + level name). */
export interface MapExportLevelItem {
  key: string;
  color: string;
  /** Line thickness in CSS px. */
  width: number;
  label: string;
}

/**
 * A rendered boundary feature.
 *
 * Structural rather than `GeoJSON.Feature`: the vizzes' own `BoundaryFeature`
 * types geometry as a plain union (`'Point' | 'Polygon' | 'MultiPolygon'` with
 * a union of coordinate shapes) rather than GeoJSON's discriminated union, so
 * the strict type rejects it. The exporter never reads the geometry — it only
 * forwards these to Leaflet to compute bounds — so the exact shape is not part
 * of this contract.
 */
export interface MapExportBoundary {
  type: 'Feature';
  geometry: unknown;
  properties?: unknown;
  id?: string | number;
}

/**
 * Everything a map visualization hands the exporter. Deliberately free of any
 * viz-specific types so `DHIS2Map` and `UGMaps` can both produce one.
 */
export interface MapExportSpec {
  /** Root element of the viz — the one carrying the export-id attribute. */
  rootElement: HTMLElement | null;
  /** The live Leaflet map. Used for the tight crop and the scale bar. */
  mapInstance: L.Map | null;
  /** Rendered boundary features, used to compute the tight crop bounds. */
  boundaries: MapExportBoundary[];
  title?: string;
  subtitle?: string;
  /** Legend heading — usually the metric display name. */
  metricName: string;
  /** Period shown under the metric name, e.g. "This year". */
  periodLabel?: string;
  legendItems: MapExportLegendItem[];
  /** Colour of the "No data" swatch, as a CSS colour string. */
  noDataColor: string;
  levelItems?: MapExportLevelItem[];
  /** Heading above `levelItems`, e.g. "Boundary levels". */
  levelsHeading?: string;
  /** Attribution HTML from the active basemap config; empty to omit. */
  attributionHtml?: string;
  /** Map canvas background, used to letterbox the crop when needed. */
  backgroundColor?: string;
  /**
   * Rendered inside the map frame when the viz has its compass turned on.
   * Passed as a node so each viz keeps using its own compass component rather
   * than the exporter depending on one of them.
   */
  compassNode?: ReactNode;
}

/** Registered by a viz; called at download time to snapshot current state. */
export type MapExportSpecGetter = () => MapExportSpec;
