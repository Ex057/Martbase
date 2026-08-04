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

import domToImage from 'dom-to-image-more';
import { EXPORT_HIDE_ATTRIBUTE, MAP_EXPORTING_CLASS } from './constants';

/**
 * Oversampling factor for the Leaflet capture. Leaflet's vector paths are
 * re-rasterised at this size so boundaries and labels stay sharp; raster
 * basemap tiles are upscaled and will be softer.
 */
export const LEAFLET_CAPTURE_SCALE = 3;

/** 1x1 transparent PNG, substituted for a tile that could not be inlined. */
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export interface LeafletCapture {
  dataUrl: string;
  /** Leaflet container size in CSS px, before oversampling. */
  containerWidth: number;
  containerHeight: number;
  scale: number;
}

export interface CaptureOptions {
  backgroundColor?: string;
  /**
   * Drop the basemap tile pane. Used as a retry when tile inlining fails, so a
   * CORS-blocked basemap costs the basemap rather than the whole export.
   */
  skipTiles?: boolean;
}

const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });

const isHiddenForExport = (node: Node): boolean =>
  node instanceof Element && node.hasAttribute(EXPORT_HIDE_ATTRIBUTE);

const isTilePane = (node: Node): boolean =>
  node instanceof Element && node.classList.contains('leaflet-tile-pane');

/**
 * Rasterise just the Leaflet canvas of a map viz, with on-map chrome hidden.
 *
 * Only `.leaflet-container` is captured, so overlays rendered as siblings of
 * the map (title, legend, basemap selector, quick filters) are excluded for
 * free — the export composes its own versions of those.
 */
export async function captureLeafletMap(
  root: HTMLElement,
  { backgroundColor, skipTiles = false }: CaptureOptions = {},
): Promise<LeafletCapture> {
  const container = root.querySelector<HTMLElement>('.leaflet-container');
  if (!container) {
    throw new Error('No Leaflet container found in map root');
  }

  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;
  if (containerWidth <= 0 || containerHeight <= 0) {
    throw new Error('Leaflet container has no size');
  }

  root.classList.add(MAP_EXPORTING_CLASS);
  try {
    // Let the chrome-hiding CSS take effect before we clone the DOM.
    await nextFrame();

    const dataUrl = await domToImage.toPng(container, {
      width: containerWidth * LEAFLET_CAPTURE_SCALE,
      height: containerHeight * LEAFLET_CAPTURE_SCALE,
      style: {
        transform: `scale(${LEAFLET_CAPTURE_SCALE})`,
        transformOrigin: 'top left',
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
      },
      bgcolor: backgroundColor,
      filter: (node: Node) =>
        !isHiddenForExport(node) && !(skipTiles && isTilePane(node)),
      /*
        Basemap tiles are the fragile part. Leaflet loads them into plain
        <img> elements without `crossOrigin`, so the cached response is opaque;
        dom-to-image then re-fetches each URL in CORS mode to inline it. Cache
        busting keeps that fetch off the opaque cache entry, and the placeholder
        means a tile that still fails costs one tile rather than rejecting the
        whole render.
      */
      cacheBust: true,
      imagePlaceholder: TRANSPARENT_PIXEL,
    });

    return {
      dataUrl,
      containerWidth,
      containerHeight,
      scale: LEAFLET_CAPTURE_SCALE,
    };
  } finally {
    root.classList.remove(MAP_EXPORTING_CLASS);
  }
}
