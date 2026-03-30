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
import { Select, Input, Checkbox } from '@superset-ui/core/components';

interface CascadeFilterConfigProps {
  filterId: string;
  filterType?: string;
  availableFilters: {
    label: string;
    value: string;
    type: string | undefined;
  }[];
  cascadeParentId?: string | null;
  cascadeLevel?: string | null;
  onCascadeParentChange: (parentId: string | null) => void;
  onCascadeLevelChange: (level: string | null) => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const CheckboxWrapper = styled.div`
  ${({ theme }) => `
    display: flex;
    align-items: center;
    padding: ${theme.sizeUnit}px 0;
  `}
`;

const FieldsWrapper = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit * 2}px;
    padding: ${theme.sizeUnit * 2}px 0;
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

const StatusBox = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 1.5}px;
    backgroundColor: ${theme.colorBgContainer};
    borderRadius: ${theme.borderRadius}px;
    border: 1px solid ${theme.colorBorder};
    font-size: 12px;
    color: ${theme.colorText};
  `}
`;

const CascadeFilterConfig = ({
  filterId,
  filterType,
  availableFilters = [],
  cascadeParentId,
  cascadeLevel,
  onCascadeParentChange,
  onCascadeLevelChange,
}: CascadeFilterConfigProps) => {
  const [isCascading, setIsCascading] = useState(!!cascadeParentId);

  const compatibleFilters = availableFilters.filter(
    filter => filter.value !== filterId && filter.type === filterType,
  );

  const handleCascadeToggle = (enabled: boolean) => {
    setIsCascading(enabled);
    if (!enabled) {
      onCascadeParentChange(null);
      onCascadeLevelChange(null);
    }
  };

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

  const hasNoFilters = compatibleFilters.length === 0;

  return (
    <Container>
      {hasNoFilters ? (
        <StatusBox>
          {t('Create other filters first to set up cascading relationships')}
        </StatusBox>
      ) : (
        <>
          <CheckboxWrapper>
            <Checkbox
              checked={isCascading}
              onChange={e => handleCascadeToggle(e.target.checked)}
            />
            <Label style={{ marginLeft: '8px', marginBottom: 0 }}>
              {t('Enable Cascade filter')}
            </Label>
          </CheckboxWrapper>

          {isCascading && (
            <FieldsWrapper>
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
                    onCascadeParentChange(selectedValue || null);
                  }}
                  placeholder={t('Select a parent filter')}
                />
              </FieldGroup>

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

              {cascadeParentId && cascadeLevel && (
                <StatusBox>
                  {t('This filter will cascade from')}{' '}
                  <strong>
                    {
                      parentOptions.find(f => f.value === cascadeParentId)
                        ?.label
                    }
                  </strong>{' '}
                  {t('at level')} <strong>{cascadeLevel}</strong>
                  {'. '}
                  {t(
                    'Only values associated with the parent selection will be displayed.',
                  )}
                </StatusBox>
              )}
            </FieldsWrapper>
          )}
        </>
      )}
    </Container>
  );
};

export default CascadeFilterConfig;
