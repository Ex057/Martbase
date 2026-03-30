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

import { DataRecord } from '@superset-ui/core';

export interface CascadeLevel {
  column: string;
  label: string;
  parentColumn?: string;
  parentLevel?: CascadeLevel;
}

export interface CascadeHierarchy {
  levels: CascadeLevel[];
  data: DataRecord[];
}

export interface FilterCascadeState {
  [filterName: string]: string | number | (string | number)[] | null;
}

/**
 * Filters data based on parent filter values
 * @param data - Full dataset
 * @param parentColumn - Column name of parent filter
 * @param parentValue - Selected value from parent filter
 * @param currentColumn - Column name being filtered
 * @returns Unique values for current filter level
 */
export function getFilteredOptions(
  data: DataRecord[],
  parentColumn: string | undefined,
  parentValue: string | number | (string | number)[] | null | undefined,
  currentColumn: string,
): Array<string | number> {
  if (!parentColumn || parentValue === null || parentValue === undefined) {
    return Array.from(
      new Set(
        data
          .map(row => row[currentColumn])
          .filter(
            (val): val is string | number => val !== null && val !== undefined,
          ),
      ),
    );
  }

  const parentValues = Array.isArray(parentValue) ? parentValue : [parentValue];

  const filtered = data
    .filter(row => parentValues.includes(String(row[parentColumn])))
    .map(row => row[currentColumn])
    .filter((val): val is string | number => val !== null && val !== undefined);

  return Array.from(new Set(filtered));
}

/**
 * Gets all distinct values for a specific column from dataset
 * @param data - Dataset
 * @param column - Column name
 * @returns Array of unique values
 */
export function getDistinctValues(
  data: DataRecord[],
  column: string,
): Array<string | number> {
  return Array.from(
    new Set(
      data
        .map(row => row[column])
        .filter(
          (val): val is string | number => val !== null && val !== undefined,
        ),
    ),
  );
}

/**
 * Builds a cascade mapping for efficient filtering
 * Maps parent values to child values at each level
 * @param data - Full dataset
 * @param hierarchy - Cascade hierarchy definition
 * @returns Mapping structure for cascade filtering
 */
export function buildCascadeMapping(
  data: DataRecord[],
  hierarchy: CascadeHierarchy,
): Map<string, Map<string | number, Set<string | number>>> {
  const cascadeMap = new Map<
    string,
    Map<string | number, Set<string | number>>
  >();

  hierarchy.levels.forEach((level, index) => {
    if (index === 0) {
      const distinctValues = getDistinctValues(data, level.column);
      const valueMap = new Map<string | number, Set<string | number>>();
      distinctValues.forEach(val => {
        valueMap.set(val, new Set([val]));
      });
      cascadeMap.set(level.column, valueMap);
    } else {
      const parentLevel = hierarchy.levels[index - 1];
      const valueMap = new Map<string | number, Set<string | number>>();

      data.forEach(row => {
        const parentVal = row[parentLevel.column];
        const currentVal = row[level.column];

        if (
          parentVal !== null &&
          parentVal !== undefined &&
          currentVal !== null &&
          currentVal !== undefined
        ) {
          const parentKey = String(parentVal);
          const childKey = String(currentVal);
          if (!valueMap.has(parentKey)) {
            valueMap.set(parentKey, new Set());
          }
          valueMap.get(parentKey)!.add(childKey);
        }
      });

      cascadeMap.set(level.column, valueMap);
    }
  });

  return cascadeMap;
}

/**
 * Gets available values for a cascade level based on parent selections
 * @param cascadeMap - Cascade mapping built from data
 * @param column - Target column
 * @param parentColumn - Parent column name
 * @param parentValue - Selected parent value(s)
 * @returns Available values for current level
 */
export function getCascadeOptions(
  cascadeMap: Map<string, Map<string | number, Set<string | number>>>,
  column: string,
  parentColumn: string | undefined,
  parentValue: string | number | (string | number)[] | null | undefined,
): Array<string | number> {
  const columnMap = cascadeMap.get(column);
  if (!columnMap) return [];

  if (!parentColumn || parentValue === null || parentValue === undefined) {
    const allSets = Array.from(columnMap.values());
    const flattened = allSets.reduce(
      (acc: (string | number)[], set) => acc.concat(Array.from(set)),
      [],
    );
    return Array.from(new Set(flattened));
  }

  const parentValues = Array.isArray(parentValue) ? parentValue : [parentValue];
  const options = new Set<string | number>();

  parentValues.forEach(pVal => {
    const childValues = columnMap.get(String(pVal));
    if (childValues) {
      childValues.forEach(val => options.add(val));
    }
  });

  return Array.from(options);
}

