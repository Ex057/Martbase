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
import {
  Tabs,
  Input,
  InputNumber,
  Select,
  Switch,
  Slider,
  ColorPicker,
  Space,
  Collapse,
  Tooltip,
  Button,
  Radio,
  Empty,
} from 'antd';
import {
  SettingOutlined,
  FormatPainterOutlined,
  CodeOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  DesktopOutlined,
  TabletOutlined,
  MobileOutlined,
} from '@ant-design/icons';

const { TabPane } = Tabs;
const { Panel } = Collapse;
const { Option } = Select;

interface BlockProperty {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'switch' | 'color' | 'slider' | 'radio';
  value: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  tooltip?: string;
  group?: string;
}

interface TabbedPropertiesPanelProps {
  block: any;
  contentProperties?: BlockProperty[];
  styleProperties?: BlockProperty[];
  advancedProperties?: BlockProperty[];
  onPropertyChange: (key: string, value: any) => void;
  isReadOnly?: boolean;
}

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const TabsContainer = styled(Tabs)`
  flex: 1;
  .ant-tabs-content {
    height: 100%;
  }
  .ant-tabs-tabpane {
    padding: 16px;
    overflow-y: auto;
  }
`;

const PropertyGroup = styled.div`
  margin-bottom: 24px;
`;

const PropertyRow = styled.div`
  margin-bottom: 16px;
`;

const PropertyLabel = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colorTextSecondary || '#666'};
`;

const ResponsiveControls = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px;
  background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
`;

const DeviceButton = styled(Button)<{ active?: boolean }>`
  ${({ active, theme }) =>
    active &&
    `
    background: ${theme.colorPrimaryBgHover || '#e6f7ff'};
    border-color: ${theme.colorPrimary || '#1890ff'};
  `}
`;

const StylePresets = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
`;

const PresetCard = styled.div<{ selected?: boolean }>`
  padding: 12px;
  border: 2px solid
    ${({ theme, selected }) =>
      selected ? theme.colorPrimary || '#1890ff' : theme.colorBorder || '#e0e0e0'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colorPrimaryHover || '#69c0ff'};
    background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  }

  .preset-name {
    font-size: 11px;
    margin-top: 4px;
  }

  .preset-preview {
    height: 40px;
    background: ${({ theme }) => theme.colorBgTextHover || '#d9d9d9'};
    border-radius: 4px;
    margin-bottom: 4px;
  }
`;

const VisibilityToggle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
  margin-bottom: 16px;
`;

// Style presets for quick application
const STYLE_PRESETS = [
  { id: 'default', name: t('Default'), styles: {} },
  {
    id: 'card',
    name: t('Card'),
    styles: {
      background: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },
  },
  {
    id: 'highlight',
    name: t('Highlight'),
    styles: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#ffffff',
      padding: '24px',
      borderRadius: '12px',
    },
  },
  {
    id: 'minimal',
    name: t('Minimal'),
    styles: {
      borderTop: '1px solid #e0e0e0',
      borderBottom: '1px solid #e0e0e0',
      padding: '16px 0',
    },
  },
  {
    id: 'bold',
    name: t('Bold'),
    styles: {
      background: '#1a1a1a',
      color: '#ffffff',
      padding: '32px',
      borderLeft: '4px solid #ff6b6b',
    },
  },
];

