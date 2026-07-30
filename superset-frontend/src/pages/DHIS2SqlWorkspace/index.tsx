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

/**
 * DHIS2 SQL Workspace
 *
 * A DHIS2-aware, serving-DB-aware SQL workspace. Unlike stock SQL Lab (which
 * makes the user pick a database/schema and, for DHIS2, dumps them onto the
 * DHIS2 *source* connection that can only call the analytics API), this page is
 * dataset-first:
 *
 *  - Pick a staged/MART dataset; it already knows its serving table + schema
 *    (DuckDB `main` or ClickHouse `dhis2_serving`) — auto-targeted, backend-agnostic.
 *  - A runnable starter query is generated against the resolved serving ref.
 *  - Queries run through `/api/v1/local-staging/run-query`, which executes on the
 *    active serving engine (never the DHIS2 dialect) — so the `/api/analytics`
 *    404 failure mode is structurally impossible here.
 *  - The AI SQL assistant (guided metric/period + multiple suggestions) is
 *    embedded for generation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css, styled, SupersetClient, t } from '@superset-ui/core';
import { Typography } from '@superset-ui/core/components';
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  DatabaseOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SaveOutlined,
  TableOutlined,
} from '@ant-design/icons';

import { useToasts } from 'src/components/MessageToasts/withToasts';
import AIInsightPanel from 'src/features/ai/AIInsightPanel';
import {
  readSqlWorkspaceHandoff,
  SqlWorkspaceHandoff,
} from './handoff';

const { Text, Title, Paragraph } = Typography;

/* ── Types ─────────────────────────────────────────────── */

interface MartColumn {
  name: string;
  type: string;
  dhis2?: {
    period?: boolean;
    indicator?: boolean;
    agg?: string;
    ou_hierarchy?: boolean;
    ou_level?: number;
  };
}

interface MartDataset {
  dataset_id: number;
  table_name: string;
  dataset_name: string;
  schema?: string | null;
  serving_database_id?: number | null;
  description?: string;
  columns: MartColumn[];
  period_column?: string | null;
  column_count: number;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowcount: number;
  total_row_count?: number | null;
}

/* ── Styles ────────────────────────────────────────────── */

const Wrapper = styled.div`
  ${({ theme }) => css`
    padding: ${theme.sizeUnit * 4}px;
    height: 100%;
  `}
`;

const SqlTextArea = styled.textarea`
  ${({ theme }) => css`
    width: 100%;
    min-height: 160px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 13px;
    padding: ${theme.sizeUnit * 2}px;
    border: 1px solid ${theme.colorBorderSecondary};
    border-radius: ${theme.borderRadius}px;
    resize: vertical;
    background: ${theme.colorBgContainer};
    color: ${theme.colorText};
    outline: none;

    &:focus {
      border-color: ${theme.colorPrimary};
    }
  `}
`;

const DatasetItem = styled(List.Item)<{ $selected: boolean }>`
  ${({ theme, $selected }) => css`
    cursor: pointer;
    padding: ${theme.sizeUnit * 2}px ${theme.sizeUnit * 2}px;
    border-radius: ${theme.borderRadius}px;
    background: ${$selected ? theme.colorPrimaryBg : 'transparent'};
    &:hover {
      background: ${$selected ? theme.colorPrimaryBg : theme.colorBgTextHover};
    }
  `}
`;

/* ── Helpers ───────────────────────────────────────────── */

function errorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return (
    anyErr?.message ||
    anyErr?.error ||
    anyErr?.statusText ||
    fallback
  );
}

// Double-quoted identifiers work on both DuckDB and ClickHouse, and the schema
// comes resolved per dataset (main | dhis2_serving), so this is backend-correct.
function quoteRef(schema: string | null | undefined, table: string): string {
  return schema ? `"${schema}"."${table}"` : `"${table}"`;
}

function buildStarterSql(ds: MartDataset): string {
  const cols = ds.columns.slice(0, 8).map(c => `  "${c.name}"`);
  const colList = cols.length ? cols.join(',\n') : '  *';
  return `SELECT\n${colList}\nFROM ${quoteRef(ds.schema, ds.table_name)}\nLIMIT 100`;
}

/* ── Component ─────────────────────────────────────────── */

