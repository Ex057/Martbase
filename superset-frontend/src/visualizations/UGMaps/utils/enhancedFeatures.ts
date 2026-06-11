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

import { BoundaryFeature } from '../types';

export interface ClusterConfig {
  enableClustering: boolean;
  clusterZoomLevel?: number;
  clusterRadius?: number;
}

export interface CustomSymbol {
  type: 'circle' | 'square' | 'triangle' | 'diamond' | 'star';
  color: string;
  size: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface Heat3DConfig {
  enable3D: boolean;
  extrusionFactor?: number;
  extrusionMin?: number;
  extrusionMax?: number;
}

export interface HeatMapConfig {
  enableHeatMap: boolean;
  radius?: number;
  maxZoom?: number;
  minOpacity?: number;
}

export interface OfflineCacheConfig {
  enableOfflineCache: boolean;
  maxCacheSize?: number;
  cacheDuration?: number;
}

export interface SplitViewConfig {
  enableSplitView: boolean;
  metric1?: string;
  metric2?: string;
  comparisonMode?: 'side-by-side' | 'overlay';
}

export interface PrintExportConfig {
  enablePrintExport: boolean;
  format?: 'png' | 'pdf' | 'svg';
  resolution?: number;
  includeScale?: boolean;
  includeLegend?: boolean;
}

export class ClusteringManager {
  static groupFeaturesByCluster(
    features: BoundaryFeature[],
    zoomLevel: number,
    clusterZoomLevel: number = 10,
  ): Map<string, BoundaryFeature[]> {
    if (zoomLevel >= clusterZoomLevel) {
      const clusters = new Map<string, BoundaryFeature[]>();
      features.forEach(feature => {
        clusters.set(feature.id, [feature]);
      });
      return clusters;
    }

    const clusters = new Map<string, BoundaryFeature[]>();

    features.forEach(feature => {
      const coords = feature.geometry.coordinates;
      let lat = 0;
      let lng = 0;

      if (feature.geometry.type === 'Point') {
        [lng, lat] = coords as [number, number];
      } else if (
        feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon'
      ) {
        const bounds = this.getBounds(feature);
        lat = (bounds.minLat + bounds.maxLat) / 2;
        lng = (bounds.minLng + bounds.maxLng) / 2;
      }

      const gridSize = 256 / Math.pow(2, zoomLevel);
      const clusterKey = `${Math.floor(lng / gridSize)}_${Math.floor(lat / gridSize)}`;

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push(feature);
    });

    return clusters;
  }

  static getBounds(feature: BoundaryFeature): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } {
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    const updateBounds = (coords: number[]) => {
      minLng = Math.min(minLng, coords[0]);
      maxLng = Math.max(maxLng, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLat = Math.max(maxLat, coords[1]);
    };

    const coords = feature.geometry.coordinates as any;

    if (feature.geometry.type === 'Point') {
      updateBounds(coords);
    } else if (feature.geometry.type === 'Polygon') {
      coords[0].forEach(updateBounds);
    } else if (feature.geometry.type === 'MultiPolygon') {
      coords.forEach((polygon: number[][][]) => {
        polygon[0].forEach(updateBounds);
      });
    }

    return { minLat, maxLat, minLng, maxLng };
  }
}

export class CustomSymbologyManager {
  static getSymbolSVG(symbol: CustomSymbol): string {
    const { type, color, size, borderColor = '#333', borderWidth = 1 } = symbol;

    const halfSize = size / 2;

    switch (type) {
      case 'circle':
        return `
          <circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - borderWidth}"
                  fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
        `;
      case 'square':
        return `
          <rect x="${borderWidth}" y="${borderWidth}"
                width="${size - borderWidth * 2}" height="${size - borderWidth * 2}"
                fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
        `;
      case 'triangle':
        return `
          <polygon points="${halfSize},${borderWidth} ${size - borderWidth},${size - borderWidth} ${borderWidth},${size - borderWidth}"
                   fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
        `;
      case 'diamond':
        return `
          <polygon points="${halfSize},${borderWidth} ${size - borderWidth},${halfSize} ${halfSize},${size - borderWidth} ${borderWidth},${halfSize}"
                   fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
        `;
      case 'star':
        const points = this.getStarPoints(
          halfSize,
          halfSize,
          halfSize - borderWidth,
          5,
        );
        return `
          <polygon points="${points}"
                   fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"/>
        `;
    }

    return '';
  }

  private static getStarPoints(
    cx: number,
    cy: number,
    radius: number,
    points: number,
  ): string {
    const result = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? radius : radius / 2;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      result.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return result.join(' ');
  }
}

export class Heat3DVisualizationManager {
  static calculateExtrusion(
    value: number,
    min: number,
    max: number,
    minHeight: number = 10,
    maxHeight: number = 100,
  ): number {
    if (max === min) {
      return minHeight;
    }
    return minHeight + ((value - min) / (max - min)) * (maxHeight - minHeight);
  }

  static generate3DGeometry(
    feature: BoundaryFeature,
    extrusionHeight: number,
  ): any {
    return {
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'Polygon',
        coordinates: feature.geometry.coordinates,
        height: extrusionHeight,
      },
    };
  }
}

