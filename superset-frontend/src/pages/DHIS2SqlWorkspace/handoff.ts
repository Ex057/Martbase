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
 * Handoff carrier for opening the DHIS2 SQL Workspace from a chart's SQL-Lab
 * entry points ("Edit / View / Run in SQL Lab").
 *
 * We use localStorage rather than the URL or router state because:
 *  - chart SQL can be large (URL length limits), and
 *  - several entry points open a NEW window/tab, where router state is lost and
 *    sessionStorage is not shared — localStorage is shared same-origin.
 *
 * The payload is short-lived (consumed once, and ignored if stale) so a fresh
 * visit to the workspace never picks up an old chart's query.
 */

const HANDOFF_KEY = 'dhis2_sql_workspace_handoff';
const MAX_AGE_MS = 60_000;

export interface SqlWorkspaceHandoff {
  /** Dataset (SqlaTable) id to pre-select, parsed from the datasourceKey. */
  datasetId?: number | null;
  /** SQL to load into the editor. */
  sql?: string;
}

/** Stash a dataset + SQL, then navigate to the workspace. */
export function setSqlWorkspaceHandoff(payload: SqlWorkspaceHandoff): void {
  try {
    window.localStorage.setItem(
      HANDOFF_KEY,
      JSON.stringify({ ...payload, ts: Date.now() }),
    );
  } catch {
    // Storage disabled/full — non-fatal; the workspace just opens empty.
  }
}

/** Read-and-clear the handoff. Returns null if absent or older than MAX_AGE_MS. */
export function readSqlWorkspaceHandoff(): SqlWorkspaceHandoff | null {
  try {
    const raw = window.localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as SqlWorkspaceHandoff & { ts?: number };
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return { datasetId: parsed.datasetId ?? null, sql: parsed.sql };
  } catch {
    return null;
  }
}

/** Derive the dataset id from a `<id>__<type>` datasourceKey. */
export function datasetIdFromKey(
  datasourceKey: string | null | undefined,
): number | null {
  if (!datasourceKey) return null;
  const idPart = String(datasourceKey).split('__')[0];
  const id = Number(idPart);
  return Number.isFinite(id) ? id : null;
}