function renderPropertyInput(
  property: BlockProperty,
  onChange: (value: any) => void,
  isReadOnly?: boolean,
) {
  switch (property.type) {
    case 'text':
      return (
        <Input
          value={property.value}
          onChange={e => onChange(e.target.value)}
          placeholder={property.placeholder}
          disabled={isReadOnly}
        />
      );

    case 'number':
      return (
        <InputNumber
          value={property.value}
          onChange={onChange}
          min={property.min}
          max={property.max}
          step={property.step}
          style={{ width: '100%' }}
          disabled={isReadOnly}
        />
      );

    case 'select':
      return (
        <Select
          value={property.value}
          onChange={onChange}
          style={{ width: '100%' }}
          disabled={isReadOnly}
        >
          {property.options?.map(option => (
            <Option key={option.value} value={option.value}>
              {option.label}
            </Option>
          ))}
        </Select>
      );

    case 'switch':
      return (
        <Switch
          checked={property.value}
          onChange={onChange}
          disabled={isReadOnly}
        />
      );

    case 'color':
      return (
        <ColorPicker
          value={property.value}
          onChange={(color, hex) => onChange(hex)}
          disabled={isReadOnly}
        />
      );

    case 'slider':
      return (
        <Slider
          value={property.value}
          onChange={onChange}
          min={property.min || 0}
          max={property.max || 100}
          step={property.step || 1}
          disabled={isReadOnly}
        />
      );

    case 'radio':
      return (
        <Radio.Group
          value={property.value}
          onChange={e => onChange(e.target.value)}
          disabled={isReadOnly}
        >
          <Space direction="vertical">
            {property.options?.map(option => (
              <Radio key={option.value} value={option.value}>
                {option.label}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      );

    default:
      return null;
  }
}

function groupProperties(properties: BlockProperty[]): Record<string, BlockProperty[]> {
  const grouped: Record<string, BlockProperty[]> = {};
  properties.forEach(prop => {
    const group = prop.group || 'General';
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(prop);
  });
  return grouped;
}

export default function TabbedPropertiesPanel({
  block,
  contentProperties = [],
  styleProperties = [],
  advancedProperties = [],
  onPropertyChange,
  isReadOnly = false,
}: TabbedPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState('content');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [selectedPreset, setSelectedPreset] = useState<string>('default');
  const [isVisible, setIsVisible] = useState(true);

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (preset && preset.styles) {
      Object.entries(preset.styles).forEach(([key, value]) => {
        onPropertyChange(`style.${key}`, value);
      });
    }
  };

  const renderProperties = (properties: BlockProperty[]) => {
    const grouped = groupProperties(properties);

    return Object.entries(grouped).map(([groupName, props]) => (
      <PropertyGroup key={groupName}>
        {Object.keys(grouped).length > 1 && (
          <h4 style={{ marginBottom: 12, color: '#666' }}>{groupName}</h4>
        )}
        {props.map(property => (
          <PropertyRow key={property.key}>
            <PropertyLabel>
              {property.label}
              {property.tooltip && (
                <Tooltip title={property.tooltip}>
                  <span style={{ marginLeft: 4, color: '#999' }}>ⓘ</span>
                </Tooltip>
              )}
            </PropertyLabel>
            {renderPropertyInput(
              property,
              value => onPropertyChange(property.key, value),
              isReadOnly,
            )}
          </PropertyRow>
        ))}
      </PropertyGroup>
    ));
  };

  return (
    <Container>
      <VisibilityToggle>
        <span>{t('Block Visibility')}</span>
        <Switch
          checked={isVisible}
          onChange={setIsVisible}
          checkedChildren={<EyeOutlined />}
          unCheckedChildren={<EyeInvisibleOutlined />}
        />
      </VisibilityToggle>

      <TabsContainer activeKey={activeTab} onChange={setActiveTab}>
        <TabPane
          tab={
            <span>
              <SettingOutlined />
              {t('Content')}
            </span>
          }
          key="content"
        >
          {contentProperties.length > 0 ? (
            renderProperties(contentProperties)
          ) : (
            <Empty description={t('No content properties available')} />
          )}
        </TabPane>

        <TabPane
          tab={
            <span>
              <FormatPainterOutlined />
              {t('Style')}
            </span>
          }
          key="style"
        >
          <ResponsiveControls>
            <DeviceButton
              icon={<DesktopOutlined />}
              active={device === 'desktop'}
              onClick={() => setDevice('desktop')}
            >
              {t('Desktop')}
            </DeviceButton>
            <DeviceButton
              icon={<TabletOutlined />}
              active={device === 'tablet'}
              onClick={() => setDevice('tablet')}
            >
              {t('Tablet')}
            </DeviceButton>
            <DeviceButton
              icon={<MobileOutlined />}
              active={device === 'mobile'}
              onClick={() => setDevice('mobile')}
            >
              {t('Mobile')}
            </DeviceButton>
          </ResponsiveControls>

          <h4 style={{ marginBottom: 12 }}>{t('Style Presets')}</h4>
          <StylePresets>
            {STYLE_PRESETS.map(preset => (
              <PresetCard
                key={preset.id}
                selected={selectedPreset === preset.id}
                onClick={() => handlePresetSelect(preset.id)}
              >
                <div className="preset-preview" />
                <div className="preset-name">{preset.name}</div>
              </PresetCard>
            ))}
          </StylePresets>

          {styleProperties.length > 0 ? (
            <Collapse defaultActiveKey={['spacing', 'typography', 'colors']}>
              <Panel header={t('Spacing')} key="spacing">
                {renderProperties(
                  styleProperties.filter(p => p.group === 'spacing'),
                )}
              </Panel>
              <Panel header={t('Typography')} key="typography">
                {renderProperties(
                  styleProperties.filter(p => p.group === 'typography'),
                )}
              </Panel>
              <Panel header={t('Colors')} key="colors">
                {renderProperties(
                  styleProperties.filter(p => p.group === 'colors'),
                )}
              </Panel>
              <Panel header={t('Effects')} key="effects">
                {renderProperties(
                  styleProperties.filter(p => p.group === 'effects'),
                )}
              </Panel>
            </Collapse>
          ) : (
            <Empty description={t('No style properties available')} />
          )}
        </TabPane>

        <TabPane
          tab={
            <span>
              <CodeOutlined />
              {t('Advanced')}
            </span>
          }
          key="advanced"
        >
          {advancedProperties.length > 0 ? (
            renderProperties(advancedProperties)
          ) : (
            <Empty description={t('No advanced properties available')} />
          )}
        </TabPane>
      </TabsContainer>
    </Container>
  );
}