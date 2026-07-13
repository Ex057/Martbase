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
 * A control chart is only meaningful when its points are in time order, so the
 * query orders by the x-axis column ascending rather than the default
 * metric-descending. (For DHIS2 period strings this sorts correctly within a
 * granularity — yyyyMM / yyyyQn are chronological lexically; the transform adds
 * a period-aware tiebreak for mixed granularities.)
 */
export default function buildQuery(formData: QueryFormData) {
  return buildDhis2ChartQuery(formData, fd => ({
    orderByColumn:
      typeof (fd as any).x_axis === 'string' ? (fd as any).x_axis : undefined,
  }));
}
