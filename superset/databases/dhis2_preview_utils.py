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
"""DHIS2 Preview Utilities - Shared functions for Column and Data Preview APIs."""
from __future__ import annotations

import logging
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

# Create a session with connection pooling and retry logic for DHIS2 API calls
# This significantly improves performance and reliability for multiple API calls
_dhis2_session: requests.Session | None = None


def get_dhis2_session() -> requests.Session:
    """Get or create a requests session with connection pooling and retry logic."""
    global _dhis2_session
    if _dhis2_session is None:
        _dhis2_session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        
        # Configure connection pooling
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=10,
        )
        
        _dhis2_session.mount("http://", adapter)
        _dhis2_session.mount("https://", adapter)
        
    return _dhis2_session


def fetch_org_unit_level_names(
    base_url: str,
    auth: tuple[str, str] | None,
) -> dict[int, str]:
    """
    Fetch organisation unit level names from DHIS2.

    Returns a dict mapping level number (1-indexed) to level name.
    Example: {1: "National", 2: "Region", 3: "District", ...}
    """
    level_names: dict[int, str] = {}
    session = get_dhis2_session()

    try:
        url = f"{base_url}/organisationUnitLevels.json?paging=false&fields=id,level,name"
        logger.info(f"[DHIS2 Utils] Fetching org unit levels from: {url}")
        resp = session.get(url, auth=auth, timeout=30)

        if resp.status_code == 200:
            levels = resp.json().get("organisationUnitLevels", [])
            logger.info(f"[DHIS2 Utils] Fetched {len(levels)} org unit levels")

            for level_obj in levels:
                level_num = level_obj.get("level", 0)
                level_name = level_obj.get("name") or level_obj.get("displayName") or f"Level {level_num}"
                level_names[level_num] = level_name
                logger.info(f"[DHIS2 Utils] Level {level_num} -> '{level_name}'")
        else:
            logger.warning(f"[DHIS2 Utils] Failed to fetch levels: HTTP {resp.status_code}")
    except Exception as e:
        logger.exception(f"[DHIS2 Utils] Error fetching org unit levels: {e}")

    return level_names


def fetch_dx_display_names(
    base_url: str,
    auth: tuple[str, str] | None,
    dx_ids: list[str],
) -> dict[str, str]:
    """
    Fetch display names for DX items (dataElements, indicators, dataSets, programIndicators).

    Returns a dict mapping DX ID to display name.
    """
    dx_names: dict[str, str] = {}

    if not dx_ids:
        return dx_names

    session = get_dhis2_session()

    # DX endpoints to try
    dx_endpoints = [
        ("dataElements", "dataElements"),
        ("indicators", "indicators"),
        ("dataSets", "dataSets"),
        ("programIndicators", "programIndicators"),
    ]

    logger.info(f"[DHIS2 Utils] Fetching display names for {len(dx_ids)} DX items")

    try:
        for endpoint_name, response_key in dx_endpoints:
            # Skip if we already have names for all IDs
            missing_ids = [dx_id for dx_id in dx_ids if dx_id not in dx_names]
            if not missing_ids:
                break

            dx_filter = ",".join(missing_ids)
            url = f"{base_url}/{endpoint_name}.json?filter=id:in:[{dx_filter}]&fields=id,name,displayName&paging=false"
            logger.info(f"[DHIS2 Utils] Trying {endpoint_name}: {url}")

            try:
                resp = session.get(url, auth=auth, timeout=30)
                if resp.status_code == 200:
                    dx_data = resp.json().get(response_key, [])
                    if dx_data:
                        logger.info(f"[DHIS2 Utils] Found {len(dx_data)} items in {endpoint_name}")
                        for dx in dx_data:
                            dx_id = dx.get("id")
                            dx_display = dx.get("displayName") or dx.get("name") or dx_id
                            dx_names[dx_id] = dx_display
                            logger.info(f"[DHIS2 Utils] DX: {dx_id} -> '{dx_display}'")
            except Exception as e:
                logger.warning(f"[DHIS2 Utils] Error fetching {endpoint_name}: {e}")
                continue
    except Exception as e:
        logger.exception(f"[DHIS2 Utils] Error in DX name fetching: {e}")

    # Fill in missing names with IDs
    for dx_id in dx_ids:
        if dx_id not in dx_names:
            dx_names[dx_id] = dx_id
            logger.warning(f"[DHIS2 Utils] DX {dx_id} has no display name, using ID")

    return dx_names


