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
 * Convenience barrel. Note that importing it pulls in the full export pipeline
 * (dom-to-image, Leaflet, react-dom) — modules that only need the
 * viz-facing contract should import './constants' and './registry' directly.
 */
export { default as exportMapImage } from './exportMapImage';
export {
  EXPORT_HIDE_ATTRIBUTE,
  MAP_EXPORTING_CLASS,
  MAP_EXPORT_ID_ATTRIBUTE,
} from './constants';
export {
  clearMapExporters,
  findMapExporter,
  registerMapExporter,
  unregisterMapExporter,
} from './registry';
export type {
  MapExportLegendItem,
  MapExportLevelItem,
  MapExportSpec,
  MapExportSpecGetter,
} from './types';
