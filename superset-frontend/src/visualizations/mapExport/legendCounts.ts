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

/** The subset of a legend row this module needs: its numeric bounds. */
export interface ClassRange {
  min?: number;
  max?: number;
}

const hasRange = (item: ClassRange): boolean =>
  typeof item.min === 'number' &&
  Number.isFinite(item.min) &&
  typeof item.max === 'number' &&
  Number.isFinite(item.max);

/**
 * How many of `values` fall in each legend class.
 *
 * Classes are half-open (`min <= v < max`) so a value on a boundary belongs to
 * exactly one class, except the last, which includes its own maximum — without
 * that the largest value in the data would be counted nowhere.
 *
 * A class with no usable numeric range yields `undefined` rather than `0`: the
 * caller renders nothing for it, which is honest, where `0` would be a claim.
 */
export function countFeaturesPerClass(
  items: ClassRange[],
  values: Array<number | undefined | null>,
): Array<number | undefined> {
  const usable = values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );

  const lastRanged = items.reduce(
    (last, item, index) => (hasRange(item) ? index : last),
    -1,
  );

  return items.map((item, index) => {
    if (!hasRange(item)) {
      return undefined;
    }
    const min = item.min as number;
    const max = item.max as number;
    const isLast = index === lastRanged;
    return usable.filter(
      value => value >= min && (isLast ? value <= max : value < max),
    ).length;
  });
}
