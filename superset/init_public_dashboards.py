import logging
from flask import Flask
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def init_public_dashboards(app: Flask) -> None:
    with app.app_context():
        from superset.models.dashboard import Dashboard
        from superset.daos.dashboard import EmbeddedDashboardDAO
        from superset.extensions import db

        try:
            all_dashboards = db.session.query(Dashboard).all()

            for dash in all_dashboards:
                if not dash.embedded:
                    embedded = EmbeddedDashboardDAO.upsert(dash, [])
                    logger.info(
                        f"[Embedded Dashboard] Auto-initialized dashboard: {dash.dashboard_title} "
                        f"(ID: {dash.id}, UUID: {embedded.uuid})"
                    )

            db.session.commit()
            logger.info(
                f"[Embedded Dashboard] Initialization complete. "
                f"Total dashboards processed: {len(all_dashboards)}"
            )
        except Exception as e:
            logger.error(
                f"[Embedded Dashboard] Failed to initialize embedded dashboards: {e}",
                exc_info=True,
            )
            db.session.rollback()