export class HeatMapManager {
  static generateHeatmapPoints(
    features: BoundaryFeature[],
    valueMap: Map<string, number>,
    maxValue: number,
  ): Array<[number, number, number]> {
    const points: Array<[number, number, number]> = [];

    features.forEach(feature => {
      const value = valueMap.get(feature.id) || 0;
      const intensity = value / maxValue;

      const coords = feature.geometry.coordinates;
      let lat = 0;
      let lng = 0;

      if (feature.geometry.type === 'Point') {
        [lng, lat] = coords as [number, number];
      } else {
        const bounds = ClusteringManager.getBounds(feature);
        lat = (bounds.minLat + bounds.maxLat) / 2;
        lng = (bounds.minLng + bounds.maxLng) / 2;
      }

      points.push([lat, lng, intensity]);
    });

    return points;
  }
}

export class OfflineCacheManager {
  private static readonly DB_NAME = 'DHIS2MapCache';

  private static readonly STORE_NAME = 'boundaries';

  static async cacheBoundaries(
    databaseId: number,
    boundaryLevel: number,
    geojson: any,
  ): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);

    await store.put({
      key: `boundaries_${databaseId}_${boundaryLevel}`,
      data: geojson,
      timestamp: Date.now(),
    });
  }

  static async getCachedBoundaries(
    databaseId: number,
    boundaryLevel: number,
    maxAge: number = 24 * 60 * 60 * 1000,
  ): Promise<any | null> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);

      const key = `boundaries_${databaseId}_${boundaryLevel}`;
      const request = store.get(key);

      const result = await new Promise<
        { data: any; timestamp: number } | undefined
      >((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (result && Date.now() - result.timestamp < maxAge) {
        return result.data;
      }

      return null;
    } catch (error) {
      console.warn('Failed to get cached boundaries:', error);
      return null;
    }
  }

  static async clearCache(): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      await store.clear();
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }
}

export class PrintExportManager {
  static async exportAsImage(
    mapElement: HTMLElement,
    filename: string,
    format: 'png' | 'svg' = 'png',
  ): Promise<void> {
    try {
      const canvas = await this.getCanvasFromElement(mapElement);
      const link = document.createElement('a');
      link.href = canvas.toDataURL(`image/${format}`);
      link.download = `${filename}.${format}`;
      link.click();
    } catch (error) {
      console.error('Failed to export image:', error);
    }
  }

  static async exportAsPDF(
    mapElement: HTMLElement,
    filename: string,
  ): Promise<void> {
    try {
      const canvas = await this.getCanvasFromElement(mapElement);
      console.log(
        'PDF export requires external library. Using canvas image instead.',
      );
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${filename}.png`;
      link.click();
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  }

  private static async getCanvasFromElement(
    element: HTMLElement,
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const rect = element.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const svgElements = element.querySelectorAll('svg');
    svgElements.forEach(svg => {
      const svgRect = svg.getBoundingClientRect();
      const offsetX = svgRect.left - rect.left;
      const offsetY = svgRect.top - rect.top;

      const canvas2 = document.createElement('canvas');
      canvas2.width = svgRect.width;
      canvas2.height = svgRect.height;

      const data = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        const ctx2 = canvas2.getContext('2d');
        ctx2?.drawImage(img, 0, 0);
        // Draw the SVG canvas onto the main canvas at the correct position
        ctx.drawImage(canvas2, offsetX, offsetY);
      };
      img.src = `data:image/svg+xml;base64,${btoa(data)}`;
    });

    return canvas;
  }
}

export class AutoThemingManager {
  static getAutoTheme(
    dataValues: number[],
    colorScheme: string,
  ): {
    backgroundColor: string;
    textColor: string;
    accentColor: string;
  } {
    const avgValue = dataValues.reduce((a, b) => a + b, 0) / dataValues.length;
    const variance =
      dataValues.reduce((sum, val) => sum + Math.pow(val - avgValue, 2), 0) /
      dataValues.length;
    const stdDev = Math.sqrt(variance);

    const isDark = avgValue > variance;

    return {
      backgroundColor: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)',
      textColor: isDark ? '#fff' : '#333',
      accentColor: stdDev > avgValue ? '#ff7875' : '#52c41a',
    };
  }
}

export class SplitViewManager {
  static calculateSplitLayout(
    containerWidth: number,
    containerHeight: number,
  ): {
    leftMap: { x: number; y: number; width: number; height: number };
    rightMap: { x: number; y: number; width: number; height: number };
    divider: { x: number; y: number; width: number; height: number };
  } {
    const dividerWidth = 2;
    const mapWidth = (containerWidth - dividerWidth) / 2;

    return {
      leftMap: {
        x: 0,
        y: 0,
        width: mapWidth,
        height: containerHeight,
      },
      rightMap: {
        x: mapWidth + dividerWidth,
        y: 0,
        width: mapWidth,
        height: containerHeight,
      },
      divider: {
        x: mapWidth,
        y: 0,
        width: dividerWidth,
        height: containerHeight,
      },
    };
  }
}
