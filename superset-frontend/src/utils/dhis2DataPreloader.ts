import { SupersetClient } from '@superset-ui/core';

interface PreloadRequest {
  datasetId: number;
  databaseId: number;
  sql: string;
}

interface PreloadProgress {
  datasetId: number;
  status: 'pending' | 'loading' | 'complete' | 'error';
  progress: number;
  error?: string;
}

class DHIS2DataPreloader {
  private preloadQueue: Map<number, PreloadRequest> = new Map();
  private preloadProgress: Map<number, PreloadProgress> = new Map();
  private loadingTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private readonly MAX_CONCURRENT = 2;
  private readonly PRELOAD_DELAY_MS = 500;
  private activeLoads = 0;

  preloadDataset(
    datasetId: number,
    databaseId: number,
    sql: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.preloadQueue.set(datasetId, { datasetId, databaseId, sql });
      this.preloadProgress.set(datasetId, {
        datasetId,
        status: 'pending',
        progress: 0,
      });

      if (this.loadingTimeouts.has(datasetId)) {
        clearTimeout(this.loadingTimeouts.get(datasetId)!);
      }

      const timeout = setTimeout(() => {
        this.processQueue().finally(() => resolve());
      }, this.PRELOAD_DELAY_MS);

      this.loadingTimeouts.set(datasetId, timeout);
    });
  }

  private async processQueue(): Promise<void> {
    while (this.preloadQueue.size > 0 && this.activeLoads < this.MAX_CONCURRENT) {
      const [datasetId, request] = Array.from(this.preloadQueue.entries())[0];
      this.preloadQueue.delete(datasetId);

      this.activeLoads += 1;
      const progress = this.preloadProgress.get(datasetId);
      if (progress) {
        progress.status = 'loading';
        progress.progress = 25;
      }

      try {
        await this.preloadDHIS2Data(request);
        const current = this.preloadProgress.get(datasetId);
        if (current) {
          current.status = 'complete';
          current.progress = 100;
        }
        setTimeout(() => {
          this.preloadProgress.delete(datasetId);
        }, 30 * 60 * 1000);
      } catch (error) {
        const current = this.preloadProgress.get(datasetId);
        if (current) {
          current.status = 'error';
          current.error = String(error);
          current.progress = 0;
        }
        // eslint-disable-next-line no-console
        console.warn(`[DHIS2 Preloader] Failed to preload dataset ${datasetId}:`, error);
      } finally {
        this.activeLoads -= 1;
        setImmediate(() => this.processQueue());
      }
    }
  }

  private async preloadDHIS2Data(request: PreloadRequest): Promise<void> {
    const { datasetId, databaseId, sql } = request;

    try {
      const cacheKey = `dhis2_preload_${datasetId}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        // eslint-disable-next-line no-console
        console.log(`[DHIS2 Preloader] Using cached data for dataset ${datasetId}`);
        return;
      }

      const progress = this.preloadProgress.get(datasetId);
      if (progress) progress.progress = 20;

      // eslint-disable-next-line no-console
      console.log(`[DHIS2 Preloader] 🚀 Starting background preload for dataset ${datasetId}`);

      // Use longer timeout for background preloading (5 minutes)
      // This runs in the background while the user configures the chart
      const response = await SupersetClient.post({
        endpoint: `/api/v1/database/${databaseId}/dhis2_chart_data/`,
        jsonPayload: {
          sql,
          limit: 50000, // Preload more data since this is background
        },
        timeout: 300000, // 5 minutes for background preload
      });

      if (progress) progress.progress = 80;

      const data = response.json;
      if (data && data.data) {
        this.cacheData(cacheKey, {
          data: data.data,
          columns: data.columns,
          total: data.total || data.data.length,
          timestamp: Date.now(),
        });

        if (progress) progress.progress = 100;
        // eslint-disable-next-line no-console
        console.log(
          `[DHIS2 Preloader] ✅ Preloaded ${data.data?.length || 0} rows for dataset ${datasetId}`,
        );
      }
    } catch (error) {
      if ((error as any)?.status === 408 || (error as any)?.message?.includes('timeout')) {
        // eslint-disable-next-line no-console
        console.warn(`[DHIS2 Preloader] Preload timeout for dataset ${datasetId} (background operation)`);
        // Don't throw for timeout - this is a background operation
      } else {
        throw error;
      }
    }
  }

  private getCachedData(key: string): any {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const data = JSON.parse(cached);
      // 4 hour cache for preloaded DHIS2 data
      const MAX_CACHE_AGE = 4 * 60 * 60 * 1000;
      if (Date.now() - data.timestamp > MAX_CACHE_AGE) {
        localStorage.removeItem(key);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Get preloaded data for a dataset if available
   */
  getPreloadedData(datasetId: number): any {
    const cacheKey = `dhis2_preload_${datasetId}`;
    return this.getCachedData(cacheKey);
  }

  /**
   * Check if dataset data is ready (either cached or loaded)
   */
  isDataReady(datasetId: number): boolean {
    const cached = this.getPreloadedData(datasetId);
    if (cached) return true;

    const progress = this.preloadProgress.get(datasetId);
    return progress?.status === 'complete';
  }

  private cacheData(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Storage might be full, silently ignore
    }
  }

  getProgress(datasetId: number): PreloadProgress | undefined {
    return this.preloadProgress.get(datasetId);
  }

  clearCache(datasetId?: number): void {
    if (datasetId) {
      const key = `dhis2_preload_${datasetId}`;
      localStorage.removeItem(key);
      this.preloadProgress.delete(datasetId);
    } else {
      this.preloadProgress.clear();
      try {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.startsWith('dhis2_preload_')) {
            localStorage.removeItem(key);
          }
        });
      } catch {
        // Ignore errors
      }
    }
  }
}

export const dhis2DataPreloader = new DHIS2DataPreloader();

export default DHIS2DataPreloader;