def fetch_org_units_with_ancestors(
    base_url: str,
    auth: tuple[str, str] | None,
    ou_ids: list[str],
) -> tuple[dict[str, str], dict[str, int], dict[str, str | None]]:
    """
    Fetch org unit details including all ancestors using the path field.
    
    Uses connection pooling and retry logic for better performance and reliability.

    Returns:
        - ou_names: dict mapping ou_id to display name
        - ou_levels: dict mapping ou_id to level number
        - ou_parents: dict mapping ou_id to parent ou_id
    """
    ou_names: dict[str, str] = {}
    ou_levels: dict[str, int] = {}
    ou_parents: dict[str, str | None] = {}

    if not ou_ids:
        return ou_names, ou_levels, ou_parents

    logger.info(f"[DHIS2 Utils] fetch_org_units_with_ancestors called for {len(ou_ids)} IDs: {ou_ids[:5]}...")

    # Use session with connection pooling for better performance
    session = get_dhis2_session()

    try:
        # Fetch selected org units with path - batch if necessary
        all_ancestor_ids: set[str] = set()

        # Process in larger batches for fewer API calls (100 instead of 50)
        BATCH_SIZE = 100
        total_batches = (len(ou_ids) + BATCH_SIZE - 1) // BATCH_SIZE
        
        for batch_num, batch_start in enumerate(range(0, len(ou_ids), BATCH_SIZE), 1):
            batch_ids = ou_ids[batch_start:batch_start + BATCH_SIZE]
            ou_filter = ",".join(batch_ids)
            url = f"{base_url}/organisationUnits.json?filter=id:in:[{ou_filter}]&fields=id,name,displayName,level,path,parent[id]&paging=false"

            logger.info(f"[DHIS2 Utils] Fetching org units batch {batch_num}/{total_batches} ({len(batch_ids)} units)")

            try:
                # Use session for connection reuse
                resp = session.get(url, auth=auth, timeout=60)

                if resp.status_code == 200:
                    ou_data = resp.json().get("organisationUnits", [])

                    for ou in ou_data:
                        ou_id = ou.get("id")
                        if not ou_id:
                            continue
                        ou_names[ou_id] = ou.get("displayName") or ou.get("name") or ou_id
                        ou_levels[ou_id] = ou.get("level", 0)
                        parent_info = ou.get("parent", {})
                        ou_parents[ou_id] = parent_info.get("id") if parent_info else None

                        # Parse path to get ancestor IDs
                        path = ou.get("path", "")
                        if path:
                            path_ids = [p for p in path.split("/") if p and p != ou_id]
                            all_ancestor_ids.update(path_ids)
                else:
                    logger.warning(f"[DHIS2 Utils] Failed to fetch org units batch: HTTP {resp.status_code}")
            except requests.exceptions.Timeout:
                logger.warning(f"[DHIS2 Utils] Timeout fetching batch {batch_num}, continuing with partial data")
                continue
            except Exception as batch_error:
                logger.warning(f"[DHIS2 Utils] Error fetching batch {batch_num}: {batch_error}")
                continue

        logger.info(f"[DHIS2 Utils] Fetched {len(ou_names)} org units, found {len(all_ancestor_ids)} ancestor IDs from paths")

        # Fetch ancestor details - also in batches, but skip if we already have most
        missing_ancestors = [a for a in all_ancestor_ids if a not in ou_names]
        
        # Limit ancestor fetching to avoid excessive API calls
        MAX_ANCESTORS = 200
        if len(missing_ancestors) > MAX_ANCESTORS:
            logger.warning(f"[DHIS2 Utils] Limiting ancestor fetch from {len(missing_ancestors)} to {MAX_ANCESTORS}")
            missing_ancestors = missing_ancestors[:MAX_ANCESTORS]
        
        if missing_ancestors:
            logger.info(f"[DHIS2 Utils] Fetching {len(missing_ancestors)} missing ancestors")
            total_anc_batches = (len(missing_ancestors) + BATCH_SIZE - 1) // BATCH_SIZE

            for batch_num, batch_start in enumerate(range(0, len(missing_ancestors), BATCH_SIZE), 1):
                batch_ids = missing_ancestors[batch_start:batch_start + BATCH_SIZE]
                anc_filter = ",".join(batch_ids)
                anc_url = f"{base_url}/organisationUnits.json?filter=id:in:[{anc_filter}]&fields=id,name,displayName,level,parent[id]&paging=false"

                logger.info(f"[DHIS2 Utils] Fetching ancestors batch {batch_num}/{total_anc_batches}")

                try:
                    # Use session for connection reuse
                    anc_resp = session.get(anc_url, auth=auth, timeout=60)
                    if anc_resp.status_code == 200:
                        ancestors = anc_resp.json().get("organisationUnits", [])
                        for anc in ancestors:
                            anc_id = anc.get("id")
                            if not anc_id:
                                continue
                            ou_names[anc_id] = anc.get("displayName") or anc.get("name") or anc_id
                            ou_levels[anc_id] = anc.get("level", 0)
                            anc_parent = anc.get("parent", {})
                            ou_parents[anc_id] = anc_parent.get("id") if anc_parent else None
                    else:
                        logger.warning(f"[DHIS2 Utils] Failed to fetch ancestors batch: HTTP {anc_resp.status_code}")
                except requests.exceptions.Timeout:
                    logger.warning(f"[DHIS2 Utils] Timeout fetching ancestors batch {batch_num}, continuing")
                    continue
                except Exception as anc_error:
                    logger.warning(f"[DHIS2 Utils] Error fetching ancestors batch: {anc_error}")
                    continue

    except Exception as e:
        logger.exception(f"[DHIS2 Utils] Error fetching org units: {e}")

    logger.info(f"[DHIS2 Utils] Final result: {len(ou_names)} names, {len(ou_levels)} levels, {len(ou_parents)} parents")
    return ou_names, ou_levels, ou_parents


