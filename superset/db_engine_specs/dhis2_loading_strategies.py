import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import requests
from urllib.parse import urlencode

logger = logging.getLogger(__name__)


class LoadStrategy(Enum):
    """DHIS2 API loading strategies to handle different data sizes"""
    DIRECT = "direct"
    BATCHED = "batched"
    PAGINATED = "paginated"
    ASYNC_QUEUE = "async_queue"


@dataclass
class BatchConfig:
    """Configuration for batched requests"""
    batch_size: int = 5
    max_concurrent_batches: int = 3
    batch_delay_ms: float = 100


@dataclass
class RetryConfig:
    """Configuration for retry logic"""
    max_retries: int = 3
    initial_backoff_seconds: float = 1.0
    max_backoff_seconds: float = 30.0
    backoff_multiplier: float = 2.0
    retry_on_status_codes: List[int] = None

    def __post_init__(self):
        if self.retry_on_status_codes is None:
            self.retry_on_status_codes = [408, 429, 500, 502, 503, 504]


@dataclass
class TimeoutConfig:
    """Adaptive timeout configuration based on query complexity"""
    base_timeout: float = 30.0
    preview_timeout: float = 10.0
    large_query_timeout: float = 300.0
    timeout_per_data_element: float = 5.0
    timeout_per_org_unit: float = 2.0


