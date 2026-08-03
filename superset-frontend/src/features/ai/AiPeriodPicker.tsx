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

/**
 * Period picker for the AI SQL assistant.
 *
 * Offers DHIS2 **relative** periods ("Last 12 months", "This year", …) and
 * **fixed** periods (the actual period codes present in the dataset), reusing the
 * fork's period stack. Relative selections are expanded to concrete codes on the
 * client (via `expandRelativePeriod`) so the backend only ever receives real
 * period values to filter on.
 */
import { useEffect, useMemo, useState } from 'react';
import { SupersetClient, t, periodSelectLabel } from '@superset-ui/core';
import { Select } from '@superset-ui/core/components';
import {
  RELATIVE_PERIOD_PREFIX,
  getVisibleRelativeGroups,
  expandRelativePeriod,
} from 'src/explore/components/controls/DHIS2ColumnFilterControl/relativePeriods';

// Distinct period codes are stable per serving table — cache across opens.
const distinctCache: Record<string, string[]> = {};

interface AiPeriodPickerProps {
  schema?: string | null;
  table: string;
  periodColumn: string;
  /** Reports the resolved, concrete period codes (relatives already expanded). */
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function qualified(schema: string | null | undefined, table: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table);
}

export default function AiPeriodPicker({
  schema,
  table,
  periodColumn,
  onChange,
  disabled,
}: AiPeriodPickerProps) {
  const [distinctCodes, setDistinctCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const cacheKey = `${schema || ''}.${table}.${periodColumn}`;

  useEffect(() => {
    let cancelled = false;
    if (distinctCache[cacheKey]) {
      setDistinctCodes(distinctCache[cacheKey]);
      return undefined;
    }
    setLoading(true);
    SupersetClient.post({
      endpoint: '/api/v1/local-staging/run-query',
      jsonPayload: {
        sql:
          `SELECT DISTINCT ${quoteIdent(periodColumn)} ` +
          `FROM ${qualified(schema, table)} ` +
          `WHERE ${quoteIdent(periodColumn)} IS NOT NULL ` +
          `ORDER BY 1`,
        limit: 2000,
      },
    })
      .then(({ json }) => {
        if (cancelled) return;
        const rows = (json.result?.rows || []) as Record<string, unknown>[];
        const codes = rows
          .map(row => String(row[periodColumn] ?? '').trim())
          .filter(Boolean);
        distinctCache[cacheKey] = codes;
        setDistinctCodes(codes);
      })
      .catch(() => {
        /* period picker is optional — leave it empty on failure */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, schema, table, periodColumn]);

  const options = useMemo(() => {
    const relativeGroups = getVisibleRelativeGroups(distinctCodes).map(group => ({
      label: group.label,
      options: group.tokens.map(tk => ({
        label: tk.label,
        value: `${RELATIVE_PERIOD_PREFIX}${tk.token}`,
      })),
    }));
    const fixedGroup = {
      label: t('Fixed periods'),
      options: distinctCodes.map(code => ({
        label: periodSelectLabel(code),
        value: code,
      })),
    };
    return [...relativeGroups, fixedGroup];
  }, [distinctCodes]);

  const handleChange = (values: string[]) => {
    setSelected(values);
    const concrete = new Set<string>();
    values.forEach(value => {
      if (value.startsWith(RELATIVE_PERIOD_PREFIX)) {
        const token = value.slice(RELATIVE_PERIOD_PREFIX.length);
        expandRelativePeriod(token, distinctCodes).forEach(code =>
          concrete.add(code),
        );
      } else {
        concrete.add(value);
      }
    });
    onChange(Array.from(concrete));
  };

  return (
    <Select
      mode="multiple"
      allowClear
      ariaLabel={t('Period')}
      placeholder={loading ? t('Loading periods…') : t('Period (optional)')}
      value={selected}
      options={options}
      onChange={handleChange as any}
      disabled={disabled}
      css={{ minWidth: 180, flex: '1 1 220px' }}
    />
  );
}
