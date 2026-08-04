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
import { captureLeafletMap } from './captureLeafletMap';
import { EXPORT_HIDE_ATTRIBUTE, MAP_EXPORTING_CLASS } from './constants';

jest.mock('dom-to-image-more', () => ({
  __esModule: true,
  default: { toPng: jest.fn() },
}));

const toPng = domToImage.toPng as jest.Mock;

const buildRoot = () => {
  const root = document.createElement('div');
  const container = document.createElement('div');
  container.className = 'leaflet-container';
  Object.defineProperty(container, 'offsetWidth', { value: 900 });
  Object.defineProperty(container, 'offsetHeight', { value: 600 });
  root.appendChild(container);
  document.body.appendChild(root);
  return root;
};

const lastFilter = () => toPng.mock.calls.at(-1)[1].filter;

const elementWith = (className: string, hidden = false) => {
  const el = document.createElement('div');
  el.className = className;
  if (hidden) {
    el.setAttribute(EXPORT_HIDE_ATTRIBUTE, '');
  }
  return el;
};

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  toPng.mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
});

describe('captureLeafletMap', () => {
  test('reports the container size so the crop can work in its coordinates', async () => {
    const capture = await captureLeafletMap(buildRoot());

    expect(capture).toMatchObject({
      containerWidth: 900,
      containerHeight: 600,
      scale: 3,
    });
  });

  test('marks the root while capturing and unmarks it afterwards', async () => {
    const root = buildRoot();
    let classDuringCapture = '';
    toPng.mockImplementation(async () => {
      classDuringCapture = root.className;
      return 'data:image/png;base64,iVBORw0KGgo=';
    });

    await captureLeafletMap(root);

    expect(classDuringCapture).toContain(MAP_EXPORTING_CLASS);
    expect(root.className).not.toContain(MAP_EXPORTING_CLASS);
  });

  test('unmarks the root even when the capture throws', async () => {
    const root = buildRoot();
    toPng.mockRejectedValue(new Error('nope'));

    await expect(captureLeafletMap(root)).rejects.toThrow('nope');

    expect(root.className).not.toContain(MAP_EXPORTING_CLASS);
  });

  test('drops screen-only chrome but keeps map content', async () => {
    await captureLeafletMap(buildRoot());
    const filter = lastFilter();

    expect(filter(elementWith('map-zoom-controls', true))).toBe(false);
    expect(filter(elementWith('map-label'))).toBe(true);
    // Tiles are kept on the first attempt.
    expect(filter(elementWith('leaflet-tile-pane'))).toBe(true);
  });

  test('drops the tile pane when retrying without the basemap', async () => {
    await captureLeafletMap(buildRoot(), { skipTiles: true });
    const filter = lastFilter();

    expect(filter(elementWith('leaflet-tile-pane'))).toBe(false);
    // Only the basemap goes; the data stays.
    expect(filter(elementWith('map-label'))).toBe(true);
  });

  test('busts the cache and placeholders failed tiles, so CORS cannot sink it', async () => {
    await captureLeafletMap(buildRoot());
    const options = toPng.mock.calls.at(-1)[1];

    expect(options.cacheBust).toBe(true);
    expect(options.imagePlaceholder).toEqual(expect.stringContaining('data:'));
  });

  test('refuses a root with no map rather than producing a blank image', async () => {
    const empty = document.createElement('div');

    await expect(captureLeafletMap(empty)).rejects.toThrow(
      'No Leaflet container found',
    );
    expect(toPng).not.toHaveBeenCalled();
  });

  test('refuses an unmeasured map container', async () => {
    const root = document.createElement('div');
    const container = document.createElement('div');
    container.className = 'leaflet-container';
    root.appendChild(container);

    await expect(captureLeafletMap(root)).rejects.toThrow('has no size');
    expect(toPng).not.toHaveBeenCalled();
  });
});
