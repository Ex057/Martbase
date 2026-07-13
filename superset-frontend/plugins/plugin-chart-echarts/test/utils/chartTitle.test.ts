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
import { ChartProps, supersetTheme } from '@superset-ui/core';
import { getChartTitleOption } from '../../src/utils/chartTitle';

const COLUMNS = [{ column_name: 'region', verbose_name: 'Region' }];

const chartPropsWith = (formData: Record<string, any>) =>
  new ChartProps({
    width: 800,
    height: 600,
    formData,
    queriesData: [{ data: [] }],
    datasource: { id: 1, columns: COLUMNS } as any,
    theme: supersetTheme,
  });

describe('getChartTitleOption', () => {
  it('no title and no subtitle renders nothing', () => {
    const props = chartPropsWith({});
    expect(
      getChartTitleOption(props.formData, supersetTheme, COLUMNS).title,
    ).toBeUndefined();
  });

  it('manual subtitle is used verbatim', () => {
    const props = chartPropsWith({
      chart_title: 'Rainfall',
      chart_subtitle: 'My own words',
    });
    const { title } = getChartTitleOption(
      props.formData,
      supersetTheme,
      COLUMNS,
    );
    expect(title?.text).toBe('Rainfall');
    expect(title?.subtext).toBe('My own words');
  });

  it('auto subtitle describes the adhoc filters, through a real ChartProps', () => {
    // ChartProps camelCases formData, so the helper must read `adhocFilters`.
    const props = chartPropsWith({
      chart_title: 'Rainfall',
      chart_auto_subtitle: true,
      adhoc_filters: [
        {
          expressionType: 'SIMPLE',
          subject: 'region',
          operator: 'IN',
          comparator: ['Bukedi', 'Busoga'],
          clause: 'WHERE',
        },
        {
          expressionType: 'SIMPLE',
          subject: 'year',
          operator: '>',
          comparator: 2020,
          clause: 'WHERE',
        },
      ],
    });

    const { title } = getChartTitleOption(
      props.formData,
      supersetTheme,
      COLUMNS,
    );
    expect(title?.subtext).toBe('Region: Bukedi, Busoga · year > 2020');
  });

  it('auto subtitle overrides a manual one', () => {
    const props = chartPropsWith({
      chart_subtitle: 'ignored',
      chart_auto_subtitle: true,
      adhoc_filters: [
        {
          expressionType: 'SIMPLE',
          subject: 'region',
          operator: 'IN',
          comparator: ['Bukedi'],
          clause: 'WHERE',
        },
      ],
    });
    const { title } = getChartTitleOption(
      props.formData,
      supersetTheme,
      COLUMNS,
    );
    expect(title?.subtext).toBe('Region: Bukedi');
  });

  it('auto subtitle with no filters renders no title at all', () => {
    const props = chartPropsWith({ chart_auto_subtitle: true });
    expect(
      getChartTitleOption(props.formData, supersetTheme, COLUMNS).title,
    ).toBeUndefined();
  });
});
