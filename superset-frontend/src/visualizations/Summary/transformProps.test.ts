/* eslint-env jest */
/* eslint-disable no-restricted-globals */
import transformProps, {
  normalizeSparklineValues,
  resolveDirection,
} from './transformProps';

describe('Summary transformProps', () => {
  test('builds items from metrics as items', () => {
    const props = transformProps({
      width: 400,
      height: 300,
      queriesData: [{ data: [{ Cases: 1234, Deaths: 12 }] }],
      formData: {
        display_mode: 'metrics_as_items',
        metrics: ['Cases', 'Deaths'],
      },
      hooks: {},
    } as any);

    expect(props.items).toHaveLength(2);
    expect(props.items[0].label).toBe('Cases');
    expect(props.items[0].formattedValue).toBeTruthy();
  });

  test('builds items from rows as items', () => {
    const props = transformProps({
      width: 400,
      height: 300,
      queriesData: [
        {
          data: [
            {
              district: 'Kampala',
              value: 42,
              delta: 3,
              pct: 0.12,
              trend: 'up',
              spark: '[1,2,3,4]',
            },
          ],
        },
      ],
      formData: {
        display_mode: 'rows_as_items',
        label_field: 'district',
        value_field: 'value',
        change_field: 'delta',
        percent_field: 'pct',
        direction_field: 'trend',
        sparkline_field: 'spark',
      },
      hooks: {},
    } as any);

    expect(props.items).toHaveLength(1);
    expect(props.items[0].label).toBe('Kampala');
    expect(props.items[0].trendDirection).toBe('up');
    expect(props.items[0].sparklineValues).toEqual([1, 2, 3, 4]);
  });

  test('normalizes sparkline values from csv', () => {
    expect(normalizeSparklineValues('1, 4, 7')).toEqual([1, 4, 7]);
  });

  test('resolves direction from numeric change', () => {
    expect(resolveDirection(undefined, -4, true)).toBe('down');
    expect(resolveDirection(undefined, -4, false)).toBe('up');
  });
});
