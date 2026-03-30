# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
DHIS2 Caching Layer

Provides a caching adapter between Superset and DHIS2 API to dramatically
improve loading times. Features:

1. Per-dataset caching with configurable TTL
2. Cache key generation based on query parameters
3. Background cache warming support
4. Multiple backend support (Redis, FileSystem, Memory)

Usage:
    cache = DHIS2CacheService.get_instance()

    # Check cache first
    cached_data = cache.get(endpoint, params)
    if cached_data:
        return cached_data

    # Fetch from DHIS2 and cache
    data = fetch_from_dhis2(endpoint, params)
    cache.set(endpoint, params, data)
    return data
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import pickle
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class CacheBackend:
    """Abstract cache backend interface"""

    def get(self, key: str) -> Optional[Any]:
        raise NotImplementedError

    def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        raise NotImplementedError

    def delete(self, key: str) -> bool:
        raise NotImplementedError

    def clear_pattern(self, pattern: str) -> int:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class RedisCacheBackend(CacheBackend):
    """Redis-based cache backend for production use"""

    def __init__(self, redis_url: str = "redis://localhost:6379/1"):
        try:
            import redis
            self._redis = redis.from_url(redis_url, decode_responses=False)
            self._redis.ping()  # Test connection
            logger.info(f"[DHIS2 Cache] Redis backend connected: {redis_url}")
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis connection failed: {e}, falling back to memory")
            self._redis = None

    @property
    def is_available(self) -> bool:
        return self._redis is not None

    def get(self, key: str) -> Optional[Any]:
        if not self._redis:
            return None
        try:
            data = self._redis.get(key)
            if data:
                return pickle.loads(data)
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis get error: {e}")
        return None

    def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        if not self._redis:
            return False
        try:
            data = pickle.dumps(value)
            return self._redis.setex(key, ttl, data)
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis set error: {e}")
            return False

    def delete(self, key: str) -> bool:
        if not self._redis:
            return False
        try:
            return self._redis.delete(key) > 0
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis delete error: {e}")
            return False

    def clear_pattern(self, pattern: str) -> int:
        if not self._redis:
            return 0
        try:
            keys = self._redis.keys(pattern)
            if keys:
                return self._redis.delete(*keys)
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis clear pattern error: {e}")
        return 0

    def exists(self, key: str) -> bool:
        if not self._redis:
            return False
        try:
            return self._redis.exists(key) > 0
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] Redis exists error: {e}")
            return False


class FileSystemCacheBackend(CacheBackend):
    """File system cache backend for development/small deployments"""

    def __init__(self, cache_dir: str = None):
        if cache_dir is None:
            # Default to superset_home/dhis2_cache
            base_dir = Path(__file__).parent.parent.parent / "superset_home" / "dhis2_cache"
        else:
            base_dir = Path(cache_dir)

        self._cache_dir = base_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"[DHIS2 Cache] FileSystem backend initialized: {self._cache_dir}")

    def _get_path(self, key: str) -> Path:
        # Use hash to avoid filesystem issues with special characters
        key_hash = hashlib.md5(key.encode()).hexdigest()
        return self._cache_dir / f"{key_hash}.cache"

    def _get_meta_path(self, key: str) -> Path:
        key_hash = hashlib.md5(key.encode()).hexdigest()
        return self._cache_dir / f"{key_hash}.meta"

    def get(self, key: str) -> Optional[Any]:
        path = self._get_path(key)
        meta_path = self._get_meta_path(key)

        if not path.exists() or not meta_path.exists():
            return None

        try:
            # Check TTL
            with open(meta_path, 'r') as f:
                meta = json.load(f)

            if time.time() > meta.get('expires', 0):
                # Expired - clean up
                path.unlink(missing_ok=True)
                meta_path.unlink(missing_ok=True)
                return None

            # Load data
            with open(path, 'rb') as f:
                return pickle.load(f)
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] FileSystem get error: {e}")
            return None

    def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        path = self._get_path(key)
        meta_path = self._get_meta_path(key)

        try:
            # Save data
            with open(path, 'wb') as f:
                pickle.dump(value, f)

            # Save metadata
            meta = {
                'key': key,
                'created': time.time(),
                'expires': time.time() + ttl,
                'ttl': ttl,
            }
            with open(meta_path, 'w') as f:
                json.dump(meta, f)

            return True
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] FileSystem set error: {e}")
            return False

    def delete(self, key: str) -> bool:
        path = self._get_path(key)
        meta_path = self._get_meta_path(key)

        try:
            path.unlink(missing_ok=True)
            meta_path.unlink(missing_ok=True)
            return True
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] FileSystem delete error: {e}")
            return False

    def clear_pattern(self, pattern: str) -> int:
        # For filesystem, we need to check all meta files
        count = 0
        try:
            for meta_path in self._cache_dir.glob("*.meta"):
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
                key = meta.get('key', '')
                # Simple pattern matching (replace * with regex)
                import fnmatch
                if fnmatch.fnmatch(key, pattern):
                    cache_path = meta_path.with_suffix('.cache')
                    meta_path.unlink(missing_ok=True)
                    cache_path.unlink(missing_ok=True)
                    count += 1
        except Exception as e:
            logger.warning(f"[DHIS2 Cache] FileSystem clear pattern error: {e}")
        return count

    def exists(self, key: str) -> bool:
        return self.get(key) is not None


