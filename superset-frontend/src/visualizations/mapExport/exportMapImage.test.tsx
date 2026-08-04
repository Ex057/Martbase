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
import { saveAs } from 'file-saver';
import { captureLeafletMap } from './captureLeafletMap';
import { cropMapImage } from './cropMapImage';
import exportMapImage from './exportMapImage';
import { MapExportSpec } from './types';

// A real 1x1 PNG payload: the save stage decodes this for real, so a stubbed
// or malformed value would be caught here.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG = `data:image/png;base64,${PNG_BASE64}`;

jest.mock('dom-to-image-more', () => ({
  __esModule: true,
  default: { toPng: jest.fn() },
}));

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

// jsdom has no canvas backend, so the crop is stubbed; its geometry is covered
// by cropMapImage.test.ts.
jest.mock('./cropMapImage', () => ({ cropMapImage: jest.fn() }));

jest.mock('./captureLeafletMap', () => ({
  captureLeafletMap: jest.fn(),
  LEAFLET_CAPTURE_SCALE: 3,
}));

const toPng = domToImage.toPng as jest.Mock;
const capture = captureLeafletMap as jest.Mock;
const saved = saveAs as unknown as jest.Mock;
const CAPTURE_RESULT = {
  dataUrl: PNG,
  containerWidth: 900,
  containerHeight: 600,
  scale: 3,
};

const buildRoot = () => {
  const root = document.createElement('div');
  const leaflet = document.createElement('div');
  leaflet.className = 'leaflet-container';
  Object.defineProperty(leaflet, 'offsetWidth', { value: 900 });
  Object.defineProperty(leaflet, 'offsetHeight', { value: 600 });
  root.appendChild(leaflet);
  document.body.appendChild(root);
  return root;
};

const buildSpec = (root: HTMLElement): MapExportSpec => ({
  rootElement: root,
  mapInstance: null,
  boundaries: [],
  title: 'Malaria positivity',
  metricName: 'Positivity rate',
  legendItems: [{ key: 'a', color: '#ffffcc', label: '3 – 19' }],
  noDataColor: 'rgba(204,204,204,1)',
});

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  toPng.mockResolvedValue(PNG);
  capture.mockResolvedValue(CAPTURE_RESULT);
  (cropMapImage as jest.Mock).mockResolvedValue({
    dataUrl: PNG,
    displayScale: 1.5,
  });
});

/*
 * The save stage must not touch the network. This deployment's CSP omits
 * `data:` from `connect-src`, so `fetch(dataUrl)` — the obvious way to turn the
 * rendered image into a Blob — is blocked in the browser with "Failed to
 * fetch". An earlier version of this suite stubbed `global.fetch`, which is
 * exactly why the bug shipped green. Leaving fetch unstubbed keeps that honest.
 */
const failIfFetched = () => {
  global.fetch = jest.fn(() => {
    throw new Error('Failed to fetch');
  }) as unknown as typeof fetch;
};

describe('exportMapImage', () => {
  test('composes a layout and saves it as a PNG', async () => {
    const root = buildRoot();

    await exportMapImage(buildSpec(root), 'malaria-positivity-2026-08-03');

    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][1]).toBe('malaria-positivity-2026-08-03.png');
  });

  test('saves a real, non-empty image blob', async () => {
    const root = buildRoot();

    await exportMapImage(buildSpec(root), 'stem');

    const blob = saved.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(atob(PNG_BASE64).length);
  });

  test('completes without any network request, which CSP would block', async () => {
    failIfFetched();
    const root = buildRoot();

    await exportMapImage(buildSpec(root), 'stem');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test('passes the crop the map frame size so it can fit the aspect', async () => {
    const root = buildRoot();

    await exportMapImage(buildSpec(root), 'stem');

    expect(cropMapImage).toHaveBeenCalledWith(
      expect.objectContaining({ targetWidth: 1200, targetHeight: 900 }),
    );
  });

  test('leaves no offscreen layout behind', async () => {
    const root = buildRoot();

    await exportMapImage(buildSpec(root), 'stem');

    // Only the map root we created remains.
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(root);
  });

  test('still produces an image when the basemap cannot be captured', async () => {
    const root = buildRoot();
    // A CORS-blocked tile host sinks the first attempt.
    capture.mockRejectedValueOnce(new Error('tile fetch blocked'));

    await exportMapImage(buildSpec(root), 'stem');

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[0][1]?.skipTiles).toBeFalsy();
    expect(capture.mock.calls[1][1]).toMatchObject({ skipTiles: true });
    // Losing the basemap must not lose the export.
    expect(saved).toHaveBeenCalledTimes(1);
  });

  test('names the capture stage when the retry without tiles also fails', async () => {
    const root = buildRoot();
    capture.mockRejectedValue(new Error('map is gone'));

    await expect(exportMapImage(buildSpec(root), 'stem')).rejects.toThrow(
      /during "capture": map is gone/,
    );

    expect(saved).not.toHaveBeenCalled();
  });

  test('names the crop stage when the crop fails', async () => {
    const root = buildRoot();
    (cropMapImage as jest.Mock).mockRejectedValue(new Error('no 2d context'));

    await expect(exportMapImage(buildSpec(root), 'stem')).rejects.toThrow(
      /during "crop": no 2d context/,
    );
  });

  test('names the layout stage when rasterising the layout fails', async () => {
    const root = buildRoot();
    toPng.mockRejectedValueOnce(new Error('rasterise blew up'));

    await expect(exportMapImage(buildSpec(root), 'stem')).rejects.toThrow(
      /during "layout": rasterise blew up/,
    );

    expect(saved).not.toHaveBeenCalled();
  });

  test('keeps the original error as the cause, for the console', async () => {
    const root = buildRoot();
    const original = new Error('map is gone');
    capture.mockRejectedValue(original);

    const thrown = await exportMapImage(buildSpec(root), 'stem').catch(e => e);

    expect(thrown.cause).toBe(original);
  });

  test('throws, rather than saving an empty file, with no root element', async () => {
    await expect(
      exportMapImage(
        { ...buildSpec(document.createElement('div')), rootElement: null },
        'stem',
      ),
    ).rejects.toThrow('map root element is not available');

    expect(saved).not.toHaveBeenCalled();
  });
});
