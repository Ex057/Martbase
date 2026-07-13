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
import { ChartProps } from '@superset-ui/core';
import transformProps from './transformProps';

describe('DHIS2Map transformProps', () => {
  test('uses dhis2_source_database_id for staged-local datasets', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        tooltip_columns: [],
        slice_id: 77,
        dashboard_id: 11,
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_staged_dataset_id: 4,
          dhis2_source_database_id: 2,
          dhis2_source_instance_ids: [101, 102],
          dhis2_serving_database_id: 3,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.databaseId).toBe(2);
    expect(result.isStagedLocalDataset).toBe(true);
    expect(result.stagedDatasetId).toBe(4);
    expect(result.sourceInstanceIds).toEqual([101, 102]);
    expect(result.isDHIS2Dataset).toBe(true);
    expect(result.chartId).toBe(77);
    expect(result.dashboardId).toBe(11);
    expect(result.datasourceColumns).toEqual([]);
    expect(result.orgUnitColumn).toBe('region');
    expect(result.metric).toBe('c_cases');
  });

  test('keeps the selected OU column level as the primary boundary level', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [3],
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
          {
            column_name: 'district_city',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 3,
            }),
          },
          {
            column_name: 'c_cases',
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 2,
          dhis2_source_instance_ids: [101, 102],
          dhis2_serving_database_id: 3,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.primaryBoundaryLevel).toBe(2);
    expect(result.boundaryLevels).toEqual([2, 3]);
    expect(result.boundaryLevelLabels).toEqual({
      2: 'region',
      3: 'district_city',
    });
    expect(result.boundaryLevelColumns).toEqual({
      2: 'region',
      3: 'district_city',
    });
    expect(result.orgUnitColumn).toBe('region');
  });

  test('infers legacy MART hierarchy levels from ordered hierarchy columns when explicit levels are missing', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'mal_testing_rate',
        org_unit_column: 'district_city',
        boundary_levels: [3],
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              district_city: 'Abim District',
              mal_testing_rate: 114.3,
            },
          ],
        },
      ],
      datasource: {
        id: 19,
        database: { id: 4 },
        columns: [
          {
            column_name: 'national',
            verbose_name: 'National',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'region',
            verbose_name: 'Region',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'district_city',
            verbose_name: 'District City',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'mal_testing_rate',
            extra: JSON.stringify({ dhis2_variable_type: 'indicator' }),
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 5,
          dhis2_source_instance_ids: [4],
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.primaryBoundaryLevel).toBe(3);
    expect(result.boundaryLevels).toEqual([3]);
    expect(result.boundaryLevelColumns).toEqual({
      1: 'national',
      2: 'region',
      3: 'district_city',
    });
    expect(result.orgUnitColumn).toBe('district_city');
  });

  test('prefers the deepest legacy hierarchy column from chart rows when public form data omits org unit settings', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'cch heat stress era5 heat',
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              national: 'MOH - Uganda',
              region: 'Bunyoro',
              district_city: 'Masindi District',
              'cch heat stress era5 heat': 50,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 2,
          dhis2_source_instance_ids: [101],
          dhis2_serving_database_id: 3,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.orgUnitColumn).toBe('district_city');
    expect(result.primaryBoundaryLevel).toBe(3);
    expect(result.boundaryLevels).toEqual([3]);
  });

  test('ignores mis-tagged legacy helper columns when resolving the primary boundary level', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'mal_testing_rate',
        org_unit_column: 'district_city',
        boundary_levels: [4],
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              district_city: 'Abim District',
              mal_testing_rate: 114.3,
            },
          ],
        },
      ],
      datasource: {
        id: 19,
        database: { id: 4 },
        columns: [
          {
            column_name: 'period_variant',
            verbose_name: 'Period Variant',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'national',
            verbose_name: 'National',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'region',
            verbose_name: 'Region',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'district_city',
            verbose_name: 'District City',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'mal_testing_rate',
            extra: JSON.stringify({ dhis2_variable_type: 'indicator' }),
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 5,
          dhis2_source_instance_ids: [4],
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.primaryBoundaryLevel).toBe(3);
    expect(result.boundaryLevels).toEqual([3, 4]);
    expect(result.boundaryLevelColumns).toEqual({
      1: 'national',
      2: 'region',
      3: 'district_city',
    });
    expect(result.ouHierarchyColumns).toEqual(['district_city']);
  });

  test('normalizes legacy default categorical color settings to sequential map colors', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'mal_testing_rate',
        org_unit_column: 'district_city',
        boundary_levels: [3],
        color_scheme: 'supersetColors',
        linear_color_scheme: 'blue_white_yellow',
        use_linear_color_scheme: false,
        legend_type: 'auto',
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              district_city: 'Abim District',
              mal_testing_rate: 114.3,
            },
          ],
        },
      ],
      datasource: {
        id: 19,
        database: { id: 4 },
        columns: [
          {
            column_name: 'district_city',
            extra: JSON.stringify({ dhis2_is_ou_hierarchy: true }),
          },
          {
            column_name: 'mal_testing_rate',
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 5,
          dhis2_source_instance_ids: [4],
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.useLinearColorScheme).toBe(true);
    expect(result.linearColorScheme).toBe('blue_white_yellow');
  });

  test('extracts staged DHIS2 legend metadata from the selected metric column', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'SUM(c_cases)',
        org_unit_column: 'region',
        boundary_levels: [2],
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
          {
            column_name: 'c_cases',
            extra: JSON.stringify({
              dhis2_legend: {
                source: 'dhis2',
                setId: 'legend_set_1',
                setName: 'Malaria Burden',
                min: 0,
                max: 500,
                items: [
                  {
                    id: 'legend_1',
                    label: 'Normal',
                    startValue: 0,
                    endValue: 100,
                    color: '#2ca25f',
                  },
                ],
              },
            }),
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 2,
          dhis2_source_instance_ids: [101],
          dhis2_serving_database_id: 3,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.stagedLegendDefinition?.setName).toBe('Malaria Burden');
    expect(result.stagedLegendDefinition?.items[0].color).toBe('#2ca25f');
  });

  test('uses the explicitly selected staged legend column when provided', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'SUM(c_cases)',
        org_unit_column: 'region',
        boundary_levels: [2],
        legend_type: 'staged',
        staged_legend_column: 'c_admissions',
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
              c_admissions: 4,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
          {
            column_name: 'c_cases',
            extra: JSON.stringify({
              dhis2_legend: {
                setName: 'Cases Legend',
                items: [{ startValue: 0, endValue: 10, color: '#2ca25f' }],
              },
            }),
          },
          {
            column_name: 'c_admissions',
            extra: JSON.stringify({
              dhis2_legend: {
                setName: 'Admissions Legend',
                items: [{ startValue: 0, endValue: 5, color: '#de2d26' }],
              },
            }),
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 2,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.stagedLegendDefinition?.setName).toBe('Admissions Legend');
    expect(result.stagedLegendDefinition?.items[0].color).toBe('#de2d26');
  });

  test('resolves a selected staged legend set from cached staged metadata', () => {
    window.localStorage.setItem(
      'dhis2_legend_sets_db2',
      JSON.stringify({
        data: [
          {
            id: 'legend_set_99',
            displayName: 'Incidence Legend',
            legendDefinition: {
              source: 'dhis2',
              setId: 'legend_set_99',
              setName: 'Incidence Legend',
              min: 0,
              max: 100,
              items: [
                {
                  id: 'legend_low',
                  label: 'Low',
                  startValue: 0,
                  endValue: 50,
                  color: '#2ca25f',
                },
                {
                  id: 'legend_high',
                  label: 'High',
                  startValue: 50,
                  endValue: 100,
                  color: '#de2d26',
                },
              ],
            },
          },
        ],
        timestamp: Date.now(),
      }),
    );

    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'SUM(c_cases)',
        org_unit_column: 'region',
        boundary_levels: [2],
        legend_type: 'staged',
        staged_legend_column: 'legendset:legend_set_99',
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
          {
            column_name: 'c_cases',
          },
        ],
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 2,
          dhis2_source_instance_ids: [101],
          dhis2_serving_database_id: 3,
        }),
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.stagedLegendDefinition?.setId).toBe('legend_set_99');
    expect(result.stagedLegendDefinition?.items[1].color).toBe('#de2d26');

    window.localStorage.removeItem('dhis2_legend_sets_db2');
  });

  test('passes through focused sub-boundary and unselected area styling options', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        focus_selected_boundary_with_children: true,
        show_all_boundaries: true,
        style_unselected_areas: true,
        unselected_area_fill_color: { r: 210, g: 220, b: 230, a: 1 },
        unselected_area_fill_opacity: 0.3,
        unselected_area_border_color: { r: 100, g: 110, b: 120, a: 1 },
        unselected_area_border_width: 1.25,
        tooltip_columns: [],
      },
      queriesData: [
        {
          data: [
            {
              region: 'Acholi',
              period: '202401',
              c_cases: 10,
            },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
          {
            column_name: 'c_cases',
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.focusSelectedBoundaryWithChildren).toBe(true);
    expect(result.showAllBoundaries).toBe(true);
    expect(result.styleUnselectedAreas).toBe(true);
    expect(result.unselectedAreaFillColor).toEqual({
      r: 210,
      g: 220,
      b: 230,
      a: 1,
    });
    expect(result.unselectedAreaFillOpacity).toBe(0.3);
    expect(result.unselectedAreaBorderColor).toEqual({
      r: 100,
      g: 110,
      b: 120,
      a: 1,
    });
    expect(result.unselectedAreaBorderWidth).toBe(1.25);
  });

  test('treats public dhis2 map charts as DHIS2 datasets even without dataset sql', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        viz_type: 'dhis2_map',
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        tooltip_columns: [],
        slice_id: 91,
      },
      queriesData: [{ data: [] }],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.isDHIS2Dataset).toBe(true);
    expect(result.chartId).toBe(91);
  });

  test('converts chart background colors from color picker values', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        viz_type: 'dhis2_map',
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_background_color: { r: 15, g: 23, b: 42, a: 0.4 },
        tooltip_columns: [],
      },
      queriesData: [{ data: [] }],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.chartBackgroundColor).toBe('rgba(15,23,42,0.4)');
  });

  test('applies background opacity control to chart background color', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        viz_type: 'dhis2_map',
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_background_color: { r: 255, g: 255, b: 255, a: 1 },
        chart_background_opacity: 0.3,
        tooltip_columns: [],
      },
      queriesData: [{ data: [] }],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    // Background opacity should override the color's alpha value
    expect(result.chartBackgroundColor).toBe('rgba(255,255,255,0.3)');
  });
  test('applies background opacity to hex string colors', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        viz_type: 'dhis2_map',
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_background_color: '#F2EBEB',
        chart_background_opacity: 0.25,
        tooltip_columns: [],
      },
      queriesData: [{ data: [] }],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.chartBackgroundColor).toBe('rgba(242,235,235,0.25)');
  });

  test('uses raw hex background color override when provided', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        viz_type: 'dhis2_map',
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_background_color: { r: 255, g: 255, b: 255, a: 1 },
        chart_background_color_hex: '#F2EBEB00',
        tooltip_columns: [],
      },
      queriesData: [{ data: [] }],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          {
            column_name: 'region',
            extra: JSON.stringify({
              dhis2_is_ou_hierarchy: true,
              dhis2_ou_level: 2,
            }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.chartBackgroundColor).toBe('rgba(242,235,235,0)');
  });

  test('auto subtitle builds from org unit + period when enabled', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: true,
        chart_subtitle: 'manual text',
      },
      queriesData: [
        { data: [{ region: 'Acholi', period: '202401', c_cases: 10 }] },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          { column_name: 'region' },
          {
            column_name: 'period',
            extra: JSON.stringify({ dhis2_is_period: true }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.chartSubtitle).toContain('Acholi');
    expect(result.chartSubtitle).toContain('2024');
  });

  test('auto subtitle summarises many areas and shows a period range', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: true,
      },
      queriesData: [
        {
          data: [
            { region: 'Acholi', period: '202401', c_cases: 1 },
            { region: 'Lango', period: '202402', c_cases: 1 },
            { region: 'Teso', period: '202406', c_cases: 1 },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          { column_name: 'region' },
          {
            column_name: 'period',
            extra: JSON.stringify({ dhis2_is_period: true }),
          },
        ],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    // Many areas read as a boundary level (no raw count)…
    expect(result.chartSubtitle).not.toContain('3 ');
    // …and the periods collapse to an earliest – latest range.
    expect(result.chartSubtitle).toContain('–');
    expect(result.chartSubtitle).toContain('2024');
  });

  const subtitleChartProps = (columnFilters: any[], extraColumns: any[] = []) =>
    ({
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: true,
        dhis2_column_filters: columnFilters,
      },
      queriesData: [
        {
          data: [
            { region: 'Acholi', period: '2024Q1', c_cases: 1 },
            { region: 'Lango', period: '2024Q4', c_cases: 1 },
          ],
        },
      ],
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [
          { column_name: 'region' },
          {
            column_name: 'period',
            extra: JSON.stringify({ dhis2_is_period: true }),
          },
          ...extraColumns,
        ],
      },
      hooks: {},
      filterState: {},
    }) as any;

  test('auto subtitle reads the filters through a real ChartProps', () => {
    // ChartProps camelCases formData keys, so at runtime the control arrives as
    // `dhis2ColumnFilters`. Building chartProps by hand skips that conversion
    // and hides the bug — go through the real class.
    const chartProps = new ChartProps({
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: true,
        dhis2_column_filters: [
          { column: 'period', values: ['REL::LAST_12_MONTHS'] },
          { column: 'region', values: ['Bukedi', 'Busoga', 'Karamoja'] },
        ],
      } as any,
      queriesData: [
        {
          // Aggregated: no period column in the results, as the real map query.
          data: [
            { region: 'Bukedi', c_cases: 1 },
            { region: 'Busoga', c_cases: 2 },
          ],
        },
      ],
      datasource: {
        id: 4,
        columns: [
          { column_name: 'region', verbose_name: 'Region' },
          {
            column_name: 'period',
            extra: JSON.stringify({ dhis2_is_period: true }),
          },
        ],
      } as any,
      hooks: {},
      filterState: {},
      theme: {} as any,
    });

    const result = transformProps(chartProps as any);

    expect(result.chartSubtitle).toContain('Last 12 months');
    expect(result.chartSubtitle).toContain('Region: Bukedi, Busoga, Karamoja');
  });

  test('auto subtitle describes non-period filters when no period filter exists', () => {
    // The Data Filters control holds arbitrary columns; a period filter is
    // optional. The period segment then comes from the data.
    const result = transformProps(
      subtitleChartProps(
        [{ column: 'dx_name', values: ['NDVI'] }],
        [{ column_name: 'dx_name', verbose_name: 'Data element' }],
      ),
    );

    expect(result.chartSubtitle).toContain('Data element: NDVI');
    // Period comes from the rows, and sorts ahead of the other filters.
    expect(result.chartSubtitle).toMatch(/2024.*Data element/);
  });

  test('auto subtitle does not mistake a non-period filter for a period', () => {
    // "2024" looks like a DHIS2 yearly code, but `region` is not a period column
    // and the datasource does declare one, so it must stay a labelled filter.
    const result = transformProps(
      subtitleChartProps([{ column: 'region', values: ['2024'] }]),
    );

    expect(result.chartSubtitle).toContain('region: 2024');
  });

  test('auto subtitle finds the period filter when the query aggregated the period column away', () => {
    // An aggregated map query groups `period` out of the result set, so the
    // column only exists on the datasource. Detection must not depend on it
    // coming back in the rows, nor on the filter values being recognisable as
    // period codes.
    const chartProps = subtitleChartProps([
      { column: 'period', values: ['whatever-the-backend-stores'] },
    ]);
    chartProps.queriesData = [
      {
        data: [
          { region: 'Acholi', c_cases: 1 },
          { region: 'Lango', c_cases: 1 },
        ],
      },
    ];

    const result = transformProps(chartProps);

    expect(result.chartSubtitle).toContain('whatever-the-backend-stores');
  });

  test('auto subtitle shows the relative period label, not the metric', () => {
    const result = transformProps(
      subtitleChartProps([
        {
          column: 'period',
          values: ['2024Q1', '2024Q2', '2024Q3', '2024Q4'],
          relativeLabel: 'Last 4 quarters',
        },
      ]),
    );

    // The relative label is shown verbatim rather than a list of quarters…
    expect(result.chartSubtitle).toContain('Last 4 quarters');
    // …and the metric is no longer appended.
    expect(result.chartSubtitle).not.toContain('c_cases');
  });

  test('auto subtitle renders a stored relative token as its label', () => {
    const result = transformProps(
      // No `relativeLabel` — the label must come from the token itself.
      subtitleChartProps([{ column: 'period', values: ['REL::LAST_QUARTER'] }]),
    );

    expect(result.chartSubtitle).toContain('Last quarter');
    expect(result.chartSubtitle).not.toContain('REL::');
  });

  test('auto subtitle names a relative token AND any extra fixed periods', () => {
    const result = transformProps(
      subtitleChartProps([
        { column: 'period', values: ['REL::LAST_QUARTER', '202401'] },
      ]),
    );

    // The query filters on both, so the subtitle must mention both.
    expect(result.chartSubtitle).toContain('Last quarter');
    expect(result.chartSubtitle).toContain('January 2024');
  });

  test('auto subtitle falls back to periods present in the data', () => {
    const result = transformProps(subtitleChartProps([]));

    expect(result.chartSubtitle).toContain('2024');
  });

  test('auto subtitle appends non-period filters, truncating long lists', () => {
    const result = transformProps(
      subtitleChartProps(
        [
          { column: 'period', values: ['REL::LAST_QUARTER'] },
          {
            column: 'dx_name',
            values: ['NDVI', 'Heat stress', 'Precipitation', 'Humidity', 'EVI'],
          },
        ],
        [{ column_name: 'dx_name', verbose_name: 'Data element' }],
      ),
    );

    expect(result.chartSubtitle).toContain(
      'Data element: NDVI, Heat stress, Precipitation +2 more',
    );
  });

  test('auto subtitle labels a non-period filter with its column name', () => {
    const result = transformProps(
      subtitleChartProps(
        [
          { column: 'period', values: ['REL::LAST_QUARTER'] },
          { column: 'dx_name', values: ['NDVI'] },
        ],
        [{ column_name: 'dx_name' }],
      ),
    );

    expect(result.chartSubtitle).toContain('dx_name: NDVI');
  });

  test('auto subtitle detects an unflagged period column from data values', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: true,
      },
      queriesData: [
        {
          data: [
            { region: 'Acholi', pe: '202401', c_cases: 10 },
            { region: 'Lango', pe: '202406', c_cases: 12 },
          ],
        },
      ],
      // Note: the "pe" column is NOT flagged with dhis2_is_period.
      datasource: {
        id: 4,
        database: { id: 3 },
        columns: [{ column_name: 'region' }, { column_name: 'pe' }],
      },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    // Period is still shown (detected from the 202401 / 202406 values).
    expect(result.chartSubtitle).toContain('2024');
    expect(result.chartSubtitle).toContain('–');
  });

  test('auto subtitle off falls back to the manual subtitle', () => {
    const chartProps = {
      width: 800,
      height: 600,
      formData: {
        metric: 'c_cases',
        org_unit_column: 'region',
        boundary_levels: [2],
        chart_auto_subtitle: false,
        chart_subtitle: 'manual text',
      },
      queriesData: [
        { data: [{ region: 'Acholi', period: '202401', c_cases: 10 }] },
      ],
      datasource: { id: 4, database: { id: 3 }, columns: [] },
      hooks: {},
      filterState: {},
    } as any;

    const result = transformProps(chartProps);

    expect(result.chartSubtitle).toBe('manual text');
  });
});
