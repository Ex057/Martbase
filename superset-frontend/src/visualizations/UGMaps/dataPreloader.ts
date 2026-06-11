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
 * DHIS2 Data Preloader
 *
 * Background data loading service that pre-fetches DHIS2 data
 * to improve chart loading times. Features:
 *
 * 1. Background queuing - datasets are fetched in the background
 * 2. Priority queue - frequently accessed data is prioritized
 * 3. IndexedDB storage - larger datasets cached locally
 * 4. Stale-while-revalidate - serve cached data while refreshing
 */

import { SupersetClient } from '@superset-ui/core';

// Cache configuration
const CACHE_DB_NAME = 'dhis2_data_cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'datasets';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CACHE_SIZE_MB = 50; // Maximum cache size in MB

interface CachedDataset {
  key: string;
  data: any[];
  columns: string[];
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  sizeBytes: number;
}

interface PreloadRequest {
  datasetId: number;
  formData: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
  callback?: (data: any) => void;
}

type PreloadStatus = 'idle' | 'loading' | 'success' | 'error';

interface PreloadState {
  status: PreloadStatus;
  progress: number;
  error?: string;
}

class DHIS2DataPreloader {
  private db: IDBDatabase | null = null;

  private queue: PreloadRequest[] = [];

  private isProcessing = false;

  private preloadStates: Map<string, PreloadState> = new Map();

  private abortControllers: Map<string, AbortController> = new Map();

  constructor() {
    this.initDB();
  }

