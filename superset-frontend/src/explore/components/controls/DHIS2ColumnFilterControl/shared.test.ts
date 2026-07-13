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
import { dhis2ColumnFilterClauses } from './shared';

describe('dhis2ColumnFilterClauses', () => {
  test('returns [] when the control is unset', () => {
    expect(dhis2ColumnFilterClauses({})).toEqual([]);
    expect(dhis2ColumnFilterClauses(undefined)).toEqual([]);
  });

  test('passes concrete period codes through as an IN clause', () => {
    expect(
      dhis2ColumnFilterClauses({
        dhis2_column_filters: [
          { column: 'period', values: ['2024Q1', '2024Q2'] },
        ],
      }),
    ).toEqual([{ col: 'period', op: 'IN', val: ['2024Q1', '2024Q2'] }]);
  });

  test('reads the camelCased key ChartProps produces', () => {
    expect(
      dhis2ColumnFilterClauses({
        dhis2ColumnFilters: [{ column: 'region', values: ['Bukedi'] }],
      }),
    ).toEqual([{ col: 'region', op: 'IN', val: ['Bukedi'] }]);
  });

  test('expands a relative period token against the calendar', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 10));
    try {
      const [clause] = dhis2ColumnFilterClauses({
        dhis2_column_filters: [
          { column: 'period', values: ['REL::LAST_12_MONTHS'] },
        ],
      });
      expect(clause.col).toBe('period');
      expect(clause.val).toEqual(expect.arrayContaining(['202507', '202606']));
      expect(clause.val).not.toContain('202607');
      expect(clause.val).not.toContain('REL::LAST_12_MONTHS');
    } finally {
      jest.useRealTimers();
    }
  });

  test('drops filters with no values and tokens that expand to nothing', () => {
    expect(
      dhis2ColumnFilterClauses({
        dhis2_column_filters: [
          { column: 'period', values: [] },
          { column: 'period', values: ['REL::NONSENSE'] },
          { column: 'region', values: ['Kampala'] },
        ],
      }),
    ).toEqual([{ col: 'region', op: 'IN', val: ['Kampala'] }]);
  });
});
