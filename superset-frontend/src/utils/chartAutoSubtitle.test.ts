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
  adhocFilterSegments,
  buildAutoSubtitle,
  buildFilterSubtitle,
  describePeriodValues,
  dhis2FilterSegments,
  isAutoSubtitleEnabled,
  makeColumnLabeller,
  renderFilterSegment,
  resolveChartTitle,
  summarizeValues,
} from './chartAutoSubtitle';

const COLUMNS = [
  { column_name: 'region', verbose_name: 'Region' },
  { column_name: 'year' },
  {
    column_name: 'period',
    extra: JSON.stringify({ dhis2_is_period: true }),
  },
];
const columnLabel = makeColumnLabeller(COLUMNS);

describe('makeColumnLabeller', () => {
  test('a duplicated column_name resolves to the FIRST occurrence', () => {
    const label = makeColumnLabeller([
      { column_name: 'dx', verbose_name: 'First label' },
      { column_name: 'dx', verbose_name: 'Second label' },
    ]);
    expect(label('dx')).toBe('First label');
  });

  test('falls back to the raw name for unknown columns', () => {
    expect(columnLabel('nope')).toBe('nope');
  });
});

describe('resolveChartTitle', () => {
  test('a falsy title (0) stays blank rather than rendering "0"', () => {
    expect(resolveChartTitle({ chart_title: 0 }).title).toBe('');
    expect(resolveChartTitle({ chart_title: false }).title).toBe('');
  });

  test('reads a real title and trims it', () => {
    expect(resolveChartTitle({ chartTitle: '  Rainfall  ' }).title).toBe(
      'Rainfall',
    );
  });
});

