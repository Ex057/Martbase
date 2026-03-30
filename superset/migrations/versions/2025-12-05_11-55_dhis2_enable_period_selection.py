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
Enable Period column selection in DHIS2 datasets

Revision ID: dhis2_enable_period_selection
Revises: dhis2_categorical_fix
Create Date: 2025-12-05 11:55:00.000000

This migration re-enables Period/period columns as selectable groupby dimensions
so they appear in the chart builder column selection UI.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session

revision = "dhis2_enable_period_selection"
down_revision = "dhis2_categorical_fix"

Base = declarative_base()


def upgrade():
    """
    Mark Period columns as groupable so they appear in column selection UI
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

        if not dhis2_databases:
            print("No DHIS2 databases found - skipping migration")
            return

        print(f"Found {len(dhis2_databases)} DHIS2 database(s)")

        for db_id, db_name in dhis2_databases:
            print(f"Processing database: {db_name} (ID: {db_id})")

            # Find all tables/datasets for this DHIS2 database
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

            print(f"  Found {len(datasets)} dataset(s)")

            for dataset_id, table_name in datasets:
                print(f"    Updating dataset: {table_name} (ID: {dataset_id})")

                # Mark Period/period columns as groupable (selectable in UI)
                period_columns = session.execute(
                    sa.text(
                        """
                        SELECT id, column_name, groupby 
                        FROM table_columns 
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('period', 'pe')
                        AND groupby = 0
                        """
                    ),
                    {"dataset_id": dataset_id},
                ).fetchall()

                for col_id, col_name, groupby in period_columns:
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
                    print(f"      ✓ Enabled '{col_name}' as selectable dimension (groupby=1)")

        session.commit()
        print("✅ Period column selection re-enabled successfully")

    except Exception as e:
        session.rollback()
        print(f"❌ Error during migration: {e}")
        raise
    finally:
        session.close()


def downgrade():
    """
    Revert Period columns to non-groupable state
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
                # Mark Period columns back as non-groupable
                session.execute(
                    sa.text(
                        """
                        UPDATE table_columns 
                        SET groupby = 0
                        WHERE table_id = :dataset_id 
                        AND LOWER(column_name) IN ('period', 'pe')
                        """
                    ),
                    {"dataset_id": dataset_id},
                )

        session.commit()
        print("✅ Period column selection disabled")

    except Exception as e:
        session.rollback()
        print(f"❌ Error during downgrade: {e}")
        raise
    finally:
        session.close()
