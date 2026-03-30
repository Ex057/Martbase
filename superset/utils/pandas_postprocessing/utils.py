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
from collections.abc import Sequence
from functools import partial
from typing import Any, Callable

import numpy as np
import pandas as pd
from flask_babel import gettext as _
from pandas import DataFrame, NamedAgg

from superset.constants import TimeGrain
from superset.exceptions import InvalidPostProcessingError

NUMPY_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "average": np.average,
    "argmin": np.argmin,
    "argmax": np.argmax,
    "count": np.ma.count,
    "count_nonzero": np.count_nonzero,
    "cumsum": np.cumsum,
    "cumprod": np.cumprod,
    "max": np.max,
    "mean": np.mean,
    "median": np.median,
    "nansum": np.nansum,
    "nanmin": np.nanmin,
    "nanmax": np.nanmax,
    "nanmean": np.nanmean,
    "nanmedian": np.nanmedian,
    "nanpercentile": np.nanpercentile,
    "min": np.min,
    "percentile": np.percentile,
    "prod": np.prod,
    "product": np.product,
    "std": np.std,
    "sum": np.sum,
    "var": np.var,
}

DENYLIST_ROLLING_FUNCTIONS = (
    "count",
    "corr",
    "cov",
    "kurt",
    "max",
    "mean",
    "median",
    "min",
    "std",
    "skew",
    "sum",
    "var",
    "quantile",
)

ALLOWLIST_CUMULATIVE_FUNCTIONS = (
    "cummax",
    "cummin",
    "cumprod",
    "cumsum",
)

PROPHET_TIME_GRAIN_MAP: dict[str, str] = {
    TimeGrain.SECOND: "S",
    TimeGrain.MINUTE: "min",
    TimeGrain.FIVE_MINUTES: "5min",
    TimeGrain.TEN_MINUTES: "10min",
    TimeGrain.FIFTEEN_MINUTES: "15min",
    TimeGrain.THIRTY_MINUTES: "30min",
    TimeGrain.HOUR: "H",
    TimeGrain.DAY: "D",
    TimeGrain.WEEK: "W",
    TimeGrain.MONTH: "M",
    TimeGrain.QUARTER: "Q",
    TimeGrain.YEAR: "A",
    TimeGrain.WEEK_STARTING_SUNDAY: "W-SUN",
    TimeGrain.WEEK_STARTING_MONDAY: "W-MON",
    TimeGrain.WEEK_ENDING_SATURDAY: "W-SAT",
    TimeGrain.WEEK_ENDING_SUNDAY: "W-SUN",
}

RESAMPLE_METHOD = ("asfreq", "bfill", "ffill", "linear", "median", "mean", "sum")

FLAT_COLUMN_SEPARATOR = ", "


def _is_multi_index_on_columns(df: DataFrame) -> bool:
    return isinstance(df.columns, pd.MultiIndex)


def scalar_to_sequence(val: Any) -> Sequence[str]:
    if val is None:
        return []
    if isinstance(val, str):
        return [val]
    return val


def validate_column_args(*argnames: str) -> Callable[..., Any]:
    def wrapper(func: Callable[..., Any]) -> Callable[..., Any]:
        def wrapped(df: DataFrame, **options: Any) -> Any:
            if _is_multi_index_on_columns(df):
                # MultiIndex column validate first level
                columns = df.columns.get_level_values(0)
            else:
                columns = df.columns.tolist()
            for name in argnames:
                if name in options and not all(
                    elem in columns for elem in scalar_to_sequence(options.get(name))
                ):
                    raise InvalidPostProcessingError(
                        _("Referenced columns not available in DataFrame.")
                    )
            return func(df, **options)

        return wrapped

    return wrapper


