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

import { countFeaturesPerClass } from './legendCounts';

// Mirrors the DHIS2 reference: 14 – 553 split into five equal classes.
const CLASSES = [
  { min: 14, max: 121.8 },
  { min: 121.8, max: 229.6 },
  { min: 229.6, max: 337.4 },
  { min: 337.4, max: 445.2 },
  { min: 445.2, max: 553 },
];

describe('countFeaturesPerClass', () => {
  test('counts each value in exactly one class', () => {
    const values = [20, 90, 130, 300, 400, 500, 460];

    const counts = countFeaturesPerClass(CLASSES, values);

    expect(counts).toEqual([2, 1, 1, 1, 2]);
    expect(counts.reduce((sum, n) => (sum ?? 0) + (n ?? 0), 0)).toBe(
      values.length,
    );
  });

  test('puts a value on a boundary in the class it starts', () => {
    expect(countFeaturesPerClass(CLASSES, [121.8])).toEqual([0, 1, 0, 0, 0]);
    expect(countFeaturesPerClass(CLASSES, [229.6])).toEqual([0, 0, 1, 0, 0]);
  });

  test('counts the overall maximum in the last class rather than nowhere', () => {
    // The whole point of making the final class inclusive.
    expect(countFeaturesPerClass(CLASSES, [553])).toEqual([0, 0, 0, 0, 1]);
  });

  test('reports empty classes as 0, matching the reference', () => {
    expect(countFeaturesPerClass(CLASSES, [20])).toEqual([1, 0, 0, 0, 0]);
  });

  test('ignores values outside every class', () => {
    expect(countFeaturesPerClass(CLASSES, [-5, 1000])).toEqual([0, 0, 0, 0, 0]);
  });

  test('ignores non-numeric and missing values', () => {
    const counts = countFeaturesPerClass(CLASSES, [
      20,
      undefined,
      null,
      Number.NaN,
      Infinity,
    ]);

    expect(counts).toEqual([1, 0, 0, 0, 0]);
  });

  test('returns undefined for a class with no usable range', () => {
    const counts = countFeaturesPerClass(
      [{ min: 0, max: 10 }, { label: 'unbounded' } as never, { min: 10 }],
      [5, 20],
    );

    expect(counts[0]).toBe(1);
    expect(counts[1]).toBeUndefined();
    expect(counts[2]).toBeUndefined();
  });

  test('treats the last ranged class as final, ignoring trailing rangeless ones', () => {
    const counts = countFeaturesPerClass(
      [{ min: 0, max: 10 }, { min: 10, max: 20 }, {} as never],
      [20],
    );

    // 20 is the max of the last *ranged* class, so it belongs there.
    expect(counts).toEqual([0, 1, undefined]);
  });

  test('handles no classes and no values', () => {
    expect(countFeaturesPerClass([], [1, 2])).toEqual([]);
    expect(countFeaturesPerClass(CLASSES, [])).toEqual([0, 0, 0, 0, 0]);
  });
});
