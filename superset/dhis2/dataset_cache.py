"""
DHIS2 Dataset Metadata Caching

Provides persistent caching for DHIS2 dataset metadata including:
- Data element lists
- Column type information  
- Data preview results
- Column statistics
"""

import logging
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, List

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, String, Integer, DateTime, Text, Index

logger = logging.getLogger(__name__)


class DHIS2DatasetMetadataCache:
    """Cache model for DHIS2 dataset metadata"""

    __tablename__ = 'dhis2_dataset_metadata_cache'

    id = Column(Integer, primary_key=True)
    database_id = Column(Integer, nullable=False, index=True)
    cache_key = Column(String(255), nullable=False, index=True)
    cache_type = Column(String(50), nullable=False)
    metadata = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, index=True)

    __table_args__ = (
        Index('ix_database_cache_type', 'database_id', 'cache_type'),
        Index('ix_cache_key_expires', 'cache_key', 'expires_at'),
    )

    @staticmethod
    def set_metadata(
        db: SQLAlchemy,
        database_id: int,
        cache_type: str,
        cache_key: str,
        data: Dict[str, Any],
        ttl_hours: int = 4,
    ) -> None:
        """
        Store metadata in cache.

        Args:
            db: SQLAlchemy instance
            database_id: Superset database ID
            cache_type: Type of cache (e.g., 'data_elements', 'columns', 'preview')
            cache_key: Unique cache identifier
            data: Metadata to cache
            ttl_hours: Time-to-live in hours (default 4)
        """
        try:
            from superset.extensions import db as db_instance

            expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)

            entry = db_instance.session.query(DHIS2DatasetMetadataCache).filter_by(
                database_id=database_id,
                cache_key=cache_key,
            ).first()

            if entry:
                entry.metadata = json.dumps(data)
                entry.expires_at = expires_at
                entry.created_at = datetime.utcnow()
            else:
                entry = DHIS2DatasetMetadataCache(
                    database_id=database_id,
                    cache_type=cache_type,
                    cache_key=cache_key,
                    metadata=json.dumps(data),
                    expires_at=expires_at,
                )
                db_instance.session.add(entry)

            db_instance.session.commit()
            logger.info(f"[DHIS2Cache] Cached {cache_type}/{cache_key} for {ttl_hours}h")
        except Exception as e:
            logger.warning(f"[DHIS2Cache] Failed to cache metadata: {e}")

    @staticmethod
    def get_metadata(
        database_id: int,
        cache_key: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve metadata from cache.

        Args:
            database_id: Superset database ID
            cache_key: Cache key to retrieve

        Returns:
            Cached metadata or None if expired/missing
        """
        try:
            from superset.extensions import db as db_instance

            entry = (
                db_instance.session.query(DHIS2DatasetMetadataCache)
                .filter_by(
                    database_id=database_id,
                    cache_key=cache_key,
                )
                .first()
            )

            if not entry:
                return None

            if entry.expires_at and entry.expires_at < datetime.utcnow():
                db_instance.session.delete(entry)
                db_instance.session.commit()
                logger.info(f"[DHIS2Cache] Cache expired: {cache_key}")
                return None

            logger.info(f"[DHIS2Cache] Cache hit: {cache_key}")
            return json.loads(entry.metadata)
        except Exception as e:
            logger.warning(f"[DHIS2Cache] Failed to retrieve cache: {e}")
            return None

    @staticmethod
    def invalidate_cache(
        database_id: int,
        cache_type: Optional[str] = None,
    ) -> int:
        """
        Invalidate cached metadata.

        Args:
            database_id: Superset database ID
            cache_type: Optional cache type to invalidate (all if None)

        Returns:
            Number of entries deleted
        """
        try:
            from superset.extensions import db as db_instance

            query = db_instance.session.query(DHIS2DatasetMetadataCache).filter_by(
                database_id=database_id,
            )

            if cache_type:
                query = query.filter_by(cache_type=cache_type)

            count = query.delete()
            db_instance.session.commit()
            logger.info(f"[DHIS2Cache] Invalidated {count} cache entries")
            return count
        except Exception as e:
            logger.warning(f"[DHIS2Cache] Failed to invalidate cache: {e}")
            return 0

    @staticmethod
    def get_cache_stats(database_id: int) -> Dict[str, Any]:
        """Get cache statistics for a database."""
        try:
            from superset.extensions import db as db_instance

            total = (
                db_instance.session.query(DHIS2DatasetMetadataCache)
                .filter_by(database_id=database_id)
                .count()
            )

            by_type = (
                db_instance.session.query(
                    DHIS2DatasetMetadataCache.cache_type,
                )
                .filter_by(database_id=database_id)
                .group_by(DHIS2DatasetMetadataCache.cache_type)
                .count()
            )

            return {
                "total_entries": total,
                "by_type": by_type,
                "database_id": database_id,
            }
        except Exception as e:
            logger.warning(f"[DHIS2Cache] Failed to get stats: {e}")
            return {"error": str(e)}
