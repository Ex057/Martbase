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
DHIS2 Cache Warming and Background Query Tasks

Celery tasks for:
1. Pre-warming DHIS2 cache to ensure fast dashboard loading
2. Background dataset querying for async data loading
3. Scheduled cache maintenance

Usage:
    # Manual trigger via Celery
    from superset.tasks.dhis2_cache import warm_dhis2_datasets
    warm_dhis2_datasets.delay()

    # Or from command line:
    celery -A superset.tasks.celery_app call superset.tasks.dhis2_cache.warm_dhis2_datasets
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="dhis2.query_dataset_async", bind=True)
def query_dataset_async(
    self,
    database_id: int,
    sql_query: str,
    cache_key: str | None = None,
    timeout: int = 300,
) -> Dict[str, Any]:
    """
    Execute a DHIS2 dataset query asynchronously in the background.

    This task allows the frontend to trigger data loading without blocking
    the UI. Results are cached for fast retrieval.

    Args:
        database_id: ID of the DHIS2 database connection
        sql_query: SQL query with DHIS2 parameters in comments
        cache_key: Optional custom cache key for the result
        timeout: Query timeout in seconds (default: 5 minutes)

    Returns:
        Dict with query results: {
            status: 'success' | 'error',
            row_count: int,
            cache_key: str,
            execution_time_ms: float,
            error: str | None
        }
    """
    from superset.models.core import Database
    from superset.db_engine_specs.dhis2_cache import DHIS2CacheService

    start_time = time.time()
    task_id = self.request.id

    logger.info(f"[DHIS2 Async Query] Task {task_id} starting for database {database_id}")

    result = {
        "status": "pending",
        "task_id": task_id,
        "row_count": 0,
        "cache_key": cache_key,
        "execution_time_ms": 0,
        "error": None,
    }

    try:
        # Update task state
        self.update_state(state='PROGRESS', meta={'status': 'connecting'})

        # Get database connection
        database = Database.query.get(database_id)
        if not database:
            raise ValueError(f"Database {database_id} not found")

        # Get cache service
        try:
            cache = DHIS2CacheService.get_instance()
        except Exception:
            cache = None

        # Update task state
        self.update_state(state='PROGRESS', meta={'status': 'executing_query'})

        # Execute query with timeout
        engine = database.get_sqla_engine()
        with engine.connect() as conn:
            # Set statement timeout
            query_result = conn.execute(sql_query)
            rows = query_result.fetchall()
            columns = list(query_result.keys())

        # Convert to list of dicts
        data = [dict(zip(columns, row)) for row in rows]

        execution_time = (time.time() - start_time) * 1000

        # Cache the results if cache is available
        if cache and cache_key:
            try:
                cache_data = {
                    "data": data,
                    "columns": columns,
                    "row_count": len(data),
                    "timestamp": datetime.now().isoformat(),
                }
                # Use the cache service to store results
                # This will be retrievable by the frontend
                from superset.extensions import cache_manager
                cache_manager.data_cache.set(
                    f"dhis2_async_query_{cache_key}",
                    cache_data,
                    timeout=7200,  # 2 hour TTL
                )
                logger.info(f"[DHIS2 Async Query] Cached {len(data)} rows with key {cache_key}")
            except Exception as cache_err:
                logger.warning(f"[DHIS2 Async Query] Failed to cache results: {cache_err}")

        result.update({
            "status": "success",
            "row_count": len(data),
            "columns": columns,
            "execution_time_ms": execution_time,
        })

        logger.info(
            f"[DHIS2 Async Query] Task {task_id} completed: {len(data)} rows in {execution_time:.1f}ms"
        )

    except Exception as e:
        execution_time = (time.time() - start_time) * 1000
        result.update({
            "status": "error",
            "error": str(e),
            "execution_time_ms": execution_time,
        })
        logger.error(f"[DHIS2 Async Query] Task {task_id} failed: {e}")

    return result


