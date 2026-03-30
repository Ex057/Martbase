#!/usr/bin/env python
"""
Setup Public Access for Uganda Malaria Superset

This script creates the Public role and configures basic permissions
for unauthenticated dashboard viewing.

Usage:
    docker exec superset_app python /app/scripts/setup_public_access.py
"""

import logging
from superset import db, security_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_public_role():
    """Create Public role with read-only dashboard permissions."""

    logger.info("=" * 70)
    logger.info("Setting up Public Access for Uganda Malaria Superset")
    logger.info("=" * 70)

    # Check if Public role already exists
    public_role = security_manager.find_role("Public")

    if public_role:
        logger.info("✅ Public role already exists")
    else:
        logger.info("Creating Public role...")
        public_role = security_manager.add_role("Public")
        logger.info("✅ Public role created")

    # Define permissions to grant to Public role
    permissions_to_grant = [
        # Dashboard access
        ("can_read", "Dashboard"),
        ("can_list", "Dashboard"),

        # Chart access
        ("can_read", "Chart"),
        ("can_list", "Chart"),

        # Dataset access (read-only)
        ("can_read", "Dataset"),

        # Menu access
        ("menu_access", "Dashboards"),
        ("menu_access", "Charts"),
    ]

    logger.info("\nGranting permissions to Public role:")
    granted_count = 0

    for permission_name, view_name in permissions_to_grant:
        permission = security_manager.find_permission_view_menu(
            permission_name,
            view_name
        )

        if permission:
            if permission not in public_role.permissions:
                public_role.permissions.append(permission)
                logger.info(f"  ✅ Granted: {permission_name} on {view_name}")
                granted_count += 1
            else:
                logger.info(f"  ⏭️  Already granted: {permission_name} on {view_name}")
        else:
            logger.warning(f"  ⚠️  Permission not found: {permission_name} on {view_name}")

    db.session.commit()

    logger.info("\n" + "=" * 70)
    logger.info("✅ Public role setup completed!")
    logger.info("=" * 70)
    logger.info(f"\nGranted {granted_count} new permissions")

    logger.info("\n📋 Next Steps:")
    logger.info("1. Login to Superset at http://localhost:8088 (admin/admin)")
    logger.info("2. Go to: Security → List Roles → Public")
    logger.info("3. Grant 'can read' permission on specific dashboards you want public")
    logger.info("4. Test in incognito window: http://localhost/superset/welcome/")
    logger.info("\n💡 To make a dashboard public:")
    logger.info("   Security → List Roles → Public → Edit")
    logger.info("   Add specific dashboards under 'Permissions'")

    return public_role


def list_dashboards():
    """List all dashboards to help with permission setup."""
    from superset.models.dashboard import Dashboard


    if (dashboards := db.session.query(Dashboard).all()):
        logger.info("\n📊 Available Dashboards:")
        logger.info("-" * 70)
        for dash in dashboards:
            logger.info(f"  ID: {dash.id} | Title: {dash.dashboard_title}")
    else:
        logger.info("\n⚠️  No dashboards found. Create some dashboards first!")


def main():
    try:
        # Create Public role
        public_role = create_public_role()

        # List available dashboards
        list_dashboards()

        logger.info("\n✅ Setup completed successfully!")
        return 0

    except Exception as e:
        logger.error(f"\n❌ Error during setup: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
