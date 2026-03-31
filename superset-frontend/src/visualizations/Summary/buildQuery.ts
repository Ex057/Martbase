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
import { buildQueryContext } from '@superset-ui/core';
import { SummaryFormData } from './types';

function uniqueColumns(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map(value => String(value || '').trim()).filter(Boolean)),
  );
}

export default function buildQuery(formData: SummaryFormData) {
  return buildQueryContext(formData, baseQueryObject => {
    const rowLimit = Number(formData.summary_row_limit) || 12;
    const queryMode = formData.query_mode || 'aggregate';
    const displayMode = formData.display_mode || 'metrics_as_items';
    const mappedColumns = uniqueColumns([
      formData.label_field,
      formData.value_field,
      formData.secondary_value_field,
      formData.percent_field,
      formData.change_field,
      formData.direction_field,
      formData.note_field,
      formData.target_field,
      formData.icon_field,
      formData.badge_field,
      formData.item_color_field,
      formData.value_position_field,
      formData.label_position_field,
      formData.sparkline_field,
    ]);

    if (queryMode === 'raw') {
      return [
        {
          ...baseQueryObject,
          columns: uniqueColumns([
            ...(formData.groupby || []),
            ...mappedColumns,
          ]),
          metrics: [],
          row_limit: rowLimit,
        },
      ];
    }

    return [
      {
        ...baseQueryObject,
        columns: displayMode === 'rows_as_items' ? formData.groupby || [] : [],
        metrics: formData.metrics || [],
        row_limit: displayMode === 'metrics_as_items' ? 1 : rowLimit,
      },
    ];
  });
}
