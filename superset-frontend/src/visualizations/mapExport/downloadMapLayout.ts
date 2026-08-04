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

import { findMapExporter } from './registry';

/**
 * Viz keys that register a map exporter — see `visualizations/presets/MainPreset.js`.
 * Used to decide whether the "Map layout" download item is offered at all.
 */
const MAP_VIZ_TYPES = new Set(['dhis2_map', 'ug_maps']);

export const isMapVizType = (vizType?: string | null): boolean =>
  Boolean(vizType && MAP_VIZ_TYPES.has(vizType));

/**
 * Download the composed, print-ready map layout for the chart inside `selector`.
 *
 * Kept out of `downloadAsImage` on purpose: the plain PNG/JPG/SVG items stay
 * plain screenshots of the chart, and this is a separate, explicitly-labelled
 * action. The heavy pipeline (Leaflet, dom-to-image, react-dom) is imported on
 * demand so it never enters the eagerly-loaded menu bundles.
 *
 * Throws when the map cannot be found or the export fails, so the caller can
 * report it — this is a direct user action, not a background nicety.
 */
export async function downloadMapLayout(
  selector: string,
  fileStem: string,
): Promise<void> {
  const chartElement = document.querySelector(selector);
  if (!chartElement) {
    throw new Error('Map export failed: chart element not found');
  }

  const getSpec = findMapExporter(chartElement);
  if (!getSpec) {
    throw new Error('Map export failed: no map found in this chart');
  }

  const { default: exportMapImage } = await import('./exportMapImage');
  await exportMapImage(getSpec(), fileStem, 'png');
}

export default downloadMapLayout;
