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

import type L from 'leaflet';

/** Sample width, in container px, used to measure ground distance. */
const SAMPLE_WIDTH_PX = 100;

export interface ScaleBar {
  /** Human-readable distance, e.g. "50 km". */
  label: string;
  /** Bar length in export-layout px. */
  widthPx: number;
}

export interface ScaleBarInput {
  /**
   * Ground metres covered by one pixel of the *original* Leaflet container.
   */
  metersPerContainerPixel: number;
  /**
   * Factor by which the captured map is scaled when placed into the export
   * layout. The bar length must be scaled by the same factor, otherwise the
   * stated distance no longer matches the rendered bar.
   */
  displayScale: number;
  /** Largest bar length we are willing to draw, in export-layout px. */
  maxWidthPx: number;
}

/**
 * Largest "nice" distance (1, 2 or 5 times a power of ten) not exceeding
 * `maxMeters`. Returns null when no such value exists.
 */
export function pickNiceDistance(maxMeters: number): number | null {
  if (!Number.isFinite(maxMeters) || maxMeters < 1) {
    return null;
  }
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  const candidates = [5 * magnitude, 2 * magnitude, magnitude];
  return candidates.find(candidate => candidate <= maxMeters) ?? null;
}

/** "500 m" below a kilometre, "50 km" at or above it. */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : Number(km.toFixed(1))} km`;
  }
  return `${Number.isInteger(meters) ? meters : Number(meters.toFixed(1))} m`;
}

/**
 * Pure scale-bar computation. Returns null when the map is degenerate (zero
 * width, non-finite projection) rather than drawing a misleading bar.
 */
export function computeScaleBar({
  metersPerContainerPixel,
  displayScale,
  maxWidthPx,
}: ScaleBarInput): ScaleBar | null {
  if (
    !Number.isFinite(metersPerContainerPixel) ||
    metersPerContainerPixel <= 0 ||
    !Number.isFinite(displayScale) ||
    displayScale <= 0 ||
    !Number.isFinite(maxWidthPx) ||
    maxWidthPx <= 0
  ) {
    return null;
  }

  const metersPerLayoutPixel = metersPerContainerPixel / displayScale;
  const distance = pickNiceDistance(maxWidthPx * metersPerLayoutPixel);
  if (distance === null) {
    return null;
  }

  return {
    label: formatDistance(distance),
    widthPx: distance / metersPerLayoutPixel,
  };
}

/**
 * Ground metres per container pixel, measured horizontally across the middle
 * of the map so the value reflects the latitude actually being viewed.
 */
export function measureMetersPerPixel(map: L.Map): number {
  const size = map.getSize();
  const y = size.y / 2;
  const left = map.containerPointToLatLng([
    0,
    y,
  ] as unknown as L.PointExpression);
  const right = map.containerPointToLatLng([
    SAMPLE_WIDTH_PX,
    y,
  ] as unknown as L.PointExpression);
  return left.distanceTo(right) / SAMPLE_WIDTH_PX;
}