def fetch_org_unit_descendants(
    base_url: str,
    auth: tuple[str, str] | None,
    parent_ou_ids: list[str],
) -> list[str]:
    """
    Fetch all descendant org units for given parent org units.

    Returns a list of all descendant org unit IDs (including the parents themselves).
    Uses recursive fetching to handle tree structure.
    """
    all_ou_ids: set[str] = set(parent_ou_ids)
    to_process = list(parent_ou_ids)

    if not parent_ou_ids:
        return list(all_ou_ids)

    try:
        logger.info(f"[DHIS2 Utils] Fetching descendants for {len(parent_ou_ids)} parent org units (recursive)")

        while to_process:
            current_ids = to_process[:100]
            to_process = to_process[100:]

            ou_filter = ",".join(current_ids)
            url = f"{base_url}/organisationUnits.json?filter=parent.id:in:[{ou_filter}]&fields=id&paging=false"
            logger.info(f"[DHIS2 Utils] Fetching direct children of {len(current_ids)} org units")

            resp = requests.get(url, auth=auth, timeout=30)
            if resp.status_code == 200:
                children = resp.json().get("organisationUnits", [])
                logger.info(f"[DHIS2 Utils] Found {len(children)} direct children")
                for ou in children:
                    ou_id = ou.get("id")
                    if ou_id and ou_id not in all_ou_ids:
                        all_ou_ids.add(ou_id)
                        to_process.append(ou_id)
            else:
                logger.warning(f"[DHIS2 Utils] Failed to fetch children: HTTP {resp.status_code}")
    except Exception as e:
        logger.exception(f"[DHIS2 Utils] Error fetching descendants: {e}")

    logger.info(f"[DHIS2 Utils] Total org units (parents + all descendants): {len(all_ou_ids)}")
    return list(all_ou_ids)