class MemoryCacheBackend(CacheBackend):
    """In-memory cache backend for testing/single-process deployments"""

    def __init__(self, max_size: int = 1000):
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._max_size = max_size
        logger.info(f"[DHIS2 Cache] Memory backend initialized (max_size={max_size})")

    def _cleanup_expired(self):
        """Remove expired entries"""
        now = time.time()
        expired = [k for k, (_, exp) in self._cache.items() if exp < now]
        for k in expired:
            del self._cache[k]

    def _evict_if_needed(self):
        """Evict oldest entries if cache is full"""
        if len(self._cache) >= self._max_size:
            # Remove 10% of oldest entries
            to_remove = max(1, self._max_size // 10)
            sorted_keys = sorted(self._cache.keys(), key=lambda k: self._cache[k][1])
            for k in sorted_keys[:to_remove]:
                del self._cache[k]

    def get(self, key: str) -> Optional[Any]:
        self._cleanup_expired()
        if key in self._cache:
            value, expires = self._cache[key]
            if expires > time.time():
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        self._cleanup_expired()
        self._evict_if_needed()
        self._cache[key] = (value, time.time() + ttl)
        return True

    def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear_pattern(self, pattern: str) -> int:
        import fnmatch
        to_delete = [k for k in self._cache.keys() if fnmatch.fnmatch(k, pattern)]
        for k in to_delete:
            del self._cache[k]
        return len(to_delete)

    def exists(self, key: str) -> bool:
        return self.get(key) is not None


class DHIS2CacheService:
    """
    Main DHIS2 caching service - singleton pattern

    Provides caching for DHIS2 API responses with:
    - Automatic cache key generation
    - Configurable TTL per endpoint
    - Cache warming support
    - Statistics tracking
    """

    _instance: Optional['DHIS2CacheService'] = None

    # Default TTL per endpoint type (in seconds)
    DEFAULT_TTL = {
        'analytics': 3600,          # 1 hour - analytics data is relatively stable
        'dataValueSets': 3600,      # 1 hour
        'dataElements': 86400,      # 24 hours - metadata rarely changes
        'indicators': 86400,        # 24 hours
        'organisationUnits': 86400, # 24 hours
        'programs': 86400,          # 24 hours
        'default': 1800,            # 30 minutes for unknown endpoints
    }

    def __init__(self, backend: CacheBackend = None):
        self._backend = backend
        self._stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'errors': 0,
        }
        self._enabled = True

    @classmethod
    def get_instance(cls, redis_url: str = None, cache_dir: str = None) -> 'DHIS2CacheService':
        """
        Get or create singleton instance

        Args:
            redis_url: Redis connection URL (optional)
            cache_dir: FileSystem cache directory (optional)

        Returns:
            DHIS2CacheService instance
        """
        if cls._instance is None:
            # Try Redis first, fall back to FileSystem, then Memory
            backend = None

            # Check environment variable for Redis URL
            redis_url = redis_url or os.getenv('DHIS2_CACHE_REDIS_URL') or os.getenv('REDIS_URL')

            if redis_url:
                redis_backend = RedisCacheBackend(redis_url)
                if redis_backend.is_available:
                    backend = redis_backend
                    logger.info("[DHIS2 Cache] Using Redis backend")

            if backend is None:
                # Try FileSystem
                try:
                    backend = FileSystemCacheBackend(cache_dir)
                    logger.info("[DHIS2 Cache] Using FileSystem backend")
                except Exception as e:
                    logger.warning(f"[DHIS2 Cache] FileSystem backend failed: {e}")
                    backend = MemoryCacheBackend()
                    logger.info("[DHIS2 Cache] Using Memory backend (fallback)")

            cls._instance = cls(backend)

        return cls._instance

    @classmethod
    def reset_instance(cls):
        """Reset singleton instance (for testing)"""
        cls._instance = None

    def generate_cache_key(
        self,
        endpoint: str,
        params: Dict[str, Any],
        base_url: str = None,
    ) -> str:
        """
        Generate a unique cache key for the request

        Format: dhis2:{base_url_hash}:{endpoint}:{params_hash}

        Args:
            endpoint: DHIS2 endpoint (e.g., 'analytics', 'dataValueSets')
            params: Query parameters dict
            base_url: DHIS2 base URL (optional, for multi-instance support)

        Returns:
            Cache key string
        """
        # Sort params for consistent keys
        sorted_params = json.dumps(params, sort_keys=True)
        params_hash = hashlib.md5(sorted_params.encode()).hexdigest()[:12]

        if base_url:
            url_hash = hashlib.md5(base_url.encode()).hexdigest()[:8]
            return f"dhis2:{url_hash}:{endpoint}:{params_hash}"

        return f"dhis2:{endpoint}:{params_hash}"

    def get_ttl(self, endpoint: str) -> int:
        """Get TTL for endpoint type"""
        # Extract base endpoint name (e.g., 'analytics' from 'analytics.json')
        base_endpoint = endpoint.split('.')[0].split('/')[0]
        return self.DEFAULT_TTL.get(base_endpoint, self.DEFAULT_TTL['default'])

    def get(
        self,
        endpoint: str,
        params: Dict[str, Any],
        base_url: str = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached data for a DHIS2 request

        Args:
            endpoint: DHIS2 endpoint
            params: Query parameters
            base_url: DHIS2 base URL (optional)

        Returns:
            Cached data dict or None if not found/expired
        """
        if not self._enabled:
            return None

        key = self.generate_cache_key(endpoint, params, base_url)

        try:
            data = self._backend.get(key)
            if data is not None:
                self._stats['hits'] += 1
                logger.info(f"[DHIS2 Cache] HIT: {endpoint} (key={key[:50]}...)")
                return data
            else:
                self._stats['misses'] += 1
                logger.debug(f"[DHIS2 Cache] MISS: {endpoint} (key={key[:50]}...)")
        except Exception as e:
            self._stats['errors'] += 1
            logger.warning(f"[DHIS2 Cache] Get error: {e}")

        return None

    def set(
        self,
        endpoint: str,
        params: Dict[str, Any],
        data: Dict[str, Any],
        base_url: str = None,
        ttl: int = None,
    ) -> bool:
        """
        Cache DHIS2 response data

        Args:
            endpoint: DHIS2 endpoint
            params: Query parameters
            data: Response data to cache
            base_url: DHIS2 base URL (optional)
            ttl: Time-to-live in seconds (optional, uses default if not specified)

        Returns:
            True if cached successfully
        """
        if not self._enabled:
            return False

        key = self.generate_cache_key(endpoint, params, base_url)
        if ttl is None:
            ttl = self.get_ttl(endpoint)

        try:
            result = self._backend.set(key, data, ttl)
            if result:
                self._stats['sets'] += 1
                logger.info(f"[DHIS2 Cache] SET: {endpoint} (ttl={ttl}s, key={key[:50]}...)")
            return result
        except Exception as e:
            self._stats['errors'] += 1
            logger.warning(f"[DHIS2 Cache] Set error: {e}")
            return False

    def invalidate(
        self,
        endpoint: str = None,
        params: Dict[str, Any] = None,
        base_url: str = None,
    ) -> int:
        """
        Invalidate cached data

        Args:
            endpoint: Specific endpoint to invalidate (or None for all)
            params: Specific params to invalidate (or None for all matching endpoint)
            base_url: DHIS2 base URL (optional)

        Returns:
            Number of cache entries invalidated
        """
        if endpoint and params:
            # Specific key
            key = self.generate_cache_key(endpoint, params, base_url)
            return 1 if self._backend.delete(key) else 0
        elif endpoint:
            # All entries for endpoint
            if base_url:
                url_hash = hashlib.md5(base_url.encode()).hexdigest()[:8]
                pattern = f"dhis2:{url_hash}:{endpoint}:*"
            else:
                pattern = f"dhis2:{endpoint}:*"
            return self._backend.clear_pattern(pattern)
        else:
            # All DHIS2 cache
            return self._backend.clear_pattern("dhis2:*")

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self._stats['hits'] + self._stats['misses']
        hit_rate = (self._stats['hits'] / total * 100) if total > 0 else 0
        return {
            **self._stats,
            'total_requests': total,
            'hit_rate_percent': round(hit_rate, 2),
        }

    def enable(self):
        """Enable caching"""
        self._enabled = True
        logger.info("[DHIS2 Cache] Caching enabled")

    def disable(self):
        """Disable caching (for debugging/testing)"""
        self._enabled = False
        logger.info("[DHIS2 Cache] Caching disabled")

    @property
    def is_enabled(self) -> bool:
        return self._enabled


class DHIS2CacheWarmer:
    """
    Background cache warming service

    Pre-fetches commonly used DHIS2 data to ensure fast loading for users.
    Can be triggered manually or scheduled via Celery.
    """

    def __init__(self, cache_service: DHIS2CacheService = None):
        self._cache = cache_service or DHIS2CacheService.get_instance()
        self._warmed_datasets: List[str] = []

    def warm_dataset(
        self,
        dataset_config: Dict[str, Any],
        fetch_func: Callable,
    ) -> bool:
        """
        Warm cache for a specific dataset configuration

        Args:
            dataset_config: Dict with endpoint, params, base_url
            fetch_func: Function to fetch data from DHIS2

        Returns:
            True if warmed successfully
        """
        endpoint = dataset_config.get('endpoint')
        params = dataset_config.get('params', {})
        base_url = dataset_config.get('base_url')

        if not endpoint:
            logger.warning("[DHIS2 Cache Warmer] No endpoint specified")
            return False

        try:
            logger.info(f"[DHIS2 Cache Warmer] Warming: {endpoint}")

            # Fetch fresh data from DHIS2
            data = fetch_func(endpoint, params)

            if data:
                # Cache with extended TTL for warmed data
                ttl = self._cache.get_ttl(endpoint) * 2  # Double TTL for pre-warmed data
                self._cache.set(endpoint, params, data, base_url, ttl)
                self._warmed_datasets.append(f"{endpoint}:{json.dumps(params, sort_keys=True)[:50]}")
                logger.info(f"[DHIS2 Cache Warmer] Successfully warmed: {endpoint}")
                return True
            else:
                logger.warning(f"[DHIS2 Cache Warmer] No data returned for: {endpoint}")
                return False

        except Exception as e:
            logger.error(f"[DHIS2 Cache Warmer] Error warming {endpoint}: {e}")
            return False

    def warm_multiple(
        self,
        dataset_configs: List[Dict[str, Any]],
        fetch_func: Callable,
    ) -> Dict[str, int]:
        """
        Warm cache for multiple datasets

        Returns:
            Dict with success/failure counts
        """
        results = {'success': 0, 'failed': 0}

        for config in dataset_configs:
            if self.warm_dataset(config, fetch_func):
                results['success'] += 1
            else:
                results['failed'] += 1

        logger.info(f"[DHIS2 Cache Warmer] Completed: {results['success']} success, {results['failed']} failed")
        return results

    def get_warmed_datasets(self) -> List[str]:
        """Get list of datasets that have been warmed"""
        return self._warmed_datasets.copy()


# Convenience functions for direct use
def get_dhis2_cache() -> DHIS2CacheService:
    """Get the DHIS2 cache service instance"""
    return DHIS2CacheService.get_instance()


def cache_dhis2_response(endpoint: str, params: Dict, data: Dict, base_url: str = None) -> bool:
    """Cache a DHIS2 response"""
    return get_dhis2_cache().set(endpoint, params, data, base_url)


def get_cached_dhis2_response(endpoint: str, params: Dict, base_url: str = None) -> Optional[Dict]:
    """Get a cached DHIS2 response"""
    return get_dhis2_cache().get(endpoint, params, base_url)


def invalidate_dhis2_cache(endpoint: str = None) -> int:
    """Invalidate DHIS2 cache entries"""
    return get_dhis2_cache().invalidate(endpoint)

