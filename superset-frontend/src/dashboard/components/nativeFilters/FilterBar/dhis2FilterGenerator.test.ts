/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information.
 */

import { NativeFilterType } from '@superset-ui/core';
import { blueprintToNativeFilters } from './dhis2FilterGenerator';

test('generates DHIS2 filters with the Superset native-filter discriminator', () => {
  const filters = blueprintToNativeFilters({
    dashboard_id: 1,
    dataset_count: 1,
    filters: [
      {
        key: 'national',
        label: 'National',
        column_name: 'national',
        filter_type: 'filter_select',
        category: 'ou_hierarchy',
        cascade_parent_key: null,
        order: 0,
        targets: [
          {
            datasetId: 7,
            column: { name: 'national' },
            datasetRole: 'MART',
          },
        ],
      },
    ],
  });

  expect(filters).toHaveLength(1);
  expect(filters[0].type).toBe(NativeFilterType.NativeFilter);
});

test('does not duplicate an existing legacy DHIS2 native filter', () => {
  const filters = blueprintToNativeFilters(
    {
      dashboard_id: 1,
      dataset_count: 1,
      filters: [
        {
          key: 'national',
          label: 'National',
          column_name: 'national',
          filter_type: 'filter_select',
          category: 'ou_hierarchy',
          cascade_parent_key: null,
          order: 0,
          targets: [
            {
              datasetId: 7,
              column: { name: 'national' },
              datasetRole: 'MART',
            },
          ],
        },
      ],
    },
    {
      'legacy-national': {
        id: 'legacy-national',
        type: 'NativeFilter',
        filterType: 'filter_select',
        targets: [{ datasetId: 7, column: { name: 'national' } }],
      } as any,
    },
  );

  expect(filters).toEqual([]);
});