  /**
   * Initialize IndexedDB for data caching
   */
  private async initDB(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      console.warn('[DHIS2Preloader] IndexedDB not available');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

      request.onerror = () => {
        console.error('[DHIS2Preloader] Failed to open IndexedDB');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[DHIS2Preloader] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          const store = db.createObjectStore(CACHE_STORE_NAME, {
            keyPath: 'key',
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccess', 'lastAccess', { unique: false });
          store.createIndex('accessCount', 'accessCount', { unique: false });
        }
      };
    });
  }

  /**
   * Generate a unique cache key for a dataset request
   */
  private generateCacheKey(
    datasetId: number,
    formData: Record<string, any>,
  ): string {
    const relevantParams = {
      datasetId,
      filters: formData.filters || [],
      columns: formData.columns || [],
      metrics: formData.metrics || [],
      time_range: formData.time_range,
      granularity: formData.granularity_sqla,
    };
    return `dataset_${datasetId}_${btoa(JSON.stringify(relevantParams)).slice(0, 32)}`;
  }

  /**
   * Get cached data from IndexedDB
   */
  async getCached(
    datasetId: number,
    formData: Record<string, any>,
  ): Promise<CachedDataset | null> {
    if (!this.db) return null;

    const key = this.generateCacheKey(datasetId, formData);

    return new Promise(resolve => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const cached = request.result as CachedDataset | undefined;

        if (!cached) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() - cached.timestamp > cached.ttl) {
          console.log(`[DHIS2Preloader] Cache expired for ${key}`);
          // Don't delete - will be refreshed in background
          resolve({ ...cached, expired: true } as any);
          return;
        }

        // Update access stats
        cached.accessCount += 1;
        cached.lastAccess = Date.now();
        store.put(cached);

        console.log(
          `[DHIS2Preloader] Cache hit for ${key} (${cached.data.length} rows)`,
        );
        resolve(cached);
      };

      request.onerror = () => {
        console.warn('[DHIS2Preloader] Failed to read from cache');
        resolve(null);
      };
    });
  }

  /**
   * Store data in IndexedDB cache
   */
  private async setCache(
    datasetId: number,
    formData: Record<string, any>,
    data: any[],
    columns: string[],
  ): Promise<void> {
    if (!this.db) return;

    const key = this.generateCacheKey(datasetId, formData);
    const sizeBytes = new Blob([JSON.stringify(data)]).size;

    // Check cache size and evict if needed
    await this.evictIfNeeded(sizeBytes);

    const cached: CachedDataset = {
      key,
      data,
      columns,
      timestamp: Date.now(),
      ttl: CACHE_TTL_MS,
      accessCount: 1,
      lastAccess: Date.now(),
      sizeBytes,
    };

    return new Promise(resolve => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      store.put(cached);

      transaction.oncomplete = () => {
        console.log(
          `[DHIS2Preloader] Cached ${data.length} rows (${(sizeBytes / 1024).toFixed(1)} KB) for ${key}`,
        );
        resolve();
      };

      transaction.onerror = () => {
        console.warn('[DHIS2Preloader] Failed to cache data');
        resolve();
      };
    });
  }

  /**
   * Evict old/least used cache entries if over size limit
   */
  private async evictIfNeeded(newDataSize: number): Promise<void> {
    if (!this.db) return;

    return new Promise(resolve => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allCached = request.result as CachedDataset[];
        const totalSize = allCached.reduce((sum, c) => sum + c.sizeBytes, 0);
        const maxSize = MAX_CACHE_SIZE_MB * 1024 * 1024;

        if (totalSize + newDataSize <= maxSize) {
          resolve();
          return;
        }

        // Sort by last access (oldest first) and access count (least used first)
        allCached.sort((a, b) => {
          const scoreA = a.accessCount * 0.3 + a.lastAccess * 0.7;
          const scoreB = b.accessCount * 0.3 + b.lastAccess * 0.7;
          return scoreA - scoreB;
        });

        // Evict entries until we have enough space
        let freedSpace = 0;
        const targetFree = newDataSize + maxSize * 0.1; // Free 10% extra

        for (const entry of allCached) {
          if (totalSize - freedSpace + newDataSize <= maxSize - targetFree) {
            break;
          }
          store.delete(entry.key);
          freedSpace += entry.sizeBytes;
          console.log(`[DHIS2Preloader] Evicted ${entry.key}`);
        }

        resolve();
      };

      request.onerror = () => resolve();
    });
  }

  /**
   * Add a dataset to the preload queue
   */
  queuePreload(request: PreloadRequest): void {
    const key = this.generateCacheKey(request.datasetId, request.formData);

    // Check if already in queue
    const existingIndex = this.queue.findIndex(
      r => this.generateCacheKey(r.datasetId, r.formData) === key,
    );

    if (existingIndex !== -1) {
      // Update priority if higher
      if (
        request.priority === 'high' &&
        this.queue[existingIndex].priority !== 'high'
      ) {
        this.queue[existingIndex].priority = 'high';
      }
      return;
    }

    // Add to queue based on priority
    if (request.priority === 'high') {
      this.queue.unshift(request);
    } else if (request.priority === 'low') {
      this.queue.push(request);
    } else {
      // Insert after high priority items
      const insertIndex = this.queue.findIndex(r => r.priority !== 'high');
      this.queue.splice(
        insertIndex === -1 ? this.queue.length : insertIndex,
        0,
        request,
      );
    }

    this.preloadStates.set(key, { status: 'idle', progress: 0 });

    console.log(
      `[DHIS2Preloader] Queued dataset ${request.datasetId} (${request.priority} priority)`,
    );

    // Start processing if not already
    this.processQueue();
  }

  /**
   * Process the preload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      const key = this.generateCacheKey(request.datasetId, request.formData);

      try {
        this.preloadStates.set(key, { status: 'loading', progress: 0 });

        const data = await this.fetchDataset(request);

        this.preloadStates.set(key, { status: 'success', progress: 100 });

        if (request.callback) {
          request.callback(data);
        }
      } catch (error: any) {
        console.error(
          `[DHIS2Preloader] Failed to preload dataset ${request.datasetId}:`,
          error,
        );
        this.preloadStates.set(key, {
          status: 'error',
          progress: 0,
          error: error.message,
        });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Fetch dataset from API
   */
  private async fetchDataset(request: PreloadRequest): Promise<any> {
    const { datasetId, formData } = request;
    const key = this.generateCacheKey(datasetId, formData);

    // Create abort controller for this request
    const abortController = new AbortController();
    this.abortControllers.set(key, abortController);

    try {
      console.log(`[DHIS2Preloader] Fetching dataset ${datasetId}...`);

      const response = await SupersetClient.post({
        endpoint: `/api/v1/chart/data`,
        jsonPayload: {
          datasource: { id: datasetId, type: 'table' },
          queries: [
            {
              ...formData,
              row_limit: formData.row_limit || 10000,
            },
          ],
        },
        signal: abortController.signal,
      });

      const result = response.json?.result?.[0];

      if (result?.data) {
        const columns = Object.keys(result.data[0] || {});
        await this.setCache(datasetId, formData, result.data, columns);

        console.log(
          `[DHIS2Preloader] Dataset ${datasetId} loaded: ${result.data.length} rows`,
        );

        return {
          data: result.data,
          columns,
          fromCache: false,
        };
      }

      return { data: [], columns: [], fromCache: false };
    } finally {
      this.abortControllers.delete(key);
    }
  }

  /**
   * Get data with stale-while-revalidate pattern
   * Returns cached data immediately if available, while refreshing in background
   */
  async getDataWithSWR(
    datasetId: number,
    formData: Record<string, any>,
    forceRefresh = false,
  ): Promise<{
    data: any[];
    columns: string[];
    fromCache: boolean;
    isStale: boolean;
  }> {
    const cached = await this.getCached(datasetId, formData);
    const isExpired = cached && (cached as any).expired;

    // If we have valid cached data and not forcing refresh
    if (cached && !forceRefresh && !isExpired) {
      return {
        data: cached.data,
        columns: cached.columns,
        fromCache: true,
        isStale: false,
      };
    }

    // If we have stale cached data, return it but queue refresh
    if (cached && isExpired) {
      // Queue background refresh
      this.queuePreload({
        datasetId,
        formData,
        priority: 'low',
      });

      return {
        data: cached.data,
        columns: cached.columns,
        fromCache: true,
        isStale: true,
      };
    }

    // No cache, fetch directly with high priority
    const result = await this.fetchDataset({
      datasetId,
      formData,
      priority: 'high',
    });

    return {
      ...result,
      isStale: false,
    };
  }

  /**
   * Cancel a pending preload request
   */
  cancelPreload(datasetId: number, formData: Record<string, any>): void {
    const key = this.generateCacheKey(datasetId, formData);

    // Remove from queue
    this.queue = this.queue.filter(
      r => this.generateCacheKey(r.datasetId, r.formData) !== key,
    );

    // Abort in-flight request
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }

    this.preloadStates.delete(key);
  }

  /**
   * Get preload status for a dataset
   */
  getPreloadStatus(
    datasetId: number,
    formData: Record<string, any>,
  ): PreloadState {
    const key = this.generateCacheKey(datasetId, formData);
    return this.preloadStates.get(key) || { status: 'idle', progress: 0 };
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    if (!this.db) return;

    return new Promise(resolve => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      store.clear();

      transaction.oncomplete = () => {
        console.log('[DHIS2Preloader] Cache cleared');
        resolve();
      };

      transaction.onerror = () => resolve();
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalEntries: number;
    totalSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    if (!this.db) {
      return {
        totalEntries: 0,
        totalSizeMB: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }

    return new Promise(resolve => {
      const transaction = this.db!.transaction([CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CACHE_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const allCached = request.result as CachedDataset[];

        if (allCached.length === 0) {
          resolve({
            totalEntries: 0,
            totalSizeMB: 0,
            oldestEntry: null,
            newestEntry: null,
          });
          return;
        }

        const totalSize = allCached.reduce((sum, c) => sum + c.sizeBytes, 0);
        const timestamps = allCached.map(c => c.timestamp);

        resolve({
          totalEntries: allCached.length,
          totalSizeMB: totalSize / (1024 * 1024),
          oldestEntry: new Date(Math.min(...timestamps)),
          newestEntry: new Date(Math.max(...timestamps)),
        });
      };

      request.onerror = () =>
        resolve({
          totalEntries: 0,
          totalSizeMB: 0,
          oldestEntry: null,
          newestEntry: null,
        });
    });
  }
}

// Singleton instance
let preloaderInstance: DHIS2DataPreloader | null = null;

export function getDataPreloader(): DHIS2DataPreloader {
  if (!preloaderInstance) {
    preloaderInstance = new DHIS2DataPreloader();
  }
  return preloaderInstance;
}

export { DHIS2DataPreloader, PreloadRequest, PreloadState, CachedDataset };
