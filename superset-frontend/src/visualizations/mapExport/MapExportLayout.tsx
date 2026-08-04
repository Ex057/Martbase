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

import type { ReactElement } from 'react';
import { t } from '@superset-ui/core';
import { ScaleBar } from './scaleBar';
import { MapExportSpec } from './types';

/* eslint-disable theme-colors/no-literal-colors */

/** Map frame and sidebar sizes in CSS px, before `LAYOUT_SCALE`. */
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 900;
export const SIDEBAR_WIDTH = 380;
export const LAYOUT_WIDTH = MAP_WIDTH + SIDEBAR_WIDTH;
export const LAYOUT_HEIGHT = MAP_HEIGHT;

/** Rasterisation factor for the whole layout — 1580x900 becomes 3160x1800. */
export const LAYOUT_SCALE = 2;

/**
 * The viz's compass is sized for an on-screen map; at export resolution it
 * would be a speck, so the whole map-frame coordinate space is scaled up around
 * its top-left corner (where the compass is anchored).
 */
const COMPASS_SCALE = 1.9;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Basemap attribution comes from the tile-layer config as a small HTML string
 * (`&copy; OpenStreetMap &copy; CARTO`). Render it as text rather than markup.
 */
export function attributionToText(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
}

function Swatch({ color }: { color: string }): ReactElement {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        minWidth: 26,
        background: color,
        border: '1px solid rgba(15,23,42,0.3)',
        borderRadius: 3,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Outlined-district glyph for the organisation-unit key, matching the DHIS2
 * export. Stroke-only: a boundary level is a line style, not a fill.
 */
function OutlineSwatch({
  color,
  width,
}: {
  color: string;
  width: number;
}): ReactElement {
  return (
    <svg
      width="26"
      height="20"
      viewBox="0 0 26 20"
      fill="none"
      aria-hidden="true"
      style={{ minWidth: 26, flexShrink: 0 }}
    >
      <path
        d="M3 6.5 8.5 2.5 15 3.5 23 2.5 22 9.5 23.5 16 15.5 17.5 7 16.5 2 12Z"
        stroke={color}
        strokeWidth={Math.max(width, 1.2)}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScaleBarBadge({ bar }: { bar: ScaleBar }): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: 20,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 3,
      }}
    >
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#1e293b',
          textShadow: '0 0 3px rgba(255,255,255,0.95)',
          lineHeight: 1,
        }}
      >
        {bar.label}
      </span>
      <span
        style={{
          display: 'block',
          width: bar.widthPx,
          height: 6,
          borderLeft: '2px solid #1e293b',
          borderRight: '2px solid #1e293b',
          borderBottom: '2px solid #1e293b',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export interface MapExportLayoutProps {
  spec: MapExportSpec;
  /** Cropped map raster, as a data URL. */
  mapImage: string;
  scaleBar: ScaleBar | null;
}

/**
 * Title, subtitle and legend, in a clean panel beside the map — the same
 * arrangement DHIS2 uses for its map exports.
 */
function SidePanel({ spec }: { spec: MapExportSpec }): ReactElement {
  const hasLevels = Boolean(spec.levelItems?.length);

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        height: MAP_HEIGHT,
        padding: '40px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        background: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {(spec.title || spec.subtitle) && (
        <div>
          {spec.title && (
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.2,
                color: '#0f172a',
              }}
            >
              {spec.title}
            </div>
          )}
          {spec.subtitle && (
            <div
              style={{
                marginTop: 10,
                fontSize: 16,
                lineHeight: 1.4,
                color: '#64748b',
              }}
            >
              {spec.subtitle}
            </div>
          )}
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            lineHeight: 1.3,
            color: '#0f172a',
          }}
        >
          {spec.metricName}
        </div>
        {spec.periodLabel && (
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.3,
              color: '#64748b',
              marginTop: 4,
            }}
          >
            {spec.periodLabel}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 16,
          }}
        >
          {spec.legendItems.map(item => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 17,
                lineHeight: 1.3,
                color: '#1e293b',
              }}
            >
              <Swatch color={item.color} />
              <span>
                {item.label}
                {typeof item.count === 'number' && ` (${item.count})`}
              </span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 17,
              lineHeight: 1.3,
              color: '#64748b',
            }}
          >
            <Swatch color={spec.noDataColor} />
            <span>{t('No data')}</span>
          </div>
        </div>
      </div>

      {hasLevels && (
        <div>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              marginBottom: 16,
              color: '#0f172a',
            }}
          >
            {spec.levelsHeading || t('Boundary Levels')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {spec.levelItems?.map(level => (
              <div
                key={level.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  fontSize: 17,
                  lineHeight: 1.3,
                  color: '#1e293b',
                }}
              >
                <OutlineSwatch color={level.color} width={level.width} />
                <span>{level.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The cropped map, with the compass, scale bar and attribution over it. */
function MapFrame({
  spec,
  mapImage,
  scaleBar,
}: MapExportLayoutProps): ReactElement {
  const attribution = spec.attributionHtml
    ? attributionToText(spec.attributionHtml)
    : '';

  return (
    <div
      style={{
        position: 'relative',
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        overflow: 'hidden',
        background: spec.backgroundColor || '#ffffff',
        flexShrink: 0,
      }}
    >
      <img
        src={mapImage}
        alt=""
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {spec.compassNode && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            transform: `scale(${COMPASS_SCALE})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          {spec.compassNode}
        </div>
      )}
      {scaleBar && <ScaleBarBadge bar={scaleBar} />}
      {attribution && (
        <div
          style={{
            position: 'absolute',
            right: 20,
            bottom: 16,
            fontSize: 13,
            color: '#475569',
            textShadow: '0 0 3px rgba(255,255,255,0.95)',
          }}
        >
          {attribution}
        </div>
      )}
    </div>
  );
}

/**
 * The composed print layout: map on the left, title, subtitle and legend in a
 * panel on the right, with the compass, scale bar and attribution sitting
 * inside the map frame — the arrangement of a DHIS2 map export.
 */
function MapExportLayout(props: MapExportLayoutProps): ReactElement {
  return (
    <div
      style={{
        width: LAYOUT_WIDTH,
        height: LAYOUT_HEIGHT,
        display: 'flex',
        background: '#ffffff',
        fontFamily: FONT_STACK,
        color: '#0f172a',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <MapFrame {...props} />
      <SidePanel spec={props.spec} />
    </div>
  );
}

/* eslint-enable theme-colors/no-literal-colors */

export default MapExportLayout;
