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

import { Dashboard, Datasource, EmbeddedDashboard } from 'src/dashboard/types';
import { Chart } from 'src/types/Chart';
import { Currency } from '@superset-ui/core';
import { useApiV1Resource, useTransformedResource } from './apiResources';

type DashboardPayload = Dashboard & {
  metadata?: unknown;
};

function parseDashboardMetadata(dashboard: DashboardPayload) {
  const metadataPayload =
    (typeof dashboard.json_metadata === 'string' && dashboard.json_metadata) ||
    (typeof dashboard.metadata === 'string' && dashboard.metadata) ||
    null;

  if (metadataPayload) {
    try {
      return JSON.parse(metadataPayload);
    } catch {
      return {};
    }
  }

  if (dashboard.metadata && typeof dashboard.metadata === 'object') {
    return dashboard.metadata;
  }

  return {};
}

function parseDashboardPosition(positionJson?: string | null) {
  if (!positionJson) {
    return positionJson;
  }

  try {
    return JSON.parse(positionJson);
  } catch {
    return null;
  }
}

export const useDashboard = (
  idOrSlug: string | number | null | undefined,
  isPublic = false,
) =>
  useTransformedResource(
    useApiV1Resource<DashboardPayload>(
      idOrSlug
        ? isPublic
          ? `/api/v1/dashboard/public/${idOrSlug}`
          : `/api/v1/dashboard/${idOrSlug}`
        : null,
    ),
    dashboard => ({
      ...dashboard,
      // TODO: load these at the API level
      metadata: parseDashboardMetadata(dashboard),
      position_data: parseDashboardPosition(dashboard.position_json),
      owners: dashboard.owners || [],
    }),
  );

// gets the chart definitions for a dashboard
export const useDashboardCharts = (
  idOrSlug: string | number | null | undefined,
  isPublic = false,
) =>
  // Use the path-based charts endpoint for public views because the
  // generic GET helper can overwrite inline query params on fetch.
  useApiV1Resource<Chart[]>(
    idOrSlug
      ? isPublic
        ? `/api/v1/chart/dashboard/${idOrSlug}/charts`
        : `/api/v1/dashboard/${idOrSlug}/charts`
      : null,
  );

// gets the datasets for a dashboard
// important: this endpoint only returns the fields in the dataset
// that are necessary for rendering the given dashboard
export const useDashboardDatasets = (
  idOrSlug: string | number | null | undefined,
  isPublic = false,
) =>
  useTransformedResource(
    useApiV1Resource<Datasource[]>(
      idOrSlug
        ? isPublic
          ? `/api/v1/dashboard/public/${idOrSlug}/datasets`
          : `/api/v1/dashboard/${idOrSlug}/datasets`
        : null,
    ),
    datasets =>
      datasets.map(dataset => ({
        ...dataset,
        currencyFormats: Object.fromEntries(
          (dataset.metrics ?? [])
            .filter(metric => !!metric.currency)
            .map((metric): [string, Currency] => [
              metric.metric_name,
              metric.currency!,
            ]),
        ),
      })),
  );

export const useEmbeddedDashboard = (idOrSlug: string | number) =>
  useApiV1Resource<EmbeddedDashboard>(`/api/v1/dashboard/${idOrSlug}/embedded`);
