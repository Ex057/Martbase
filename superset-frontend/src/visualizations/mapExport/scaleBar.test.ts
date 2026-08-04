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

import { computeScaleBar, formatDistance, pickNiceDistance } from './scaleBar';

describe('pickNiceDistance', () => {
  test('picks the largest 1/2/5 multiple that fits', () => {
    expect(pickNiceDistance(1000)).toBe(1000);
    expect(pickNiceDistance(999)).toBe(500);
    expect(pickNiceDistance(499)).toBe(200);
    expect(pickNiceDistance(199)).toBe(100);
    expect(pickNiceDistance(87_000)).toBe(50_000);
  });

  test('returns null when nothing sensible fits', () => {
    expect(pickNiceDistance(0.5)).toBeNull();
    expect(pickNiceDistance(0)).toBeNull();
    expect(pickNiceDistance(Number.NaN)).toBeNull();
  });
});

describe('formatDistance', () => {
  test('switches to kilometres at 1000 m', () => {
    expect(formatDistance(500)).toBe('500 m');
    expect(formatDistance(1000)).toBe('1 km');
    expect(formatDistance(50_000)).toBe('50 km');
  });
});

describe('computeScaleBar', () => {
  test('scales the bar by displayScale so the stated distance stays true', () => {
    // 500 m per container px, and the crop is enlarged 2x into the layout, so
    // one layout px covers 250 m.
    const bar = computeScaleBar({
      metersPerContainerPixel: 500,
      displayScale: 2,
      maxWidthPx: 264,
    });

    // 264 layout px * 250 m = 66 km available -> 50 km is the nice value.
    expect(bar).toEqual({ label: '50 km', widthPx: 200 });
  });

  test('produces a shorter bar for the same distance when not rescaled', () => {
    const bar = computeScaleBar({
      metersPerContainerPixel: 500,
      displayScale: 1,
      maxWidthPx: 264,
    });

    // 264 px * 500 m = 132 km available -> 100 km over 200 px.
    expect(bar).toEqual({ label: '100 km', widthPx: 200 });
  });

  test('keeps the rendered bar within the allowed width', () => {
    const inputs = [0.5, 5, 50, 500, 5000];
    inputs.forEach(metersPerContainerPixel => {
      const bar = computeScaleBar({
        metersPerContainerPixel,
        displayScale: 1.7,
        maxWidthPx: 264,
      });
      expect(bar).not.toBeNull();
      expect(bar!.widthPx).toBeGreaterThan(0);
      expect(bar!.widthPx).toBeLessThanOrEqual(264);
    });
  });

  test('bails out rather than drawing a misleading bar', () => {
    expect(
      computeScaleBar({
        metersPerContainerPixel: 0,
        displayScale: 1,
        maxWidthPx: 264,
      }),
    ).toBeNull();
    expect(
      computeScaleBar({
        metersPerContainerPixel: 100,
        displayScale: 0,
        maxWidthPx: 264,
      }),
    ).toBeNull();
    expect(
      computeScaleBar({
        metersPerContainerPixel: 100,
        displayScale: 1,
        maxWidthPx: 0,
      }),
    ).toBeNull();
  });
});
