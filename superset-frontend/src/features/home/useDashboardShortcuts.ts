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
import { useEffect, useState } from 'react';
import rison from 'rison';
import { SupersetClient, logging } from '@superset-ui/core';

export interface DashboardShortcut {
  id: number;
  dashboard_title: string;
  url: string;
}

const MAX_SHORTCUTS = 25;

/**
 * Dashboards the current user can access, for the navbar "Dashboards" dropdown.
 */
export function useDashboardShortcuts(enabled: boolean): DashboardShortcut[] {
  const [dashboards, setDashboards] = useState<DashboardShortcut[]>([]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;
    const query = rison.encode({
      columns: ['id', 'dashboard_title', 'url'],
      order_column: 'dashboard_title',
      order_direction: 'asc',
      page_size: MAX_SHORTCUTS,
    });
    SupersetClient.get({ endpoint: `/api/v1/dashboard/?q=${query}` })
      .then(({ json }) => {
        if (cancelled) {
          return;
        }
        setDashboards(
          (json?.result ?? []).filter(
            (dashboard: DashboardShortcut) =>
              dashboard.url && dashboard.dashboard_title,
          ),
        );
      })
      .catch(error => {
        logging.error('Failed to load dashboards for the navbar', error);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return dashboards;
}

export default useDashboardShortcuts;
