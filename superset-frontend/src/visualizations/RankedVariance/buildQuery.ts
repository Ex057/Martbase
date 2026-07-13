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
import { QueryFormData } from '@superset-ui/core';
import { buildDhis2ChartQuery } from 'src/explore/components/controls/DHIS2ColumnFilterControl/shared';

/**
 * RankedVariance uses custom control names (`entity_column`, `actual_metric`,
 * `target_metric`) that the default query builder doesn't know about, so map
 * them explicitly. `buildDhis2ChartQuery` adds the DHIS2 time_range guard and
 * data filters.
 */
export default function buildQuery(formData: QueryFormData) {
  return buildDhis2ChartQuery(formData, fd => {
    const f = fd as any;
    return {
      columns: [f.entity_column].filter(Boolean),
      metrics: [f.actual_metric, f.target_metric].filter(Boolean),
    };
  });
}
