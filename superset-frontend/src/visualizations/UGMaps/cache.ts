const CACHE_PREFIX = 'dhis2_map_cache_';
const DEFAULT_TTL_HOURS = 4;
// Increment this version when cache structure or data format changes
// v2: Added geometry type auto-correction for MultiPolygon coordinates
// v3: Fixed MultiPolygon validation for Ankole/Kigezi regions
// v4: Added multi-level boundary support with level-specific styling
// v5: Added timeout handling and improved error messages
// v6: Added full color scheme support (categorical + sequential) like other charts
// v7: Enhanced sequential color schemes with proper choices/schemes, manual breaks/colors
// v8: Added auto-themed borders that derive border color from fill color
const CACHE_VERSION = 'v8';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  version?: string;
}

export class DHIS2MapCache {
  private static getKey(type: string, id: string): string {
    return `${CACHE_PREFIX}${type}_${id}`;
  }

  private static isExpired(entry: CacheEntry<unknown>): boolean {
    const now = Date.now();
    const age = (now - entry.timestamp) / (1000 * 60 * 60);
    return age > entry.ttl;
  }

  private static isOutdatedVersion(entry: CacheEntry<unknown>): boolean {
    return entry.version !== CACHE_VERSION;
  }

  static set<T>(
    type: string,
    id: string,
    data: T,
    ttlHours: number = DEFAULT_TTL_HOURS,
  ): void {
    try {
      const key = this.getKey(type, id);
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlHours,
        version: CACHE_VERSION,
      };
      localStorage.setItem(key, JSON.stringify(entry));
      // eslint-disable-next-line no-console
      console.log(
        `[DHIS2MapCache] Cached ${type}/${id} for ${ttlHours}h (${CACHE_VERSION})`,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DHIS2MapCache] Failed to cache data:', e);
    }
  }

  static get<T>(type: string, id: string): T | null {
    try {
      const key = this.getKey(type, id);
      const cached = localStorage.getItem(key);

      if (!cached) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);

      // Check for outdated cache version (e.g., geometry type fixes)
      if (this.isOutdatedVersion(entry)) {
        localStorage.removeItem(key);
        // eslint-disable-next-line no-console
        console.log(
          `[DHIS2MapCache] Cache outdated for ${type}/${id} (was ${entry.version || 'v1'}, need ${CACHE_VERSION})`,
        );
        return null;
      }

      if (this.isExpired(entry)) {
        localStorage.removeItem(key);
        // eslint-disable-next-line no-console
        console.log(`[DHIS2MapCache] Cache expired for ${type}/${id}`);
        return null;
      }

      // eslint-disable-next-line no-console
      console.log(`[DHIS2MapCache] Cache hit for ${type}/${id}`);
      return entry.data;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DHIS2MapCache] Failed to retrieve cache:', e);
      return null;
    }
  }

  static invalidate(type: string, id: string): void {
    try {
      const key = this.getKey(type, id);
      localStorage.removeItem(key);
      // eslint-disable-next-line no-console
      console.log(`[DHIS2MapCache] Invalidated cache for ${type}/${id}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DHIS2MapCache] Failed to invalidate cache:', e);
    }
  }

  static invalidateAll(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      // eslint-disable-next-line no-console
      console.log('[DHIS2MapCache] Cleared all caches');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DHIS2MapCache] Failed to clear caches:', e);
    }
  }

  static getCacheStats(): { total: number; types: Record<string, number> } {
    try {
      const keys = Object.keys(localStorage);
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      const types: Record<string, number> = {};

      cacheKeys.forEach(key => {
        const type = key.replace(CACHE_PREFIX, '').split('_')[0];
        types[type] = (types[type] || 0) + 1;
      });

      return { total: cacheKeys.length, types };
    } catch (e) {
      return { total: 0, types: {} };
    }
  }
}
