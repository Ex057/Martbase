/*
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

import { sanitizeDHIS2ColumnName } from '../../features/datasets/AddDataset/DHIS2ParameterBuilder/sanitize';

/**
 * Backward compatibility layer for DHIS2 column name references.
 * Handles both old (pre-sanitization) and new (sanitized) column names.
 *
 * When existing charts have column references that haven't been migrated yet,
 * this layer helps find the correct actual column in the returned data.
 */

/**
 * Find a column in data that matches a reference, handling both old and new naming.
 *
 * Strategy:
 * 1. Try exact match (might be already sanitized)
 * 2. Try sanitized version (old name reference)
 * 3. Try reverse lookup (old name might be in new sanitized form)
 *
 * @param columnRef - The column reference from chart config (might be old or new format)
 * @param availableColumns - List of actual columns from data
 * @returns The matching column name, or the original reference if no match found
 */
export function resolveColumnName(
  columnRef: string | undefined,
  availableColumns: string[],
): string | undefined {
  if (!columnRef || availableColumns.length === 0) {
    return columnRef;
  }

  // Strategy 1: Exact match (reference is already correct)
  if (availableColumns.includes(columnRef)) {
    return columnRef;
  }

  // Strategy 2: Sanitized match (reference is old, data has new sanitized name)
  const sanitizedRef = sanitizeDHIS2ColumnName(columnRef);
  if (availableColumns.includes(sanitizedRef)) {
    return sanitizedRef;
  }

  // Strategy 3: Reverse lookup (data might have old name, reference is new)
  // Find a column that when sanitized matches our sanitized reference
  for (const col of availableColumns) {
    if (sanitizeDHIS2ColumnName(col) === sanitizedRef) {
      return col;
    }
  }

  // No match found - return original reference and let downstream handle it
  return columnRef;
}

/**
 * Resolve an array of column names with backward compatibility.
 *
 * @param columnRefs - Array of column references
 * @param availableColumns - List of actual columns from data
 * @returns Array of resolved column names
 */
export function resolveColumnNames(
  columnRefs: string[] | undefined,
  availableColumns: string[],
): string[] {
  if (!columnRefs || columnRefs.length === 0) {
    return [];
  }

  return columnRefs
    .map((ref) => resolveColumnName(ref, availableColumns))
    .filter((col): col is string => Boolean(col));
}

/**
 * Get a mapping of old column names to new sanitized names.
 * Useful for debugging and understanding what changed.
 *
 * @param availableColumns - List of columns from data
 * @returns Map of old → new column name mappings
 */
export function getColumnNameMapping(
  availableColumns: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const col of availableColumns) {
    const sanitized = sanitizeDHIS2ColumnName(col);
    if (sanitized !== col) {
      mapping[col] = sanitized;
    }
  }

  return mapping;
}

/**
 * Log column name resolution for debugging compatibility issues.
 *
 * @param chartName - Name/ID of the chart for logging
 * @param columnRef - The reference being resolved
 * @param resolved - The resolved column name
 * @param availableColumns - Available columns in data
 */
export function logColumnResolution(
  chartName: string,
  columnRef: string,
  resolved: string,
  availableColumns: string[],
): void {
  if (columnRef !== resolved) {
    // eslint-disable-next-line no-console
    console.log(
      `[DHIS2 Compatibility] ${chartName}: "${columnRef}" → "${resolved}"`,
    );
  }

  // Log if we couldn't find the column
  if (!availableColumns.includes(resolved)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[DHIS2 Compatibility] ${chartName}: Could not find column "${resolved}" in available columns:`,
      availableColumns,
    );
  }
}
