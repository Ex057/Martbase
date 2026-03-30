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
import { useState, useEffect, useMemo, useCallback } from 'react';
import { ensureIsArray, styled, t, SupersetClient } from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/api/core';
import {
  TableView,
  TableSize,
  EmptyState,
  Loading,
  EmptyWrapperType,
} from '@superset-ui/core/components';
import {
  useFilteredTableData,
  useTableColumns,
} from 'src/explore/components/DataTableControl';
import { getDatasourceSamples } from 'src/components/Chart/chartAction';
import { TableControls } from './DataTableControls';
import { SamplesPaneProps } from '../types';

const ErrorMessage = styled.pre`
  margin-top: ${({ theme }) => `${theme.sizeUnit * 4}px`};
`;

const cache = new WeakSet();

async function loadDHIS2SampleData(datasource: any) {
  try {
    const sql = datasource.sql as string;
    const databaseId = datasource.database?.id;

    if (!databaseId) {
      throw new Error('Database ID not found in datasource');
    }

    // eslint-disable-next-line no-console
    console.log(
      '[SamplesPane] Loading DHIS2 sample data for database:',
      databaseId,
    );
    // eslint-disable-next-line no-console
    console.log('[SamplesPane] Dataset SQL:', sql?.substring(0, 200));

    // Use the dhis2_chart_data endpoint which parses SQL comment parameters
    const response = await SupersetClient.post({
      endpoint: `/api/v1/database/${databaseId}/dhis2_chart_data/`,
      jsonPayload: {
        sql,
        limit: 100,
      },
    });

    const rows = response.json?.data || [];
    const columns = response.json?.columns || [];

    // eslint-disable-next-line no-console
    console.log('[SamplesPane] DHIS2 data loaded:', {
      rowCount: rows.length,
      columnCount: columns.length,
      columns: columns.map((c: any) => c.name),
    });

    if (rows.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[SamplesPane] No rows returned from DHIS2');
      return null;
    }

    // Transform rows to match expected format
    // The dhis2_chart_data endpoint returns rows as objects with column names as keys
    const colnames = columns.map((col: any) => col.name || col.label || col);
    const data = rows.map((row: any) =>
      Array.isArray(row) ? row : colnames.map((col: string) => row[col]),
    );

    // Map column types - DHIS2 uses FLOAT for data elements, STRING for dimensions
    const coltypes = columns.map((col: any) => {
      const colType = col.type?.toUpperCase() || 'STRING';
      if (colType === 'FLOAT' || colType === 'DOUBLE' || colType === 'NUMBER') {
        return 1; // GenericDataType.Numeric
      }
      if (colType === 'BOOLEAN') {
        return 3; // GenericDataType.Boolean
      }
      if (col.is_dttm || colType.includes('DATE') || colType.includes('TIME')) {
        return 2; // GenericDataType.Temporal
      }
      return 0; // GenericDataType.String
    });

    return {
      data,
      colnames,
      coltypes,
      rowcount: rows.length,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[SamplesPane] Failed to load DHIS2 sample data:', error);
    throw error;
  }
}

export const SamplesPane = ({
  isRequest,
  datasource,
  queryForce,
  setForceQuery,
  dataSize = 50,
  isVisible,
  canDownload,
}: SamplesPaneProps) => {
  const [filterText, setFilterText] = useState('');
  const [data, setData] = useState<Record<string, any>[][]>([]);
  const [colnames, setColnames] = useState<string[]>([]);
  const [coltypes, setColtypes] = useState<GenericDataType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [rowcount, setRowCount] = useState<number>(0);
  const [responseError, setResponseError] = useState<string>('');
  const [isDHIS2, setIsDHIS2] = useState<boolean>(false);
  const datasourceId = useMemo(
    () => `${datasource.id}__${datasource.type}`,
    [datasource],
  );

  useEffect(() => {
    if (isRequest && queryForce) {
      cache.delete(datasource);
    }

    // Check if this is a DHIS2 dataset by looking at the SQL
    const { sql } = datasource as { sql?: string };
    const isDHIS2Dataset =
      sql && (sql.includes('/* DHIS2:') || sql.includes('-- DHIS2:'));

    if (isDHIS2Dataset) {
      setIsDHIS2(true);

      // Load DHIS2 data in background - fetch full dataset structure
      if (!cache.has(datasource) || queryForce) {
        setIsLoading(true);
        loadDHIS2SampleData(datasource)
          .then(result => {
            if (result) {
              setData(result.data);
              setColnames(result.colnames);
              setColtypes(result.coltypes);
              setRowCount(result.rowcount);
              setResponseError('');
              cache.add(datasource);
            }
          })
          .catch(error => {
            setData([]);
            setColnames([]);
            setColtypes([]);
            setResponseError(`Failed to load DHIS2 data: ${error.message}`);
          })
          .finally(() => {
            setIsLoading(false);
            if (queryForce) {
              setForceQuery?.(false);
            }
          });
      }
      return;
    }

    setIsDHIS2(false);

    if (isRequest && !cache.has(datasource)) {
      setIsLoading(true);
      getDatasourceSamples(datasource.type, datasource.id, queryForce, {})
        .then(response => {
          setData(ensureIsArray(response.data));
          setColnames(ensureIsArray(response.colnames));
          setColtypes(ensureIsArray(response.coltypes));
          setRowCount(response.rowcount);
          setResponseError('');
          cache.add(datasource);
          if (queryForce) {
            setForceQuery?.(false);
          }
        })
        .catch(error => {
          setData([]);
          setColnames([]);
          setColtypes([]);
          setResponseError(`${error.name}: ${error.message}`);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [datasource, isRequest, queryForce, setForceQuery]);

  const transformedData = useMemo(() => {
    if (!data || !colnames) {
      return [];
    }

    return data.map(row => {
      const rowObject: Record<string, any> = {};

      // Handle different data structures
      if (Array.isArray(row)) {
        // Row is an array - map by index
        colnames.forEach((col, i) => {
          rowObject[col] = row[i];
        });
      } else if (row && typeof row === 'object') {
        // Row is already an object - copy values using column names
        colnames.forEach(col => {
          // Try exact column name first
          if (col in row) {
            rowObject[col] = row[col];
          } else {
            // Try to find column by sanitized name comparison
            const foundKey = Object.keys(row).find(k => {
              const sanitizedK = k
                .replace(/[.\-\s()]+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
              const sanitizedCol = col
                .replace(/[.\-\s()]+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
              return sanitizedK.toLowerCase() === sanitizedCol.toLowerCase();
            });
            rowObject[col] = foundKey ? row[foundKey] : undefined;
          }
        });
      } else {
        // Unknown format - try to use as-is
        colnames.forEach(col => {
          rowObject[col] = undefined;
        });
      }

      return rowObject;
    });
  }, [data, colnames]);

  // this is to preserve the order of the columns, even if there are integer values,
  // while also only grabbing the first column's keys
  const columns = useTableColumns(
    colnames,
    coltypes,
    transformedData,
    datasourceId,
    isVisible,
    {}, // moreConfig
  );
  const filteredData = useFilteredTableData(filterText, transformedData);

  const handleInputChange = useCallback(
    (input: string) => setFilterText(input),
    [],
  );

  if (isLoading) {
    return <Loading />;
  }

  if (responseError) {
    return (
      <>
        <TableControls
          data={filteredData}
          columnNames={colnames}
          columnTypes={coltypes}
          rowcount={rowcount}
          datasourceId={datasourceId}
          onInputChange={handleInputChange}
          isLoading={isLoading}
          canDownload={canDownload}
        />
        <ErrorMessage>{responseError}</ErrorMessage>
      </>
    );
  }

  if (data.length === 0) {
    let title = t('No samples were returned for this dataset');
    let description;

    if (isDHIS2) {
      title = t('Loading DHIS2 Data...');
      description = t(
        'Fetching sample data from DHIS2. If this takes too long, the dataset may have connection issues.',
      );

      // If not loading and no data, show appropriate message
      if (!isLoading) {
        title = t('No DHIS2 Data Available');
        description = t(
          'Could not load sample data. Please check that the DHIS2 connection is configured correctly and the dataset parameters are valid.',
        );
      }
    }

    return (
      <EmptyState
        image="document.svg"
        title={title}
        description={description}
      />
    );
  }

  return (
    <>
      <TableControls
        data={filteredData}
        columnNames={colnames}
        columnTypes={coltypes}
        rowcount={rowcount}
        datasourceId={datasourceId}
        onInputChange={handleInputChange}
        isLoading={isLoading}
        canDownload={canDownload}
      />
      <TableView
        columns={columns}
        data={filteredData}
        pageSize={dataSize}
        noDataText={t('No results')}
        emptyWrapperType={EmptyWrapperType.Small}
        className="table-condensed"
        isPaginationSticky
        showRowCount={false}
        size={TableSize.Small}
        small
      />
    </>
  );
};
