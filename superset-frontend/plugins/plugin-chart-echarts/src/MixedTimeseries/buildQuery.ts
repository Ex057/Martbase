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
  buildQueryContext,
  ensureIsArray,
  normalizeOrderBy,
  PostProcessingPivot,
  QueryFormData,
  QueryObject,
  isXAxisSet,
  getXAxisColumn,
} from '@superset-ui/core';
import {
  pivotOperator,
  renameOperator,
  flattenOperator,
  isTimeComparison,
  timeComparePivotOperator,
  rollingWindowOperator,
  timeCompareOperator,
  resampleOperator,
} from '@superset-ui/chart-controls';
import { dhis2ColumnFilterClauses } from 'src/explore/components/controls/DHIS2ColumnFilterControl/shared';
import {
  retainFormDataSuffix,
  removeFormDataSuffix,
} from '../utils/formDataSuffix';

export default function buildQuery(formData: QueryFormData) {
  const baseFormData = {
    ...formData,
  };

  const formData1 = removeFormDataSuffix(baseFormData, '_b');
  const formData2 = retainFormDataSuffix(baseFormData, '_b');

  // Get DHIS2 filters from the main formData (not the split versions)
  const dhis2Filters = dhis2ColumnFilterClauses(formData);

  const queryContexts = [formData1, formData2].map(fd =>
    buildQueryContext(fd, baseQueryObject => {
      const existingFilters = Array.isArray(baseQueryObject.filters)
        ? baseQueryObject.filters
        : [];

      const queryObject = {
        ...baseQueryObject,
        columns: [
          ...(isXAxisSet(formData)
            ? ensureIsArray(getXAxisColumn(formData))
            : []),
          ...ensureIsArray(fd.groupby),
        ],
        series_columns: fd.groupby,
        filters: [...existingFilters, ...dhis2Filters],
        ...(isXAxisSet(formData) ? {} : { is_timeseries: true }),
      };

      const pivotOperatorInRuntime: PostProcessingPivot = isTimeComparison(
        fd,
        queryObject,
      )
        ? timeComparePivotOperator(fd, queryObject)
        : pivotOperator(fd, queryObject);

      const tmpQueryObject = {
        ...queryObject,
        time_offsets: isTimeComparison(fd, queryObject) ? fd.time_compare : [],
        post_processing: [
          pivotOperatorInRuntime,
          rollingWindowOperator(fd, queryObject),
          timeCompareOperator(fd, queryObject),
          resampleOperator(fd, queryObject),
          renameOperator(fd, queryObject),
          flattenOperator(fd, queryObject),
        ],
      } as QueryObject;
      return [normalizeOrderBy(tmpQueryObject)];
    }),
  );

  return {
    ...queryContexts[0],
    queries: [...queryContexts[0].queries, ...queryContexts[1].queries],
  };
}
