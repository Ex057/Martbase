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
import { makeApi } from '@superset-ui/core';
import { act, renderHook } from '@testing-library/react-hooks';
import { useDashboardCharts } from './dashboards';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual<any>('@superset-ui/core'),
  makeApi: jest.fn().mockReturnValue(
    jest.fn().mockResolvedValue({
      result: [],
    }),
  ),
}));

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

afterEach(() => {
  (makeApi as jest.Mock).mockClear();
});

test('uses the path-based charts endpoint for public dashboards', async () => {
  renderHook(() => useDashboardCharts(7, true));

  await act(async () => {
    jest.runAllTimers();
  });

  expect(makeApi).toHaveBeenCalledWith({
    method: 'GET',
    endpoint: '/api/v1/chart/dashboard/7/charts',
  });
});
