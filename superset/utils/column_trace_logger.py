"""
Column Tracing Logger for DHIS2 Integration

This module provides comprehensive logging for tracking column selection, 
mapping, and data flow through the query pipeline.

Used to debug data alignment issues where columns are referenced by index 
instead of by name.
"""

import logging
from typing import Any, Optional
from pprint import pformat

logger = logging.getLogger(__name__)


class ColumnTraceLogger:
    """Provides structured logging for column tracking and data flow."""

    @staticmethod
    def log_form_data_columns(
        form_data: dict[str, Any],
        datasource_id: str | int,
        datasource_type: str,
    ) -> None:
        """
        Log columns from formData when a chart is being built.
        
        Args:
            form_data: The form data dictionary from the chart builder
            datasource_id: ID of the datasource
            datasource_type: Type of datasource (table, dataset, etc.)
        """
        columns = form_data.get("columns", [])
        groupby = form_data.get("groupby", [])
        x_axis = form_data.get("x_axis")
        metrics = form_data.get("metrics", [])

        logger.info(
            f"[COLUMN_TRACE] FormData Columns - "
            f"datasource_id={datasource_id}, datasource_type={datasource_type}"
        )
        logger.info(f"[COLUMN_TRACE]   columns: {columns}")
        logger.info(f"[COLUMN_TRACE]   groupby: {groupby}")
        logger.info(f"[COLUMN_TRACE]   x_axis: {x_axis}")
        logger.info(f"[COLUMN_TRACE]   metrics: {metrics}")

    @staticmethod
    def log_query_object_creation(
        query_obj: dict[str, Any],
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log QueryObject details when it's created.
        
        Args:
            query_obj: The QueryObjectDict
            datasource_name: Name of the datasource for reference
        """
        columns = query_obj.get("columns", [])
        metrics = query_obj.get("metrics", [])
        orderby = query_obj.get("orderby", [])

        logger.info(
            f"[COLUMN_TRACE] QueryObject Created - datasource={datasource_name}"
        )
        logger.info(f"[COLUMN_TRACE]   columns: {columns}")
        logger.info(f"[COLUMN_TRACE]   metrics: {metrics}")
        logger.info(f"[COLUMN_TRACE]   orderby: {orderby}")
        logger.info(f"[COLUMN_TRACE]   is_timeseries: {query_obj.get('is_timeseries')}")

    @staticmethod
    def log_sql_generation(
        sql: str,
        column_names: list[str],
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log the generated SQL and expected column names.
        
        Args:
            sql: The generated SQL query
            column_names: Expected column names from the query
            datasource_name: Name of the datasource
        """
        logger.info(
            f"[COLUMN_TRACE] SQL Generated - datasource={datasource_name}"
        )
        logger.info(f"[COLUMN_TRACE]   expected_columns: {column_names}")
        logger.info(f"[COLUMN_TRACE]   sql_first_500_chars: {sql[:500]}")

    @staticmethod
    def log_dataframe_info(
        df_columns: list[str],
        expected_columns: list[str],
        df_shape: tuple[int, int],
        stage: str,
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log DataFrame column info at different processing stages.
        
        Args:
            df_columns: Actual DataFrame column names
            expected_columns: Expected column names
            df_shape: DataFrame shape (rows, cols)
            stage: Processing stage (e.g., "after_query", "after_truncation")
            datasource_name: Name of the datasource
        """
        logger.info(
            f"[COLUMN_TRACE] DataFrame {stage} - datasource={datasource_name}, shape={df_shape}"
        )
        logger.info(f"[COLUMN_TRACE]   actual_columns: {df_columns}")
        logger.info(f"[COLUMN_TRACE]   expected_columns: {expected_columns}")
        
        if df_columns != expected_columns:
            logger.warning(
                f"[COLUMN_TRACE]   ⚠️  COLUMN MISMATCH: "
                f"actual={df_columns} != expected={expected_columns}"
            )

    @staticmethod
    def log_column_selection(
        selection_method: str,
        selected_columns: list[str],
        original_columns: list[str],
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log how columns were selected from DataFrame.
        
        Args:
            selection_method: How columns were selected ("by_name", "by_index")
            selected_columns: The columns that were selected
            original_columns: The original DataFrame columns
            datasource_name: Name of the datasource
        """
        logger.info(
            f"[COLUMN_TRACE] Column Selection - method={selection_method}, "
            f"datasource={datasource_name}"
        )
        logger.info(f"[COLUMN_TRACE]   original_columns: {original_columns}")
        logger.info(f"[COLUMN_TRACE]   selected_columns: {selected_columns}")

    @staticmethod
    def log_data_sample(
        df_columns: list[str],
        data_sample: list[dict[str, Any]],
        sample_size: int = 1,
        stage: str = "final",
    ) -> None:
        """
        Log sample data rows with their column mapping.
        
        Args:
            df_columns: Column names
            data_sample: List of data rows (as dicts)
            sample_size: Number of rows to log
            stage: Processing stage
        """
        logger.info(f"[COLUMN_TRACE] Data Sample ({stage}) - columns: {df_columns}")
        for i, row in enumerate(data_sample[:sample_size]):
            logger.info(f"[COLUMN_TRACE]   row_{i}: {row}")

    @staticmethod
    def log_column_mapping(
        column_mapping: dict[str, str],
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log column name mapping (e.g., from raw names to sanitized names).
        
        Args:
            column_mapping: Dict of original_name -> mapped_name
            datasource_name: Name of the datasource
        """
        logger.info(
            f"[COLUMN_TRACE] Column Mapping - datasource={datasource_name}"
        )
        for original, mapped in column_mapping.items():
            if original != mapped:
                logger.info(f"[COLUMN_TRACE]   {original} -> {mapped}")

    @staticmethod
    def log_index_vs_name_selection(
        tried_by_name: bool,
        success_by_name: bool,
        fallback_to_index: bool,
        columns: list[str],
        datasource_name: Optional[str] = None,
    ) -> None:
        """
        Log whether column selection used names or indices.
        
        Args:
            tried_by_name: Whether name-based selection was attempted
            success_by_name: Whether name-based selection succeeded
            fallback_to_index: Whether index-based fallback was used
            columns: The columns involved
            datasource_name: Name of the datasource
        """
        method = "BY_NAME" if success_by_name else "BY_INDEX"
        status = "✓ SUCCESS" if (tried_by_name and success_by_name) else "⚠️  FALLBACK"
        
        logger.info(
            f"[COLUMN_TRACE] Column Selection {status} - "
            f"method={method}, datasource={datasource_name}"
        )
        logger.info(f"[COLUMN_TRACE]   columns: {columns}")
        logger.info(
            f"[COLUMN_TRACE]   tried_by_name={tried_by_name}, "
            f"success={success_by_name}, "
            f"fallback={fallback_to_index}"
        )


def log_dataframe_snapshot(
    df,
    label: str,
    columns_expected: Optional[list[str]] = None,
) -> None:
    """Utility function to snapshot DataFrame state for debugging."""
    if df is None:
        logger.info(f"[COLUMN_TRACE] {label}: DataFrame is None")
        return

    logger.info(f"[COLUMN_TRACE] {label}:")
    logger.info(f"[COLUMN_TRACE]   shape: {df.shape}")
    logger.info(f"[COLUMN_TRACE]   columns: {list(df.columns)}")
    
    if columns_expected:
        match = set(df.columns) == set(columns_expected)
        logger.info(f"[COLUMN_TRACE]   expected: {columns_expected}")
        logger.info(f"[COLUMN_TRACE]   match: {match}")
    
    if not df.empty and len(df) > 0:
        logger.info(f"[COLUMN_TRACE]   first_row: {dict(df.iloc[0])}")
