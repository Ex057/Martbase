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
import { resolveDatasetOption } from './AIChartGeneratorModal';

describe('resolveDatasetOption', () => {
  // AsyncSelect calls onChange(selectValue, option). `selectValue` is the antd
  // labeled value and carries no `id`; only `option` does.
  const labeledValue = { value: '7__table', label: 'ANC Dataset — ClickHouse' };
  const fullOption = {
    id: 7,
    value: '7__table',
    label: 'ANC Dataset — ClickHouse',
    customLabel: 'ANC Dataset',
  };

  it('takes the id from the option argument', () => {
    expect(resolveDatasetOption(labeledValue, fullOption)?.id).toBe(7);
  });

  it('recovers the id from the value when no option is supplied', () => {
    // This is the regression: reading only the first argument used to yield
    // `id: undefined`, which silently downgraded the choice to auto-detect.
    expect(resolveDatasetOption(labeledValue)?.id).toBe(7);
  });

  it('returns null when the selection is cleared', () => {
    expect(resolveDatasetOption(null)).toBeNull();
    expect(resolveDatasetOption(undefined)).toBeNull();
  });

  it('returns null for a value with no parseable id', () => {
    expect(resolveDatasetOption({ value: 'not-an-id', label: 'x' })).toBeNull();
  });

  it('never yields an option whose id is undefined', () => {
    const resolved = resolveDatasetOption(labeledValue, fullOption);
    expect(resolved).not.toBeNull();
    expect(typeof resolved?.id).toBe('number');
  });
});
