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

import ReactDOM from 'react-dom';
import domToImage from 'dom-to-image-more';
import { saveAs } from 'file-saver';
import { captureLeafletMap } from './captureLeafletMap';
import { cropMapImage } from './cropMapImage';
import { dataUrlToBlob } from './dataUrl';
import MapExportLayout, {
  LAYOUT_HEIGHT,
  LAYOUT_SCALE,
  LAYOUT_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
} from './MapExportLayout';
import { computeScaleBar, measureMetersPerPixel } from './scaleBar';
import { MapExportSpec } from './types';

/** Formats the composed export can be written as. */
export type MapExportFormat = 'png' | 'jpg' | 'svg';

/** Longest scale bar we will draw, as a fraction of the map frame width. */
const SCALE_BAR_MAX_WIDTH_RATIO = 0.22;

/**
 * The export is a standalone print artefact, so it is white regardless of the
 * app theme the chart happens to be viewed in.
 */
// eslint-disable-next-line theme-colors/no-literal-colors
const EXPORT_BACKGROUND = '#ffffff';

const nextFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });

function buildScaleBar(spec: MapExportSpec, displayScale: number) {
  if (!spec.mapInstance) {
    return null;
  }
  try {
    return computeScaleBar({
      metersPerContainerPixel: measureMetersPerPixel(spec.mapInstance),
      displayScale,
      maxWidthPx: MAP_WIDTH * SCALE_BAR_MAX_WIDTH_RATIO,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not compute map scale bar', error);
    return null;
  }
}

/**
 * Capture the map, retrying without the basemap if tile inlining fails.
 *
 * Tiles are loaded by Leaflet into plain <img> elements, so a basemap host that
 * blocks cross-origin reads can sink the whole render. Losing the basemap is a
 * far better outcome than losing the export — the boundaries, legend and title
 * are what the image is for.
 */
async function captureWithTileFallback(
  root: HTMLElement,
  backgroundColor?: string,
) {
  try {
    return await captureLeafletMap(root, { backgroundColor });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      'Map capture failed with the basemap; retrying without tiles',
      error,
    );
    return captureLeafletMap(root, { backgroundColor, skipTiles: true });
  }
}

/**
 * Render the export layout offscreen and rasterise it.
 *
 * The layout is mounted into a detached React root rather than composed on a
 * canvas so text wrapping, the legend and the viz's own compass component all
 * come out of normal DOM layout.
 */
async function rasterizeLayout(
  spec: MapExportSpec,
  mapImage: string,
  displayScale: number,
  format: MapExportFormat,
): Promise<string> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position: fixed',
    'left: -100000px',
    'top: 0',
    `width: ${LAYOUT_WIDTH}px`,
    `height: ${LAYOUT_HEIGHT}px`,
    'pointer-events: none',
    'z-index: -1000',
  ].join('; ');
  document.body.appendChild(host);

  try {
    // ReactDOM.render (React 17) commits synchronously; the frames below are
    // only to let layout settle before we measure and rasterise.
    ReactDOM.render(
      <MapExportLayout
        spec={spec}
        mapImage={mapImage}
        scaleBar={buildScaleBar(spec, displayScale)}
      />,
      host,
    );

    await nextFrame();
    await nextFrame();

    const image = host.querySelector('img');
    if (image?.decode) {
      await image.decode().catch(() => undefined);
    }

    const layout = host.firstElementChild as HTMLElement | null;
    if (!layout) {
      throw new Error('Export layout failed to mount');
    }

    const options = {
      width: LAYOUT_WIDTH * LAYOUT_SCALE,
      height: LAYOUT_HEIGHT * LAYOUT_SCALE,
      style: {
        transform: `scale(${LAYOUT_SCALE})`,
        transformOrigin: 'top left',
      },
      bgcolor: EXPORT_BACKGROUND,
      cacheBust: false,
    };
    if (format === 'jpg') {
      return await domToImage.toJpeg(layout, { ...options, quality: 0.95 });
    }
    if (format === 'svg') {
      return await domToImage.toSvg(layout, options);
    }
    return await domToImage.toPng(layout, options);
  } finally {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  }
}

/**
 * Run one stage, labelling any failure with the stage that produced it.
 *
 * The caller silently falls back to a plain screenshot, so without this an
 * export that breaks anywhere in the pipeline is indistinguishable from one
 * that never ran.
 */
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Map export failed during "${name}": ${detail}`, {
      cause: error,
    });
  }
}

/**
 * Produce a composed, print-quality PNG of a map viz: the map cropped tight to
 * its boundaries, with title, legend, scale bar and attribution laid out
 * around it.
 *
 * Throws on failure so the caller can fall back to the generic chart capture.
 */
export default async function exportMapImage(
  spec: MapExportSpec,
  fileStem: string,
  format: MapExportFormat = 'png',
): Promise<void> {
  if (!spec.rootElement) {
    throw new Error('Map export failed: map root element is not available');
  }

  const capture = await stage('capture', () =>
    captureWithTileFallback(spec.rootElement!, spec.backgroundColor),
  );

  const { dataUrl: mapImage, displayScale } = await stage('crop', () =>
    cropMapImage({
      capture,
      map: spec.mapInstance,
      boundaries: spec.boundaries,
      targetWidth: MAP_WIDTH,
      targetHeight: MAP_HEIGHT,
      layoutScale: LAYOUT_SCALE,
      backgroundColor: spec.backgroundColor,
    }),
  );

  const layoutDataUrl = await stage('layout', () =>
    rasterizeLayout(spec, mapImage, displayScale, format),
  );

  await stage('save', async () =>
    saveAs(dataUrlToBlob(layoutDataUrl), `${fileStem}.${format}`),
  );
}
