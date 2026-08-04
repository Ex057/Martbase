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

/*
 * Contract shared between a map viz and the exporter. Kept dependency-free so a
 * viz can reference it without pulling in the export pipeline (dom-to-image,
 * Leaflet, react-dom), which only loads when a download actually runs.
 */

/**
 * Class the exporter puts on the map root while capturing. Each map viz owns
 * the matching CSS rule (it hides `[data-export-hide]` overlays and the Leaflet
 * control container), because the styling lives in its styled components.
 */
export const MAP_EXPORTING_CLASS = 'map-exporting';

/**
 * Attribute marking an on-map overlay as screen-only, so the capture drops it.
 */
export const EXPORT_HIDE_ATTRIBUTE = 'data-export-hide';

/**
 * Attribute a map viz puts on its root element so the generic
 * "Download as image" path can discover a registered exporter for it.
 */
export const MAP_EXPORT_ID_ATTRIBUTE = 'data-map-export-id';