/**
 * Generates SQL filter clause for cascading filters
 * @param filterState - Current filter selections
 * @param filterHierarchy - Mapping of filter names to column names
 * @returns SQL WHERE clause fragment
 */
export function generateCascadeFilterSQL(
  filterState: FilterCascadeState,
  filterHierarchy: { [filterName: string]: string },
): string {
  const conditions: string[] = [];

  Object.entries(filterState).forEach(([filterName, value]) => {
    if (value === null || value === undefined) return;

    const column = filterHierarchy[filterName];
    if (!column) return;

    if (Array.isArray(value)) {
      const values = value
        .map(v => `'${String(v).replace(/'/g, "''")}'`)
        .join(', ');
      conditions.push(`${column} IN (${values})`);
    } else {
      conditions.push(`${column} = '${String(value).replace(/'/g, "''")}'`);
    }
  });

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * Resets child filter values when parent filter changes
 * @param filterState - Current filter state
 * @param changedFilter - Name of filter that changed
 * @param hierarchy - Cascade hierarchy defining parent-child relationships
 * @returns Updated filter state with reset child values
 */
export function resetChildFilters(
  filterState: FilterCascadeState,
  changedFilter: string,
  hierarchy: CascadeHierarchy,
): FilterCascadeState {
  const changedLevelIndex = hierarchy.levels.findIndex(
    level => level.column === changedFilter,
  );

  if (changedLevelIndex === -1) return filterState;

  const resetState = { ...filterState };

  hierarchy.levels.forEach((level, index) => {
    if (index > changedLevelIndex) {
      resetState[level.column] = null;
    }
  });

  return resetState;
}

/**
 * Validates cascade state consistency
 * Ensures that selected values at each level are compatible with parent selections
 * @param filterState - Filter state to validate
 * @param cascadeMap - Cascade mapping
 * @param hierarchy - Hierarchy definition
 * @returns Array of validation errors, empty if valid
 */
export function validateCascadeState(
  filterState: FilterCascadeState,
  cascadeMap: Map<string, Map<string | number, Set<string | number>>>,
  hierarchy: CascadeHierarchy,
): string[] {
  const errors: string[] = [];

  hierarchy.levels.forEach((level, index) => {
    if (index === 0) return;

    const parentLevel = hierarchy.levels[index - 1];
    const parentValue = filterState[parentLevel.column];
    const currentValue = filterState[level.column];

    if (
      parentValue !== null &&
      parentValue !== undefined &&
      currentValue !== null &&
      currentValue !== undefined
    ) {
      const columnMap = cascadeMap.get(level.column);
      if (columnMap) {
        const parentValues = Array.isArray(parentValue)
          ? parentValue
          : [parentValue];
        const currentValues = Array.isArray(currentValue)
          ? currentValue
          : [currentValue];

        currentValues.forEach(cVal => {
          const isValid = parentValues.some(pVal => {
            const childValues = columnMap.get(String(pVal));
            return childValues?.has(String(cVal));
          });

          if (!isValid) {
            errors.push(
              `${level.label} value "${cVal}" is not available for selected ${parentLevel.label}`,
            );
          }
        });
      }
    }
  });

  return errors;
}

/**
 * Filters dataset based on parent filter selection for cascading
 * Used in filter plugins to restrict available options
 * @param data - Full dataset from backend
 * @param parentColumnName - Column name of parent filter
 * @param parentValue - Currently selected value(s) in parent filter
 * @returns Filtered dataset containing only rows matching parent selection
 */
export function filterDataByCascadeParent(
  data: DataRecord[],
  parentColumnName: string | undefined,
  parentValue: string | number | (string | number)[] | null | undefined,
): DataRecord[] {
  if (
    !parentColumnName ||
    parentValue === null ||
    parentValue === undefined ||
    data.length === 0
  ) {
    return data;
  }

  const parentValues = Array.isArray(parentValue) ? parentValue : [parentValue];
  return data.filter(row => {
    const rowVal = row[parentColumnName];
    return (
      rowVal !== null &&
      rowVal !== undefined &&
      parentValues.includes(String(rowVal))
    );
  });
}
