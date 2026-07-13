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
import { resolveCssVarColors } from './resolveCssVarColors';

describe('resolveCssVarColors', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  test('uses the fallback when the property is undefined (jsdom default)', () => {
    expect(
      resolveCssVarColors({ color: 'var(--pro-accent, #1976D2)' }),
    ).toEqual({ color: '#1976D2' });
  });

  test('prefers the live property value over the fallback', () => {
    document.documentElement.style.setProperty('--pro-accent', '#82B1FF');
    expect(
      resolveCssVarColors({ color: 'var(--pro-accent, #1976D2)' }),
    ).toEqual({ color: '#82B1FF' });
  });

  test('follows a fallback that is itself a var()', () => {
    expect(
      resolveCssVarColors({ c: 'var(--missing, var(--also-missing, #abc))' }),
    ).toEqual({ c: '#abc' });
  });

  test('resolves nested arrays and objects, leaving non-var strings alone', () => {
    const option = {
      series: [
        { itemStyle: { color: 'var(--pro-danger, #D32F2F)' } },
        { lineStyle: { color: '#7C4DFF', type: 'dashed' } },
      ],
      xAxis: { axisLabel: { color: 'var(--pro-text-muted, #9CA3AF)' } },
      grid: { top: 40 },
    };
    expect(resolveCssVarColors(option)).toEqual({
      series: [
        { itemStyle: { color: '#D32F2F' } },
        { lineStyle: { color: '#7C4DFF', type: 'dashed' } },
      ],
      xAxis: { axisLabel: { color: '#9CA3AF' } },
      grid: { top: 40 },
    });
  });

  test('leaves a bare var() with no fallback and no live value unchanged', () => {
    expect(resolveCssVarColors({ c: 'var(--nope)' })).toEqual({
      c: 'var(--nope)',
    });
  });

  test('leaves plain rgba/hex untouched', () => {
    expect(
      resolveCssVarColors({ a: 'rgba(211, 47, 47, 0.06)', b: '#fff' }),
    ).toEqual({ a: 'rgba(211, 47, 47, 0.06)', b: '#fff' });
  });

  test('returns the SAME reference when nothing contains var() (no copy)', () => {
    // Clone-on-write: a large option with no var() must not be reallocated.
    const data = [1, 2, 3, 4, 5];
    const option = { series: [{ data }], grid: { top: 40 } };
    const result = resolveCssVarColors(option);
    expect(result).toBe(option);
    expect(result.series).toBe(option.series);
    expect(result.series[0].data).toBe(data);
  });

  test('copies only the branch that changed, sharing the rest', () => {
    const bigData = [1, 2, 3];
    const option = {
      series: [{ data: bigData }],
      xAxis: { axisLabel: { color: 'var(--x, #abc)' } },
    };
    const result = resolveCssVarColors(option);
    expect(result).not.toBe(option); // root changed
    expect(result.series).toBe(option.series); // untouched branch shared
    expect(result.series[0].data).toBe(bigData);
    expect(result.xAxis.axisLabel.color).toBe('#abc'); // changed branch resolved
  });
});
