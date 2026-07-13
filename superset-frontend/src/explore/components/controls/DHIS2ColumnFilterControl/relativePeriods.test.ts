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
import {
  classifyPeriodCode,
  availableGranularities,
  getVisibleRelativeGroups,
  expandRelativePeriod,
  expandRelativeTokenByCalendar,
  isRelativeValue,
  relativeTokenOf,
  resolveFilterValues,
} from './relativePeriods';

const MONTHS = [
  '202401',
  '202402',
  '202403',
  '202404',
  '202405',
  '202406',
  '202407',
  '202408',
  '202409',
  '202410',
  '202411',
  '202412',
  '202501',
];

describe('classifyPeriodCode', () => {
  test('classifies DHIS2 period granularities', () => {
    expect(classifyPeriodCode('2024')).toEqual({
      granularity: 'year',
      order: 2024 * 12,
    });
    expect(classifyPeriodCode('202401')?.granularity).toBe('month');
    expect(classifyPeriodCode('2024Q3')?.granularity).toBe('quarter');
  });

  test('ignores unsupported / invalid codes', () => {
    expect(classifyPeriodCode('202413')).toBeUndefined(); // month 13
    expect(classifyPeriodCode('2024W12')).toBeUndefined();
    expect(classifyPeriodCode('')).toBeUndefined();
  });
});

describe('availableGranularities', () => {
  test('reports which granularities are present', () => {
    const set = availableGranularities(['2024', '202401', '2024Q1', 'junk']);
    expect(set.has('year')).toBe(true);
    expect(set.has('month')).toBe(true);
    expect(set.has('quarter')).toBe(true);
    expect(set.size).toBe(3);
  });
});

describe('getVisibleRelativeGroups', () => {
  test('monthly data unlocks month, quarter and year groups', () => {
    const grans = getVisibleRelativeGroups(MONTHS).map(g => g.granularity);
    expect(grans).toEqual(['month', 'quarter', 'year']);
  });

  test('yearly data only unlocks the year group', () => {
    const grans = getVisibleRelativeGroups(['2022', '2023', '2024']).map(
      g => g.granularity,
    );
    expect(grans).toEqual(['year']);
  });

  test('quarterly data unlocks quarter and year, not month', () => {
    const grans = getVisibleRelativeGroups(['2024Q1', '2024Q2']).map(
      g => g.granularity,
    );
    expect(grans).toEqual(['quarter', 'year']);
  });
});

describe('expandRelativePeriod (match periods in the data)', () => {
  test('LAST_12_MONTHS takes the 12 most recent monthly codes present', () => {
    const result = expandRelativePeriod('LAST_12_MONTHS', MONTHS);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('202501'); // most recent first
    expect(result).not.toContain('202401'); // oldest dropped (13 present)
  });

  test('THIS_MONTH takes only the most recent month', () => {
    expect(expandRelativePeriod('THIS_MONTH', MONTHS)).toEqual(['202501']);
  });

  test('LAST_MONTH skips the most recent and takes the previous', () => {
    expect(expandRelativePeriod('LAST_MONTH', MONTHS)).toEqual(['202412']);
  });

  test('LAST_6_MONTHS takes the 6 most recent months', () => {
    expect(expandRelativePeriod('LAST_6_MONTHS', MONTHS)).toEqual([
      '202501',
      '202412',
      '202411',
      '202410',
      '202409',
      '202408',
    ]);
  });

  test('LAST_QUARTER over MONTHLY data selects the previous quarter’s 3 months', () => {
    // Anchor = Dec 2024 (ignoring the stray Jan 2025 for clarity)
    const monthly = MONTHS.filter(m => m !== '202501');
    // This quarter = Q4 2024 (Oct-Dec) -> last quarter = Q3 2024 (Jul-Sep)
    expect(expandRelativePeriod('LAST_QUARTER', monthly).sort()).toEqual([
      '202407',
      '202408',
      '202409',
    ]);
  });

  test('THIS_YEAR over MONTHLY data selects that year’s months', () => {
    const monthly2024 = MONTHS.filter(m => m.startsWith('2024'));
    const result = expandRelativePeriod('THIS_YEAR', monthly2024);
    expect(result).toHaveLength(12);
    expect(result.every(code => code.startsWith('2024'))).toBe(true);
  });

  test('LAST_5_YEARS over YEARLY data selects the year codes', () => {
    const years = ['2019', '2020', '2021', '2022', '2023', '2024'];
    expect(expandRelativePeriod('LAST_5_YEARS', years).sort()).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
    ]);
  });

  test('returns [] for an unknown token', () => {
    expect(expandRelativePeriod('NONSENSE', MONTHS)).toEqual([]);
  });
});

