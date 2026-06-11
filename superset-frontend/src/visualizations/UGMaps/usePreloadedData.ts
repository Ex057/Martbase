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
 * React hook for using the DHIS2 data preloader
 *
 * Provides:
 * - Automatic data prefetching
 * - Cache status indicators
 * - Background refresh capability
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getDataPreloader, PreloadState } from './dataPreloader';

interface UsePreloadedDataOptions {
  /** Dataset ID to preload */
  datasetId?: number;
  /** Form data for the query */
  formData?: Record<string, any>;
  /** Whether to enable preloading */
  enabled?: boolean;
  /** Force refresh even if cached */
  forceRefresh?: boolean;
  /** Callback when data is loaded */
  onDataLoaded?: (data: any[], fromCache: boolean) => void;
}

interface UsePreloadedDataResult {
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether data was served from cache */
  fromCache: boolean;
  /** Whether the cached data is stale (being refreshed in background) */
  isStale: boolean;
  /** Current preload status */
  status: PreloadState;
  /** Preloaded data */
  data: any[] | null;
  /** Column names */
  columns: string[];
  /** Error message if any */
  error: string | null;
  /** Function to manually trigger refresh */
  refresh: () => Promise<void>;
  /** Function to prefetch related datasets */
  prefetchRelated: (
    datasets: Array<{ id: number; formData: Record<string, any> }>,
  ) => void;
}

export function usePreloadedData(
  options: UsePreloadedDataOptions,
): UsePreloadedDataResult {
  const {
    datasetId,
    formData,
    enabled = true,
    forceRefresh = false,
    onDataLoaded,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [data, setData] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PreloadState>({
    status: 'idle',
    progress: 0,
  });

  const preloader = useRef(getDataPreloader());
  const loadingRef = useRef(false);
  const lastKeyRef = useRef<string>('');

  // Generate a stable key for the request
  const requestKey =
    datasetId && formData
      ? `${datasetId}_${JSON.stringify(formData).slice(0, 50)}`
      : '';

  // Load data function
  const loadData = useCallback(
    async (force = false) => {
      if (!datasetId || !formData || !enabled) {
        return;
      }

      // Prevent duplicate loads
      if (loadingRef.current && !force) {
        return;
      }

      loadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        console.log(`[usePreloadedData] Loading dataset ${datasetId}...`);

        const result = await preloader.current.getDataWithSWR(
          datasetId,
          formData,
          force || forceRefresh,
        );

        setData(result.data);
        setColumns(result.columns);
        setFromCache(result.fromCache);
        setIsStale(result.isStale);

        if (result.fromCache) {
          console.log(
            `[usePreloadedData] Served ${result.data.length} rows from cache${result.isStale ? ' (stale)' : ''}`,
          );
        } else {
          console.log(
            `[usePreloadedData] Fetched ${result.data.length} rows from API`,
          );
        }

        if (onDataLoaded) {
          onDataLoaded(result.data, result.fromCache);
        }
      } catch (err: any) {
        console.error('[usePreloadedData] Failed to load data:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    },
    [datasetId, formData, enabled, forceRefresh, onDataLoaded],
  );

  // Update status periodically
  useEffect(() => {
    if (!datasetId || !formData) return undefined;

    const updateStatus = () => {
      const currentStatus = preloader.current.getPreloadStatus(
        datasetId,
        formData,
      );
      setStatus(currentStatus);
    };

    const interval = setInterval(updateStatus, 500);
    updateStatus();

    return () => clearInterval(interval);
  }, [datasetId, formData]);

  // Load data when dependencies change
  useEffect(() => {
    if (requestKey && requestKey !== lastKeyRef.current) {
      lastKeyRef.current = requestKey;
      loadData();
    }
  }, [requestKey, loadData]);

  // Refresh function
  const refresh = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  // Prefetch related datasets
  const prefetchRelated = useCallback(
    (datasets: Array<{ id: number; formData: Record<string, any> }>) => {
      datasets.forEach(({ id, formData: fd }) => {
        preloader.current.queuePreload({
          datasetId: id,
          formData: fd,
          priority: 'low',
        });
      });
    },
    [],
  );

  return {
    isLoading,
    fromCache,
    isStale,
    status,
    data,
    columns,
    error,
    refresh,
    prefetchRelated,
  };
}

/**
 * Hook for prefetching multiple datasets on mount
 * Useful for dashboards to preload all chart data
 */
export function usePrefetchDatasets(
  datasets: Array<{ id: number; formData: Record<string, any> }>,
  enabled = true,
): void {
  const preloader = useRef(getDataPreloader());

  useEffect(() => {
    if (!enabled || datasets.length === 0) return;

    console.log(
      `[usePrefetchDatasets] Prefetching ${datasets.length} datasets...`,
    );

    datasets.forEach(({ id, formData }, index) => {
      // Stagger the requests slightly to avoid overwhelming the server
      setTimeout(() => {
        preloader.current.queuePreload({
          datasetId: id,
          formData,
          priority: index < 3 ? 'high' : 'normal', // First 3 are high priority
        });
      }, index * 100);
    });
  }, [datasets, enabled]);
}

/**
 * Hook to get cache statistics
 */
export function useCacheStats(): {
  stats: {
    totalEntries: number;
    totalSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } | null;
  clearCache: () => Promise<void>;
  isLoading: boolean;
} {
  const [stats, setStats] = useState<{
    totalEntries: number;
    totalSizeMB: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const preloader = useRef(getDataPreloader());

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      const cacheStats = await preloader.current.getCacheStats();
      setStats(cacheStats);
      setIsLoading(false);
    };
    loadStats();
  }, []);

  const clearCache = useCallback(async () => {
    await preloader.current.clearCache();
    setStats({
      totalEntries: 0,
      totalSizeMB: 0,
      oldestEntry: null,
      newestEntry: null,
    });
  }, []);

  return { stats, clearCache, isLoading };
}
