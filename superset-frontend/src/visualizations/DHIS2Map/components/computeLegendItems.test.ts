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

/*
 * `computeLegendItems` feeds both the on-screen LegendPanel and the image
 * export. The export needed each class's numeric bounds, so the return type
 * grew `min`/`max`. These tests pin the fields the on-screen legend actually
 * renders — key, colour, label — so that addition cannot quietly change what
 * users see on the map.
 */

import { computeLegendItems } from './LegendPanel';

const colorScale = (value: number) => (value > 50 ? '#800026' : '#ffffcc');
const valueRange = { min: 0, max: 100 };

const visible = (items: ReturnType<typeof computeLegendItems>) =>
  items.map(({ key, color, label }) => ({ key, color, label }));

describe('computeLegendItems', () => {
  describe('from precomputed legend entries', () => {
    const legendEntries = [
      { key: 'a', color: '#ffffcc', label: '0 – 50', min: 0, max: 50 },
      { key: 'b', color: '#800026', label: '50 – 100', min: 50, max: 100 },
    ];

    test('renders one row per entry, unchanged', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
        legendEntries,
      });

      expect(visible(items)).toEqual([
        { key: 'a', color: '#ffffcc', label: '0 – 50' },
        { key: 'b', color: '#800026', label: '50 – 100' },
      ]);
    });

    test('carries the bounds through for the export', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
        legendEntries,
      });

      expect(items.map(i => [i.min, i.max])).toEqual([
        [0, 50],
        [50, 100],
      ]);
    });
  });

  describe('from a staged legend definition', () => {
    const stagedLegendDefinition = {
      items: [
        { id: 'low', label: 'Low', startValue: 0, endValue: 10, color: '#eee' },
        {
          id: 'high',
          label: null,
          startValue: 10,
          endValue: 20,
          color: '#333',
        },
      ],
    };

    test('keeps the labelled and unlabelled row formats', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
        stagedLegendDefinition,
      });

      expect(visible(items)).toEqual([
        { key: 'low', color: '#eee', label: 'Low: 0 – 10' },
        { key: 'high', color: '#333', label: '10 – 20' },
      ]);
    });

    test('carries the staged bounds through', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
        stagedLegendDefinition,
      });

      expect(items.map(i => [i.min, i.max])).toEqual([
        [0, 10],
        [10, 20],
      ]);
    });
  });

  describe('from equal-interval breaks', () => {
    test('splits the range into the requested number of classes', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
      });

      expect(visible(items)).toEqual([
        { key: '0-#ffffcc', color: '#ffffcc', label: '0 – 50' },
        { key: '1-#800026', color: '#800026', label: '50 – 100' },
      ]);
      expect(items.map(i => [i.min, i.max])).toEqual([
        [0, 50],
        [50, 100],
      ]);
    });

    test('honours manual breaks and colours', () => {
      const items = computeLegendItems({
        colorScale,
        valueRange,
        classes: 2,
        manualBreaks: [0, 25, 100],
        manualColors: ['#111', '#222'],
      });

      expect(visible(items)).toEqual([
        { key: '0-#111', color: '#111', label: '0 – 25' },
        { key: '1-#222', color: '#222', label: '25 – 100' },
      ]);
    });
  });

  test('prefers precomputed entries over a staged definition', () => {
    const items = computeLegendItems({
      colorScale,
      valueRange,
      classes: 2,
      legendEntries: [{ key: 'only', color: '#abc', label: 'Only' }],
      stagedLegendDefinition: {
        items: [{ id: 'ignored', startValue: 0, endValue: 1, color: '#000' }],
      },
    });

    expect(visible(items)).toEqual([
      { key: 'only', color: '#abc', label: 'Only' },
    ]);
  });
});