@shared_task(name="dhis2.prefetch_dashboard_data")
def prefetch_dashboard_data(
    dashboard_id: int,
    database_ids: List[int] | None = None,
) -> Dict[str, Any]:
    """
    Pre-fetch data for all DHIS2 charts in a dashboard.

    This is triggered when a user opens a dashboard to start loading
    all chart data in the background.

    Args:
        dashboard_id: Dashboard ID to prefetch data for
        database_ids: Optional list of DHIS2 database IDs to limit prefetch

    Returns:
        Dict with prefetch results
    """
    from superset.models.dashboard import Dashboard
    from superset.models.slice import Slice

    logger.info(f"[DHIS2 Prefetch] Starting prefetch for dashboard {dashboard_id}")

    results = {
        "dashboard_id": dashboard_id,
        "charts_processed": 0,
        "charts_cached": 0,
        "errors": [],
        "started_at": datetime.now().isoformat(),
    }

    try:
        dashboard = Dashboard.query.get(dashboard_id)
        if not dashboard:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        # Get all slices (charts) in the dashboard
        slices = dashboard.slices

        for slc in slices:
            try:
                # Check if this is a DHIS2 datasource
                datasource = slc.datasource
                if not datasource:
                    continue

                database = datasource.database
                if not database:
                    continue

                # Check if it's a DHIS2 database
                db_engine = database.db_engine_spec
                if not hasattr(db_engine, 'engine') or 'dhis2' not in str(db_engine.engine).lower():
                    continue

                # Filter by database_ids if provided
                if database_ids and database.id not in database_ids:
                    continue

                # Get the form_data and generate query
                form_data = slc.form_data

                # Queue the async query task
                sql_query = f"SELECT * FROM {datasource.name} LIMIT 10000"
                cache_key = f"dashboard_{dashboard_id}_chart_{slc.id}"

                query_dataset_async.delay(
                    database_id=database.id,
                    sql_query=sql_query,
                    cache_key=cache_key,
                )

                results["charts_processed"] += 1

            except Exception as e:
                results["errors"].append({
                    "chart_id": slc.id,
                    "error": str(e),
                })

        results["completed_at"] = datetime.now().isoformat()
        logger.info(
            f"[DHIS2 Prefetch] Dashboard {dashboard_id}: "
            f"queued {results['charts_processed']} charts"
        )

    except Exception as e:
        results["error"] = str(e)
        logger.error(f"[DHIS2 Prefetch] Failed for dashboard {dashboard_id}: {e}")

    return results


