/*
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

import {
  getDownloadDimensions,
  getPngRenderScale,
  processCloneForVisibility,
} from './downloadAsImage';

test('renders normal PNG downloads at double resolution', () => {
  expect(getPngRenderScale(1200, 800)).toBe(2);
});

test('caps PNG output at the safe canvas dimension', () => {
  expect(getPngRenderScale(10000, 800)).toBeCloseTo(1.6384);
  expect(20000 * getPngRenderScale(20000, 800)).toBeLessThanOrEqual(16384);
});

test('preserves the live dashboard footprint when cloning for export', () => {
  const dashboard = document.createElement('div');
  Object.defineProperties(dashboard, {
    scrollWidth: { value: 2048 },
    scrollHeight: { value: 980 },
  });
  dashboard.getBoundingClientRect = () =>
    ({ width: 1920, height: 900 }) as DOMRect;

  expect(getDownloadDimensions(dashboard)).toEqual({
    width: 2048,
    height: 980,
  });
});

test('does not collapse chart cards that use inline overflow styles', () => {
  const dashboard = document.createElement('div');
  const chartCard = document.createElement('div');
  chartCard.style.height = '620px';
  chartCard.style.overflow = 'hidden';
  dashboard.appendChild(chartCard);

  processCloneForVisibility(dashboard);

  // This focused Jest setup does not install the jest-dom style matcher.
  // eslint-disable-next-line jest-dom/prefer-to-have-style
  expect(chartCard.style.height).toBe('620px');
});