def _get_aggregate_funcs(
    df: DataFrame,
    aggregates: dict[str, dict[str, Any]],
) -> dict[str, NamedAgg]:
    """
    Converts a set of aggregate config objects into functions that pandas can use as
    aggregators. Currently only numpy aggregators are supported.

    :param df: DataFrame on which to perform aggregate operation.
    :param aggregates: Mapping from column name to aggregate config.
    :return: Mapping from metric name to function that takes a single input argument.
    """
    import logging
    import re
    logger = logging.getLogger(__name__)
    
    # DHIS2 datasets: Skip problematic aggregations
    # DHIS2 API returns pre-aggregated data, so postprocessing aggregation is often incorrect
    # Check if this is DHIS2 data (contains columns with DHIS2-style names and hierarchy columns)
    is_dhis2_data = False
    dhis2_hierarchy_patterns = ['National', 'Region', 'District', 'Sub_County', 'Health_Facility', 'Period']
    if all(col in df.columns or col.replace('_', ' ') in df.columns for col in dhis2_hierarchy_patterns[:3]):
        # Likely DHIS2 data if it has multiple hierarchy columns
        is_dhis2_data = True
        logger.warning("[POSTPROCESSING] Detected DHIS2 dataset - will skip problematic aggregations")
    
    # Sanitize column names in aggregates for DHIS2 datasets if needed
    # This handles cases where formData contains unsanitized column names like "SUM(105-EP01a. Suspected fever)"
    try:
        from superset.db_engine_specs.dhis2_dialect import sanitize_dhis2_column_name
        sanitized_aggregates = {}
        for name, agg_obj in aggregates.items():
            sanitized_agg_obj = agg_obj.copy()
            column = agg_obj.get("column", name)
            
            # Handle aggregate function wrappers: SUM(col), AVG(col), etc. (case-insensitive)
            agg_wrapper_match = re.match(r'^(SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|VAR)\((.+)\)$', column, re.IGNORECASE)
            if agg_wrapper_match:
                # Extract the inner column from wrapper
                agg_func = agg_wrapper_match.group(1).upper()  # Normalize to uppercase
                inner_column = agg_wrapper_match.group(2)
                
                # Check if inner column needs sanitization
                if inner_column and any(c in inner_column for c in '- .()/@#$%^&*'):
                    sanitized_inner = sanitize_dhis2_column_name(inner_column)
                    if sanitized_inner != inner_column:
                        # Reconstruct with wrapper
                        sanitized_column = f"{agg_func}({sanitized_inner})"
                        logger.error(f"[POSTPROCESSING] Auto-sanitizing wrapped aggregate: '{column}' -> '{sanitized_column}'")
                        sanitized_agg_obj["column"] = sanitized_column
            else:
                # Not wrapped - sanitize the column directly if it has special chars
                if column and any(c in column for c in '- .()/@#$%^&*'):
                    sanitized_column = sanitize_dhis2_column_name(column)
                    if sanitized_column != column:
                        logger.error(f"[POSTPROCESSING] Auto-sanitizing unsanitized column: '{column}' -> '{sanitized_column}'")
                        sanitized_agg_obj["column"] = sanitized_column
            
            sanitized_aggregates[name] = sanitized_agg_obj
        aggregates = sanitized_aggregates
    except (ImportError, ModuleNotFoundError):
        pass
    
    logger.error(f"[POSTPROCESSING-DEBUG] DataFrame columns: {list(df.columns)}")
    logger.error(f"[POSTPROCESSING-DEBUG] Aggregates: {aggregates}")
    
    agg_funcs: dict[str, NamedAgg] = {}
    for name, agg_obj in aggregates.items():
        column = agg_obj.get("column", name)
        logger.error(f"[POSTPROCESSING-DEBUG] Processing aggregate: name='{name}', column='{column}'")
        
        if column not in df:
            logger.error(f"[POSTPROCESSING-DEBUG] Column '{column}' not found directly. Checking if aggregate name '{name}' is in DataFrame...")
            if name in df:
                logger.error(f"[POSTPROCESSING-DEBUG] Found aggregate name '{name}' in DataFrame! Using name as column.")
                column = name
            else:
                logger.error(f"[POSTPROCESSING-DEBUG] Aggregate name '{name}' not found either. Trying column matching strategies...")
                # Try to find a matching column using various sanitization methods
                found_column = None
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"[DHIS2] Column not found directly: '{column}'. Available columns: {list(df.columns)}")

                # Method 0: Strip aggregate function wrapper (SUM(col), AVG(col), etc. - case insensitive)
                # Chart formData may request "SUM(105_EP01b_Malaria_Total)" but DataFrame has "105_EP01b_Malaria_Total"
                import re
                agg_wrapper_match = re.match(r'^(SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|VAR)\((.+)\)$', column, re.IGNORECASE)
                if agg_wrapper_match:
                    inner_column = agg_wrapper_match.group(2)
                    logger.warning(f"[DHIS2] Extracted inner column from aggregate wrapper: '{inner_column}'")
                    if inner_column in df:
                        found_column = inner_column
                    else:
                        # Use the inner column name for subsequent matching attempts
                        column = inner_column
                
                # Also try the opposite: if column is not wrapped, try finding it wrapped with aggregate function
                if not found_column and "(" not in column and ")" not in column:
                    # Try to find a column that is the aggregated version of this column
                    for df_col in df.columns:
                        # Check if df_col looks like "AGG(column_name)" (case insensitive)
                        wrapper_match = re.match(r'^(SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|VAR)\((.+)\)$', df_col, re.IGNORECASE)
                        if wrapper_match:
                            inner_from_df = wrapper_match.group(2)
                            if inner_from_df == column:
                                found_column = df_col
                                logger.warning(f"[DHIS2] Found aggregated column: '{column}' -> '{df_col}'")
                                break

                # Method 1: Try DHIS2 sanitization
                if not found_column:
                    try:
                        from superset.db_engine_specs.dhis2_dialect import sanitize_dhis2_column_name
                        sanitized_column = sanitize_dhis2_column_name(column)
                        logger.warning(f"[DHIS2] Trying DHIS2 sanitization: '{column}' -> '{sanitized_column}'")
                        if sanitized_column in df:
                            found_column = sanitized_column
                            logger.warning(f"[DHIS2] Found matching column after DHIS2 sanitization!")
                    except (ImportError, ModuleNotFoundError):
                        pass

                # Method 2: Try case-insensitive matching
                if not found_column:
                    for df_col in df.columns:
                        if df_col.lower() == column.lower():
                            found_column = df_col
                            logger.warning(f"[DHIS2] Found matching column with case-insensitive match: '{df_col}'")
                            break

                # Method 3: Try fuzzy matching with common transformations
                if not found_column:
                    # Normalize both names for comparison
                    def normalize(s: str) -> str:
                        s = s.lower()
                        # Use the same sanitization as DHIS2 to ensure consistency
                        s = re.sub(r'[^\w]', '_', s)
                        s = re.sub(r'_+', '_', s)
                        return s.strip('_')

                    normalized_column = normalize(column)
                    logger.error(f"[POSTPROCESSING] Trying fuzzy matching. Normalized query column: '{normalized_column}'")
                    logger.error(f"[POSTPROCESSING] Available DF columns (normalized): {[(df_col, normalize(df_col)) for df_col in df.columns]}")
                    for df_col in df.columns:
                        # Try both direct column and wrapped version
                        norm_df_col = normalize(df_col)
                        
                        # Check direct match
                        if norm_df_col == normalized_column:
                            found_column = df_col
                            logger.error(f"[POSTPROCESSING] Found matching column with fuzzy matching: '{df_col}' (normalized: '{norm_df_col}')")
                            break
                        
                        # Check if df_col is wrapped and inner matches (case insensitive)
                        wrapper_match = re.match(r'^(SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|VAR)\((.+)\)$', df_col, re.IGNORECASE)
                        if wrapper_match:
                            inner_from_df = wrapper_match.group(2)
                            norm_inner = normalize(inner_from_df)
                            if norm_inner == normalized_column:
                                found_column = df_col
                                logger.error(f"[POSTPROCESSING] Found wrapped column with fuzzy matching: '{df_col}' (inner normalized: '{norm_inner}')")
                                break

                if found_column:
                    column = found_column
                else:
                    logger.error(f"[POSTPROCESSING] CRITICAL: Could not find column '{column}' in dataframe")
                    logger.error(f"[POSTPROCESSING] Available columns in DataFrame: {list(df.columns)}")
                    logger.error(f"[POSTPROCESSING] DF shape: {df.shape}, dtypes: {df.dtypes.to_dict()}")
                    logger.error(f"[POSTPROCESSING] DataFrame head:\n{df.head()}")
                    raise InvalidPostProcessingError(
                        _(
                            "Column referenced by aggregate is undefined: %(column)s. "
                            "Available columns: %(available)s",
                            column=column,
                            available=", ".join(str(c) for c in df.columns),
                        )
                    )
        if "operator" not in agg_obj:
            raise InvalidPostProcessingError(
                _(
                    "Operator undefined for aggregator: %(name)s",
                    name=name,
                )
            )
        operator = agg_obj["operator"]
        if callable(operator):
            aggfunc = operator
        else:
            func = NUMPY_FUNCTIONS.get(operator)
            if not func:
                raise InvalidPostProcessingError(
                    _(
                        "Invalid numpy function: %(operator)s",
                        operator=operator,
                    )
                )
            options = agg_obj.get("options", {})
            aggfunc = partial(func, **options)

        # Validate column type before aggregation - prevent "Could not convert string to numeric" errors
        # This happens when dimension columns (like OrgUnit with values "MOH - Uganda") are accidentally
        # included in numeric aggregations
        if column in df.columns:
            col_dtype = df[column].dtype
            # Check if column is object/string type
            if col_dtype == 'object' or str(col_dtype).startswith('string'):
                # Check if column contains non-numeric data
                sample_values = df[column].dropna().head(5).tolist()
                has_non_numeric = False
                for val in sample_values:
                    if isinstance(val, str):
                        try:
                            float(val)
                        except (ValueError, TypeError):
                            has_non_numeric = True
                            break

                if has_non_numeric:
                    # This column contains string values and shouldn't be aggregated numerically
                    # This is likely a configuration error - the wrong column was selected
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(
                        f"[AGGREGATE] ERROR: Column '{column}' contains non-numeric string values "
                        f"(sample: {sample_values[:2]}). Cannot apply numeric aggregation '{operator}'. "
                        f"This usually means the wrong column was selected for the metric. "
                        f"Available columns: {list(df.columns)}"
                    )
                    # Raise a clear error instead of silently returning wrong data
                    raise InvalidPostProcessingError(
                        _(
                            "Cannot aggregate column '%(column)s' - it contains text values like '%(sample)s'. "
                            "Please select a numeric column for metrics.",
                            column=column,
                            sample=str(sample_values[0])[:50] if sample_values else "N/A",
                        )
                    )

        agg_funcs[name] = NamedAgg(column=column, aggfunc=aggfunc)

    return agg_funcs


