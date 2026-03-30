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
import { useState } from 'react';
import { styled, t } from '@superset-ui/core';
import { Select, Input } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { INPUT_WIDTH } from './constants';

interface FilterDependenciesProps {
  filterId: string;
  filterType?: string;
  availableFilters: {
    label: string;
    value: string;
    type: string | undefined;
  }[];
  cascadeParentId?: string | null;
  cascadeLevel?: string | null;
  dependencies: string[];
  onCascadeParentChange: (parentId: string | null) => void;
  onCascadeLevelChange: (level: string | null) => void;
  onDependenciesChange: (dependencies: string[]) => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 1.5}px;
`;

const SectionTitle = styled.div`
  ${({ theme }) => `
    font-size: ${theme.fontSizeSM}px;
    font-weight: 600;
    color: ${theme.colorText};
    padding-bottom: ${theme.sizeUnit}px;
    border-bottom: 1px solid ${theme.colorBorder};
  `}
`;

const FieldGroup = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
  `}
`;

const Label = styled.label`
  ${({ theme }) => `
    font-size: ${theme.fontSizeSM}px;
    color: ${theme.colorText};
    font-weight: 500;
  `}
`;

const StatusBox = styled.div<{ variant?: 'info' | 'success' | 'warning' }>`
  ${({ theme, variant = 'info' }) => {
    const bgColor =
      variant === 'success'
        ? '#f6ffed'
        : variant === 'warning'
          ? '#fffbe6'
          : theme.colorBgContainer;
    return `
      padding: ${theme.sizeUnit * 1.5}px;
      backgroundColor: ${bgColor};
      borderRadius: ${theme.borderRadius}px;
      border: 1px solid ${theme.colorBorder};
      font-size: 12px;
      color: ${theme.colorText};
    `;
  }}
`;

const RowPanel = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-bottom: ${theme.sizeUnit}px;

    & > div {
      width: ${INPUT_WIDTH}px;
    }
  `}
`;

const DeleteIcon = styled(Icons.DeleteOutlined)`
  ${({ theme }) => `
    cursor: pointer;
    margin-left: ${theme.sizeUnit * 2}px;
    color: ${theme.colorIcon};
    &:hover {
      color: ${theme.colorText};
    }
  `}
`;

const AddFilter = styled.div`
  ${({ theme }) => `
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    color: ${theme.colorPrimary};
    &:hover {
      color: ${theme.colorPrimaryText};
    }
  `}
