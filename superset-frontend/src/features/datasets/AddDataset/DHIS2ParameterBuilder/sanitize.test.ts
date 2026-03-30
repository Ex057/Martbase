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

import {
  sanitizeDHIS2ColumnName,
  findOriginalColumnName,
  findMetricColumn,
} from './sanitize';

describe('DHIS2 Sanitization Functions', () => {
  describe('sanitizeDHIS2ColumnName', () => {
    test('should handle basic column names', () => {
      expect(sanitizeDHIS2ColumnName('simple')).toBe('simple');
      expect(sanitizeDHIS2ColumnName('SimpleColumn')).toBe('SimpleColumn');
    });

    test('should replace special characters with underscores', () => {
      expect(sanitizeDHIS2ColumnName('105-EP01b. Malaria Total')).toBe(
        '105_EP01b_Malaria_Total',
      );
      expect(sanitizeDHIS2ColumnName('Malaria-Total')).toBe('Malaria_Total');
      expect(sanitizeDHIS2ColumnName('Data/Element')).toBe('Data_Element');
    });

    test('should handle parentheses and special characters', () => {
      expect(
        sanitizeDHIS2ColumnName(
          '105-EP01c. Malaria Confirmed (B/s and RDT Positive)',
        ),
      ).toBe('105_EP01c_Malaria_Confirmed_B_s_and_RDT_Positive');
    });

    test('should collapse multiple underscores', () => {
      expect(sanitizeDHIS2ColumnName('Col__Name___With____Underscores')).toBe(
        'Col_Name_With_Underscores',
      );
    });

    test('should strip leading and trailing underscores', () => {
      expect(sanitizeDHIS2ColumnName('_leading')).toBe('leading');
      expect(sanitizeDHIS2ColumnName('trailing_')).toBe('trailing');
      expect(sanitizeDHIS2ColumnName('__both__')).toBe('both');
    });

    test('should handle whitespace', () => {
      expect(sanitizeDHIS2ColumnName('Column With Spaces')).toBe(
        'Column_With_Spaces',
      );
      expect(sanitizeDHIS2ColumnName('Tab\tCharacter')).toBe('Tab_Character');
      expect(sanitizeDHIS2ColumnName('Multiple   Spaces')).toBe(
        'Multiple_Spaces',
      );
    });

    test('should handle edge cases', () => {
      expect(sanitizeDHIS2ColumnName('')).toBe('');
      expect(sanitizeDHIS2ColumnName('   ')).toBe('');
      expect(sanitizeDHIS2ColumnName('___')).toBe('');
    });

    test('should handle null/undefined gracefully', () => {
      expect(sanitizeDHIS2ColumnName(null as any)).toBe('');
      expect(sanitizeDHIS2ColumnName(undefined as any)).toBe('');
    });

    test('should match backend sanitization behavior', () => {
      const testCases = [
        {
          input: '105-EP01a. Suspected fever',
          expected: '105_EP01a_Suspected_fever',
        },
        {
          input: 'Cases - Confirmed & Probable',
          expected: 'Cases_Confirmed_Probable',
        },
        {
          input: 'Confirmed/Suspected/Probable',
          expected: 'Confirmed_Suspected_Probable',
        },
        { input: 'Data (Element)', expected: 'Data_Element' },
        {
          input: 'Col@Name#With$Special%Chars',
          expected: 'Col_Name_With_Special_Chars',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(sanitizeDHIS2ColumnName(input)).toBe(expected);
      });
    });
  });

  describe('findOriginalColumnName', () => {
    const columns = [
      '105_EP01a_Suspected_fever',
      '105-EP01b. Malaria Total',
      'simple_column',
      'Country',
      'Region',
    ];

    test('should find exact matches', () => {
      expect(findOriginalColumnName('simple_column', columns)).toBe(
        'simple_column',
      );
      expect(findOriginalColumnName('Country', columns)).toBe('Country');
    });

    test('should find by sanitized name', () => {
      // Looking for sanitized "Malaria Total", should find "105-EP01b. Malaria Total"
      expect(findOriginalColumnName('105_EP01b_Malaria_Total', columns)).toBe(
        '105-EP01b. Malaria Total',
      );
      // Looking for sanitized version of "105-EP01a. Suspected fever"
      expect(findOriginalColumnName('105_EP01a_Suspected_fever', columns)).toBe(
        '105_EP01a_Suspected_fever',
      );
    });

    test('should return undefined for non-existent columns', () => {
      expect(findOriginalColumnName('NonExistent', columns)).toBeUndefined();
      expect(findOriginalColumnName('Does_Not_Exist', columns)).toBeUndefined();
    });

    test('should handle edge cases', () => {
      expect(findOriginalColumnName('', columns)).toBeUndefined();
      expect(findOriginalColumnName('Country', [])).toBeUndefined();
    });
  });

  describe('findMetricColumn', () => {
    const columns = [
      '105_EP01b_Malaria_Total',
      '105-EP01a. Suspected fever',
      'simple_value',
      'Region',
      'Country',
      'count_records',
    ];

    test('should find metric by exact name', () => {
      expect(findMetricColumn('simple_value', columns)).toBe('simple_value');
      expect(findMetricColumn('105_EP01b_Malaria_Total', columns)).toBe(
        '105_EP01b_Malaria_Total',
      );
    });

    test('should find metric by sanitized name', () => {
      expect(findMetricColumn('105-EP01b. Malaria Total', columns)).toBe(
        '105_EP01b_Malaria_Total',
      );
      expect(findMetricColumn('Malaria Total', columns)).toBe(
        '105_EP01b_Malaria_Total',
      );
    });

    test('should extract and match from SUM() wrapper', () => {
      expect(findMetricColumn('SUM(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('SUM(105-EP01b. Malaria Total)', columns)).toBe(
        '105_EP01b_Malaria_Total',
      );
    });

    test('should extract and match from various aggregation functions', () => {
      expect(findMetricColumn('AVG(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('COUNT(count_records)', columns)).toBe(
        'count_records',
      );
      expect(findMetricColumn('MIN(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('MAX(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('STDDEV(simple_value)', columns)).toBe(
        'simple_value',
      );
    });

    test('should be case-insensitive for aggregation functions', () => {
      expect(findMetricColumn('sum(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('avg(simple_value)', columns)).toBe(
        'simple_value',
      );
      expect(findMetricColumn('count(simple_value)', columns)).toBe(
        'simple_value',
      );
    });

    test('should do partial matching as fallback', () => {
      // "Malaria" appears in "105_EP01b_Malaria_Total" and doesn't match period/level
      expect(findMetricColumn('Malaria', columns)).toBe(
        '105_EP01b_Malaria_Total',
      );
    });

    test('should avoid matching on period/level columns', () => {
      const columnsWithPeriod = [
        ...columns,
        'Period',
        'Level',
        'year_period',
        'TimeColumn',
      ];
      // Period, Level, Time, Date should never be returned as metrics
      expect(findMetricColumn('Period', columnsWithPeriod)).toBeUndefined();
      expect(findMetricColumn('Level', columnsWithPeriod)).toBeUndefined();
      expect(findMetricColumn('Time', columnsWithPeriod)).toBeUndefined();
      // But partial matches that include period/level in the full name are still excluded
      expect(findMetricColumn('period', columnsWithPeriod)).toBeUndefined();
    });

    test('should return undefined for non-existent metrics', () => {
      expect(findMetricColumn('NonExistentMetric', columns)).toBeUndefined();
    });

    test('should handle complex DHIS2 patterns', () => {
      // Real-world DHIS2 patterns
      expect(findMetricColumn('SUM(105-EP01a. Suspected fever)', columns)).toBe(
        '105-EP01a. Suspected fever',
      );
    });

    test('should handle edge cases', () => {
      expect(findMetricColumn('', columns)).toBeUndefined();
      expect(findMetricColumn('simple_value', [])).toBeUndefined();
    });
  });
});
