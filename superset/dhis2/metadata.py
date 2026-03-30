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
"""DHIS2 metadata fetching and caching."""
import logging
from typing import Any
from datetime import datetime, timedelta

import requests
from flask_caching import Cache

logger = logging.getLogger(__name__)

# Cache for DHIS2 metadata (cache for 1 hour)
metadata_cache = Cache(config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 3600})


class DHIS2MetadataFetcher:
    """Fetch and cache DHIS2 metadata."""

    def __init__(self, base_url: str, username: str, password: str):
        """
        Initialize DHIS2 metadata fetcher.

        Args:
            base_url: DHIS2 API base URL (e.g., https://play.dhis2.org/api)
            username: DHIS2 username
            password: DHIS2 password
        """
        self.base_url = base_url.rstrip('/')
        self.auth = (username, password)
        self.session = requests.Session()
        self.session.auth = self.auth

    @metadata_cache.memoize(timeout=3600)
    def fetch_data_elements(
        self,
        element_type: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50
    ) -> dict[str, Any]:
        """
        Fetch data elements from DHIS2.

        Args:
            element_type: Filter by type (indicators, dataElements, dataSets, programIndicators)
            search: Search term for filtering
            page: Page number (1-indexed)
            page_size: Items per page

        Returns:
            Dictionary with data elements and pagination info
        """
        endpoint_map = {
            'indicators': '/indicators',
            'dataElements': '/dataElements',
            'dataSets': '/dataSets',
            'programIndicators': '/programIndicators',
            'all': None  # Fetch from multiple endpoints
        }

        endpoint = endpoint_map.get(element_type or 'all')

        if endpoint is None:
            # Fetch all types
            return self._fetch_all_types(search, page, page_size)

        # Fetch specific type
        url = f"{self.base_url}{endpoint}"
        params = {
            'fields': 'id,name,shortName,code,displayName,valueType,aggregationType,domainType',
            'paging': 'true',
            'page': page,
            'pageSize': page_size,
            'order': 'name:asc'
        }

        if search:
            params['filter'] = f'name:ilike:{search}'

        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Extract items based on endpoint type
            items_key = endpoint.lstrip('/')  # 'indicators', 'dataElements', etc.
            items = data.get(items_key, [])

            return {
                'items': [self._format_item(item, element_type) for item in items],
                'pager': data.get('pager', {}),
                'total': data.get('pager', {}).get('total', len(items))
            }

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch DHIS2 metadata: {e}")
            return {'items': [], 'pager': {}, 'total': 0, 'error': str(e)}

    def _fetch_all_types(self, search: str | None, page: int, page_size: int) -> dict[str, Any]:
        """Fetch all data element types and combine results."""
        all_items = []
        types = ['indicators', 'dataElements', 'programIndicators']

        for element_type in types:
            result = self.fetch_data_elements(element_type, search, 1, page_size)
            all_items.extend(result['items'])

        # Sort by name
        all_items.sort(key=lambda x: x['name'])

        # Paginate combined results
        start = (page - 1) * page_size
        end = start + page_size
        paginated_items = all_items[start:end]

        return {
            'items': paginated_items,
            'pager': {
                'page': page,
                'pageSize': page_size,
                'total': len(all_items),
                'pageCount': (len(all_items) + page_size - 1) // page_size
            },
            'total': len(all_items)
        }

    def _format_item(self, item: dict[str, Any], item_type: str | None) -> dict[str, Any]:
        """
        Format data element item for frontend.

        Args:
            item: Raw item from DHIS2 API
            item_type: Type of item (indicators, dataElements, etc.)

        Returns:
            Formatted item
        """
        return {
            'id': item.get('id'),
            'name': item.get('name') or item.get('displayName'),
            'shortName': item.get('shortName'),
            'code': item.get('code'),
            'displayName': item.get('displayName'),
            'type': item_type or 'dataElement',
            'valueType': item.get('valueType', 'TEXT'),
            'aggregationType': item.get('aggregationType', 'SUM'),
            'domainType': item.get('domainType', 'AGGREGATE')
        }

    @metadata_cache.memoize(timeout=3600)
    def fetch_org_units(
        self,
        level: int | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50
    ) -> dict[str, Any]:
        """
        Fetch organization units from DHIS2.

        Args:
            level: Filter by org unit level (1=country, 2=region, 3=district, etc.)
            search: Search term
            page: Page number
            page_size: Items per page

        Returns:
            Dictionary with org units and pagination
        """
        url = f"{self.base_url}/organisationUnits"
        params = {
            'fields': 'id,name,shortName,code,level,path,parent[id,name]',
            'paging': 'true',
            'page': page,
            'pageSize': page_size,
            'order': 'name:asc'
        }

        filters = []
        if level is not None:
            filters.append(f'level:eq:{level}')
        if search:
            filters.append(f'name:ilike:{search}')

        if filters:
            params['filter'] = filters

        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            return {
                'items': data.get('organisationUnits', []),
                'pager': data.get('pager', {}),
                'total': data.get('pager', {}).get('total', 0)
            }

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch org units: {e}")
            return {'items': [], 'pager': {}, 'total': 0, 'error': str(e)}

    @metadata_cache.memoize(timeout=3600)
    def fetch_periods(self, period_type: str = 'YEARLY') -> list[str]:
        """
        Generate available periods.

        Args:
            period_type: DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY

        Returns:
            List of period identifiers
        """
        current_year = datetime.now().year
        periods = []

        if period_type == 'YEARLY':
            # Last 5 years
            for year in range(current_year - 5, current_year + 1):
                periods.append(str(year))

        elif period_type == 'QUARTERLY':
            # Last 2 years of quarters
            for year in range(current_year - 2, current_year + 1):
                for quarter in range(1, 5):
                    periods.append(f"{year}Q{quarter}")

        elif period_type == 'MONTHLY':
            # Last year of months
            for year in range(current_year - 1, current_year + 1):
                for month in range(1, 13):
                    periods.append(f"{year}{month:02d}")

        return periods


def get_metadata_fetcher(database_id: int) -> DHIS2MetadataFetcher | None:
    """
    Get DHIS2 metadata fetcher for a database.

    Args:
        database_id: Superset database ID

    Returns:
        DHIS2MetadataFetcher instance or None if not DHIS2 database
    """
    from superset.models.core import Database

    database = Database.query.get(database_id)
    if not database or database.db_engine_spec.engine != 'dhis2':
        return None

    # Parse connection URI to get credentials
    try:
        uri_parts = database.sqlalchemy_uri_customized.split('://')
        if len(uri_parts) != 2:
            return None

        auth_and_host = uri_parts[1]
        if '@' not in auth_and_host:
            return None

        auth, host_path = auth_and_host.split('@', 1)
        username, password = auth.split(':', 1)

        # Construct base URL
        base_url = f"https://{host_path}"
        if not base_url.endswith('/api'):
            base_url = f"{base_url}/api"

        return DHIS2MetadataFetcher(base_url, username, password)

    except Exception as e:
        logger.error(f"Failed to create metadata fetcher: {e}")
        return None