export default function DHIS2SqlWorkspace() {
  const { addDangerToast, addSuccessToast } = useToasts();

  const [datasets, setDatasets] = useState<MartDataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const [aiOpen, setAiOpen] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => datasets.find(d => d.dataset_id === selectedId) || null,
    [datasets, selectedId],
  );

  // Read-and-clear any pending handoff from a chart's "Edit/View/Run in SQL Lab"
  // exactly once (the initializer runs a single time). Applied after datasets load.
  const handoffRef = useRef<SqlWorkspaceHandoff | null | undefined>(undefined);
  if (handoffRef.current === undefined) {
    handoffRef.current = readSqlWorkspaceHandoff();
  }

  useEffect(() => {
    let cancelled = false;
    setLoadingDatasets(true);
    SupersetClient.get({ endpoint: '/api/v1/ai/sql/mart-tables' })
      .then(({ json }) => {
        if (cancelled) return;
        const list = (json.result as MartDataset[]) || [];
        setDatasets(list);

        // Apply the chart handoff (or ?dataset_id=): pre-select the dataset and
        // load its SQL. This is what makes "Edit in SQL Lab" land somewhere that
        // actually runs against the serving DB.
        const handoff = handoffRef.current;
        const urlDatasetId = new URLSearchParams(window.location.search).get(
          'dataset_id',
        );
        const targetId =
          handoff?.datasetId ??
          (urlDatasetId ? Number(urlDatasetId) : null);
        const handoffSql = handoff?.sql?.trim();

        if (targetId != null && Number.isFinite(targetId)) {
          const match = list.find(d => d.dataset_id === targetId);
          if (match) {
            setSelectedId(match.dataset_id);
            setSql(handoffSql || buildStarterSql(match));
            return;
          }
        }
        if (handoffSql) {
          setSql(handoffSql);
        }
      })
      .catch(err => {
        if (cancelled) return;
        addDangerToast(errorMessage(err, t('Failed to load datasets')));
      })
      .finally(() => {
        if (!cancelled) setLoadingDatasets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addDangerToast]);

  const runQueryWith = useCallback(
    async (querySql: string) => {
      const trimmed = (querySql || '').trim();
      if (!trimmed) return;
      setRunning(true);
      setResult(null);
      try {
        const resp = await SupersetClient.post({
          endpoint: '/api/v1/local-staging/run-query',
          jsonPayload: { sql: trimmed, limit: 1000 },
        });
        setResult(resp.json.result as QueryResult);
      } catch (err) {
        addDangerToast(errorMessage(err, t('Query failed')));
      } finally {
        setRunning(false);
      }
    },
    [addDangerToast],
  );

  const handleSelectDataset = useCallback((ds: MartDataset) => {
    setSelectedId(ds.dataset_id);
    setSql(buildStarterSql(ds));
    setResult(null);
  }, []);

  const handleSaveAsNew = useCallback(async () => {
    if (!selected?.serving_database_id || !saveName.trim() || !sql.trim()) {
      return;
    }
    setSaving(true);
    try {
      await SupersetClient.post({
        endpoint: '/api/v1/dataset/',
        jsonPayload: {
          database: selected.serving_database_id,
          schema: selected.schema || undefined,
          table_name: saveName.trim(),
          sql: sql.trim(),
          owners: [],
        },
      });
      addSuccessToast(t('Saved dataset "%s"', saveName.trim()));
      setSaveOpen(false);
      setSaveName('');
    } catch (err) {
      addDangerToast(errorMessage(err, t('Could not save dataset')));
    } finally {
      setSaving(false);
    }
  }, [selected, saveName, sql, addSuccessToast, addDangerToast]);

  const filteredDatasets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return datasets;
    return datasets.filter(
      d =>
        d.dataset_name?.toLowerCase().includes(q) ||
        d.table_name?.toLowerCase().includes(q),
    );
  }, [datasets, search]);

  const resultColumns = (result?.columns || []).map(col => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    render: (v: unknown) =>
      v == null ? <Text type="secondary">null</Text> : String(v),
  }));

  return (
    <Wrapper>
      <Title level={3} style={{ marginBottom: 4 }}>
        {t('DHIS2 SQL Workspace')}
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t(
          'Query staged DHIS2 data directly against its serving database. Pick a ' +
            'dataset, run read-only SQL, or ask AI to write it — no DHIS2 API ' +
            'translation, works the same on DuckDB and ClickHouse.',
        )}
      </Paragraph>

      <Row gutter={16}>
        {/* Dataset picker */}
        <Col xs={24} md={7} lg={6}>
          <Card
            size="small"
            title={
              <Space>
                <DatabaseOutlined />
                {t('Serving datasets')}
              </Space>
            }
            styles={{ body: { padding: 8 } }}
          >
            <Input.Search
              allowClear
              placeholder={t('Search datasets')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {loadingDatasets ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin />
              </div>
            ) : filteredDatasets.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('No staged datasets found')}
              />
            ) : (
              <List
                size="small"
                dataSource={filteredDatasets}
                style={{ maxHeight: '60vh', overflowY: 'auto' }}
                renderItem={ds => (
                  <DatasetItem
                    $selected={ds.dataset_id === selectedId}
                    onClick={() => handleSelectDataset(ds)}
                  >
                    <List.Item.Meta
                      avatar={<TableOutlined />}
                      title={ds.dataset_name || ds.table_name}
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {(ds.schema ? `${ds.schema}.` : '') + ds.table_name}
                          {' · '}
                          {t('%s cols', ds.column_count)}
                        </Text>
                      }
                    />
                  </DatasetItem>
                )}
              />
            )}
          </Card>
        </Col>

        {/* Editor + results */}
        <Col xs={24} md={17} lg={18}>
          <Card
            size="small"
            title={
              selected ? (
                <Space wrap>
                  <Text strong>{selected.dataset_name || selected.table_name}</Text>
                  {selected.period_column ? (
                    <Tag color="geekblue">
                      {t('period: %s', selected.period_column)}
                    </Tag>
                  ) : null}
                </Space>
              ) : (
                t('SQL')
              )
            }
            extra={
              <Space>
                <Button
                  icon={<RobotOutlined />}
                  onClick={() => setAiOpen(true)}
                >
                  {t('AI SQL')}
                </Button>
                <Tooltip
                  title={
                    selected?.serving_database_id
                      ? ''
                      : t('Select a dataset with a serving database to save')
                  }
                >
                  <Button
                    icon={<SaveOutlined />}
                    disabled={!selected?.serving_database_id || !sql.trim()}
                    onClick={() => setSaveOpen(true)}
                  >
                    {t('Save as dataset')}
                  </Button>
                </Tooltip>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={running}
                  disabled={!sql.trim()}
                  onClick={() => void runQueryWith(sql)}
                >
                  {t('Run')}
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <SqlTextArea
                value={sql}
                onChange={e => setSql(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void runQueryWith(sql);
                  }
                }}
                placeholder={
                  selected
                    ? t('Edit the query… (Ctrl+Enter to run)')
                    : t('Pick a dataset on the left, or write a SELECT here.')
                }
                spellCheck={false}
              />

              {result ? (
                <div>
                  <Space wrap style={{ marginBottom: 8 }}>
                    <Text type="secondary">
                      {t('%s rows returned', result.rowcount)}
                    </Text>
                    {result.total_row_count != null ? (
                      <Tag color="blue">
                        {t(
                          'Total rows: %s',
                          result.total_row_count.toLocaleString(),
                        )}
                      </Tag>
                    ) : null}
                  </Space>
                  <Table
                    dataSource={result.rows.map((r, i) => ({ ...r, __key: i }))}
                    columns={resultColumns}
                    rowKey="__key"
                    size="small"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 50, hideOnSinglePage: true }}
                  />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t(
                    'Run a query to see results, or use AI SQL to generate one.',
                  )}
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* AI SQL assistant */}
      <Drawer
        title={t('AI SQL assistant')}
        placement="right"
        width={480}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        styles={{ body: { padding: 0 } }}
        destroyOnClose
      >
        <AIInsightPanel
          mode="sql"
          context={{}}
          defaultQuestion={t('Describe the metric and period you want…')}
          currentSql={sql}
          databaseId={selected?.serving_database_id ?? undefined}
          schema={selected?.schema ?? undefined}
          onApplySql={s => setSql(s)}
          onRunSql={s => {
            setSql(s);
            setAiOpen(false);
            void runQueryWith(s);
          }}
        />
      </Drawer>

      {/* Save as new dataset */}
      <Modal
        title={t('Save as new dataset')}
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={() => void handleSaveAsNew()}
        okText={t('Save')}
        confirmLoading={saving}
        okButtonProps={{ disabled: !saveName.trim() }}
      >
        <Paragraph type="secondary">
          {t(
            'Creates a virtual dataset on the serving database from the current ' +
              'SQL. You can then build charts on it.',
          )}
        </Paragraph>
        <Input
          placeholder={t('Dataset name')}
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
          onPressEnter={() => void handleSaveAsNew()}
        />
      </Modal>
    </Wrapper>
  );
}