def build_ou_hierarchy(
    ou_ids: list[str],
    ou_names: dict[str, str],
    ou_levels: dict[str, int],
    ou_parents: dict[str, str | None],
) -> dict[str, dict[str, Any]]:
    """
    Build hierarchy info for each org unit based on actual DHIS2 levels.

    Returns a dict mapping ou_id to hierarchy info:
        {
            "level": int,
            "ancestors_by_level": {level_num: ou_id, ...}
        }
    """
    ou_hierarchy: dict[str, dict[str, Any]] = {}

    logger.info(f"[DHIS2 Utils] Building hierarchy for {len(ou_ids)} org units")
    logger.info(f"[DHIS2 Utils] ou_names has {len(ou_names)} entries, ou_levels has {len(ou_levels)} entries, ou_parents has {len(ou_parents)} entries")

    # Debug: show sample entries
    if ou_ids:
        sample_id = ou_ids[0]
        logger.info(f"[DHIS2 Utils] Sample: id={sample_id}, name={ou_names.get(sample_id, 'N/A')}, level={ou_levels.get(sample_id, 'N/A')}, parent={ou_parents.get(sample_id, 'N/A')}")

    for ou_id in ou_ids:
        ou_level = ou_levels.get(ou_id, 0)
        ancestors_by_level: dict[int, str] = {}

        # Walk up the parent chain
        current_id: str | None = ou_id
        visited: set[str] = set()  # Prevent infinite loops
        depth = 0
        max_depth = 10  # Safety limit

        while current_id and current_id not in visited and depth < max_depth:
            visited.add(current_id)
            depth += 1

            current_level = ou_levels.get(current_id, 0)

            # Add to ancestors_by_level if we have a valid level
            if current_level > 0:
                ancestors_by_level[current_level] = current_id

            parent_id = ou_parents.get(current_id)
            # Continue walking up as long as we have a parent
            if parent_id:
                current_id = parent_id
            else:
                break

        if len(ancestors_by_level) == 0:
            logger.warning(f"[DHIS2 Utils] No ancestors found for {ou_id} (level={ou_level}, depth={depth})")
            # Fallback: if we have the org unit's own level, at least add itself
            if ou_level > 0:
                ancestors_by_level[ou_level] = ou_id
                logger.info(f"[DHIS2 Utils] Added self as fallback: level {ou_level} -> {ou_id}")
        else:
            logger.debug(f"[DHIS2 Utils] Hierarchy for {ou_id}: levels {sorted(ancestors_by_level.keys())}")

        ou_hierarchy[ou_id] = {
            "level": ou_level,
            "ancestors_by_level": ancestors_by_level,
        }

    # Log summary
    empty_count = sum(1 for h in ou_hierarchy.values() if not h.get("ancestors_by_level"))
    has_data_count = len(ou_hierarchy) - empty_count
    logger.info(f"[DHIS2 Utils] Built hierarchy: {len(ou_hierarchy)} entries, {has_data_count} with ancestors, {empty_count} empty")

    # Log a sample hierarchy
    if ou_ids and ou_hierarchy:
        sample_id = ou_ids[0]
        sample_h = ou_hierarchy.get(sample_id, {})
        logger.info(f"[DHIS2 Utils] Sample hierarchy for {sample_id}: {sample_h}")

    return ou_hierarchy


def build_preview_columns(
    level_names: dict[int, str],
    dx_names: dict[str, str],
    dx_ids: list[str],
    min_level: int,
    max_level: int,
) -> list[dict[str, Any]]:
    """
    Build column definitions for preview table.

    Returns a list of column definitions with title, dataIndex, key, width.
    """
    columns: list[dict[str, Any]] = []

    # Add hierarchy level columns from min_level to max_level
    for level in range(min_level, max_level + 1):
        level_name = level_names.get(level, f"Level {level}")
        logger.info(f"[DHIS2 Utils] Column for level {level}: '{level_name}'")
        columns.append({
            "title": level_name,
            "dataIndex": f"ou_level_{level}",
            "key": f"ou_level_{level}",
            "width": 140,
        })

    # Add Period column
    columns.append({
        "title": "Period",
        "dataIndex": "period",
        "key": "period",
        "width": 120,
    })

    # Add DX columns
    for dx_id in dx_ids:
        dx_name = dx_names.get(dx_id, dx_id)
        logger.info(f"[DHIS2 Utils] DX column: '{dx_name}' (id: {dx_id})")
        columns.append({
            "title": dx_name,
            "dataIndex": f"de_{dx_id}",
            "key": f"de_{dx_id}",
            "width": 140,
            "de_id": dx_id,
        })

    return columns


