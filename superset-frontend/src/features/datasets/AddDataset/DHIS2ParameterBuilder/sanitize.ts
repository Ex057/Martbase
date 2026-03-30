/**
 * Sanitize DHIS2 column names for Superset compatibility.
 * MUST match the backend implementation in superset/db_engine_specs/dhis2_dialect.py
 *
 * Replaces all non-word characters (including whitespace) with underscores,
 * collapses multiple underscores, and strips leading/trailing underscores.
 *
 * Matches Python regex: re.sub(r'[^\w]', '_', name)
 * Where \w includes: [a-zA-Z0-9_] plus Unicode word characters
 *
 * @param name - Original column name
 * @returns Sanitized column name safe for Superset/database column references
 */
export function sanitizeDHIS2ColumnName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let sanitized = name.trim();

  // Step 1: Replace any character that is NOT alphanumeric or underscore with underscore
  // This includes: special characters, whitespace, punctuation, non-ASCII letters
  // Using a negated character class to match anything that's not word-like
  sanitized = sanitized.replace(/[\W]/gu, '_');

  // Step 2: Collapse multiple consecutive underscores to single underscore
  sanitized = sanitized.replace(/_+/g, '_');

  // Step 3: Strip leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  return sanitized;
}

/**
 * Find the original column name from a list of columns by matching against a sanitized name.
 * Useful for matching metric/column references that have been sanitized.
 *
 * @param sanitizedName - The sanitized column name to search for
 * @param availableColumns - List of original column names from data
 * @returns The matching original column name, or undefined if not found
 */
export function findOriginalColumnName(
  sanitizedName: string,
  availableColumns: string[],
): string | undefined {
  if (!sanitizedName || availableColumns.length === 0) {
    return undefined;
  }

  // Strategy 1: Exact match (column already sanitized or matches directly)
  if (availableColumns.includes(sanitizedName)) {
    return sanitizedName;
  }

  // Strategy 2: Sanitized match (find original column that sanitizes to our target)
  for (const col of availableColumns) {
    if (sanitizeDHIS2ColumnName(col) === sanitizedName) {
      return col;
    }
  }

  return undefined;
}

/**
 * Match a metric expression (with optional aggregation function) to actual columns.
 * Handles cases like "SUM(Malaria-Total)" or plain column names.
 *
 * @param metricExpression - Expression like "SUM(105-EP01b. Malaria Total)" or "Malaria-Total"
 * @param availableColumns - List of actual column names from data
 * @returns The matched column name, or undefined if not found
 */
export function findMetricColumn(
  metricExpression: string,
  availableColumns: string[],
): string | undefined {
  if (!metricExpression || availableColumns.length === 0) {
    return undefined;
  }

  const sanitizedMetric = sanitizeDHIS2ColumnName(metricExpression);
  const metricLower = sanitizedMetric.toLowerCase();

  // Don't return period/level columns as metrics
  if (
    metricLower === 'period' ||
    metricLower === 'level' ||
    metricLower === 'time' ||
    metricLower === 'date'
  ) {
    return undefined;
  }

  // Try to match the full expression first (might be already sanitized)
  const directMatch = findOriginalColumnName(sanitizedMetric, availableColumns);
  if (directMatch) {
    const directLower = directMatch.toLowerCase();
    // Don't return dimension columns as metrics
    if (
      directLower !== 'period' &&
      directLower !== 'level' &&
      directLower !== 'time' &&
      directLower !== 'date'
    ) {
      return directMatch;
    }
  }

  // Try extracting inner column from aggregation functions
  // Pattern: SUM(...), AVG(...), COUNT(...), etc.
  const aggFunctionMatch = metricExpression.match(
    /^(SUM|AVG|COUNT|MIN|MAX|STDDEV|VARIANCE|MEDIAN)\s*\(\s*([^)]+)\s*\)$/i,
  );

  if (aggFunctionMatch) {
    const innerColumn = aggFunctionMatch[2].trim();
    const sanitizedInner = sanitizeDHIS2ColumnName(innerColumn);

    // Try to match the extracted column
    const extractedMatch = findOriginalColumnName(
      sanitizedInner,
      availableColumns,
    );
    if (extractedMatch) {
      return extractedMatch;
    }
  }

  // Try partial matching as last resort
  for (const col of availableColumns) {
    const colSanitized = sanitizeDHIS2ColumnName(col).toLowerCase();
    if (
      colSanitized.includes(metricLower) &&
      !colSanitized.includes('period') &&
      !colSanitized.includes('level') &&
      !colSanitized.includes('time') &&
      !colSanitized.includes('date')
    ) {
      return col;
    }
  }

  return undefined;
}
