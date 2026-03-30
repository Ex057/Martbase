import { useEffect, useState } from 'react';
import { styled } from '@superset-ui/core';
import { Input, Card } from 'antd';
import { Typography } from '@superset-ui/core/components';
import { DHIS2WizardState } from '../index';

const { Title, Paragraph, Text } = Typography;

const StepContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
`;

const FormSection = styled.div`
  ${({ theme }) => `
    background: ${theme.colorBgElevated};
    padding: 16px;
    border-radius: ${theme.borderRadius}px;
    margin-bottom: 16px;
    border: 1px solid ${theme.colorBorder};
  `}
`;

const extractDHIS2ServerUrl = (
  sqlalchemyUri: string | null | undefined,
): string => {
  if (!sqlalchemyUri) return 'N/A';

  try {
    const uri = sqlalchemyUri.trim();
    if (!uri.startsWith('dhis2://')) {
      return 'N/A';
    }

    const urlPart = uri.substring(8);
    const parts = urlPart.split('@');
    const hostAndPath = parts.length > 1 ? parts[1] : parts[0];

    if (!hostAndPath) {
      return 'N/A';
    }

    const colonIndex = hostAndPath.indexOf('/');
    const hostname =
      colonIndex !== -1 ? hostAndPath.substring(0, colonIndex) : hostAndPath;

    if (!hostname) {
      return 'N/A';
    }

    try {
      const url = new URL(`https://${hostname}`);
      return url.hostname || hostname;
    } catch {
      return hostname;
    }
  } catch {
    return 'N/A';
  }
};

const InputField = styled.div`
  ${({ theme }) => `
    margin-bottom: 16px;

    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      color: #000;
    }

    input {
      width: 100%;
    }

    &:last-child {
      margin-bottom: 0;
    }
  `}
`;

const ErrorText = styled(Text)`
  ${({ theme }) => `
    color: #ff4d4f;
    font-size: 12px;
    margin-top: 4px;
    display: block;
  `}
`;

const HelpText = styled(Text)`
  ${({ theme }) => `
    color: #999;
    font-size: 12px;
    margin-top: 4px;
    display: block;
  `}
`;

interface StepInfoProps {
  wizardState: DHIS2WizardState;
  updateState: (updates: Partial<DHIS2WizardState>) => void;
  errors: Record<string, string>;
  dataset: any;
}

const generateDatasetName = (state: DHIS2WizardState): string => {
  const parts: string[] = [];

  if (state.dataElements.length > 0) {
    const count = state.dataElements.length;
    if (count === 1) {
      parts.push(state.dataElements[0]);
    } else {
      parts.push(`${count} Data Elements`);
    }
  }

  if (state.periods.length > 0) {
    parts.push(`${state.periods.length} Periods`);
  }

  if (state.orgUnits.length > 0) {
    parts.push(`${state.orgUnits.length} Units`);
  }

  const baseLabel = parts.length > 0 ? parts.join(' - ') : 'DHIS2 Dataset';

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');

  return `${baseLabel} ${timestamp}-${randomNum}`;
};

export default function WizardStepInfo({
  wizardState,
  updateState,
  errors,
  dataset,
}: StepInfoProps) {
  const [hasUserEditedName, setHasUserEditedName] = useState(false);

  useEffect(() => {
    if (!hasUserEditedName && wizardState.dataElements.length > 0) {
      const generatedName = generateDatasetName(wizardState);
      updateState({ datasetName: generatedName });
    }
  }, [
    wizardState.dataElements.length,
    wizardState.periods.length,
    wizardState.orgUnits.length,
    hasUserEditedName,
    updateState,
  ]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasUserEditedName(true);
    updateState({ datasetName: e.target.value });
  };

  return (
    <StepContainer>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, marginBottom: 8 }}>
          Dataset Information
        </Title>
        <Paragraph style={{ margin: 0, color: '#666' }}>
          Enter basic information for your DHIS2 dataset.
        </Paragraph>
      </div>

      <FormSection>
        <InputField>
          <label>Dataset Name *</label>
          <Input
            placeholder="e.g., Malaria Cases 2024"
            value={wizardState.datasetName}
            onChange={handleNameChange}
            status={errors.datasetName ? 'error' : ''}
            size="large"
          />
          {errors.datasetName && <ErrorText>{errors.datasetName}</ErrorText>}
          <HelpText>
            {hasUserEditedName
              ? 'You can edit the name or select different data elements/periods/units to update it.'
              : 'Dataset name is auto-generated based on your selections. Edit to customize.'}
          </HelpText>
        </InputField>

        <InputField>
          <label>Description (Optional)</label>
          <Input.TextArea
            placeholder="Describe the dataset, intended use, etc."
            value={wizardState.description}
            onChange={e => updateState({ description: e.target.value })}
            rows={3}
            maxLength={500}
            showCount
          />
          <HelpText>
            Help other users understand what data this dataset contains.
          </HelpText>
        </InputField>
      </FormSection>

      <Card
        type="inner"
        title="Database Connection"
        style={{ marginBottom: 16 }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>Database:</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 13 }}>
            {dataset?.db?.database_name || 'Not selected'}
          </Text>
        </div>
        <div>
          <Text strong>Server URL:</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 13 }}>
            {extractDHIS2ServerUrl(dataset?.db?.sqlalchemy_uri)}
          </Text>
        </div>
      </Card>
    </StepContainer>
  );
}
