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
import { resolveDhis2PeriodColumn } from './periodColumnResolver';

const periodCol = {
  column_name: 'period',
  extra: JSON.stringify({
    dhis2_is_period: true,
    dhis2_is_period_hierarchy: true,
    dhis2_period_key: 'period',
  }),
};
const periodVariantCol = {
  column_name: 'period_variant',
  extra: JSON.stringify({
    dhis2_is_period_hierarchy: true,
    dhis2_period_key: 'period_variant',
  }),
};

describe('resolveDhis2PeriodColumn', () => {
  it('prefers the primary period marker over period_variant, even when the variant key comes first', () => {
    // The bug: keys ordered so period_variant precedes period. The old
    // heuristic grabbed the (blank) variant and the slider died.
    const keys = ['national', 'region', 'period_variant', 'period', 'value'];
    expect(
      resolveDhis2PeriodColumn(keys, [periodVariantCol, periodCol], []),
    ).toBe('period');
  });

  it('never returns period_variant when a real period column exists', () => {
    const keys = ['period_variant', 'period'];
    const result = resolveDhis2PeriodColumn(
      keys,
      [periodVariantCol, periodCol],
      [],
    );
    expect(result).not.toBe('period_variant');
    expect(result).toBe('period');
  });

  it('resolves via dhis2_is_period when the column is not a hierarchy variant and has no period_key', () => {
    const keys = ['period', 'value'];
    const cols = [{ column_name: 'period', extra: { dhis2_is_period: true } }];
    expect(resolveDhis2PeriodColumn(keys, cols, [])).toBe('period');
  });

  it('does NOT treat a hierarchy-only column as the primary period', () => {
    // period_variant is dhis2_is_period_hierarchy but not the primary period;
    // with no real period column present it must not be picked by the marker
    // rule (it can only surface via the name heuristic as a last resort).
    const keys = ['national', 'value'];
    expect(
      resolveDhis2PeriodColumn(keys, [periodVariantCol], []),
    ).toBeUndefined();
  });

  it('handles a dataset with only a period column (no variant)', () => {
    const keys = ['national', 'region', 'district_city', 'period', 'value'];
    expect(resolveDhis2PeriodColumn(keys, [periodCol], [])).toBe('period');
  });

  it('falls back to an exact "period" name over a *period* variant when markers are absent', () => {
    const keys = ['period_variant', 'period'];
    expect(resolveDhis2PeriodColumn(keys, [], [])).toBe('period');
  });

  it('resolves via sanitized match when the data key differs by non-word chars', () => {
    // sanitizeDHIS2ColumnName maps non-word chars to `_`, so a marker
    // column_name of "period" still resolves a data key like "period." .
    const keys = ['national', 'period.', 'value'];
    const cols = [{ column_name: 'period', extra: { dhis2_period_key: 'period' } }];
    expect(resolveDhis2PeriodColumn(keys, cols, [])).toBe('period.');
  });

  it('uses explicit periodColumns when present in the data', () => {
    const keys = ['national', 'pe', 'value'];
    expect(resolveDhis2PeriodColumn(keys, [], ['pe'])).toBe('pe');
  });

  it('returns undefined when there are no data keys', () => {
    expect(resolveDhis2PeriodColumn([], [periodCol], [])).toBeUndefined();
  });

  it('returns undefined when no period-ish column can be found', () => {
    const keys = ['national', 'region', 'value'];
    expect(resolveDhis2PeriodColumn(keys, [], [])).toBeUndefined();
  });
});
