/*
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
 * On-map value labels for the DHIS2 choropleth, rendered as a React-managed
 * layer.
 *
 * Each label is a non-interactive `<Marker>` (a `divIcon`) placed at the
 * boundary centre. Because React owns the marker lifecycle, changing the period
 * (or any data) unmounts the old labels and mounts fresh ones — so labels never
 * stack or go stale, and areas with no value simply render no label. This
 * replaces the previous imperative `L.marker(...).addTo(map)` approach, whose
 * manual cleanup left orphaned labels behind when scrubbing the timeline.
 */
import React from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { BoundaryFeature } from '../types';
import { getFeatureCenter } from '../utils';

export type MapLabelType = 'name' | 'value' | 'name_value' | 'percent';

interface LabelLayerProps {
  features: BoundaryFeature[];
  getValue: (feature: BoundaryFeature) => number | undefined;
  labelType: MapLabelType;
  formatValue?: (value: number) => string;
  fontSize?: number;
  textColor?: string;
  /** Sum of all values, used to compute `percent` labels. */
  total?: number;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function buildLabelText(
  feature: BoundaryFeature,
  value: number | undefined,
  labelType: MapLabelType,
  formatValue: (value: number) => string,
  total: number,
): string {
  const name = feature.properties?.name ?? '';
  switch (labelType) {
    case 'name':
      return name;
    case 'value':
      return value !== undefined ? formatValue(value) : '';
    case 'name_value':
      return value !== undefined ? `${name}\n${formatValue(value)}` : '';
    case 'percent':
      return value !== undefined && total
        ? `${((value / total) * 100).toFixed(1)}%`
        : '';
    default:
      return '';
  }
}

function LabelLayer({
  features,
  getValue,
  labelType,
  formatValue = value => String(value),
  fontSize = 12,
  textColor = '#1f2937',
  total = 0,
}: LabelLayerProps): React.ReactElement {
  return (
    <>
      {features.map(feature => {
        // Points don't carry a fill/centroid worth labelling here.
        if (feature.geometry?.type === 'Point') {
          return null;
        }
        const value = getValue(feature);
        const labelText = buildLabelText(
          feature,
          value,
          labelType,
          formatValue,
          total,
        );
        // No label where there is no data — this keeps zero/NULL areas blank.
        if (!labelText) {
          return null;
        }
        const [lat, lng] = getFeatureCenter(feature);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        const html = escapeHtml(labelText).replace(/\n/g, '<br/>');
        return (
          // @ts-ignore - React 19 compatibility with react-leaflet
          <Marker
            key={feature.id}
            position={[lat, lng]}
            interactive={false}
            keyboard={false}
            icon={L.divIcon({
              className: 'map-label',
              html: `<div style="font-size: ${fontSize}px; text-align: center; white-space: nowrap; color: ${textColor};">${html}</div>`,
            })}
          />
        );
      })}
    </>
  );
}

export default LabelLayer;
