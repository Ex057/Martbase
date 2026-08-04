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
import { computeBoundaryRect, fitRectToAspect } from './cropMapImage';

const CONTAINER = { width: 900, height: 600 };

const square = (
  west: number,
  south: number,
  east: number,
  north: number,
): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  },
});

/**
 * Stand-in for the Leaflet map: projects 1 degree to 10 container px, with the
 * origin at the container's top-left and latitude increasing upwards.
 */
const fakeMap = {
  latLngToContainerPoint: ({ lat, lng }: { lat: number; lng: number }) => ({
    x: lng * 10,
    y: (90 - lat) * 10,
  }),
} as unknown as L.Map;

describe('fitRectToAspect', () => {
  test('widens a too-tall rect instead of cropping it', () => {
    const fitted = fitRectToAspect(
      { x: 400, y: 100, width: 100, height: 300 },
      4 / 3,
      CONTAINER,
    );

    expect(fitted.height).toBe(300);
    expect(fitted.width).toBe(400);
    // Grown symmetrically around the original centre (450).
    expect(fitted.x + fitted.width / 2).toBe(450);
  });

  test('heightens a too-wide rect instead of cropping it', () => {
    const fitted = fitRectToAspect(
      { x: 100, y: 250, width: 400, height: 100 },
      4 / 3,
      CONTAINER,
    );

    expect(fitted.width).toBe(400);
    expect(fitted.height).toBe(300);
    expect(fitted.y + fitted.height / 2).toBe(300);
  });

  test('slides a rect back inside the container rather than letterboxing', () => {
    const fitted = fitRectToAspect(
      { x: 10, y: 10, width: 100, height: 300 },
      4 / 3,
      CONTAINER,
    );

    // Growing to 400 wide would push x to -140; it fits, so it is shifted to 0.
    expect(fitted.x).toBe(0);
    expect(fitted.width).toBe(400);
  });

  test('lets an oversized rect overhang, to be letterboxed', () => {
    const fitted = fitRectToAspect(
      { x: -50, y: 0, width: 1000, height: 600 },
      4 / 3,
      CONTAINER,
    );

    expect(fitted.width).toBe(1000);
    expect(fitted.x).toBe(-50);
  });
});

describe('computeBoundaryRect', () => {
  test('falls back to the full container without a map or boundaries', () => {
    const full = { x: 0, y: 0, ...CONTAINER };
    expect(computeBoundaryRect(null, [square(0, 0, 1, 1)], CONTAINER)).toEqual(
      full,
    );
    expect(computeBoundaryRect(fakeMap, [], CONTAINER)).toEqual(full);
  });

  test('brackets the boundaries with proportional padding', () => {
    // 30x20 degrees -> 300x200 px, padded by 4% of the long side (12 px).
    const rect = computeBoundaryRect(
      fakeMap,
      [square(10, 0, 40, 20)],
      CONTAINER,
    );

    expect(rect.width).toBeCloseTo(324);
    expect(rect.height).toBeCloseTo(224);
    expect(rect.x).toBeCloseTo(88);
    expect(rect.y).toBeCloseTo(688);
  });

  test('is much smaller than the container when the data is, which is the point', () => {
    const rect = computeBoundaryRect(
      fakeMap,
      [square(10, 0, 40, 20)],
      CONTAINER,
    );

    expect(rect.width).toBeLessThan(CONTAINER.width);
    expect(rect.height).toBeLessThan(CONTAINER.height);
  });

  test('falls back to the full container for a degenerate projection', () => {
    const degenerate = {
      latLngToContainerPoint: () => ({ x: Number.NaN, y: Number.NaN }),
    } as unknown as L.Map;

    expect(
      computeBoundaryRect(degenerate, [square(10, 0, 40, 20)], CONTAINER),
    ).toEqual({ x: 0, y: 0, ...CONTAINER });
  });
});