describe('summarizeValues', () => {
  test('names up to three values, then collapses', () => {
    expect(summarizeValues(['a', 'b'])).toBe('a, b');
    expect(summarizeValues(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2 more');
  });
});

describe('describePeriodValues', () => {
  test('renders a relative token as its label', () => {
    expect(describePeriodValues(['REL::LAST_QUARTER'])).toBe('Last quarter');
  });

  test('names a token AND any extra fixed periods', () => {
    expect(describePeriodValues(['REL::LAST_QUARTER', '202401'])).toBe(
      'Last quarter, January 2024',
    );
  });

  test('falls back to the legacy relativeLabel when values are bare codes', () => {
    // `values` is the expansion of the label, so listing them would repeat it.
    expect(describePeriodValues(['202401', '202402'], 'Last 4 quarters')).toBe(
      'Last 4 quarters',
    );
  });

  test('formats bare codes as a range', () => {
    expect(describePeriodValues(['202508', '202510'])).toBe(
      'August 2025 – October 2025',
    );
  });
});

describe('adhocFilterSegments', () => {
  const seg = (filter: any) =>
    renderFilterSegment(adhocFilterSegments([filter], columnLabel)[0]);

  test('IN reads as a labelled list', () => {
    expect(
      seg({
        expressionType: 'SIMPLE',
        subject: 'region',
        operator: 'IN',
        comparator: ['Bukedi', 'Busoga'],
      }),
    ).toBe('Region: Bukedi, Busoga');
  });

  test('comparisons read as an expression', () => {
    expect(
      seg({
        expressionType: 'SIMPLE',
        subject: 'year',
        operator: '>',
        comparator: 2020,
      }),
    ).toBe('year > 2020');
  });

  test('unary operators read as a phrase', () => {
    expect(
      seg({
        expressionType: 'SIMPLE',
        subject: 'region',
        operator: 'IS NOT NULL',
      }),
    ).toBe('Region is not null');
  });

  test('NOT IN is not silently rendered as IN', () => {
    expect(
      seg({
        expressionType: 'SIMPLE',
        subject: 'region',
        operator: 'NOT IN',
        comparator: ['Kampala'],
      }),
    ).toContain('not in');
  });

  test('a raw SQL filter shows its own label', () => {
    expect(
      seg({
        expressionType: 'SQL',
        sqlExpression: 'value > 100',
        label: 'big values',
        clause: 'WHERE',
      }),
    ).toBe('big values');
  });

  test('dashboard-applied filters (isExtra) are skipped', () => {
    expect(
      adhocFilterSegments(
        [
          {
            expressionType: 'SIMPLE',
            subject: 'region',
            operator: 'IN',
            comparator: ['Kampala'],
            isExtra: true,
          },
        ],
        columnLabel,
      ),
    ).toEqual([]);
  });

  test('an empty comparator produces no segment', () => {
    expect(
      adhocFilterSegments(
        [
          {
            expressionType: 'SIMPLE',
            subject: 'region',
            operator: 'IN',
            comparator: [],
          },
        ],
        columnLabel,
      ),
    ).toEqual([]);
  });
});

describe('dhis2FilterSegments', () => {
  test('flags a filter on a declared period column', () => {
    const [segment] = dhis2FilterSegments(
      [{ column: 'period', values: ['REL::LAST_12_MONTHS'] }],
      { columnLabel, periodColumns: ['period'] },
    );
    expect(segment.isPeriod).toBe(true);
    expect(renderFilterSegment(segment)).toBe('Last 12 months');
  });

  test('does not mistake a year-shaped value on a non-period column', () => {
    const [segment] = dhis2FilterSegments(
      [{ column: 'region', values: ['2024'] }],
      { columnLabel, periodColumns: ['period'] },
    );
    expect(segment.isPeriod).toBe(false);
    expect(renderFilterSegment(segment)).toBe('Region: 2024');
  });

  test('guesses from values only when no period column is declared', () => {
    const [segment] = dhis2FilterSegments(
      [{ column: 'pe', values: ['202401'] }],
      { columnLabel, periodColumns: [] },
    );
    expect(segment.isPeriod).toBe(true);
  });
});

describe('buildAutoSubtitle', () => {
  test('joins prefix and filters, dropping empties', () => {
    expect(
      buildAutoSubtitle({
        prefix: ['Uganda Districts', ''],
        filters: [
          { label: 'Period', values: ['REL::LAST_QUARTER'], isPeriod: true },
          { label: 'Region', values: ['Bukedi'] },
        ],
      }),
    ).toBe('Uganda Districts · Last quarter · Region: Bukedi');
  });

  test('a chart with no filters keeps just its prefix', () => {
    expect(buildAutoSubtitle({ prefix: ['Uganda Districts'] })).toBe(
      'Uganda Districts',
    );
  });
});

describe('buildFilterSubtitle', () => {
  test('reads camelCased formData, as ChartProps produces', () => {
    // Reading only snake_case here silently yields an empty subtitle — that was
    // a real bug. Both spellings must work.
    expect(
      buildFilterSubtitle(
        {
          dhis2ColumnFilters: [
            { column: 'period', values: ['REL::LAST_12_MONTHS'] },
          ],
          adhocFilters: [
            {
              expressionType: 'SIMPLE',
              subject: 'region',
              operator: 'IN',
              comparator: ['Bukedi', 'Busoga'],
            },
          ],
        },
        COLUMNS,
      ),
    ).toBe('Last 12 months · Region: Bukedi, Busoga');
  });

  test('reads snake_case formData too', () => {
    expect(
      buildFilterSubtitle(
        {
          adhoc_filters: [
            {
              expressionType: 'SIMPLE',
              subject: 'region',
              operator: 'IN',
              comparator: ['Bukedi'],
            },
          ],
        },
        COLUMNS,
      ),
    ).toBe('Region: Bukedi');
  });

  test('no filters yields an empty subtitle', () => {
    expect(buildFilterSubtitle({}, COLUMNS)).toBe('');
  });
});

describe('isAutoSubtitleEnabled', () => {
  test('accepts either spelling', () => {
    expect(isAutoSubtitleEnabled({ chartAutoSubtitle: true })).toBe(true);
    expect(isAutoSubtitleEnabled({ chart_auto_subtitle: true })).toBe(true);
    expect(isAutoSubtitleEnabled({})).toBe(false);
  });
});