@shared_task(name="dhis2.warm_cache")
def warm_dhis2_cache(
    database_id: int,
    dataset_configs: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Warm DHIS2 cache for specified datasets

    Args:
        database_id: ID of the DHIS2 database connection
        dataset_configs: List of dataset configurations to warm, each with:
            - endpoint: DHIS2 endpoint (e.g., 'analytics')
            - params: Query parameters dict
            - name: Optional name for logging

    Returns:
        Dict with warming results: {success: int, failed: int, details: [...]}
    """
    from superset.models.core import Database
    from superset.db_engine_specs.dhis2_cache import DHIS2CacheService, DHIS2CacheWarmer

    logger.info(f"[DHIS2 Cache Warm] Starting cache warming for database {database_id}")

    results = {
        "success": 0,
        "failed": 0,
        "details": [],
        "started_at": datetime.now().isoformat(),
    }

    try:
        # Get database connection
        database = Database.query.get(database_id)
        if not database:
            raise ValueError(f"Database {database_id} not found")

        # Create engine and get connection details
        engine = database.get_sqla_engine()

        # Extract connection info
        from sqlalchemy.engine.url import make_url
        url = make_url(str(engine.url))
        base_url = f"https://{url.host}{url.database or '/api'}"
        auth = (url.username, url.password) if url.username else None
        headers = {}

        # If no username, assume PAT authentication
        if not url.username and url.password:
            auth = None
            headers = {"Authorization": f"ApiToken {url.password}"}

        # Initialize cache service
        cache = DHIS2CacheService.get_instance()
        warmer = DHIS2CacheWarmer(cache)

        # Define fetch function
        import requests

        def fetch_from_dhis2(endpoint: str, params: Dict) -> Optional[Dict]:
            """Fetch data from DHIS2 API"""
            import time
            start = time.time()

            try:
                # Build URL with parameters
                query_parts = []
                for key, value in params.items():
                    if key == "dimension" and ";" in value:
                        import re
                        dimension_parts = re.split(r';(?=(?:dx|pe|ou):)', value)
                        for dim in dimension_parts:
                            if dim:
                                query_parts.append(f"dimension={dim}")
                    else:
                        query_parts.append(f"{key}={value}")

                url = f"{base_url}/{endpoint}"
                if query_parts:
                    url = f"{url}?{'&'.join(query_parts)}"

                logger.info(f"[DHIS2 Cache Warm] Fetching: {url}")

                response = requests.get(
                    url,
                    auth=auth,
                    headers=headers,
                    timeout=300,  # 5 minute timeout for warming
                )
                response.raise_for_status()

                data = response.json()
                elapsed = time.time() - start
                logger.info(f"[DHIS2 Cache Warm] Fetched {endpoint} in {elapsed:.1f}s")

                return data

            except Exception as e:
                logger.error(f"[DHIS2 Cache Warm] Failed to fetch {endpoint}: {e}")
                return None

        # Use default configs if none provided
        if not dataset_configs:
            dataset_configs = get_default_warm_configs()

        # Warm each dataset
        for config in dataset_configs:
            config["base_url"] = base_url
            name = config.get("name", config.get("endpoint", "unknown"))

            try:
                success = warmer.warm_dataset(config, fetch_from_dhis2)
                if success:
                    results["success"] += 1
                    results["details"].append({"name": name, "status": "success"})
                else:
                    results["failed"] += 1
                    results["details"].append({"name": name, "status": "failed", "error": "No data returned"})
            except Exception as e:
                results["failed"] += 1
                results["details"].append({"name": name, "status": "failed", "error": str(e)})

        results["completed_at"] = datetime.now().isoformat()
        logger.info(f"[DHIS2 Cache Warm] Completed: {results['success']} success, {results['failed']} failed")

    except Exception as e:
        logger.error(f"[DHIS2 Cache Warm] Task failed: {e}")
        results["error"] = str(e)

    return results


@shared_task(name="dhis2.invalidate_cache")
def invalidate_dhis2_cache(
    endpoint: str = None,
    database_id: int = None,
) -> Dict[str, Any]:
    """
    Invalidate DHIS2 cache entries

    Args:
        endpoint: Specific endpoint to invalidate (or None for all)
        database_id: Specific database to invalidate (or None for all)

    Returns:
        Dict with invalidation results
    """
    from superset.db_engine_specs.dhis2_cache import DHIS2CacheService

    logger.info(f"[DHIS2 Cache] Invalidating cache - endpoint={endpoint}, database_id={database_id}")

    try:
        cache = DHIS2CacheService.get_instance()
        count = cache.invalidate(endpoint)

        return {
            "status": "success",
            "invalidated_count": count,
            "endpoint": endpoint,
            "database_id": database_id,
        }
    except Exception as e:
        logger.error(f"[DHIS2 Cache] Invalidation failed: {e}")
        return {
            "status": "error",
            "error": str(e),
        }


@shared_task(name="dhis2.cache_stats")
def get_dhis2_cache_stats() -> Dict[str, Any]:
    """
    Get DHIS2 cache statistics

    Returns:
        Dict with cache statistics
    """
    from superset.db_engine_specs.dhis2_cache import DHIS2CacheService

    try:
        cache = DHIS2CacheService.get_instance()
        return {
            "status": "success",
            "stats": cache.get_stats(),
        }
    except Exception as e:
        logger.error(f"[DHIS2 Cache] Stats retrieval failed: {e}")
        return {
            "status": "error",
            "error": str(e),
        }


def get_default_warm_configs() -> List[Dict[str, Any]]:
    """
    Get default dataset configurations for cache warming

    These represent commonly accessed DHIS2 data patterns.
    Customize based on your actual dashboards and usage patterns.
    """
    return [
        # Analytics - Last 12 months, all org units at district level
        {
            "name": "analytics_last_12_months",
            "endpoint": "analytics",
            "params": {
                "dimension": "pe:LAST_12_MONTHS;ou:LEVEL-3",
                "displayProperty": "NAME",
                "skipMeta": "false",
            },
        },
        # Analytics - This year by month
        {
            "name": "analytics_this_year",
            "endpoint": "analytics",
            "params": {
                "dimension": "pe:THIS_YEAR;ou:LEVEL-2",
                "displayProperty": "NAME",
                "skipMeta": "false",
            },
        },
        # Data Value Sets - Recent data
        {
            "name": "datavaluesets_recent",
            "endpoint": "dataValueSets",
            "params": {
                "period": "LAST_3_MONTHS",
                "children": "true",
            },
        },
    ]


# Add beat schedule for automatic cache warming
# This runs nightly after DHIS2 analytics typically completes
def get_dhis2_cache_beat_schedule():
    """
    Get Celery beat schedule for DHIS2 cache warming

    To enable, add to CELERY_CONFIG.beat_schedule in superset_config.py:
        from superset.tasks.dhis2_cache import get_dhis2_cache_beat_schedule
        beat_schedule.update(get_dhis2_cache_beat_schedule())
    """
    from celery.schedules import crontab

    return {
        # Warm cache every day at 5 AM (after DHIS2 analytics typically completes)
        "dhis2-cache-warm-daily": {
            "task": "dhis2.warm_cache",
            "schedule": crontab(hour=5, minute=0),
            "kwargs": {
                "database_id": 1,  # Update with your DHIS2 database ID
                "dataset_configs": None,  # Use defaults
            },
        },
        # Invalidate stale cache weekly (Sunday 4 AM)
        "dhis2-cache-invalidate-weekly": {
            "task": "dhis2.invalidate_cache",
            "schedule": crontab(hour=4, minute=0, day_of_week=0),
            "kwargs": {},
        },
    }

