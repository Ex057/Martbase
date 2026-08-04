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

import L from 'leaflet';
import { LeafletCapture } from './captureLeafletMap';
import type { MapExportBoundary } from './types';

/** Breathing room around the boundaries, as a fraction of the crop's long side. */
const CROP_PADDING_RATIO = 0.04;

/** Ceiling on output resolution relative to the layout's own rasterisation. */
const MAX_OVERSAMPLE = 1.5;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  dataUrl: string;
  /**
   * Export-layout px per original Leaflet container px. The scale bar must be
   * multiplied by this, since the cropped map is rescaled to fill the frame.
   */
  displayScale: number;
}

/**
 * Grow `rect` to `targetAspect` without ever shrinking it, then slide it back
 * inside `bounds` where there is room. Whatever still falls outside is
 * letterboxed by the caller.
 */
export function fitRectToAspect(
  rect: Rect,
  targetAspect: number,
  bounds: { width: number; height: number },
): Rect {
  let { x, y, width, height } = rect;

  if (width / height < targetAspect) {
    const grown = height * targetAspect;
    x -= (grown - width) / 2;
    width = grown;
  } else {
    const grown = width / targetAspect;
    y -= (grown - height) / 2;
    height = grown;
  }

  // Prefer real map pixels over empty background: shift the rect back into
  // the container when it overhangs one edge but would still fit.
  if (width <= bounds.width) {
    if (x < 0) x = 0;
    else if (x + width > bounds.width) x = bounds.width - width;
  }
  if (height <= bounds.height) {
    if (y < 0) y = 0;
    else if (y + height > bounds.height) y = bounds.height - height;
  }

  return { x, y, width, height };
}

/**
 * Pixel bounding box of `boundaries` within the Leaflet container, padded.
 * Falls back to the whole container when there is nothing to fit to.
 */
export function computeBoundaryRect(
  map: L.Map | null,
  boundaries: MapExportBoundary[],
  container: { width: number; height: number },
): Rect {
  const full = { x: 0, y: 0, width: container.width, height: container.height };
  if (!map || boundaries.length === 0) {
    return full;
  }

  try {
    // Valid GeoJSON at runtime; see MapExportBoundary for why the static type
    // is looser than Leaflet's. Malformed input lands in the catch below.
    const bounds = L.geoJSON({
      type: 'FeatureCollection',
      features: boundaries,
    } as unknown as GeoJSON.FeatureCollection).getBounds();
    if (!bounds.isValid()) {
      return full;
    }

    const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
    const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
    const width = Math.abs(southEast.x - northWest.x);
    const height = Math.abs(southEast.y - northWest.y);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return full;
    }
    if (width < 1 || height < 1) {
      return full;
    }

    const padding = Math.max(width, height) * CROP_PADDING_RATIO;
    return {
      x: Math.min(northWest.x, southEast.x) - padding,
      y: Math.min(northWest.y, southEast.y) - padding,
      width: width + padding * 2,
      height: height + padding * 2,
    };
  } catch {
    return full;
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('Failed to load captured map image'));
    image.src = src;
  });

export interface CropMapImageOptions {
  capture: LeafletCapture;
  map: L.Map | null;
  boundaries: MapExportBoundary[];
  /** Size of the map frame in the export layout, in CSS px. */
  targetWidth: number;
  targetHeight: number;
  /** Rasterisation factor applied to the export layout as a whole. */
  layoutScale: number;
  backgroundColor?: string;
}

/**
 * Crop the captured map to the rendered boundaries — this is what removes the
 * large empty margins the plain screenshot used to include.
 */
export async function cropMapImage({
  capture,
  map,
  boundaries,
  targetWidth,
  targetHeight,
  layoutScale,
  backgroundColor,
}: CropMapImageOptions): Promise<CropResult> {
  const container = {
    width: capture.containerWidth,
    height: capture.containerHeight,
  };
  const rect = fitRectToAspect(
    computeBoundaryRect(map, boundaries, container),
    targetWidth / targetHeight,
    container,
  );

  const image = await loadImage(capture.dataUrl);

  // Keep the crop's own resolution, capped so a large container cannot produce
  // a needlessly huge canvas.
  const maxWidth = targetWidth * layoutScale * MAX_OVERSAMPLE;
  const canvasWidth = Math.round(
    Math.min(rect.width * capture.scale, maxWidth),
  );
  const canvasHeight = Math.round(canvasWidth * (rect.height / rect.width));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(canvasWidth, 1);
  canvas.height = Math.max(canvasHeight, 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D context for map crop');
  }

  ctx.fillStyle = backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    rect.x * capture.scale,
    rect.y * capture.scale,
    rect.width * capture.scale,
    rect.height * capture.scale,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return {
    dataUrl: canvas.toDataURL('image/png'),
    displayScale: targetWidth / rect.width,
  };
}
