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

import { Dispatch, AnyAction } from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { Dataset } from '@superset-ui/chart-controls';
import { SupersetClient, getClientErrorObject } from '@superset-ui/core';
import { addDangerToast } from 'src/components/MessageToasts/actions';
import { dhis2DataPreloader } from 'src/utils/dhis2DataPreloader';
import { updateFormDataByDatasource } from './exploreActions';
import { ExplorePageState } from '../types';

interface SaveDatasetRequest {
  data: {
    schema?: string;
    sql?: string;
    dbId?: number;
    templateParams?: string;
    datasourceName: string;
    columns: unknown[];
  };
}

export const SET_DATASOURCE = 'SET_DATASOURCE';
export interface SetDatasource {
  type: string;
  datasource: Dataset;
}
export function setDatasource(datasource: Dataset) {
  return { type: SET_DATASOURCE, datasource };
}

export function changeDatasource(newDatasource: Dataset) {
  return function (dispatch: Dispatch, getState: () => ExplorePageState) {
    const {
      explore: { datasource: prevDatasource },
    } = getState();
    dispatch(setDatasource(newDatasource));
    dispatch(updateFormDataByDatasource(prevDatasource, newDatasource));

    // Check if this is a DHIS2 dataset by looking for DHIS2 comment in SQL
    // Use type assertion since Dataset type doesn't include sql property
    const datasourceWithSql = newDatasource as Dataset & { sql?: string };
    const databaseId = (newDatasource.database as { id?: number })?.id;

    if (
      newDatasource &&
      databaseId &&
      newDatasource.id &&
      datasourceWithSql.sql &&
      /\/\*\s*DHIS2:\s*(.+?)\s*\*\//i.test(datasourceWithSql.sql)
    ) {
      dhis2DataPreloader.preloadDataset(
        newDatasource.id,
        databaseId,
        datasourceWithSql.sql,
      );
    }
  };
}

export function saveDataset({
  schema,
  sql,
  database,
  templateParams,
  datasourceName,
  columns,
}: Omit<SaveDatasetRequest['data'], 'dbId'> & { database: { id: number } }) {
  return async function (dispatch: ThunkDispatch<any, undefined, AnyAction>) {
    // Create a dataset object
    try {
      const {
        json: { data },
      } = await SupersetClient.post({
        endpoint: '/api/v1/dataset/',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database: database?.id,
          table_name: datasourceName,
          schema,
          sql,
          template_params: templateParams,
          columns,
        }),
      });
      // Update form_data to point to new dataset
      dispatch(changeDatasource(data));
      return data;
    } catch (error) {
      getClientErrorObject(error).then(e => {
        dispatch(addDangerToast(e.error));
      });
      throw error;
    }
  };
}

export const datasourcesActions = {
  setDatasource,
  changeDatasource,
  saveDataset,
};

export type AnyDatasourcesAction = SetDatasource;
