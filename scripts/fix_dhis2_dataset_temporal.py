#!/usr/bin/env python3
"""
Script to fix DHIS2 dataset temporal configuration
Removes Period as the main datetime column to enable categorical charting
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from superset import app, db
from superset.models.core import Database
from superset.connectors.sqla.models import SqlaTable, TableColumn


def fix_dhis2_datasets():
    """Fix DHIS2 datasets to treat Period as categorical, not temporal"""

    with app.app_context():
        print("🔍 Finding DHIS2 datasets...")

        # Find all DHIS2 databases
        dhis2_databases = db.session.query(Database).filter(
            Database.database_name.like('%DHIS2%')
        ).all()

        if not dhis2_databases:
            print("⚠️  No DHIS2 databases found")
            print("   Looking for all databases with 'period' column...")

        # Get all datasets
        all_datasets = db.session.query(SqlaTable).all()

        fixed_count = 0

        for dataset in all_datasets:
            # Check if dataset has a period column
            period_columns = [
                col
                for col in dataset.columns
                if 'period' in col.column_name.lower()
                and 'period_start' not in col.column_name.lower()
            ]

            if not period_columns:
                continue

            print(f"\n📊 Dataset: {dataset.table_name}")
            print(f"   Database: {dataset.database.database_name}")

            # Check current main datetime column
            if dataset.main_dttm_col:
                print(f"   Current main datetime: {dataset.main_dttm_col}")

                # If Period is the main datetime column, remove it
                if 'period' in dataset.main_dttm_col.lower() and 'period_start' not in dataset.main_dttm_col.lower():
                    print(f"   ⚠️  Removing Period as main datetime column")
                    dataset.main_dttm_col = None
                    fixed_count += 1

            # Check period columns' temporal flag
            for col in period_columns:
                print(f"   Column: {col.column_name}")
                print(f"   - Is temporal: {col.is_dttm}")
                print(f"   - Type: {col.type}")

                if col.is_dttm:
                    print(f"   ⚠️  Unmarking {col.column_name} as temporal")
                    col.is_dttm = False
                    fixed_count += 1

        if fixed_count > 0:
            print(f"\n✅ Fixed {fixed_count} configuration(s)")
            print("💾 Saving changes...")
            db.session.commit()
            print("✓ Changes saved successfully")
        else:
            print("\n✓ No changes needed - all datasets configured correctly")

        print("\n" + "="*60)
        print("DHIS2 Dataset Configuration Summary")
        print("="*60)

        for dataset in all_datasets:
            period_columns = [
                col for col in dataset.columns
                if 'period' in col.column_name.lower()
            ]

            if period_columns:
                print(f"\n📊 {dataset.table_name}")
                print(f"   Main datetime column: {dataset.main_dttm_col or 'None'}")
                for col in period_columns:
                    status = "❌ Temporal" if col.is_dttm else "✅ Categorical"
                    print(f"   - {col.column_name}: {status}")


if __name__ == "__main__":
    print("="*60)
    print("DHIS2 Dataset Temporal Configuration Fix")
    print("="*60)
    print()
    print("This script will:")
    print("1. Find all datasets with 'period' columns")
    print("2. Remove 'Period' as main datetime column")
    print("3. Unmark period columns as temporal")
    print()

    response = input("Continue? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled")
        sys.exit(0)

    try:
        fix_dhis2_datasets()
        print("\n✅ Fix complete!")
        print("\nNext steps:")
        print("1. Refresh your browser")
        print("2. Create a new Bar Chart (categorical, not time-series)")
        print("3. Set X-Axis to orgunit or orgunit_name")
        print("4. Add Period as a filter")
        print("5. Verify the chart shows regions on X-axis")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
