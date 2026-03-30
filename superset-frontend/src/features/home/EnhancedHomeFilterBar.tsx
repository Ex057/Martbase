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

import { FC, useState, useCallback, useEffect } from 'react';
import { styled, t, Filter } from '@superset-ui/core';
import { Select, DatePicker, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

const FilterBarContainer = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 4}px ${theme.sizeUnit * 6}px;
    background: ${theme.colorBgContainer};
    border-bottom: 1px solid ${theme.colorBorderSecondary};
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    position: sticky;
    top: 60px;
    z-index: 10;
  `}
`;

const FilterControls = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: ${theme.sizeUnit * 4}px;
    flex-wrap: wrap;
  `}
`;

const FilterControl = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
    min-width: 200px;
    max-width: 300px;
  `}
`;

const FilterLabel = styled.label`
  ${({ theme }) => `
    font-size: ${theme.fontSizeSM}px;
    font-weight: ${theme.fontWeightNormal};
    color: ${theme.colorTextSecondary};
  `}
`;

const ActionButtons = styled(Space)`
  margin-left: auto;
`;

export interface FilterValue {
  filterId: string;
  value: any;
}

interface EnhancedHomeFilterBarProps {
  filters: Filter[];
  onFilterChange: (filterId: string, value: any) => void;
  onApply: () => void;
  onClear: () => void;
  isPublic?: boolean;
}

const EnhancedHomeFilterBar: FC<EnhancedHomeFilterBarProps> = ({
  filters,
  onFilterChange,
  onApply,
  onClear,
  isPublic = false,
}) => {
  const [localFilterValues, setLocalFilterValues] = useState<
    Record<string, any>
  >({});
  const [filterOptions, setFilterOptions] = useState<
    Record<string, Array<{ label: string; value: any }>>
  >({});
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>(
    {},
  );

  // Fetch filter options from datasource
  useEffect(() => {
    if (!filters || filters.length === 0) return;

    filters.forEach(async filter => {
      // Skip if already loading or loaded
      if (loadingOptions[filter.id] || filterOptions[filter.id]) return;

      // Only fetch for select filters
      if (filter.filterType !== 'filter_select') return;

      setLoadingOptions(prev => ({ ...prev, [filter.id]: true }));

      try {
        const target = filter.targets?.[0];
        if (!target?.datasetId || !target.column?.name) {
          setLoadingOptions(prev => ({ ...prev, [filter.id]: false }));
          return;
        }

        const column = target.column.name;
        const endpoint = isPublic
          ? `/api/v1/datasource/public/table/${target.datasetId}/column/${encodeURIComponent(column)}/values/?q=${encodeURIComponent(
              JSON.stringify({ filters: [], page: 0, page_size: 1000 }),
            )}`
          : `/api/v1/datasource/table/${target.datasetId}/column/${encodeURIComponent(column)}/values/?q=${encodeURIComponent(
              JSON.stringify({ filters: [], page: 0, page_size: 1000 }),
            )}`;

        const response = await fetch(endpoint, { credentials: 'same-origin' });

        // Handle unauthorized (public page) - set empty options to enable tags mode
        if (response.status === 401 || response.status === 403) {
          console.log(
            `Filter ${filter.id} requires authentication - enabling manual input mode`,
          );
          setFilterOptions(prev => ({ ...prev, [filter.id]: [] }));
          setLoadingOptions(prev => ({ ...prev, [filter.id]: false }));
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();

        // The API returns { result: ['value1', 'value2', ...] }
        const data = json.result || [];
        const options = data
          .filter((item: any) => item !== null && item !== undefined)
          .map((item: any) => ({
            label: String(item),
            value: item,
          }));

        setFilterOptions(prev => ({ ...prev, [filter.id]: options }));
      } catch (error) {
        console.error(`Error loading options for filter ${filter.id}:`, error);
        // Set empty options on error to enable tags mode
        setFilterOptions(prev => ({ ...prev, [filter.id]: [] }));
      } finally {
        setLoadingOptions(prev => ({ ...prev, [filter.id]: false }));
      }
    });
  }, [filters, loadingOptions, filterOptions]);

  // Debug: log filter structure
  useEffect(() => {
    console.log('EnhancedHomeFilterBar - Received filters:', filters);
    if (filters && filters.length > 0) {
      console.log('First filter structure:', filters[0]);
    }
  }, [filters]);

  const handleFilterChange = useCallback(
    (filterId: string, value: any) => {
      console.log('Filter changed:', filterId, value);
      setLocalFilterValues(prev => ({ ...prev, [filterId]: value }));
      onFilterChange(filterId, value);
    },
    [onFilterChange],
  );

  const handleClear = useCallback(() => {
    console.log('Clearing all filters');
    setLocalFilterValues({});
    onClear();
  }, [onClear]);

  const renderFilterControl = (filter: Filter) => {
    const filterValue = localFilterValues[filter.id];

    // Determine filter type based on filter configuration
    const filterType = filter.filterType || 'select';

    switch (filterType) {
      case 'time_range':
      case 'date':
        return (
          <FilterControl key={filter.id}>
            <FilterLabel>{filter.name}</FilterLabel>
            <RangePicker
              style={{ width: '100%' }}
              value={filterValue}
              onChange={value => handleFilterChange(filter.id, value)}
              placeholder={[t('Start date'), t('End date')]}
            />
          </FilterControl>
        );

      case 'filter_select':
      case 'select':
      default:
        const options = filterOptions[filter.id] || [];
        const isLoading = loadingOptions[filter.id] || false;
        const isMultiple = filter.controlValues?.multiSelect !== false;

        // Determine select mode based on options availability
        let selectMode: 'multiple' | 'tags' | undefined;
        if (options.length === 0 && !isLoading) {
          selectMode = 'tags'; // Allow typing custom values if no options
        } else if (isMultiple) {
          selectMode = 'multiple';
        }

        return (
          <FilterControl key={filter.id}>
            <FilterLabel>{filter.name}</FilterLabel>
            <Select
              style={{ width: '100%' }}
              mode={selectMode}
              value={filterValue}
              onChange={value => handleFilterChange(filter.id, value)}
              placeholder={
                isLoading
                  ? t('Loading...')
                  : options.length > 0
                    ? t('Select %s', filter.name)
                    : t('Type and press Enter to add %s', filter.name)
              }
              allowClear
              showSearch
              loading={isLoading}
              options={options}
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            />
          </FilterControl>
        );
    }
  };

  if (!filters || filters.length === 0) {
    return null;
  }

  return (
    <FilterBarContainer>
      <FilterControls>
        {filters.map(filter => renderFilterControl(filter))}
        <ActionButtons>
          <Button icon={<ReloadOutlined />} onClick={handleClear}>
            {t('Clear All')}
          </Button>
          <Button type="primary" onClick={onApply}>
            {t('Apply')}
          </Button>
        </ActionButtons>
      </FilterControls>
    </FilterBarContainer>
  );
};

export default EnhancedHomeFilterBar;