`;

const FilterDependencies = ({
  filterId,
  filterType,
  availableFilters = [],
  cascadeParentId,
  cascadeLevel,
  dependencies = [],
  onCascadeParentChange,
  onCascadeLevelChange,
  onDependenciesChange,
}: FilterDependenciesProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const compatibleFilters = availableFilters.filter(
    filter => filter.value !== filterId && filter.type === filterType,
  );

  const isCascadeMode =
    cascadeParentId && cascadeLevel && dependencies.length === 0;
  const hasNoFilters = compatibleFilters.length === 0;

  const currentParent = compatibleFilters.find(
    f => f.value === cascadeParentId,
  );

  let parentOptions = compatibleFilters;
  if (!currentParent && cascadeParentId) {
    parentOptions = [
      {
        label: t('(deleted or invalid type)'),
        value: cascadeParentId,
        type: filterType,
      },
      ...compatibleFilters,
    ];
  }

  const handleAddDependency = () => {
    const filter = compatibleFilters.find(
      availableFilter => !dependencies.includes(availableFilter.value),
    );
    if (filter) {
      onDependenciesChange([...dependencies, filter.value]);
    }
  };

  const handleDeleteDependency = (filterId: string) => {
    onDependenciesChange(dependencies.filter(dep => dep !== filterId));
  };

  const handleChangeDependency = (oldId: string, newId: string) => {
    const newDeps = dependencies.map(dep => (dep === oldId ? newId : dep));
    onDependenciesChange(newDeps);
  };

  const handleClearCascade = () => {
    onCascadeParentChange(null);
    onCascadeLevelChange(null);
  };

  return (
    <Container>
      {hasNoFilters ? (
        <StatusBox variant="info">
          {t('Create other filters first to set up cascading relationships')}
        </StatusBox>
      ) : (
        <>
          {isCascadeMode && (
            <StatusBox variant="success">
              <strong>{t('Cascading Relationship Active')}</strong>
              <br />
              {t('This filter cascades from')}{' '}
              <strong>{currentParent?.label}</strong> {t('at level')}{' '}
              <strong>{cascadeLevel}</strong>.{' '}
              {t(
                'Only values associated with the parent selection will be displayed.',
              )}
            </StatusBox>
          )}

          <Section>
            <SectionTitle>{t('Parent Filter (1-to-1 Mapping)')}</SectionTitle>
            <StatusBox variant="info">
              {t(
                "Select a parent filter to establish a hierarchical cascade relationship. This filter will show only values that exist in the parent filter's selection.",
              )}
            </StatusBox>

            <FieldGroup>
              <Label>{t('Parent Filter')}</Label>
              <Select
                ariaLabel={t('Select parent filter')}
                labelInValue
                options={parentOptions}
                value={
                  currentParent || {
                    label: t('Select a parent filter'),
                    value: '',
                  }
                }
                onChange={option => {
                  const selectedValue = (option as { value: string }).value;
                  if (!selectedValue) {
                    handleClearCascade();
                    onDependenciesChange([]);
                  } else {
                    onCascadeParentChange(selectedValue);
                    onDependenciesChange([]);
                  }
                }}
                placeholder={t('Select a parent filter')}
              />
            </FieldGroup>

            {cascadeParentId && (
              <FieldGroup>
                <Label>{t('Cascade Level Name')}</Label>
                <Input
                  placeholder={t('e.g., Region, District, Facility')}
                  value={cascadeLevel || ''}
                  onChange={({ target: { value } }) => {
                    onCascadeLevelChange(value || null);
                  }}
                />
              </FieldGroup>
            )}
          </Section>

          <Section>
            <div
              role="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                gap: '8px',
                padding: '8px 0',
              }}
            >
              <Icons.CaretDownOutlined
                style={{
                  transform: showAdvanced ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s',
                }}
              />
              <span style={{ fontWeight: 600, fontSize: '12px' }}>
                {t('Advanced: Multi-Filter Dependencies')}
              </span>
            </div>

            {showAdvanced && (
              <div
                style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <StatusBox variant="info" style={{ marginBottom: '12px' }}>
                  {t(
                    'Optionally set up additional filter dependencies. This filter will be constrained by multiple parent filters simultaneously.',
                  )}
                </StatusBox>

                <div>
                  {dependencies.length > 0 && (
                    <>
                      <Label style={{ marginBottom: '12px' }}>
                        {t('Values dependent on')}
                      </Label>
                      {dependencies.map(depId => {
                        let value = compatibleFilters.find(
                          e => e.value === depId,
                        );
                        let options = compatibleFilters;
                        if (!value) {
                          value = {
                            label: t('(deleted or invalid type)'),
                            value: depId,
                            type: filterType,
                          };
                          options = [value, ...options];
                        }
                        return (
                          <RowPanel key={depId}>
                            <Select
                              ariaLabel={t('Dependency filter')}
                              labelInValue
                              options={options.filter(
                                e =>
                                  e.value === depId ||
                                  !dependencies.includes(e.value),
                              )}
                              onChange={option =>
                                handleChangeDependency(
                                  depId,
                                  (option as { value: string }).value,
                                )
                              }
                              value={value}
                            />
                            <DeleteIcon
                              iconSize="xl"
                              onClick={() => handleDeleteDependency(depId)}
                            />
                          </RowPanel>
                        );
                      })}
                    </>
                  )}

                  {compatibleFilters.length > dependencies.length && (
                    <AddFilter
                      role="button"
                      onClick={handleAddDependency}
                      style={{
                        marginTop: dependencies.length > 0 ? '12px' : 0,
                      }}
                    >
                      <Icons.PlusOutlined iconSize="xs" />
                      {t('Add filter dependency')}
                    </AddFilter>
                  )}

                  {dependencies.length > 0 &&
                    cascadeParentId &&
                    cascadeLevel && (
                      <StatusBox
                        variant="warning"
                        style={{ marginTop: '12px' }}
                      >
                        {t(
                          'Note: Both cascade and dependencies are active. Only dependencies will be applied.',
                        )}
                      </StatusBox>
                    )}
                </div>
              </div>
            )}
          </Section>
        </>
      )}
    </Container>
  );
};

export default FilterDependencies;