class DHIS2LoadingStrategy:
    """
    Implements various loading strategies for DHIS2 Analytics API
    to handle timeouts and large datasets efficiently
    """

    def __init__(self, timeout_config: Optional[TimeoutConfig] = None):
        self.timeout_config = timeout_config or TimeoutConfig()
        self.retry_config = RetryConfig()
        self.batch_config = BatchConfig()

    def calculate_adaptive_timeout(
        self,
        num_data_elements: int,
        num_org_units: int,
        is_preview: bool = False,
    ) -> float:
        """
        Calculate request timeout based on query complexity

        Args:
            num_data_elements: Number of data elements in query
            num_org_units: Number of organization units in query
            is_preview: Whether this is a preview query

        Returns:
            Timeout in seconds
        """
        if is_preview:
            return self.timeout_config.preview_timeout

        complexity = (
            num_data_elements * self.timeout_config.timeout_per_data_element
            + num_org_units * self.timeout_config.timeout_per_org_unit
        )

        timeout = min(
            max(
                self.timeout_config.base_timeout,
                complexity,
            ),
            self.timeout_config.large_query_timeout,
        )

        logger.info(
            f"[DHIS2 Timeout] Calculated {timeout}s timeout for "
            f"{num_data_elements} data elements, {num_org_units} org units"
        )
        return timeout

    def execute_with_retry(
        self,
        func: Callable,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """
        Execute function with exponential backoff retry logic

        Args:
            func: Function to execute
            args: Positional arguments
            kwargs: Keyword arguments

        Returns:
            Function result

        Raises:
            Exception: If all retries are exhausted
        """
        backoff = self.retry_config.initial_backoff_seconds
        last_exception = None

        for attempt in range(self.retry_config.max_retries + 1):
            try:
                logger.debug(f"[DHIS2 Retry] Attempt {attempt + 1}/{self.retry_config.max_retries + 1}")
                return func(*args, **kwargs)
            except requests.exceptions.Timeout as e:
                last_exception = e
                if attempt < self.retry_config.max_retries:
                    logger.warning(
                        f"[DHIS2 Retry] Timeout on attempt {attempt + 1}, "
                        f"retrying in {backoff}s"
                    )
                    time.sleep(backoff)
                    backoff = min(
                        backoff * self.retry_config.backoff_multiplier,
                        self.retry_config.max_backoff_seconds,
                    )
            except requests.exceptions.HTTPError as e:
                if e.response.status_code in self.retry_config.retry_on_status_codes:
                    last_exception = e
                    if attempt < self.retry_config.max_retries:
                        logger.warning(
                            f"[DHIS2 Retry] HTTP {e.response.status_code} on attempt {attempt + 1}, "
                            f"retrying in {backoff}s"
                        )
                        time.sleep(backoff)
                        backoff = min(
                            backoff * self.retry_config.backoff_multiplier,
                            self.retry_config.max_backoff_seconds,
                        )
                else:
                    raise
            except Exception as e:
                last_exception = e
                raise

        logger.error(
            f"[DHIS2 Retry] All {self.retry_config.max_retries + 1} attempts failed"
        )
        raise last_exception

    def batch_data_elements(
        self,
        data_elements: List[str],
        batch_size: Optional[int] = None,
    ) -> List[List[str]]:
        """
        Batch data elements into smaller groups to avoid large payloads

        Args:
            data_elements: List of data element IDs
            batch_size: Size of each batch (uses config default if not provided)

        Returns:
            List of batches, each containing up to batch_size elements
        """
        if batch_size is None:
            batch_size = self.batch_config.batch_size

        batches = []
        for i in range(0, len(data_elements), batch_size):
            batch = data_elements[i : i + batch_size]
            batches.append(batch)
            logger.debug(
                f"[DHIS2 Batching] Batch {len(batches)}: {len(batch)} data elements"
            )

        logger.info(
            f"[DHIS2 Batching] Split {len(data_elements)} data elements into "
            f"{len(batches)} batches of ~{batch_size}"
        )
        return batches

    def build_batched_requests(
        self,
        data_element_batches: List[List[str]],
        periods: List[str],
        org_units: List[str],
        base_params: Dict[str, str],
    ) -> List[Tuple[str, Dict[str, str]]]:
        """
        Build separate API requests for each data element batch

        Args:
            data_element_batches: List of data element batches
            periods: List of periods
            org_units: List of organization units
            base_params: Base parameters for all requests

        Returns:
            List of (endpoint, params) tuples for each batch request
        """
        requests_list = []

        for batch_num, batch in enumerate(data_element_batches):
            params = base_params.copy()

            dimension_parts = []
            if batch:
                dimension_parts.append(f"dx:{';'.join(batch)}")
            if periods:
                dimension_parts.append(f"pe:{';'.join(periods)}")
            if org_units:
                dimension_parts.append(f"ou:{';'.join(org_units)}")

            if dimension_parts:
                params["dimension"] = ";".join(dimension_parts)

            endpoint = base_params.get("_endpoint", "analytics")
            requests_list.append((endpoint, params))

            logger.debug(
                f"[DHIS2 Batching] Batch {batch_num + 1}: "
                f"{len(batch)} data elements, {len(periods)} periods, "
                f"{len(org_units)} org units"
            )

        logger.info(
            f"[DHIS2 Batching] Created {len(requests_list)} separate API requests"
        )
        return requests_list

    def choose_strategy(
        self,
        data_elements: List[str],
        periods: List[str],
        org_units: List[str],
        is_preview: bool = False,
    ) -> LoadStrategy:
        """
        Choose optimal loading strategy based on query complexity

        Strategy selection logic:
        - Preview queries: DIRECT (fast, limited to 1 DE + 1 period)
        - Small queries (<=5 DE, <=10 OU): DIRECT
        - Medium queries (5-20 DE, <=20 OU): BATCHED
        - Large queries (>20 DE or >20 OU): PAGINATED
        - Very large queries (>50 DE or >50 OU): ASYNC_QUEUE

        Args:
            data_elements: List of data element IDs
            periods: List of periods
            org_units: List of organization units
            is_preview: Whether this is a preview query

        Returns:
            Recommended LoadStrategy
        """
        if is_preview:
            return LoadStrategy.DIRECT

        num_de = len(data_elements)
        num_ou = len(org_units)
        total_complexity = num_de * num_ou

        if total_complexity <= 50:
            strategy = LoadStrategy.DIRECT
        elif total_complexity <= 200:
            strategy = LoadStrategy.BATCHED
        elif total_complexity <= 1000:
            strategy = LoadStrategy.PAGINATED
        else:
            strategy = LoadStrategy.ASYNC_QUEUE

        logger.info(
            f"[DHIS2 Strategy] Selected {strategy.value} for "
            f"{num_de} data elements × {num_ou} org units (complexity: {total_complexity})"
        )
        return strategy

    def merge_batch_responses(
        self,
        batch_responses: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Merge multiple batch responses into a single response

        Args:
            batch_responses: List of response dictionaries from each batch

        Returns:
            Merged response with combined rows
        """
        if not batch_responses:
            return {"rows": [], "columns": []}

        merged = {
            "rows": [],
            "columns": batch_responses[0].get("columns", []),
            "width": 0,
            "height": 0,
            "metaData": batch_responses[0].get("metaData", {}),
        }

        for response in batch_responses:
            rows = response.get("rows", [])
            merged["rows"].extend(rows)

        merged["height"] = len(merged["rows"])
        merged["width"] = len(merged.get("columns", []))

        logger.info(
            f"[DHIS2 Merge] Merged {len(batch_responses)} batch responses "
            f"into {len(merged['rows'])} total rows"
        )
        return merged
