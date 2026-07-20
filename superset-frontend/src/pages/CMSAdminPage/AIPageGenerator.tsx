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

import { useState, useCallback } from 'react';
import { styled, SupersetClient, t } from '@superset-ui/core';
import {
  Alert,
  Button,
  Drawer,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  CloseOutlined,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { PortalPageBlock } from 'src/pages/PublicLandingPage/types';

const { TextArea } = Input;
const { Text, Title } = Typography;

const GeneratorPanel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
`;

const PromptSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const QuickPrompts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const QuickPromptTag = styled(Tag)`
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 16px;

  &:hover {
    background: #e6f4ff;
    border-color: #1890ff;
  }
`;

const PreviewSection = styled.div`
  flex: 1;
  overflow-y: auto;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
  min-height: 200px;
`;

const BlockPreviewItem = styled.div`
  padding: 8px 12px;
  margin-bottom: 8px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #1890ff;

  &:last-child {
    margin-bottom: 0;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
`;

const QUICK_PROMPTS = [
  {
    label: 'Landing page with hero',
    prompt: 'Create a landing page with a hero section, key statistics, and a call-to-action button',
  },
  {
    label: 'Dashboard overview',
    prompt: 'Create a dashboard overview page with a 2x2 grid of charts and a summary section',
  },
  {
    label: 'Data report',
    prompt: 'Create a data report page with a heading, introduction paragraph, a chart, and a data table',
  },
  {
    label: 'Program page',
    prompt: 'Create a health program page with program description, key indicators, and regional breakdown',
  },
];

interface AIPageGeneratorProps {
  open: boolean;
  onClose: () => void;
  onApplyBlocks: (blocks: PortalPageBlock[]) => void;
  availableCharts?: Array<{ id: number; name: string }>;
  availableDashboards?: Array<{ id: number; name: string }>;
}

export default function AIPageGenerator({
  open,
  onClose,
  onApplyBlocks,
  availableCharts = [],
  availableDashboards = [],
}: AIPageGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedBlocks, setGeneratedBlocks] = useState<PortalPageBlock[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setGeneratedBlocks(null);
    setSuggestions([]);

    try {
      const response = await SupersetClient.post({
        endpoint: '/api/v1/public_page/admin/ai/generate',
        jsonPayload: {
          prompt: prompt.trim(),
          page_context: {
            available_charts: availableCharts.slice(0, 10),
            available_dashboards: availableDashboards.slice(0, 5),
          },
        },
      });

      const data = response.json as {
        blocks?: PortalPageBlock[];
        suggestions?: string[];
        error?: string;
        message?: string;
      };

      if (data.error || data.message) {
        setError(data.error || data.message || t('Unknown error'));
      } else if (data.blocks && data.blocks.length > 0) {
        setGeneratedBlocks(data.blocks);
        setSuggestions(data.suggestions || []);
      } else {
        setError(t('No blocks generated. Try a different prompt.'));
      }
    } catch (err: any) {
      console.error('AI Generation error:', err);
      let errorMessage = t('Failed to generate page');
      if (err?.body?.message) {
        errorMessage = err.body.message;
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [prompt, availableCharts, availableDashboards]);

  const handleApply = useCallback(() => {
    if (generatedBlocks && generatedBlocks.length > 0) {
      onApplyBlocks(generatedBlocks);
      setGeneratedBlocks(null);
      setPrompt('');
      onClose();
    }
  }, [generatedBlocks, onApplyBlocks, onClose]);

  const handleQuickPrompt = useCallback((quickPrompt: string) => {
    setPrompt(quickPrompt);
  }, []);

  const handleReset = useCallback(() => {
    setPrompt('');
    setGeneratedBlocks(null);
    setSuggestions([]);
    setError(null);
  }, []);

  const renderBlockPreview = (block: PortalPageBlock, depth = 0) => (
    <BlockPreviewItem key={block.uid} style={{ marginLeft: depth * 16 }}>
      <Space>
        <Tag color="blue">{block.block_type}</Tag>
        <Text type="secondary">
          {block.content?.text?.slice(0, 50) ||
           block.content?.title?.slice(0, 50) ||
           block.content?.heading?.slice(0, 50) ||
           t('(no content)')}
        </Text>
      </Space>
      {block.children?.map(child => renderBlockPreview(child, depth + 1))}
    </BlockPreviewItem>
  );

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined style={{ color: '#1890ff' }} />
          {t('AI Page Generator')}
        </Space>
      }
      placement="right"
      width={450}
      open={open}
      onClose={onClose}
      extra={
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={onClose}
        />
      }
    >
      <GeneratorPanel>
        <PromptSection>
          <Title level={5}>{t('Describe the page you want to create')}</Title>
          <TextArea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t('e.g., Create a dashboard page with malaria statistics by region...')}
            rows={4}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={loading ? <Spin size="small" /> : <SendOutlined />}
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            block
          >
            {loading ? t('Generating...') : t('Generate Page')}
          </Button>
        </PromptSection>

        <div>
          <Text type="secondary">{t('Quick prompts:')}</Text>
          <QuickPrompts>
            {QUICK_PROMPTS.map(qp => (
              <QuickPromptTag
                key={qp.label}
                onClick={() => handleQuickPrompt(qp.prompt)}
              >
                <ThunderboltOutlined /> {qp.label}
              </QuickPromptTag>
            ))}
          </QuickPrompts>
        </div>

        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {generatedBlocks && generatedBlocks.length > 0 && (
          <>
            <div>
              <Title level={5}>{t('Generated Blocks')}</Title>
              <PreviewSection>
                {generatedBlocks.map(block => renderBlockPreview(block))}
              </PreviewSection>
            </div>

            {suggestions.length > 0 && (
              <Alert
                type="info"
                message={t('Suggestions')}
                description={
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <ActionButtons>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReset}
              >
                {t('Reset')}
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleApply}
              >
                {t('Apply to Page')}
              </Button>
            </ActionButtons>
          </>
        )}
      </GeneratorPanel>
    </Drawer>
  );
}
