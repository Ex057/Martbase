#
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
#
"""Utilities for cascading filter support in Superset dashboards."""

from typing import Any, Dict, List, Optional, Set, Tuple, Union


class CascadeLevel:
    """Represents a level in a cascading filter hierarchy."""

    def __init__(
        self,
        column: str,
        label: str,
        parent_column: Optional[str] = None,
    ):
        """Initialize a cascade level.

        Args:
            column: Database column name
            label: Human-readable label
            parent_column: Parent level column (if any)
        """
        self.column = column
        self.label = label
        self.parent_column = parent_column


class CascadeHierarchy:
    """Manages a cascading filter hierarchy."""

    def __init__(self, levels: List[CascadeLevel]):
        """Initialize cascade hierarchy.

        Args:
            levels: List of cascade levels in order from parent to child
        """
        self.levels = levels
        self._cascade_map: Optional[Dict[str, Dict[Any, Set[Any]]]] = None

    def build_cascade_map(self, data: List[Dict[str, Any]]) -> Dict[str, Dict[Any, Set[Any]]]:
        """Build cascade mapping from data for efficient filtering.

        Args:
            data: List of data records

        Returns:
            Mapping of column -> parent_value -> set of child values
        """
        cascade_map: Dict[str, Dict[Any, Set[Any]]] = {}

        for level_idx, level in enumerate(self.levels):
            column_map: Dict[Any, Set[Any]] = {}

            if level_idx == 0:
                distinct_values = set()
                for record in data:
                    val = record.get(level.column)
                    if val is not None:
                        distinct_values.add(val)

                for val in distinct_values:
                    column_map[val] = {val}

            else:
                parent_level = self.levels[level_idx - 1]
                for record in data:
                    parent_val = record.get(parent_level.column)
                    current_val = record.get(level.column)

                    if parent_val is not None and current_val is not None:
                        if parent_val not in column_map:
                            column_map[parent_val] = set()
                        column_map[parent_val].add(current_val)

            cascade_map[level.column] = column_map

        self._cascade_map = cascade_map
        return cascade_map

    def get_options(
        self,
        column: str,
        parent_column: Optional[str],
        parent_value: Optional[Union[str, int, List[Union[str, int]]]],
    ) -> List[Union[str, int]]:
        """Get available values for a cascade level.

        Args:
            column: Target column name
            parent_column: Parent column name (if any)
            parent_value: Selected parent value(s)

        Returns:
            List of available values for the column
        """
        if self._cascade_map is None:
            return []

        column_map = self._cascade_map.get(column, {})
        if not column_map:
            return []

        if not parent_column or parent_value is None:
            result = set()
            for values_set in column_map.values():
                result.update(values_set)
            return sorted(list(result))

        parent_values = parent_value if isinstance(parent_value, list) else [parent_value]
        options = set()

        for pval in parent_values:
            child_values = column_map.get(pval)
            if child_values:
                options.update(child_values)

        return sorted(list(options))

    def validate_selection(
        self,
        filter_state: Dict[str, Optional[Union[str, int, List[Union[str, int]]]]],
    ) -> Tuple[bool, List[str]]:
        """Validate that selected values are compatible across levels.

        Args:
            filter_state: Current filter selections by column name

        Returns:
            Tuple of (is_valid, list of error messages)
        """
        if self._cascade_map is None:
            return True, []

        errors: List[str] = []

        for level_idx, level in enumerate(self.levels):
            if level_idx == 0 or not level.parent_column:
                continue

            parent_value = filter_state.get(level.parent_column)
            current_value = filter_state.get(level.column)

            if parent_value is None or current_value is None:
                continue

            column_map = self._cascade_map.get(level.column, {})
            parent_values = parent_value if isinstance(parent_value, list) else [parent_value]
            current_values = current_value if isinstance(current_value, list) else [current_value]

            for cval in current_values:
                is_valid = any(
                    cval in column_map.get(pval, set()) for pval in parent_values
                )
                if not is_valid:
                    errors.append(
                        f"{level.label} value '{cval}' is not available "
                        f"for selected {self.levels[level_idx - 1].label}"
                    )

        return len(errors) == 0, errors


