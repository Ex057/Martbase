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
/* eslint-disable no-restricted-imports */
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { getMetricLabel, SupersetClient, t } from '@superset-ui/core';
import ControlHeader from 'src/explore/components/ControlHeader';
import { Button, Select, Space, Tag } from 'antd';

type MediaAsset = {
  id: number;
  title: string;
  asset_type?: string;
  mime_type?: string;
  file_extension?: string | null;
  download_url?: string;
  visibility?: string;
  is_public?: boolean;
};

type SummaryImageAssetsControlProps = {
  label?: string;
  description?: string;
  value?: Record<string, string>;
  onChange?: (value: Record<string, string>) => void;
  metrics?: any[];
};

function metricOptionLabel(metric: any) {
  try {
    return getMetricLabel(metric);
  } catch {
    return String(metric?.label || metric?.name || metric || '');
  }
}

export default function SummaryImageAssetsControl({
  value = {},
  onChange,
  metrics = [],
  ...props
}: SummaryImageAssetsControlProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string | undefined>();
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<
    string | undefined
  >();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInputId = useMemo(
    () => `summary-image-upload-${Math.random().toString(36).slice(2)}`,
    [],
  );

  const metricOptions = useMemo(
    () =>
      metrics
        .map(metricOptionLabel)
        .filter(Boolean)
        .map(label => ({ value: label, label })),
    [metrics],
  );

  const imageOptions = useMemo(
    () =>
      assets
        .filter(asset => {
          if (!asset.download_url) {
            return false;
          }
          const assetType = String(asset.asset_type || '').toLowerCase();
          const mimeType = String(asset.mime_type || '').toLowerCase();
          const extension = String(asset.file_extension || '').toLowerCase();
          return (
            assetType === 'image' ||
            assetType.includes('image') ||
            mimeType.startsWith('image/') ||
            ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(
              extension,
            )
          );
        })
        .map(asset => ({
          value: asset.download_url as string,
          label: `${asset.title}${asset.visibility ? ` · ${asset.visibility}` : ''}`,
        })),
    [assets],
  );

  function loadAssets() {
    SupersetClient.get({ endpoint: '/api/v1/public_page/admin/assets' })
      .then(response => {
        setAssets(response.json?.result || []);
        setError(null);
      })
      .catch(() => {
        setError(
          t(
            'Could not load CMS image assets. You may need CMS media permissions.',
          ),
        );
      });
  }

  useEffect(() => {
    loadAssets();
  }, []);

  function updateMetricImage(metricLabel: string, imageUrl?: string) {
    const nextValue = { ...(value || {}) };
    if (imageUrl) {
      nextValue[metricLabel] = imageUrl;
    } else {
      delete nextValue[metricLabel];
    }
    onChange?.(nextValue);
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const csrfToken = await SupersetClient.getCSRFToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name);
      formData.append('visibility', 'public');
      formData.append('is_public', 'true');
      const response = await fetch('/api/v1/public_page/admin/assets', {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined,
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.message || t('Failed to upload image asset.'));
      }
      const asset = json?.result as MediaAsset | undefined;
      if (asset) {
        setAssets(previous => [asset, ...previous]);
        if (selectedMetric && asset.download_url) {
          updateMetricImage(selectedMetric, asset.download_url);
        }
        setSelectedAssetUrl(asset.download_url);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : t('Failed to upload image asset.'),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <ControlHeader {...props} />
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Select
          allowClear
          showSearch
          placeholder={t('Metric')}
          value={selectedMetric}
          options={metricOptions}
          onChange={metricLabel => {
            setSelectedMetric(metricLabel);
            setSelectedAssetUrl(metricLabel ? value?.[metricLabel] : undefined);
          }}
        />
        <Select
          allowClear
          showSearch
          placeholder={t('Image asset')}
          value={selectedAssetUrl}
          options={imageOptions}
          disabled={!selectedMetric}
          onChange={assetUrl => {
            setSelectedAssetUrl(assetUrl);
            if (selectedMetric) {
              updateMetricImage(selectedMetric, assetUrl);
            }
          }}
        />
        <Space wrap>
          <Button size="small" onClick={loadAssets}>
            {t('Refresh images')}
          </Button>
          <label
            htmlFor={uploadInputId}
            style={{
              alignItems: 'center',
              background: 'var(--pro-bg-card)',
              border: '1px solid var(--pro-border)',
              borderRadius: 4,
              boxSizing: 'border-box',
              color: 'var(--pro-text)',
              cursor: uploading ? 'default' : 'pointer',
              display: 'inline-flex',
              fontSize: 12,
              height: 24,
              paddingInline: 8,
            }}
          >
            {uploading ? t('Uploading...') : t('Upload public image')}
          </label>
          <input
            id={uploadInputId}
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={uploadImage}
            style={{ display: 'none' }}
          />
          {selectedMetric && value?.[selectedMetric] ? (
            <Button
              size="small"
              onClick={() => {
                updateMetricImage(selectedMetric, undefined);
                setSelectedAssetUrl(undefined);
              }}
            >
              {t('Clear metric image')}
            </Button>
          ) : null}
        </Space>
        {Object.keys(value || {}).length ? (
          <Space wrap>
            {Object.entries(value).map(([metricLabel]) => (
              <Tag key={metricLabel}>{metricLabel}</Tag>
            ))}
          </Space>
        ) : null}
        {error ? <div role="alert">{error}</div> : null}
      </Space>
    </div>
  );
}
