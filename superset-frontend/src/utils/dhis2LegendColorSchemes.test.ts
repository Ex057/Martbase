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
  collectDHIS2SourceDatabaseIds,
  DHIS2_SCHEME_PREFIX,
  isDeferredColorScheme,
} from './dhis2LegendColorSchemes';

describe('isDeferredColorScheme', () => {
  it('is true for DHIS2 legend scheme ids', () => {
    expect(isDeferredColorScheme(`${DHIS2_SCHEME_PREFIX}ABC123`)).toBe(true);
  });

  it('is true for the Pro theme preset id', () => {
    expect(isDeferredColorScheme('proThemePreset')).toBe(true);
  });

  it('is false for standard registered schemes', () => {
    expect(isDeferredColorScheme('supersetColors')).toBe(false);
    expect(isDeferredColorScheme('d3Category10')).toBe(false);
    expect(isDeferredColorScheme('googleCategory20c')).toBe(false);
  });

  it('is false for empty / nullish input', () => {
    expect(isDeferredColorScheme('')).toBe(false);
    expect(isDeferredColorScheme(null)).toBe(false);
    expect(isDeferredColorScheme(undefined)).toBe(false);
  });
});

describe('collectDHIS2SourceDatabaseIds', () => {
  it('extracts distinct db ids from staged-local DHIS2 datasources', () => {
    const datasources = {
      '16__table': {
        extra: JSON.stringify({
          dhis2_staged_local: true,
          dhis2_source_database_id: 5,
        }),
      },
      '17__table': {
        // object extra (not a string) also supported
        extra: { dhis2_staged_local: true, dhis2_source_database_id: 5 },
      },
      '18__table': {
        extra: { dhis2_staged_local: true, dhis2_source_database_id: 7 },
      },
    };
    expect(collectDHIS2SourceDatabaseIds(datasources).sort()).toEqual([5, 7]);
  });

  it('ignores non-staged, malformed, or non-DHIS2 datasources', () => {
    const datasources = {
      '1__table': { extra: { dhis2_source_database_id: 5 } }, // not staged_local
      '2__table': { extra: 'not json' },
      '3__table': {}, // no extra
      '4__table': {
        extra: { dhis2_staged_local: true, dhis2_source_database_id: 0 },
      }, // non-positive id
    };
    expect(collectDHIS2SourceDatabaseIds(datasources)).toEqual([]);
  });

  it('handles null/undefined input', () => {
    expect(collectDHIS2SourceDatabaseIds(null)).toEqual([]);
    expect(collectDHIS2SourceDatabaseIds(undefined)).toEqual([]);
  });
});
