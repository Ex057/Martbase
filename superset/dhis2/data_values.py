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
"""DHIS2 dataValueSets API utilities."""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def convert_to_data_values_response(raw_data_values: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert DHIS2 dataValueSets API response into standardized format.

    Args:
        raw_data_values: Response from /api/dataValueSets endpoint

    Returns:
        Standardized data values dictionary
    """
    return {
        "dataValues": raw_data_values.get("dataValues", []),
        "metadata": {
            "dataSet": raw_data_values.get("dataSet"),
            "period": raw_data_values.get("period"),
            "organisationUnit": raw_data_values.get("organisationUnit"),
            "lastUpdated": raw_data_values.get("lastUpdated"),
        },
    }


def build_data_value_params(
    dataset_uid: str,
    org_units: List[str],
    periods: List[str],
    data_elements: Optional[List[str]] = None,
    include_children: bool = False,
) -> Dict[str, Any]:
    """
    Build parameters for DHIS2 dataValueSets API request.

    Args:
        dataset_uid: UID of the dataset
        org_units: List of organisation unit UIDs (concrete, not relative keywords)
        periods: List of period codes (fixed periods, not relative like LAST_5_YEARS)
        data_elements: Optional list of specific data element UIDs to filter
        include_children: Whether to include child org units

    Returns:
        Dictionary of API parameters

    Example:
        >>> params = build_data_value_params(
        ...     dataset_uid='BvD83haYO5d',
        ...     org_units=['ImspD7YubBo', 'O6uvpzGd5pu'],
        ...     periods=['2020', '2021', '2022'],
        ...     data_elements=['JhvC7ZR9hUe', 'D9A0afrTYPw']
        ... )
    """
    if not dataset_uid:
        raise ValueError("dataset_uid is required")

    if not org_units:
        raise ValueError("org_units list cannot be empty")

    if not periods:
        raise ValueError("periods list cannot be empty")

    if not isinstance(org_units, list):
        raise ValueError("org_units must be a list of UIDs")

    if not isinstance(periods, list):
        raise ValueError("periods must be a list of period codes")

    params = {
        "dataSet": dataset_uid,
        "orgUnit": ",".join(org_units),
        "period": ",".join(periods),
    }

    if data_elements:
        if not isinstance(data_elements, list):
            raise ValueError("data_elements must be a list of UIDs")
        params["dataElement"] = ",".join(data_elements)

    if include_children:
        params["children"] = "true"

    return params


def get_last_n_years(years: int = 5) -> List[str]:
    """
    Generate list of year codes for the last N years.

    Args:
        years: Number of years to include (default 5)

    Returns:
        List of year codes (e.g., ['2020', '2021', '2022', '2023', '2024'])

    Note:
        Use this when migrating from relative periods like LAST_5_YEARS
        to fixed period codes for dataValueSets API.
    """
    current_year = datetime.now().year
    return [str(year) for year in range(current_year - years + 1, current_year + 1)]


def get_last_n_quarters(quarters: int = 4) -> List[str]:
    """
    Generate list of quarter codes for the last N quarters.

    Args:
        quarters: Number of quarters to include (default 4)

    Returns:
        List of quarter codes (e.g., ['2023Q3', '2023Q4', '2024Q1', '2024Q2'])

    Note:
        Use this when migrating from relative periods to fixed quarter codes.
    """
    now = datetime.now()
    current_year = now.year
    current_quarter = (now.month - 1) // 3 + 1

    result = []
    q = current_quarter
    y = current_year

    for _ in range(quarters):
        result.insert(0, f"{y}Q{q}")
        q -= 1
        if q < 1:
            q = 4
            y -= 1

    return result


def expand_org_unit_keywords(
    org_units: List[str],
    user_org_units: Optional[List[str]] = None,
) -> List[str]:
    """
    Expand relative org unit keywords to concrete UIDs.

    Args:
        org_units: List that may contain keywords like USER_ORGUNIT_CHILDREN
        user_org_units: List of concrete UIDs that user has access to

    Returns:
        List of concrete org unit UIDs

    Note:
        Keywords like USER_ORGUNIT_GRANDCHILDREN are only supported in analytics endpoints,
        not in dataValueSets. This function helps migrate queries to use concrete UIDs instead.

    Example:
        >>> expand_org_unit_keywords(
        ...     ['USER_ORGUNIT_CHILDREN'],
        ...     user_org_units=['ImspD7YubBo', 'O6uvpzGd5pu', 'qhWMD43UnmE']
        ... )
        ['ImspD7YubBo', 'O6uvpzGd5pu', 'qhWMD43UnmE']
    """
    if not user_org_units:
        user_org_units = []

    result = []
    for ou in org_units:
        if ou.startswith("USER_ORGUNIT"):
            if user_org_units:
                result.extend(user_org_units)
        else:
            result.append(ou)

    return result or org_units