def calculate_level_range(
    ou_ids: list[str],
    ou_levels: dict[str, int],
    ou_hierarchy: dict[str, dict[str, Any]],
) -> tuple[int, int]:
    """
    Calculate the min and max levels based on org units and their ancestors.
    """
    all_levels = [ou_levels.get(ou_id, 0) for ou_id in ou_ids if ou_id in ou_levels]
    min_level = min(all_levels) if all_levels else 1
    max_level = max(all_levels) if all_levels else 1

    # Also check ancestors
    for ou_id in ou_ids:
        hierarchy_info = ou_hierarchy.get(ou_id, {})
        for lvl in hierarchy_info.get("ancestors_by_level", {}).keys():
            if lvl < min_level:
                min_level = lvl

    logger.info(f"[DHIS2 Utils] Level range: {min_level} to {max_level}")
    return min_level, max_level


def filter_empty_level_columns(
    columns: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    min_level: int,
    max_level: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Remove empty hierarchy level columns from columns and rows.
    """
    # Find non-empty levels
    non_empty_levels: set[int] = set()
    for row in rows:
        for level in range(min_level, max_level + 1):
            value = row.get(f"ou_level_{level}", "")
            if value and str(value).strip():
                non_empty_levels.add(level)

    logger.info(f"[DHIS2 Utils] Non-empty levels: {sorted(non_empty_levels)}")

    # Filter columns
    columns_to_keep = []
    for col in columns:
        data_index = col.get("dataIndex", "")
        if data_index.startswith("ou_level_"):
            level_num = int(data_index.split("_")[-1])
            if level_num in non_empty_levels:
                columns_to_keep.append(col)
        else:
            columns_to_keep.append(col)

    # Clean up rows
    for row in rows:
        for level in range(min_level, max_level + 1):
            if level not in non_empty_levels and f"ou_level_{level}" in row:
                del row[f"ou_level_{level}"]

    logger.info(f"[DHIS2 Utils] Kept {len(columns_to_keep)} columns (removed {len(columns) - len(columns_to_keep)} empty)")
    return columns_to_keep, rows


def build_ou_dimension_with_levels(
    ou_ids: list[str],
    ou_levels: dict[str, int],
    data_level_scope: str = "selected",
    max_org_unit_level: int = 5,
) -> str:
    """
    Build the ou dimension parameter for DHIS2 Analytics API with LEVEL-X syntax.

    Args:
        ou_ids: List of organization unit IDs
        ou_levels: Mapping of org unit IDs to their levels
        data_level_scope: One of 'selected', 'children', 'grandchildren', 'all_levels'
        max_org_unit_level: Maximum organization unit level in the system

    Returns:
        Org unit dimension string (e.g., "ou_id1;ou_id2;LEVEL-3;LEVEL-4")
    """
    ou_parts = list(ou_ids)

    # Find the highest level among selected org units
    selected_levels = [ou_levels.get(ou_id, 1) for ou_id in ou_ids if ou_id in ou_levels]
    if not selected_levels:
        selected_levels = [1]

    max_selected_level = max(selected_levels)
    logger.info(f"[DHIS2 Utils] Max selected level: {max_selected_level}, Data scope: {data_level_scope}")

    if data_level_scope == "children":
        target_level = max_selected_level + 1
        if target_level <= max_org_unit_level:
            ou_parts.append(f"LEVEL-{target_level}")
            logger.info(f"[DHIS2 Utils] Added LEVEL-{target_level} for children scope")

    elif data_level_scope == "grandchildren":
        for level_offset in [1, 2]:
            target_level = max_selected_level + level_offset
            if target_level <= max_org_unit_level:
                ou_parts.append(f"LEVEL-{target_level}")
                logger.info(f"[DHIS2 Utils] Added LEVEL-{target_level} for grandchildren scope")

    elif data_level_scope == "all_levels":
        for target_level in range(max_selected_level + 1, max_org_unit_level + 1):
            ou_parts.append(f"LEVEL-{target_level}")
            logger.info(f"[DHIS2 Utils] Added LEVEL-{target_level} for all_levels scope")

    dimension = ";".join(ou_parts)
    logger.info(f"[DHIS2 Utils] Built ou dimension: {dimension}")
    return dimension