def _append_columns(
    base_df: DataFrame, append_df: DataFrame, columns: dict[str, str]
) -> DataFrame:
    """
    Function for adding columns from one DataFrame to another DataFrame. Calls the
    assign method, which overwrites the original column in `base_df` if the column
    already exists, and appends the column if the name is not defined.

    Note that! this is a memory-intensive operation.

    :param base_df: DataFrame which to use as the base
    :param append_df: DataFrame from which to select data.
    :param columns: columns on which to append, mapping source column to
           target column. For instance, `{'y': 'y'}` will replace the values in
           column `y` in `base_df` with the values in `y` in `append_df`,
           while `{'y': 'y2'}` will add a column `y2` to `base_df` based
           on values in column `y` in `append_df`, leaving the original column `y`
           in `base_df` unchanged.
    :return: new DataFrame with combined data from `base_df` and `append_df`
    """
    if all(key == value for key, value in columns.items()):
        # make sure to return a new DataFrame instead of changing the `base_df`.
        _base_df = base_df.copy()
        _base_df.loc[:, columns.keys()] = append_df
        return _base_df
    append_df = append_df.rename(columns=columns)
    return pd.concat([base_df, append_df], axis="columns")


def escape_separator(plain_str: str, sep: str = FLAT_COLUMN_SEPARATOR) -> str:
    char = sep.strip()
    return plain_str.replace(char, "\\" + char)


def unescape_separator(escaped_str: str, sep: str = FLAT_COLUMN_SEPARATOR) -> str:
    char = sep.strip()
    return escaped_str.replace("\\" + char, char)
