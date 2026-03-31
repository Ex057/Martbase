/* eslint-env jest */
/* eslint-disable no-restricted-globals */
import buildQuery from './buildQuery';

describe('Summary buildQuery', () => {
  test('builds aggregate query for metrics mode', () => {
    const context = buildQuery({
      datasource: '1__table',
      viz_type: 'summary',
      display_mode: 'metrics_as_items',
      query_mode: 'aggregate',
      metrics: ['sum__value'],
    } as any);

    expect(context.queries[0].metrics).toEqual(['sum__value']);
    expect(context.queries[0].row_limit).toBe(1);
  });

  test('builds raw query with mapped columns', () => {
    const context = buildQuery({
      datasource: '1__table',
      viz_type: 'summary',
      display_mode: 'rows_as_items',
      query_mode: 'raw',
      groupby: ['district'],
      value_field: 'value',
      change_field: 'delta',
      summary_row_limit: 15,
    } as any);

    expect(context.queries[0].columns).toEqual(
      expect.arrayContaining(['district', 'value', 'delta']),
    );
    expect(context.queries[0].metrics).toEqual([]);
    expect(context.queries[0].row_limit).toBe(15);
  });
});
