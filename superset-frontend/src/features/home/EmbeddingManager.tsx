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
import { styled, SupersetClient, t } from '@superset-ui/core';
import { Button, Modal, message, Alert, Input, Space, Typography } from 'antd';
import { Icons } from '@superset-ui/core/components/Icons';

const { Text, Paragraph } = Typography;

const StyledButton = styled(Button)`
  ${({ theme }) => `
    margin-bottom: ${theme.sizeUnit * 4}px;
  `}
`;

const InfoSection = styled.div`
  ${({ theme }) => `
    margin: ${theme.sizeUnit * 4}px 0;
    padding: ${theme.sizeUnit * 4}px;
    background: ${theme.colorBgLayout};
    border-radius: ${theme.borderRadiusLG}px;
  `}
`;

interface EmbeddingManagerProps {
  dashboardId: number;
  dashboardTitle: string;
  embeddedUuid: string | null;
  onEmbeddingEnabled: (uuid: string) => void;
  onEmbeddingDisabled: () => void;
}

export default function EmbeddingManager({
  dashboardId,
  dashboardTitle,
  embeddedUuid,
  onEmbeddingEnabled,
  onEmbeddingDisabled,
}: EmbeddingManagerProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string>('');

  const isEmbedded = !!embeddedUuid;

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setAllowedDomains('');
  };

  const enableEmbedding = async () => {
    setLoading(true);
    try {
      // Parse allowed domains
      const domains = allowedDomains
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0);

      // Call API to enable embedding
      const response = await SupersetClient.post({
        endpoint: `/api/v1/dashboard/${dashboardId}/embedded`,
        jsonPayload: {
          allowed_domains: domains,
        },
      });

      const { result } = response.json;
      message.success(t('Dashboard embedding enabled successfully!'));
      onEmbeddingEnabled(result.uuid);
      setIsModalVisible(false);
      setAllowedDomains('');
    } catch (error: any) {
      console.error('Error enabling embedding:', error);
      message.error(
        error?.message ||
          t('Failed to enable embedding. You may need admin permissions.'),
      );
    } finally {
      setLoading(false);
    }
  };

  const disableEmbedding = async () => {
    Modal.confirm({
      title: t('Disable Embedding?'),
      content: t(
        'Are you sure you want to disable embedding for this dashboard? Existing embedded dashboards will stop working.',
      ),
      okText: t('Disable'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        setLoading(true);
        try {
          await SupersetClient.delete({
            endpoint: `/api/v1/dashboard/${dashboardId}/embedded`,
          });
          message.success(t('Dashboard embedding disabled successfully!'));
          onEmbeddingDisabled();
        } catch (error: any) {
          console.error('Error disabling embedding:', error);
          message.error(
            error?.message ||
              t('Failed to disable embedding. You may need admin permissions.'),
          );
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }}>
        {isEmbedded ? (
          <>
            <Alert
              message={t('Embedding Enabled')}
              description={
                <>
                  <Paragraph>
                    {t('This dashboard is configured for embedding.')}
                  </Paragraph>
                  <Text strong>Embedded UUID:</Text>
                  <br />
                  <Text code copyable>
                    {embeddedUuid}
                  </Text>
                </>
              }
              type="success"
              showIcon
              icon={<Icons.CheckCircleOutlined />}
            />
            <StyledButton
              danger
              icon={<Icons.StopOutlined />}
              onClick={disableEmbedding}
              loading={loading}
              block
            >
              {t('Disable Embedding')}
            </StyledButton>
          </>
        ) : (
          <>
            <Alert
              message={t('Embedding Not Enabled')}
              description={t(
                'This dashboard is not configured for embedding. Click below to enable.',
              )}
              type="warning"
              showIcon
              icon={<Icons.WarningOutlined />}
            />
            <StyledButton
              type="primary"
              icon={<Icons.SettingOutlined />}
              onClick={showModal}
              block
            >
              {t('Enable Embedding')}
            </StyledButton>
          </>
        )}
      </Space>

      <Modal
        title={t('Enable Dashboard Embedding')}
        open={isModalVisible}
        onOk={enableEmbedding}
        onCancel={handleCancel}
        confirmLoading={loading}
        okText={t('Enable')}
        cancelText={t('Cancel')}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Paragraph>
            {t(
              'Enabling embedding allows this dashboard to be embedded in external applications using the Superset Embedded SDK.',
            )}
          </Paragraph>

          <InfoSection>
            <Text strong>{t('Dashboard:')}</Text> {dashboardTitle}
            <br />
            <Text strong>{t('Dashboard ID:')}</Text> {dashboardId}
          </InfoSection>

          <div>
            <Text strong>{t('Allowed Domains (Optional)')}</Text>
            <Paragraph type="secondary">
              {t(
                'Comma-separated list of domains allowed to embed this dashboard. Leave empty to allow all domains.',
              )}
            </Paragraph>
            <Input
              placeholder={t(
                'e.g., https://example.com, https://app.example.com',
              )}
              value={allowedDomains}
              onChange={e => setAllowedDomains(e.target.value)}
            />
          </div>

          <Alert
            message={t('Note')}
            description={t(
              'After enabling embedding, you will receive a unique UUID that can be used with the Superset Embedded SDK to embed this dashboard.',
            )}
            type="info"
            showIcon
          />
        </Space>
      </Modal>
    </>
  );
}
