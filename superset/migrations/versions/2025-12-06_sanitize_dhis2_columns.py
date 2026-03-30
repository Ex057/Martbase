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
Sanitize DHIS2 dataset column names to remove special characters

Revision ID: sanitize_dhis2_columns
Revises: dhis2_enable_period_selection
Create Date: 2025-12-06 15:30:00.000000

This migration sanitizes all column names in DHIS2 datasets by:
1. Converting all special characters (/, -, ., (, ), etc.) to underscores
2. Collapsing multiple underscores to single underscore
3. Preserving the original names in verbose_name field for display

This ensures column names are valid database identifiers and prevents layout distortions.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from sqlalchemy import inspect
import re

revision = "sanitize_dhis2_columns"
down_revision = "dhis2_enable_period_selection"

Base = declarative_base()


def sanitize_dhis2_column_name(name: str) -> str:
    """Sanitize DHIS2 column names for Superset compatibility."""
    name = re.sub(r'[^\w]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return name


def upgrade():
    """Sanitize all DHIS2 dataset column names"""
    bind = op.get_bind()
    session = Session(bind=bind)
    
    try:
        # Check if required tables exist before querying
        inspector = inspect(bind)
        table_names = inspector.get_table_names()
        required_tables = {'table_columns', 'tables', 'dbs'}
        
        if not required_tables.issubset(set(table_names)):
            print(f"✓ Required tables not found - skipping migration")
            session.close()
            return
        
        # Get all columns from DHIS2 datasets
        # We'll use raw SQL to get columns that need updating
        result = session.execute(sa.text("""
            SELECT tc.id, tc.column_name, tc.verbose_name, t.table_name, db.database_name
            FROM table_columns tc
            JOIN tables t ON tc.table_id = t.id
            JOIN dbs db ON t.database_id = db.id
            WHERE db.database_name LIKE '%DHIS2%' 
               OR db.sqlalchemy_uri LIKE '%dhis2://%'
            ORDER BY t.table_name, tc.column_name
        """))
        
        columns_to_update = result.fetchall()
        
        if not columns_to_update:
            print("✓ No DHIS2 datasets found to update")
            session.close()
            return
        
        print(f"Found {len(columns_to_update)} columns in DHIS2 datasets")
        
        updated_count = 0
        
        for col_id, column_name, verbose_name, table_name, db_name in columns_to_update:
            sanitized_name = sanitize_dhis2_column_name(column_name)
            
            # Only update if the sanitized name differs from current name
            if sanitized_name != column_name:
                print(f"\n📊 Dataset: {table_name}")
                print(f"   Original column: {column_name}")
                print(f"   Sanitized column: {sanitized_name}")
                
                # Update the column
                update_stmt = sa.text("""
                    UPDATE table_columns
                    SET column_name = :sanitized,
                        verbose_name = :verbose
                    WHERE id = :id
                """)
                
                session.execute(update_stmt, {
                    'sanitized': sanitized_name,
                    'verbose': verbose_name or column_name,  # Keep original name for display
                    'id': col_id
                })
                
                updated_count += 1
        
        if updated_count > 0:
            print(f"\n✅ Updated {updated_count} column(s)")
            print("💾 Saving changes...")
            session.commit()
            print("✓ Changes saved successfully")
        else:
            print("\n✓ No changes needed - all column names are already sanitized")
        
    except Exception as e:
        print(f"❌ Error during upgrade: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def downgrade():
    """Revert to original column names (not recommended for DHIS2)"""
    print("⚠️  Downgrade is not supported for this migration")
    print("   Column name changes should not be reverted as it may break existing charts")
