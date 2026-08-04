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

import { useRef } from 'react';
import { MAP_EXPORT_ID_ATTRIBUTE } from './constants';
import type { MapExportSpecGetter } from './types';

export { MAP_EXPORT_ID_ATTRIBUTE };

const exporters = new Map<string, MapExportSpecGetter>();

let idCounter = 0;

/**
 * A stable per-instance id for a map viz, so several maps on one dashboard each
 * register separately. This is `useId` in all but name — but the app is on
 * React 17, which does not have it.
 */
export function useMapExportId(): string {
  const idRef = useRef<string>();
  if (!idRef.current) {
    idCounter += 1;
    idRef.current = `map-export-${idCounter}`;
  }
  return idRef.current;
}

export function registerMapExporter(
  id: string,
  getSpec: MapExportSpecGetter,
): void {
  exporters.set(id, getSpec);
}

export function unregisterMapExporter(id: string): void {
  exporters.delete(id);
}

/**
 * Find the exporter for a map rendered inside `root`. `root` is whatever the
 * download menu resolved (a chart container in Explore, a dashboard chart
 * wrapper on a dashboard), so the map root may be nested arbitrarily deep —
 * and `root` may itself be the map root.
 *
 * Returns null when `root` holds no registered map, which is the normal case
 * for every non-map chart.
 */
export function findMapExporter(root: Element): MapExportSpecGetter | null {
  const candidates: Element[] = [];
  if (root.hasAttribute?.(MAP_EXPORT_ID_ATTRIBUTE)) {
    candidates.push(root);
  }
  candidates.push(...root.querySelectorAll(`[${MAP_EXPORT_ID_ATTRIBUTE}]`));

  for (const element of candidates) {
    const id = element.getAttribute(MAP_EXPORT_ID_ATTRIBUTE);
    const getSpec = id ? exporters.get(id) : undefined;
    if (getSpec) {
      return getSpec;
    }
  }
  return null;
}

/** Test seam — drops every registration. */
export function clearMapExporters(): void {
  exporters.clear();
}
