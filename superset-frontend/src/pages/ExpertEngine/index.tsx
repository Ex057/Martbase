import { useEffect, useState } from 'react';
import { SupersetClient, t } from '@superset-ui/core';
import {
  Alert,
  Button,
  Card,
  Input,
  Table,
} from '@superset-ui/core/components';

const DEFAULT_MAPPING = JSON.stringify(
  {
    datasets: [
      {
        name: 'malaria burden',
        file: 'malaria_burden_historical.csv',
        dashboard_metric: 'confirmed_cases',
        source_instance_id: 2,
        org_unit: 'org_unit_id',
        period: 'period',
        value: 'confirmed_cases',
        reporting_rate: 'reporting_rate',
      },
    ],
  },
  null,
  2,
);

type Bundle = {
  version: string;
  status: string;
  created_at: string;
  provenance?: { row_count?: number };
};

export default function ExpertEngine() {
  const [files, setFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const loadBundles = () =>
    SupersetClient.get({ endpoint: '/api/v1/expert/bundles' })
      .then(({ json }) => setBundles(json.result || []))
      .catch(() => setNotice(t('Unable to load research bundles.')));

  useEffect(() => {
    loadBundles();
  }, []);

  const build = async () => {
    if (!files.length) {
      setNotice(t('Choose one or more CSV exports first.'));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      JSON.parse(mapping);
      const csrfToken = await SupersetClient.getCSRFToken();
      const body = new FormData();
      files.forEach(file => body.append('files', file));
      body.append('mapping', mapping);
      const response = await fetch('/api/v1/expert/bundles', {
        method: 'POST',
        credentials: 'same-origin',
        body,
        headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined,
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.message || t('Bundle build failed.'));
      setNotice(
        t('Draft bundle %(version)s created. Uploaded CSV was not retained.', {
          version: json.result.version,
        }),
      );
      setPreview(json.result.preview_markdown || null);
      loadBundles();
    } catch (error: any) {
      setNotice(error.message || t('Mapping must be valid JSON.'));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (version: string) => {
    setBusy(true);
    try {
      await SupersetClient.post({
        endpoint: '/api/v1/expert/activate',
        jsonPayload: { version },
      });
      setNotice(
        t(
          'Approved bundle %(version)s is now active for dashboard historical evidence.',
          { version },
        ),
      );
      loadBundles();
    } catch {
      setNotice(t('Unable to activate this bundle.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1>{t('Expert Engine')}</h1>
      <p>
        {t(
          'Build dated, reviewed seasonal evidence bundles from local DHIS2 CSV exports. Dashboard AI uses only the approved bundle; uploaded CSV files are not retained.',
        )}
      </p>
      {notice && (
        <Alert
          type="info"
          message={notice}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Card title={t('Create research bundle')}>
        <input
          aria-label={t('Choose CSV exports')}
          accept=".csv,text/csv"
          multiple
          type="file"
          onChange={event => setFiles(Array.from(event.target.files || []))}
        />
        {files.length > 0 && (
          <p>{t('%(count)s CSV file(s) selected.', { count: files.length })}</p>
        )}
        <p style={{ marginTop: 16 }}>
          {t(
            'Approved metric mapping (JSON). Each dataset must name the uploaded CSV in its file field.',
          )}
        </p>
        <Input.TextArea
          value={mapping}
          rows={14}
          onChange={event => setMapping(event.target.value)}
        />
        <Button
          type="primary"
          loading={busy}
          onClick={build}
          style={{ marginTop: 16 }}
        >
          {t('Build draft bundle')}
        </Button>
      </Card>
      {preview && (
        <Card title={t('Mock AI response preview')} style={{ marginTop: 20 }}>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{preview}</pre>
        </Card>
      )}
      <Card title={t('Research bundle history')} style={{ marginTop: 20 }}>
        <Table<Bundle>
          rowKey="version"
          data={bundles}
          pagination={false}
          columns={[
            { title: t('Version'), dataIndex: 'version' },
            { title: t('Status'), dataIndex: 'status' },
            { title: t('Created'), dataIndex: 'created_at' },
            {
              title: t('Rows'),
              render: (_, row) => row.provenance?.row_count || 0,
            },
            {
              title: t('Action'),
              render: (_, row) => (
                <Button
                  disabled={busy || row.status === 'approved'}
                  onClick={() => activate(row.version)}
                >
                  {t('Approve & activate')}
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
