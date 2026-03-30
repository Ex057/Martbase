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
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { t, styled, SupersetClient } from '@superset-ui/core';
import {
  Typography,
  Button,
  Modal,
  Empty,
  Loading,
} from '@superset-ui/core/components';
// eslint-disable-next-line no-restricted-imports
import { Tag, Divider, Input, Table, message, Collapse } from 'antd';
import { PeriodSelector } from './PeriodSelector';
import { DxSelector } from './DxSelector';
import {
  OuSelector,
  HierarchyColumnMode,
  OuSelectionOutput,
} from './OuSelector';
import { sanitizeDHIS2ColumnName } from './sanitize';

const { Title, Paragraph, Text } = Typography;

interface DHIS2Dimension {
  id: string;
  displayName: string;
  type: 'dataElement' | 'indicator' | 'dataSet';
}

interface DHIS2ParameterBuilderProps {
  databaseId?: number;
  endpoint?: string | null;
  onParametersChange?: (parameters: Record<string, string>) => void;
  onColumnsChange?: (columns: Array<{ name: string; type: string }>) => void;
  onDatasetNameChange?: (name: string) => void;
  onSave?: () => void;
  initialParameters?: Record<string, string>;
  initialDatasetName?: string;
}

const Container = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 3}px;
    background: ${theme.colorBgContainer};
    border-radius: ${theme.borderRadius}px;
    margin: ${theme.sizeUnit * 2}px 0;
  `}
`;

const ParameterSection = styled.div`
  ${({ theme }) => `
    margin-bottom: ${theme.sizeUnit * 3}px;
    
    h3, h4 {
      margin-bottom: ${theme.sizeUnit}px;
      font-weight: 600;
    }
  `}
`;

const InfoBox = styled.div`
  ${({ theme }) => `
    background: ${theme.colorBgElevated};
    border-left: 4px solid ${theme.colorPrimary};
    padding: ${theme.sizeUnit * 1.5}px ${theme.sizeUnit * 2}px;
    margin-bottom: ${theme.sizeUnit * 2}px;
    border-radius: ${theme.borderRadius}px;
    font-size: 12px;
    line-height: 1.5;
  `}
`;

const PreviewUrlSection = styled.div`
  ${({ theme }) => `
    padding: 12px;
    background-color: ${theme.colorBgElevated};
    border-bottom: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px ${theme.borderRadius}px 0 0;
  `}
`;