def generate_cascade_filter_sql(
    filter_state: Dict[str, Optional[Union[str, int, List[Union[str, int]]]]],
    filter_hierarchy: Dict[str, str],
    use_where: bool = True,
) -> str:
    """Generate SQL WHERE clause for cascading filters.

    Args:
        filter_state: Current filter selections
        filter_hierarchy: Mapping of filter names to column names
        use_where: Include WHERE keyword in output

    Returns:
        SQL fragment for filtering
    """
    conditions: List[str] = []

    for filter_name, value in filter_state.items():
        if value is None:
            continue

        column = filter_hierarchy.get(filter_name)
        if not column:
            continue

        if isinstance(value, list):
            quoted_values = [f"'{str(v).replace(chr(39), chr(39) + chr(39))}'" for v in value]
            conditions.append(f"{column} IN ({', '.join(quoted_values)})")
        else:
            quoted_value = f"'{str(value).replace(chr(39), chr(39) + chr(39))}'"
            conditions.append(f"{column} = {quoted_value}")

    if not conditions:
        return ""

    where_clause = " AND ".join(conditions)
    return f"WHERE {where_clause}" if use_where else where_clause


def apply_cascade_filter_to_query(
    query: Any,
    cascade_parent_id: Optional[str],
    cascade_parent_column: Optional[str],
    parent_filter_value: Optional[Union[str, int, List[Union[str, int]]]],
) -> Any:
    """Apply cascade filtering to a SQLAlchemy query.

    Args:
        query: SQLAlchemy query object
        cascade_parent_id: ID of the parent filter (for logging)
        cascade_parent_column: Database column of parent filter
        parent_filter_value: Current value(s) of parent filter

    Returns:
        Modified query with cascade filter applied
    """
    if (
        not cascade_parent_id
        or not cascade_parent_column
        or parent_filter_value is None
    ):
        return query

    try:
        import sqlalchemy as sa
        from sqlalchemy import Column

        # Convert single value to list for uniform processing
        values = (
            parent_filter_value
            if isinstance(parent_filter_value, list)
            else [parent_filter_value]
        )

        # Filter out None values
        values = [v for v in values if v is not None]
        if not values:
            return query

        # Apply IN filter for parent column
        parent_col = sa.literal_column(f'"{cascade_parent_column}"')
        query = query.filter(parent_col.in_(values))

        return query
    except Exception as e:
        # Log but don't fail - cascade filtering is optional
        import logging

        logging.warning(
            f"Failed to apply cascade filter for parent {cascade_parent_id}: {str(e)}"
        )
        return query


def reset_child_filters(
    filter_state: Dict[str, Optional[Union[str, int, List[Union[str, int]]]]],
    changed_column: str,
    hierarchy: CascadeHierarchy,
) -> Dict[str, Optional[Union[str, int, List[Union[str, int]]]]]:
    """Reset child filter values when parent filter changes.

    Args:
        filter_state: Current filter state
        changed_column: Column that was changed
        hierarchy: Cascade hierarchy

    Returns:
        Updated filter state with reset child values
    """
    reset_state = dict(filter_state)

    changed_idx = next(
        (idx for idx, level in enumerate(hierarchy.levels) if level.column == changed_column),
        -1,
    )

    if changed_idx == -1:
        return reset_state

    for level in hierarchy.levels[changed_idx + 1 :]:
        reset_state[level.column] = None

    return reset_state


class AdminHierarchyCascade(CascadeHierarchy):
    """Predefined cascade hierarchy for administrative units."""

    def __init__(self):
        """Initialize administrative hierarchy cascade."""
        levels = [
            CascadeLevel("region", "Region"),
            CascadeLevel("district", "District", parent_column="region"),
            CascadeLevel("subcounty", "Subcounty", parent_column="district"),
            CascadeLevel("health_facility", "Health Facility", parent_column="subcounty"),
        ]
        super().__init__(levels)


class PeriodHierarchyCascade(CascadeHierarchy):
    """Predefined cascade hierarchy for periods."""

    def __init__(self):
        """Initialize period hierarchy cascade."""
        levels = [
            CascadeLevel("period_type", "Period Type"),
            CascadeLevel("period", "Period", parent_column="period_type"),
        ]
        super().__init__(levels)