describe('relative token helpers', () => {
  test('recognises and unwraps REL:: values', () => {
    expect(isRelativeValue('REL::LAST_QUARTER')).toBe(true);
    expect(isRelativeValue('202401')).toBe(false);
    expect(relativeTokenOf('REL::LAST_QUARTER')).toBe('LAST_QUARTER');
    expect(relativeTokenOf('202401')).toBeUndefined();
  });
});

describe('expandRelativeTokenByCalendar', () => {
  // 2026-07-10, matching the scenario the feature was built for.
  const JULY_2026 = new Date(2026, 6, 10);

  test('LAST_QUARTER emits the previous quarter at every granularity', () => {
    // Q2 2026 — the quarter before the in-progress Q3. The 2026 year code
    // overlaps the window, so it is emitted too (same rule as the data-anchored
    // expansion), letting yearly datasets match.
    expect(expandRelativeTokenByCalendar('LAST_QUARTER', JULY_2026)).toEqual([
      '202604',
      '202605',
      '202606',
      '2026Q2',
      '2026',
    ]);
  });

  test('LAST_12_MONTHS ends on the previous month, not the current one', () => {
    // Must equal what superset/dhis2/sync_service.py fetches for the same day,
    // otherwise the chart filters on periods the sync never staged.
    const codes = expandRelativeTokenByCalendar('LAST_12_MONTHS', JULY_2026);
    const months = codes.filter(code => /^\d{6}$/.test(code));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('202507');
    expect(months[months.length - 1]).toBe('202606');
    expect(months).not.toContain('202607');
    // Both years the window straddles are offered for yearly datasets.
    expect(codes).toEqual(expect.arrayContaining(['2025', '2026']));
  });

  test('LAST_4_QUARTERS covers the four completed quarters', () => {
    const codes = expandRelativeTokenByCalendar('LAST_4_QUARTERS', JULY_2026);
    const quarters = codes.filter(code => /Q\d$/.test(code));
    expect(quarters).toEqual(['2025Q3', '2025Q4', '2026Q1', '2026Q2']);
    expect(quarters).not.toContain('2026Q3'); // in progress
  });

  test('LAST_5_YEARS covers the five completed years', () => {
    const codes = expandRelativeTokenByCalendar('LAST_5_YEARS', JULY_2026);
    const years = codes.filter(code => /^\d{4}$/.test(code));
    expect(years).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(years).not.toContain('2026'); // in progress
  });

  test('THIS_MONTH emits only the current month', () => {
    expect(expandRelativeTokenByCalendar('THIS_MONTH', JULY_2026)).toEqual([
      '202607',
      '2026Q3',
      '2026',
    ]);
  });

  test('returns [] for an unknown token', () => {
    expect(expandRelativeTokenByCalendar('NONSENSE', JULY_2026)).toEqual([]);
  });
});

describe('resolveFilterValues', () => {
  const JULY_2026 = new Date(2026, 6, 10);

  test('passes concrete codes through untouched', () => {
    expect(resolveFilterValues(['2024Q1', '2024Q2'], JULY_2026)).toEqual([
      '2024Q1',
      '2024Q2',
    ]);
  });

  test('expands a relative token against the calendar', () => {
    expect(resolveFilterValues(['REL::LAST_QUARTER'], JULY_2026)).toEqual([
      '202604',
      '202605',
      '202606',
      '2026Q2',
      '2026',
    ]);
  });

  test('merges tokens with concrete codes and dedupes', () => {
    const result = resolveFilterValues(
      ['202604', 'REL::LAST_QUARTER'],
      JULY_2026,
    );
    expect(result.filter(code => code === '202604')).toHaveLength(1);
    expect(result).toContain('202606');
  });
});
