/* eslint-env jest */
/* eslint-disable no-restricted-globals */
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.
 */

import transformProps from './transformProps';

const makeChartProps = (overrides: any = {}) => ({
  ...overrides,
  formData: {
    metrics: [
      {
        expressionType: 'SIMPLE',
        column: { column_name: 'count' },
        label: 'Total Count',
      },
      {
        expressionType: 'SIMPLE',
        column: { column_name: 'sum_value' },
        label: 'Sum Value',
      },
    ],
    placement: 'top',
    orientation: 'auto',
    speed: 30,
    pause_on_hover: true,
    auto_loop: true,
    scroll_direction: 'forward',
    number_format: 'SMART_NUMBER',
    prefix: '',
    suffix: '',
    null_text: 'N/A',
    show_label: true,
    show_subtitle: true,
    show_delta: true,
    show_separators: false,
    ...overrides.formData,
  },
  queriesData: overrides.queriesData || [
    {
      data: [{ 'Total Count': 12345, 'Sum Value': 67890 }],
    },
  ],
  height: 80,
  width: 800,
});

describe('MarqueeViz transformProps', () => {
  test('produces items from metrics', () => {
    const result = transformProps(makeChartProps() as any);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].label).toBe('Total Count');
    expect(result.items[1].label).toBe('Sum Value');
    expect(result.items[0].formattedValue).not.toBe('N/A');
  });

  test('formats values using number format', () => {
    const result = transformProps(makeChartProps() as any);
    expect(result.items[0].formattedValue).toBeTruthy();
  });

  test('applies prefix and suffix', () => {
    const result = transformProps(
      makeChartProps({ formData: { prefix: '$', suffix: 'k' } }) as any,
    );
    expect(result.items[0].formattedValue).toMatch(/\$/);
  });

  test('uses null text for missing values', () => {
    const result = transformProps(
      makeChartProps({ queriesData: [{ data: [{}] }] }) as any,
    );
    // values will be null/NaN → formatted as null text
    expect(result.items[0].formattedValue).toBeTruthy();
  });

  test('passes through placement as-is', () => {
    const result = transformProps(
      makeChartProps({ formData: { placement: 'left' } }) as any,
    );
    expect(result.placement).toBe('left');
  });

  test('resolves defaults when formData is minimal', () => {
    const result = transformProps({
      formData: { metrics: [] },
      queriesData: [{ data: [] }],
      height: 80,
      width: 800,
    } as any);
    expect(result.items).toHaveLength(0);
    expect(result.speed).toBe(30);
    expect(result.pauseOnHover).toBe(true);
    expect(result.showLabel).toBe(true);
  });

  test('uses the metric label instead of the raw column name for adhoc metrics', () => {
    const result = transformProps(
      makeChartProps({
        formData: {
          metrics: [
            {
              expressionType: 'SIMPLE',
              aggregate: 'SUM',
              column: {
                column_name: 'c_105_ep01a_suspected_malaria_fever',
              },
              label: 'Suspected Malaria Fever',
            },
          ],
        },
        queriesData: [
          {
            data: [{ 'Suspected Malaria Fever': 514 }],
          },
        ],
      }) as any,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Suspected Malaria Fever');
    expect(result.items[0].formattedValue).not.toBe('N/A');
  });

  test('uses shared chart colors when Marquee colors are still at their defaults', () => {
    const result = transformProps(
      makeChartProps({
        formData: {
          label_color: { r: 107, g: 114, b: 128, a: 1 },
          value_color: { r: 17, g: 24, b: 39, a: 1 },
          subtitle_color: { r: 156, g: 163, b: 175, a: 1 },
          container_background: { r: 255, g: 255, b: 255, a: 0 },
          default_breakpoint_color: { r: 30, g: 64, b: 175, a: 1 },
          chart_background_color: { r: 239, g: 246, b: 255, a: 1 },
        },
      }) as any,
    );

    expect(result.labelColor).toBe('rgba(30,64,175,1)');
    expect(result.valueColor).toBe('rgba(30,64,175,1)');
    expect(result.subtitleColor).toBe('rgba(30,64,175,1)');
    expect(result.containerBackground).toBe('rgba(239,246,255,1)');
  });

  test('preserves explicit Marquee colors over shared chart colors', () => {
    const result = transformProps(
      makeChartProps({
        formData: {
          label_color: { r: 236, g: 72, b: 153, a: 1 },
          value_color: { r: 14, g: 116, b: 144, a: 1 },
          subtitle_color: { r: 120, g: 53, b: 15, a: 1 },
          container_background: { r: 17, g: 24, b: 39, a: 1 },
          default_breakpoint_color: { r: 30, g: 64, b: 175, a: 1 },
          chart_background_color: { r: 239, g: 246, b: 255, a: 1 },
        },
      }) as any,
    );

    expect(result.labelColor).toBe('rgba(236,72,153,1)');
    expect(result.valueColor).toBe('rgba(14,116,144,1)');
    expect(result.subtitleColor).toBe('rgba(120,53,15,1)');
    expect(result.containerBackground).toBe('rgba(17,24,39,1)');
  });
});
