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
"""
Fix DHIS2 datasets for categorical charting

Revision ID: dhis2_categorical_fix
Revises: 84b3de3686f2
Create Date: 2025-12-03 16:30:00.000000

This migration updates existing DHIS2 datasets to support categorical charting:
1. Removes Period as main datetime column
2. Marks Period/period columns as non-temporal (is_dttm=False)
3. Ensures OrgUnit/orgUnit columns are marked as categorical dimensions

This allows charts to use OrgUnit, DataElement, or any DHIS2 dimension
as the X-axis, instead of being forced to use Period.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session

# revision identifiers, used by Alembic.
revision = "dhis2_categorical_fix"
down_revision = "84b3de3686f2"

Base = declarative_base()


def upgrade():
    """
    Update DHIS2 datasets to support categorical charting
    """
    bind = op.get_bind()
    session = Session(bind=bind)

    try:
        # Find all DHIS2 databases by sqlalchemy_uri pattern
        dhis2_databases = session.execute(
            sa.text(
                """
                SELECT id, database_name, sqlalchemy_uri
                FROM dbs 
                WHERE sqlalchemy_uri LIKE 'dhis2://%'
                """
            )
        ).fetchall()

        if not dhis2_databases:
            print("No DHIS2 databases found - skipping migration")
            return

        print(f"Found {len(dhis2_databases)} DHIS2 database(s)")

        for db_id, db_name, db_uri in dhis2_databases:
            print(f"Processing database: {db_name} (ID: {db_id})")

            # Find all tables/datasets for this DHIS2 database
            datasets = session.execute(
                sa.text(
                    """
                    SELECT id, table_name, main_dttm_col 
                    FROM tables 
                    WHERE database_id = :db_id
                    """
                ),
                {"db_id": db_id},
            ).fetchall()

            print(f"  Found {len(datasets)} dataset(s)")

            for dataset_id, table_name, main_dttm_col in datasets:
                print(f"    Updating dataset: {table_name} (ID: {dataset_id})")

                # 1. Remove main_dttm_col if it's set to a period column
                if main_dttm_col and main_dttm_col.lower() in ["period", "pe"]:
                    session.execute(
                        sa.text(
                            """
                            UPDATE tables 
                            SET main_dttm_col = NULL 
                            WHERE id = :dataset_id
                            """
                        ),
                        {"dataset_id": dataset_id},
                    )
                    print(f"      ✓ Removed main_dttm_col '{main_dttm_col}'")

                # 2. Mark Period/period columns as non-temporal
                period_columns = session.execute(
                    sa.text(
                        """
                        SELECT id, column_name, is_dttm 
                        FROM table_columns 
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('period', 'pe')
                        """
                    ),
                    {"dataset_id": dataset_id},
                ).fetchall()

                for col_id, col_name, is_dttm in period_columns:
                    if is_dttm:
                        session.execute(
                            sa.text(
                                """
                                UPDATE table_columns 
                                SET is_dttm = 0 
                                WHERE id = :col_id
                                """
                            ),
                            {"col_id": col_id},
                        )
                        print(f"      ✓ Marked column '{col_name}' as non-temporal")

                # 3. Mark Period columns as non-groupable (filter-only, not a dimension)
                period_groupby_columns = session.execute(
                    sa.text(
                        """
                        SELECT id, column_name, groupby 
                        FROM table_columns 
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('period', 'pe')
                        AND groupby = 1
                        """
                    ),
                    {"dataset_id": dataset_id},
                ).fetchall()

                for col_id, col_name, groupby in period_groupby_columns:
                    session.execute(
                        sa.text(
                            """
                            UPDATE table_columns 
                            SET groupby = 0 
                            WHERE id = :col_id
                            """
                        ),
                        {"col_id": col_id},
                    )
                    print(f"      ✓ Marked column '{col_name}' as non-groupable (filter-only)")

                # 4. Ensure OrgUnit columns are marked as categorical (groupable)
                orgunit_columns = session.execute(
                    sa.text(
                        """
                        SELECT id, column_name, groupby 
                        FROM table_columns 
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('orgunit', 'ou', 'orgunit_name', 'organisation_unit')
                        """
                    ),
                    {"dataset_id": dataset_id},
                ).fetchall()

                for col_id, col_name, groupby in orgunit_columns:
                    if not groupby:
                        session.execute(
                            sa.text(
                                """
                                UPDATE table_columns 
                                SET groupby = 1 
                                WHERE id = :col_id
                                """
                            ),
                            {"col_id": col_id},
                        )
                        print(f"      ✓ Marked column '{col_name}' as groupable")

        session.commit()
        print("✅ DHIS2 categorical charting fix completed successfully")

    except Exception as e:
        session.rollback()
        print(f"❌ Error during migration: {e}")
        raise
    finally:
        session.close()


def downgrade():
    """
    Revert DHIS2 datasets to original state

    Note: This is a best-effort revert. We can't restore the exact original
    main_dttm_col values, so we set Period columns back to temporal.
    """
    bind = op.get_bind()
    session = Session(bind=bind)

    try:
        # Find all DHIS2 databases
        dhis2_databases = session.execute(
            sa.text(
                """
                SELECT id, database_name 
                FROM dbs 
                WHERE sqlalchemy_uri LIKE 'dhis2://%'
                """
            )
        ).fetchall()

        for db_id, db_name in dhis2_databases:
            # Find all tables for this database
            datasets = session.execute(
                sa.text(
                    """
                    SELECT id, table_name 
                    FROM tables 
                    WHERE database_id = :db_id
                    """
                ),
                {"db_id": db_id},
            ).fetchall()

            for dataset_id, table_name in datasets:
                # Mark Period columns back as temporal and groupable
                session.execute(
                    sa.text(
                        """
                        UPDATE table_columns 
                        SET is_dttm = 1, groupby = 1
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('period', 'pe')
                        """
                    ),
                    {"dataset_id": dataset_id},
                )

        session.commit()
        print("✅ DHIS2 categorical fix reverted")

    except Exception as e:
        session.rollback()
        print(f"❌ Error during downgrade: {e}")
        raise
    finally:
        session.close()

