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
 * Bubble (proportional-circle) thematic layer for the DHIS2 map.
 *
 * Renders one CircleMarker per org-unit boundary, positioned at the boundary's
 * centre, sized by its value (via `radiusScale`) and coloured by the shared
 * `colorScale`. Used as an alternative to the choropleth fill; the polygon
 * outlines are still drawn underneath by the GeoJSON layer. No-data areas are
 * skipped. Each bubble shows a hover tooltip with the area name and value.
 */
import React from 'react';
import { CircleMarker, Tooltip, Popup } from 'react-leaflet';
import { BoundaryFeature } from '../types';
import { getFeatureCenter } from '../utils';

interface BubbleLayerProps {
  features: BoundaryFeature[];
  getValue: (feature: BoundaryFeature) => number | undefined;
  colorScale: (value: number) => string;
  radiusScale: (value: number) => number;
  metricLabel?: string;
  formatValue?: (value: number) => string;
  fillOpacity?: number;
  /** Show the value as a permanent label centred on each bubble. */
  showValues?: boolean;
}

function BubbleLayer({
  features,
  getValue,
  colorScale,
  radiusScale,
  metricLabel,
  formatValue = value => String(value),
  fillOpacity = 0.75,
  showValues = true,
}: BubbleLayerProps): React.ReactElement {
  return (
    <>
      {features.map(feature => {
        const value = getValue(feature);
        // Skip areas with no value — bubbles only where there is data.
        if (value === undefined || value === null || Number.isNaN(value)) {
          return null;
        }
        const [lat, lng] = getFeatureCenter(feature);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }
        return (
          // @ts-ignore - React 19 compatibility with react-leaflet
          <CircleMarker
            key={feature.id}
            center={[lat, lng]}
            {...({ radius: radiusScale(value) } as any)}
            pathOptions={{
              fillColor: colorScale(value),
              fillOpacity,
              color: '#ffffff',
              weight: 1,
            }}
          >
            {showValues && (
              // @ts-ignore - React 19 compatibility with react-leaflet
              <Tooltip
                permanent
                direction="center"
                className="dhis2-bubble-value-label"
              >
                {formatValue(value)}
              </Tooltip>
            )}
            {/* @ts-ignore - React 19 compatibility with react-leaflet */}
            <Popup>
              <strong>{feature.properties?.name}</strong>
              <br />
              {metricLabel ? `${metricLabel}: ` : ''}
              {formatValue(value)}
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default BubbleLayer;