const PreviewDataSection = styled.div`
  ${({ theme }) => `
    padding: 12px;
    flex: 1;
    overflow: auto;
    background-color: ${theme.colorBgContainer};
    
    .ant-table-wrapper {
      .ant-table {
        font-size: 12px;
        
        .ant-table-thead > tr > th {
          padding: 8px 12px;
          font-weight: 600;
          background-color: ${theme.colorBgElevated};
        }
        
        .ant-table-tbody > tr > td {
          padding: 6px 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }
  `}
`;

const PreviewTextArea = styled(Input.TextArea)`
  ${({ theme }) => `
    font-family: Monaco, Consolas, 'Courier New', monospace;
    font-size: 12px;
    background-color: ${theme.colorBgContainer};
    border: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
    padding: 12px;
  `}
`;

const PreviewTable = styled.div`
  ${({ theme }) => `
    background-color: ${theme.colorBgContainer};
    border-radius: ${theme.borderRadius}px;
    overflow: hidden;
    
    .ant-table-container {
      font-size: 12px !important;
    }
    
    .ant-table-cell {
      max-width: 200px;
      padding: 6px 12px !important;
    }
  `}
`;

const DimensionCollapse = styled(Collapse)`
  ${({ theme }) => `
    .ant-collapse-item {
      margin-bottom: ${theme.sizeUnit * 2}px;
      border: 1px solid ${theme.colorBorder};
      border-radius: ${theme.borderRadius}px !important;
      overflow: hidden;
    }
    
    .ant-collapse-header {
      background: ${theme.colorBgLayout};
      font-weight: 500;
      padding: ${theme.sizeUnit * 2}px ${theme.sizeUnit * 3}px !important;
    }
    
    .ant-collapse-content-box {
      padding: ${theme.sizeUnit * 2}px !important;
    }
  `}
`;

const DimensionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

const DimensionTitle = styled.span`
  ${({ theme }) => `
    font-size: 14px;
    font-weight: 600;
    color: ${theme.colorText};
  `}
`;

const DimensionBadge = styled.span`
  ${({ theme }) => `
    background: ${theme.colorPrimary};
    color: ${theme.colorTextLightSolid};
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
  `}
`;

// NOTE: PERIOD_OPTIONS removed - now using PeriodSelector component with tabs

// Preview optimization: limit rows for fast loading
const PREVIEW_ROW_LIMIT = 10;

/**
 * Extract the source table name from a dataset name
 *
 * Pattern: {source_table}_{custom_suffix}
 * Examples:
 *   "analytics_malaria_cases" -> "analytics"
 *   "analytics_version2" -> "analytics"
 *   "dataValueSets_monthly" -> "dataValueSets"
 *
 * @param datasetName - The full dataset name
 * @returns The source table name (first part before underscore)
 */
export function parseSourceTable(
  datasetName: string | null | undefined,
): string | null {
  if (!datasetName) return null;

  const parts = datasetName.split('_');
  return parts[0] || null;
}

/**
 * Ref type for accessing DHIS2ParameterBuilder preview functionality from parent components
 */
export interface DHIS2ParameterBuilderRef {
  triggerPreview: () => Promise<void>;
  openPreviewModal: () => void;
}

/**
 * DHIS2 Parameter Builder Component
 * Visual query builder for DHIS2 analytics endpoint
 * Allows users to select dx (data), pe (period), and ou (org units) without SQL
 */
const DHIS2ParameterBuilder = forwardRef<
  DHIS2ParameterBuilderRef,
  DHIS2ParameterBuilderProps
>(
  (
    {
      databaseId,
      endpoint,
      onParametersChange,
      onColumnsChange,
      onDatasetNameChange,
      onSave,
      initialParameters = {},
      initialDatasetName,
    },
    ref,
  ) => {
    // Dimension metadata for column generation (populated by child selectors)
    const [loadedDimensions, setLoadedDimensions] = useState<DHIS2Dimension[]>(
      [],
    );
    const [availableOrgUnitLevels, setAvailableOrgUnitLevels] = useState<
      Array<{ level: number; displayName: string }>
    >([]);
    const [datasetName, setDatasetName] = useState<string>(
      initialDatasetName || '',
    );
    const [userEditedName, setUserEditedName] = useState(false); // Track if user manually edited the name

    // Active dimension panel (only one open at a time)
    const [activePanel, setActivePanel] = useState<string | string[]>('dx');

    // Selected values (use semicolons to split values within dimension)
    const [selectedData, setSelectedData] = useState<string[]>(
      initialParameters.dimension
        ?.split(';')
        .find(d => d.startsWith('dx:'))
        ?.replace('dx:', '')
        .split(';') || [],
    );
    const [selectedPeriods, setSelectedPeriods] = useState<string[]>(
      initialParameters.dimension
        ?.split(';')
        .find(d => d.startsWith('pe:'))
        ?.replace('pe:', '')
        .split(';') || ['LAST_YEAR'],
    );
    const [selectedOrgUnits, setSelectedOrgUnits] = useState<string[]>([
      'USER_ORGUNIT',
    ]);

    // Hierarchy column mode: 'all_levels' or 'data_levels_only'
    const [hierarchyColumnMode, setHierarchyColumnMode] =
      useState<HierarchyColumnMode>('all_levels');

    // Full OU selection output for building parameters
    const [ouSelectionOutput, setOuSelectionOutput] =
      useState<OuSelectionOutput | null>(null);

    // Preview modal state
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [previewColumns, setPreviewColumns] = useState<any[]>([]);
    const [generatedApiUrl, setGeneratedApiUrl] = useState<string>(''); // Human-readable decoded URL
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Preview caching and request management
    const previewCacheRef = useRef<{
      [key: string]: { data: any[]; columns: any[]; timestamp: number };
    }>({});
    const previewRequestRef = useRef<{ [key: string]: boolean }>({});
    const PREVIEW_CACHE_TTL = 5 * 60 * 1000;

    // Create a ref to store the fetchPreviewData function for imperative access
    const fetchPreviewDataRef = useRef<() => Promise<void>>();

    useImperativeHandle(
      ref,
      () => ({
        triggerPreview: async () => {
          if (fetchPreviewDataRef.current) {
            await fetchPreviewDataRef.current();
          }
        },
        openPreviewModal: () => setPreviewVisible(true),
      }),
      [],
    );

    // Callback to receive loaded dimensions from DxSelector
    const handleDimensionsLoad = useCallback((dimensions: DHIS2Dimension[]) => {
      setLoadedDimensions(dimensions);
    }, []);

    // Callback to receive org unit levels from OuSelector
    const handleOrgUnitLevelsLoad = useCallback(
      (levels: Array<{ level: number; displayName: string }>) => {
        setAvailableOrgUnitLevels(levels);
      },
      [],
    );

    // Callback to receive OU selection changes from OuSelector
    // Use flushSync alternative: batch updates to avoid render-during-render warnings
    const handleOuSelectionChange = useCallback((output: OuSelectionOutput) => {
      // Defer state updates to next tick to avoid "Cannot update component while rendering" warning
      // This happens when the OuSelector triggers onChange during its render cycle
      queueMicrotask(() => {
        setOuSelectionOutput(output);
        setHierarchyColumnMode(output.hierarchyColumnMode);
      });
    }, []);

    // Auto-generate suggested dataset name with pattern: {source_table}_{custom_suffix}
    useEffect(() => {
      // Only auto-generate if user hasn't manually edited and name is empty or default
      if (
        !userEditedName &&
        (!datasetName ||
          datasetName === endpoint ||
          datasetName === initialDatasetName)
      ) {
        const parts: string[] = [];

        // Add first data element name if available (more descriptive)
        if (selectedData.length > 0 && loadedDimensions.length > 0) {
          const firstDE = loadedDimensions.find(
            de => de.id === selectedData[0],
          );
          if (firstDE) {
            // Clean name: remove special chars, limit length
            const cleanName = firstDE.displayName
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .replace(/\s+/g, '_')
              .substring(0, 30);
            parts.push(cleanName);
          }
        }

        // Add period info
        if (selectedPeriods.length > 0) {
          parts.push(selectedPeriods[0].replace(/\s+/g, '_'));
        }

        // Generate name with pattern: {source_table}_{suffix}
        // Example: analytics_malaria_cases_2024Q1
        const suffix = parts.length > 0 ? parts.join('_') : 'dataset';
        const timestamp = new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, ''); // YYYYMMDD
        const suggested = `${endpoint}_${suffix}_${timestamp}`;

        if (suggested !== datasetName) {
          setDatasetName(suggested);
        }
      }
    }, [selectedData, selectedPeriods, loadedDimensions, endpoint]);

    // Notify parent when dataset name changes (debounced to avoid infinite loops)
    const onDatasetNameChangeRef = useRef(onDatasetNameChange);
    const endpointRef = useRef(endpoint);

    useEffect(() => {
      onDatasetNameChangeRef.current = onDatasetNameChange;
      endpointRef.current = endpoint;
    });

    useEffect(() => {
      if (
        onDatasetNameChangeRef.current &&
        datasetName &&
        datasetName !== endpointRef.current
      ) {
        const timeoutId = setTimeout(() => {
          onDatasetNameChangeRef.current?.(datasetName);
        }, 300); // Debounce 300ms

        return () => clearTimeout(timeoutId);
      }
      return undefined; // Return undefined when condition is false
    }, [datasetName]);

    // Update parent when selections change
    useEffect(() => {
      if (!onParametersChange) {
        return;
      }

      const parameters: Record<string, string> = {};

      if (endpoint === 'analytics') {
        // Build dimension parameter for DHIS2 Analytics API
        // Format: dimension=dx:id1;id2&dimension=pe:PERIOD&dimension=ou:UID;LEVEL-n
        // Reference: https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/analytics.html
        const dimensions: string[] = [];

        // Data dimension (dx)
        if (selectedData.length > 0) {
          dimensions.push(`dx:${selectedData.join(';')}`);
        }

        // Period dimension (pe)
        if (selectedPeriods.length > 0) {
          dimensions.push(`pe:${selectedPeriods.join(';')}`);
        }

        // Organisation unit dimension (ou)
        // Use the ouDimensionValue from OuSelectionOutput which includes UIDs and LEVEL-n
        if (ouSelectionOutput?.ouDimensionValue) {
          dimensions.push(`ou:${ouSelectionOutput.ouDimensionValue}`);
        } else if (selectedOrgUnits.length > 0) {
          // Fallback to raw selectedOrgUnits if ouSelectionOutput not available
          dimensions.push(`ou:${selectedOrgUnits.join(';')}`);
        }

        if (dimensions.length > 0) {
          parameters.dimension = dimensions.join(';');
        }
        parameters.displayProperty = 'NAME';
        parameters.skipMeta = 'false';
        parameters.hierarchyMeta = 'true';
        parameters.hierarchyColumnMode = hierarchyColumnMode;

        // Query performance optimizations
        parameters.outputIdScheme = 'UID';
        parameters.analyticsType = 'aggregate';
      } else if (endpoint === 'dataValueSets') {
        // dataValueSets uses different parameter format
        // Optimizations: limit fields, use pagination for large datasets
        if (selectedData.length > 0) {
          parameters.dataElement = selectedData.join(',');
        }
        if (selectedPeriods.length > 0) {
          parameters.period = selectedPeriods.join(',');
        }
        // For dataValueSets, extract org unit IDs (not LEVEL-n)
        const orgUnitIds = selectedOrgUnits.filter(
          id => !id.startsWith('LEVEL-') && !id.startsWith('USER_ORGUNIT'),
        );
        if (orgUnitIds.length > 0) {
          parameters.orgUnit = orgUnitIds.join(',');
        }
        // Check if any LEVEL selections exist - if so, include children
        const hasLevelSelections = selectedOrgUnits.some(id =>
          id.startsWith('LEVEL-'),
        );
        if (hasLevelSelections) {
          parameters.children = 'true';
        }
        parameters.hierarchyColumnMode = hierarchyColumnMode;

        // Query performance optimizations for large datasets
        parameters.outputIdScheme = 'UID';
        parameters.paging = 'true';
        parameters.pageSize = '10000';
      } else {
        // For other DHIS2 endpoints, support filter parameters
        // Example: dataElements?filter=id:in:[FTRrcoaog83,P3jJH5Tu5VC]
        if (selectedData.length > 0) {
          parameters.filter = `id:in:[${selectedData.join(',')}]`;
        }
        parameters.fields = 'id,displayName,name,code,created,lastUpdated';
        parameters.paging = 'false';
      }

      onParametersChange(parameters);

      // Generate expected column structure for DHIS2 (dynamic based on endpoint)
      if (onColumnsChange) {
        const columns: Array<{ name: string; type: string }> = [];

        // Generate columns dynamically based on selected endpoint
        // For analytics-type endpoints with dimensional data, generate pivoted columns
        if (endpoint === 'analytics' && selectedData.length > 0) {
          console.log(
            '[DHIS2 Columns] Generating analytics columns - selectedData:',
            selectedData.length,
            'loadedDimensions:',
            loadedDimensions.length,
          );

          // Always include Period and hierarchy level columns (sanitized to match backend output)
          columns.push({
            name: sanitizeDHIS2ColumnName('Period'),
            type: 'VARCHAR(255)',
          });
          availableOrgUnitLevels.forEach(levelInfo => {
            columns.push({
              name: sanitizeDHIS2ColumnName(levelInfo.displayName),
              type: 'VARCHAR(255)',
            });
          });

          selectedData.forEach(dataId => {
            const dimension = loadedDimensions.find(d => d.id === dataId);
            const columnName = dimension?.displayName || dataId;
            const sanitizedName = sanitizeDHIS2ColumnName(columnName);
            columns.push({ name: sanitizedName, type: 'FLOAT' });
            console.log(
              '[DHIS2 Columns] Added column:',
              sanitizedName,
              '(from:',
              columnName,
              ') for ID:',
              dataId,
            );
          });
        } else if (endpoint === 'dataValueSets') {
          // dataValueSets returns unpivoted data with hierarchical org unit support
          columns.push({
            name: sanitizeDHIS2ColumnName('dataElement'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('period'),
            type: 'VARCHAR(255)',
          });

          availableOrgUnitLevels.forEach(levelInfo => {
            columns.push({
              name: sanitizeDHIS2ColumnName(levelInfo.displayName),
              type: 'VARCHAR(255)',
            });
          });

          columns.push({
            name: sanitizeDHIS2ColumnName('value'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('storedBy'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('created'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('lastUpdated'),
            type: 'TIMESTAMP',
          });
        } else if (endpoint === 'events') {
          // Tracker events endpoint - individual event records with org unit hierarchy
          columns.push({
            name: sanitizeDHIS2ColumnName('event'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('program'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('programStage'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('enrollment'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('trackedEntityInstance'),
            type: 'VARCHAR(255)',
          });

          // Add OrgUnit hierarchy levels for filtering (same as analytics)
          availableOrgUnitLevels.forEach(levelInfo => {
            columns.push({
              name: sanitizeDHIS2ColumnName(levelInfo.displayName),
              type: 'VARCHAR(255)',
            });
          });

          columns.push({
            name: sanitizeDHIS2ColumnName('eventDate'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('dueDate'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('status'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('created'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('lastUpdated'),
            type: 'TIMESTAMP',
          });
          // Note: Data values will be added dynamically based on program data elements
        } else if (endpoint === 'enrollments') {
          // Tracker enrollments endpoint with org unit hierarchy
          columns.push({
            name: sanitizeDHIS2ColumnName('enrollment'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('trackedEntityInstance'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('program'),
            type: 'VARCHAR(255)',
          });

          // Add OrgUnit hierarchy levels for filtering (same as analytics)
          availableOrgUnitLevels.forEach(levelInfo => {
            columns.push({
              name: sanitizeDHIS2ColumnName(levelInfo.displayName),
              type: 'VARCHAR(255)',
            });
          });

          columns.push({
            name: sanitizeDHIS2ColumnName('enrollmentDate'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('incidentDate'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('status'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('created'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('lastUpdated'),
            type: 'TIMESTAMP',
          });
          // Note: Attributes will be added dynamically based on program attributes
        } else if (endpoint === 'trackedEntityInstances') {
          // Tracker entity instances endpoint with org unit hierarchy
          columns.push({
            name: sanitizeDHIS2ColumnName('trackedEntityInstance'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('trackedEntityType'),
            type: 'VARCHAR(255)',
          });

          // Add OrgUnit hierarchy levels for filtering (same as analytics)
          availableOrgUnitLevels.forEach(levelInfo => {
            columns.push({
              name: sanitizeDHIS2ColumnName(levelInfo.displayName),
              type: 'VARCHAR(255)',
            });
          });

          columns.push({
            name: sanitizeDHIS2ColumnName('created'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('lastUpdated'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('inactive'),
            type: 'BOOLEAN',
          });
          // Note: Attributes will be added dynamically based on tracked entity type
        } else {
          // For any other DHIS2 endpoint, generate generic columns (sanitized to match backend output)
          // This will be dynamically populated when data is actually fetched
          columns.push({
            name: sanitizeDHIS2ColumnName('id'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('displayName'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('name'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('code'),
            type: 'VARCHAR(255)',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('created'),
            type: 'TIMESTAMP',
          });
          columns.push({
            name: sanitizeDHIS2ColumnName('lastUpdated'),
            type: 'TIMESTAMP',
          });
        }

        // eslint-disable-next-line no-console
        console.log('Generated DHIS2 columns for', endpoint, ':', columns);
        onColumnsChange(columns);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedData,
      selectedPeriods,
      selectedOrgUnits,
      endpoint,
      loadedDimensions,
      hierarchyColumnMode,
      ouSelectionOutput,
    ]);

    // Function to fetch preview data (can be called on initial preview or refresh)
    const fetchPreviewData = async () => {
      if (!databaseId) {
        try {
          message.error('No database selected');
        } catch {
          console.error('No database selected');
        }
        return;
      }

      // Validate that at least one data element is selected
      if (selectedData.length === 0) {
        try {
          message.warning(
            'Please select at least one data element or indicator',
          );
        } catch {
          console.warn('Please select at least one data element or indicator');
        }
        return;
      }

      // Build parameters for preview (simplified to reduce timeout risk)
      // Preview uses aggregated data for speed
      const params: Record<string, string> = {};

      if (endpoint === 'analytics') {
        const dimensions = [];

        // PREVIEW OPTIMIZATION: Limit data elements to FIRST 1 for faster preview (reduces timeout risk)
        const previewData = selectedData.slice(0, 1);
        if (previewData.length > 0) {
          dimensions.push(`dx:${previewData.join(';')}`);
        }

        // PREVIEW OPTIMIZATION: Limit periods to FIRST 1 for faster preview
        const previewPeriods = selectedPeriods
          .filter(p => p.startsWith('LAST_') || p.startsWith('THIS_'))
          .slice(0, 1);
        if (previewPeriods.length === 0 && selectedPeriods.length > 0) {
          // If no predefined periods selected, just take first one
          dimensions.push(`pe:${selectedPeriods[0]}`);
        } else if (previewPeriods.length > 0) {
          dimensions.push(`pe:${previewPeriods.join(';')}`);
        }

        // PREVIEW OPTIMIZATION: For preview, use the actual OU dimension value
        // but limit to first org unit for faster response
        if (ouSelectionOutput?.ouDimensionValue) {
          // Use the full ouDimensionValue for accurate preview
          dimensions.push(`ou:${ouSelectionOutput.ouDimensionValue}`);
        } else if (selectedOrgUnits.length > 0) {
          // Fallback: use first selected org unit
          const firstOu =
            selectedOrgUnits.find(ou => !ou.startsWith('LEVEL-')) ||
            selectedOrgUnits[0];
          dimensions.push(`ou:${firstOu}`);
        }

        if (dimensions.length > 0) {
          params.dimension = dimensions.join(';');
        }
        params.displayProperty = 'NAME';
        params.skipMeta = 'false';
        params.hierarchyMeta = 'true';

        // Optimization parameters for faster preview loading
        params.outputIdScheme = 'UID';
        params.analyticsType = 'aggregate';
      } else if (endpoint === 'dataValueSets') {
        if (selectedData.length > 0) {
          params.dataElement = selectedData.join(',');
        }
        if (selectedPeriods.length > 0) {
          params.period = selectedPeriods.join(',');
        }
        // Extract org unit IDs (not LEVEL-n) for dataValueSets
        const orgUnitIds = selectedOrgUnits.filter(
          id => !id.startsWith('LEVEL-') && !id.startsWith('USER_ORGUNIT'),
        );
        if (orgUnitIds.length > 0) {
          params.orgUnit = orgUnitIds.join(',');
        }
        // Check if any LEVEL selections exist - if so, include children
        const hasLevelSelections = selectedOrgUnits.some(id =>
          id.startsWith('LEVEL-'),
        );
        if (hasLevelSelections) {
          params.children = 'true';
        }
      } else if (endpoint === 'events') {
        // Tracker events endpoint
        // Required: program or programStage
        if (selectedData.length > 0) {
          // First selected item is treated as the program
          params.program = selectedData[0];
        }
        if (selectedOrgUnits.length > 0) {
          params.orgUnit = selectedOrgUnits[0]; // Events API takes single orgUnit
        }
        if (selectedPeriods.length > 0) {
          // Convert period selections to date range
          // For now, use lastUpdated filter
          const period = selectedPeriods[0];
          if (period === 'THIS_YEAR') {
            const year = new Date().getFullYear();
            params.startDate = `${year}-01-01`;
            params.endDate = `${year}-12-31`;
          } else if (period === 'LAST_YEAR') {
            const year = new Date().getFullYear() - 1;
            params.startDate = `${year}-01-01`;
            params.endDate = `${year}-12-31`;
          } else if (period === 'LAST_12_MONTHS') {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);
            params.startDate = startDate.toISOString().split('T')[0];
            params.endDate = endDate.toISOString().split('T')[0];
          }
        }
        // Include child org units if LEVEL selections exist
        const hasLevelSelectionsEvents = selectedOrgUnits.some(id =>
          id.startsWith('LEVEL-'),
        );
        if (hasLevelSelectionsEvents) {
          params.ouMode = 'DESCENDANTS';
        }
        params.fields = '*';
        params.paging = 'false';
      } else if (endpoint === 'enrollments') {
        // Tracker enrollments endpoint
        if (selectedData.length > 0) {
          // First selected item is treated as the program
          params.program = selectedData[0];
        }
        if (selectedOrgUnits.length > 0) {
          params.ou = selectedOrgUnits[0]; // Enrollments API uses 'ou'
        }
        if (selectedPeriods.length > 0) {
          // Convert period to date filter
          const period = selectedPeriods[0];
          if (period === 'THIS_YEAR') {
            const year = new Date().getFullYear();
            params.programStartDate = `${year}-01-01`;
            params.programEndDate = `${year}-12-31`;
          } else if (period === 'LAST_YEAR') {
            const year = new Date().getFullYear() - 1;
            params.programStartDate = `${year}-01-01`;
            params.programEndDate = `${year}-12-31`;
          }
        }
        // Include child org units if LEVEL selections exist
        const hasLevelSelectionsEnrollments = selectedOrgUnits.some(id =>
          id.startsWith('LEVEL-'),
        );
        if (hasLevelSelectionsEnrollments) {
          params.ouMode = 'DESCENDANTS';
        }
        params.fields = '*';
        params.paging = 'false';
      } else if (endpoint === 'trackedEntityInstances') {
        // Tracked entity instances endpoint
        if (selectedData.length > 0) {
          // First selected item can be program or trackedEntityType
          params.program = selectedData[0];
        }
        if (selectedOrgUnits.length > 0) {
          params.ou = selectedOrgUnits[0];
        }
        // Include child org units if LEVEL selections exist
        const hasLevelSelectionsTEI = selectedOrgUnits.some(id =>
          id.startsWith('LEVEL-'),
        );
        if (hasLevelSelectionsTEI) {
          params.ouMode = 'DESCENDANTS';
        }
        params.fields = '*';
        params.paging = 'false';
      } else {
        // Other endpoints use filter parameter
        if (selectedData.length > 0) {
          params.filter = `id:in:[${selectedData.join(',')}]`;
        }
        params.fields = 'id,displayName,name,code,created,lastUpdated';
        params.paging = 'false';
      }

      // Generate cache key from query parameters for deduplication and caching
      const cacheKey = JSON.stringify({ endpoint, params });

      // Check if request is already in progress
      if (previewRequestRef.current[cacheKey]) {
        try {
          message.info('Preview request already in progress. Please wait...');
        } catch {
          console.info('Preview request already in progress.');
        }
        return;
      }

      // Check cache (5 minute TTL)
      const cachedResult = previewCacheRef.current[cacheKey];
      if (
        cachedResult &&
        Date.now() - cachedResult.timestamp < PREVIEW_CACHE_TTL
      ) {
        console.log('[Preview Cache] Returning cached preview data');
        setPreviewColumns(cachedResult.columns);
        setPreviewData(cachedResult.data);
        setPreviewVisible(true);
        return;
      }

      setIsRefreshing(true);
      previewRequestRef.current[cacheKey] = true;

      try {
        // Build human-readable decoded URL (NOT encoded)
        const decodedParts: string[] = [];
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'dimension') {
            const dimensionTypes = value.split(/;(?=(?:dx|pe|ou):)/);
            dimensionTypes.forEach(dim => {
              decodedParts.push(`dimension=${dim}`);
            });
          } else {
            decodedParts.push(`${key}=${value}`);
          }
        });
        const decodedUrl = `api/${endpoint}?${decodedParts.join('&')}`;
        setGeneratedApiUrl(decodedUrl);

        // For SQL comment, manually build query string to handle multiple dimension parameters
        // URLSearchParams doesn't support multiple values for same key properly
        const sqlCommentParts: string[] = [];
        Object.entries(params).forEach(([key, value]) => {
          if (key === 'dimension') {
            // Split dimension string and create separate parameters
            const dimensionTypes = value.split(/;(?=(?:dx|pe|ou):)/);
            dimensionTypes.forEach(dim => {
              sqlCommentParts.push(`dimension=${encodeURIComponent(dim)}`);
            });
          } else {
            sqlCommentParts.push(`${key}=${encodeURIComponent(value)}`);
          }
        });
        const queryParams = sqlCommentParts.join('&');

        // Use Superset's SQL Lab execute endpoint to preview data
        // The DHIS2 dialect parses the comment to extract query parameters
        // OPTIMIZATION: Use LIMIT 20 for fast preview, even though full dataset will be larger
        const sql = `-- DHIS2: ${queryParams}\nSELECT * FROM ${endpoint} LIMIT ${PREVIEW_ROW_LIMIT}`;

        let response;
        let parsedPayload: any = {};

        try {
          response = await SupersetClient.post({
            endpoint: `/api/v1/sqllab/execute/`,
            jsonPayload: {
              database_id: databaseId,
              sql,
              schema: 'dhis2',
              runAsync: false, // Force synchronous execution for faster preview
              queryLimit: PREVIEW_ROW_LIMIT,
            },
          });

          // Handle different response formats from SQL Lab execute
          if (response?.json) {
            const { json } = response;

            // Format 1: Direct data/columns structure
            if (json.data && json.columns) {
              parsedPayload = json;
            }
            // Format 2: SQL Lab async format with status
            else if (json.status === 'success' && json.data) {
              parsedPayload = json;
            }
            // Format 3: Query result format with query object
            else if (json.query && json.query.results) {
              parsedPayload = {
                data: json.query.results.data || [],
                columns: json.query.results.columns || [],
              };
            }
            // Format 4: String payload that needs parsing
            else if (typeof json === 'string') {
              parsedPayload = JSON.parse(json);
            }
            // Format 5: Nested query_result
            else if (json.query_result) {
              parsedPayload = {
                data: json.query_result.data || [],
                columns: json.query_result.columns || [],
              };
            } else {
              // Fallback: use json as-is
              parsedPayload = json;
            }
          }
        } catch (fetchError: any) {
          // eslint-disable-next-line no-console
          console.error('SQL Lab execute failed:', fetchError);

          // If SQLLab fails, provide a helpful message
          const statusCode = fetchError?.response?.status || fetchError?.status;
          const errorMsg = fetchError?.message || '';

          if (
            statusCode === 500 ||
            statusCode === 504 ||
            errorMsg.toLowerCase().includes('timeout')
          ) {
            throw new Error(
              'Preview timed out - the DHIS2 server is responding slowly. ' +
                'This is common for large data queries. The preview is limited to 1 data element and 1 period (10 rows) for speed. ' +
                'You can still create the dataset with all your selections - ' +
                'the actual dataset will be processed with all selected data elements, periods, and org units. ' +
                'Note: Large DHIS2 queries may take several minutes to complete.',
            );
          }
          throw fetchError;
        }

        // eslint-disable-next-line no-console
        console.log('Parsed payload:', parsedPayload);

        // Handle response - ensure data is properly structured
        const responseData = parsedPayload?.data || [];
        const responseColumns = parsedPayload?.columns || [];

        // eslint-disable-next-line no-console
        console.log(
          'Extracted data:',
          responseData.length,
          'rows, columns:',
          responseColumns,
        );

        if (responseData.length > 0 && responseColumns.length > 0) {
          // Convert columns to Ant Design Table format
          const columns = responseColumns.map((col: any) => ({
            title: typeof col === 'string' ? col : col.name,
            dataIndex: typeof col === 'string' ? col : col.name,
            key: typeof col === 'string' ? col : col.name,
            ellipsis: true,
          }));

          // Add row keys for Ant Design Table
          const dataWithKeys = responseData.map((row: any, idx: number) => ({
            ...row,
            key: idx,
          }));

          // Cache the successful response
          previewCacheRef.current[cacheKey] = {
            data: dataWithKeys,
            columns,
            timestamp: Date.now(),
          };

          setPreviewColumns(columns);
          setPreviewData(dataWithKeys);
          setPreviewVisible(true);
          message.success(
            `Preview loaded: ${responseData.length} rows (cached for 5 min) - full dataset will include all ${selectedData.length} data element(s) and ${selectedPeriods.length} period(s)`,
            5,
          );
        } else {
          // Show empty state in modal with helpful guidance
          setPreviewColumns([]);
          setPreviewData([]);
          setPreviewVisible(true);
          // eslint-disable-next-line no-console
          console.log('Empty response:', parsedPayload);

          // Check if USER_ORGUNIT options were used
          const usesUserOrgUnit = selectedOrgUnits.some(ou =>
            ou.startsWith('USER_ORGUNIT'),
          );

          try {
            if (usesUserOrgUnit) {
              message.warning(
                t(
                  'No data returned. When using USER_ORGUNIT options, ensure the DHIS2 API user has an assigned organisation unit. Try selecting specific org units instead.',
                ),
                8,
              );
            } else {
              message.warning(
                t(
                  'No data returned. The selected data elements may not have data for the chosen periods and organisation units.',
                ),
                6,
              );
            }
          } catch {
            console.warn(
              'Message display failed - likely due to context issue. Data may be empty.',
            );
          }
        }
      } catch (error: any) {
        console.error('Preview error:', error);
        let errorMsg = 'Unknown error';

        if (error?.response) {
          if (error.response.statusText) {
            errorMsg = error.response.statusText;
          } else if (error.response.status) {
            errorMsg = `HTTP ${error.response.status}`;
          }
        } else if (error?.message) {
          errorMsg = error.message;
        } else if (typeof error === 'string') {
          errorMsg = error;
        }

        try {
          message.error(`Failed to load preview: ${errorMsg}`);
        } catch {
          console.error(`Failed to load preview: ${errorMsg}`);
        }
      } finally {
        setIsRefreshing(false);
        previewRequestRef.current[cacheKey] = false;
      }
    };

    useEffect(() => {
      fetchPreviewDataRef.current = fetchPreviewData;
    }, [fetchPreviewData]);

    // Show builder for ALL DHIS2 endpoints
    if (!endpoint || !databaseId) {
      return null;
    }

    return (
      <Container>
        <Title level={4}>{t('DHIS2 Query Builder')}</Title>

        <InfoBox>
          <Paragraph style={{ margin: 0 }}>
            {t(
              'Build your DHIS2 query visually by selecting data elements, periods, and organization units. No SQL required!',
            )}
          </Paragraph>
        </InfoBox>

        {/* Dataset Name Input */}
        <ParameterSection>
          <Title level={5}>{t('Dataset Name')}</Title>
          <Paragraph type="secondary">
            {t(
              'Customize the name for this dataset (auto-generated based on your selections)',
            )}
          </Paragraph>
          <Input
            value={datasetName}
            onChange={e => {
              setDatasetName(e.target.value);
              setUserEditedName(true); // Mark as user-edited to stop auto-generation
            }}
            placeholder={t('Enter dataset name...')}
            style={{ width: '100%' }}
          />
        </ParameterSection>

        <Divider />

        {/* Visual Query Builder with Collapsible Panels */}
        <DimensionCollapse
          accordion
          activeKey={activePanel}
          onChange={key => setActivePanel(key)}
          items={[
            {
              key: 'dx',
              label: (
                <DimensionHeader>
                  <DimensionTitle>📊 {t('Data (dx)')}</DimensionTitle>
                  {selectedData.length > 0 && (
                    <DimensionBadge>{selectedData.length}</DimensionBadge>
                  )}
                </DimensionHeader>
              ),
              children: (
                <>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {t(
                      'Select data elements, indicators, or data sets to include in your query.',
                    )}
                  </Paragraph>
                  <DxSelector
                    databaseId={databaseId}
                    endpoint={endpoint || 'analytics'}
                    value={selectedData}
                    onChange={setSelectedData}
                    onDimensionsLoad={handleDimensionsLoad}
                  />
                </>
              ),
            },
            {
              key: 'pe',
              label: (
                <DimensionHeader>
                  <DimensionTitle>📅 {t('Period (pe)')}</DimensionTitle>
                  {selectedPeriods.length > 0 && (
                    <DimensionBadge>{selectedPeriods.length}</DimensionBadge>
                  )}
                </DimensionHeader>
              ),
              children: (
                <>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {t(
                      'Select time periods for your data - relative or fixed.',
                    )}
                  </Paragraph>
                  <PeriodSelector
                    databaseId={databaseId}
                    value={selectedPeriods}
                    onChange={setSelectedPeriods}
                  />
                </>
              ),
            },
            {
              key: 'ou',
              label: (
                <DimensionHeader>
                  <DimensionTitle>
                    🏢 {t('Organization Units (ou)')}
                  </DimensionTitle>
                  {selectedOrgUnits.length > 0 && (
                    <DimensionBadge>{selectedOrgUnits.length}</DimensionBadge>
                  )}
                </DimensionHeader>
              ),
              children: (
                <>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {t(
                      'Select organization units using the tree view, levels, or user-relative options.',
                    )}
                  </Paragraph>
                  <OuSelector
                    databaseId={databaseId}
                    value={selectedOrgUnits}
                    onChange={setSelectedOrgUnits}
                    onLevelsLoad={handleOrgUnitLevelsLoad}
                    onSelectionChange={handleOuSelectionChange}
                    hierarchyColumnMode={hierarchyColumnMode}
                    onHierarchyColumnModeChange={setHierarchyColumnMode}
                  />
                </>
              ),
            },
          ]}
        />

        <Divider />

        {/* Preview Data Modal (will be triggered from dataset menu, not here) */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>
                DHIS2 Data Preview
              </span>
              {previewData.length > 0 && (
                <Tag color="blue">{previewData.length} rows</Tag>
              )}
            </div>
          }
          show={previewVisible}
          onHide={() => setPreviewVisible(false)}
          width={1200}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                onClick={fetchPreviewData}
                loading={isRefreshing}
                disabled={isRefreshing}
              >
                Refresh Data
              </Button>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(generatedApiUrl);
                  message.success('API URL copied to clipboard!');
                }}
                disabled={!generatedApiUrl}
              >
                Copy API URL
              </Button>
              <Button type="primary" onClick={() => setPreviewVisible(false)}>
                Close
              </Button>
            </div>
          }
        >
          {isRefreshing ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 600,
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <Loading />
              <Text type="secondary">Loading preview data...</Text>
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', height: 600 }}
            >
              {/* API URL Section - Single Decoded URL */}
              <PreviewUrlSection>
                <div
                  style={{
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text strong style={{ fontSize: 14 }}>
                    🔗 Generated API URL
                  </Text>
                  <Tag color="green">Ready to use</Tag>
                </div>
                <PreviewTextArea
                  value={generatedApiUrl}
                  readOnly
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <Paragraph
                  type="secondary"
                  style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
                >
                  💡 Use this URL to query DHIS2 directly or paste it into other
                  tools. URL uses readable format with <code>:</code> and{' '}
                  <code>;</code> characters.
                </Paragraph>
              </PreviewUrlSection>

              {/* Data Table with better spacing */}
              <PreviewDataSection>
                {previewData.length > 0 ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 14 }}>
                        📊 Data Sample
                      </Text>
                      <Paragraph
                        type="secondary"
                        style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}
                      >
                        Showing first {previewData.length} rows from your query
                      </Paragraph>
                    </div>
                    <PreviewTable>
                      <Table
                        columns={previewColumns}
                        dataSource={previewData}
                        scroll={{ x: 'max-content', y: 350 }}
                        pagination={{
                          pageSize: 10,
                          showSizeChanger: false,
                          showTotal: (total, range) =>
                            `${range[0]}-${range[1]} of ${total} rows (preview limited to ${PREVIEW_ROW_LIMIT} rows)`,
                        }}
                        bordered
                      />
                    </PreviewTable>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                    }}
                  >
                    <Empty description="No data to display" />
                  </div>
                )}
              </PreviewDataSection>
            </div>
          )}
        </Modal>
      </Container>
    );
  },
);

DHIS2ParameterBuilder.displayName = 'DHIS2ParameterBuilder';

export default DHIS2ParameterBuilder;
