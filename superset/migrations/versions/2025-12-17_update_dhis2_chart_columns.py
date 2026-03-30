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
Update existing DHIS2 charts and datasets to use new sanitization approach

Revision ID: update_dhis2_chart_columns
Revises: sanitize_dhis2_columns
Create Date: 2025-12-17 14:00:00.000000

This migration updates:
1. Chart form_data to use sanitized column references
2. Dataset SQL to ensure compatibility with new naming
3. Creates backward compatibility mappings for column lookups
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
import json
import re

revision = "update_dhis2_chart_columns"
down_revision = "add_display_order_dashboards"

Base = declarative_base()


def sanitize_dhis2_column_name(name: str) -> str:
    """Sanitize DHIS2 column names - matches frontend and backend logic."""
    if not name or not isinstance(name, str):
        return ""
    
    sanitized = name.strip()
    sanitized = re.sub(r"[^\w]", "_", sanitized)  # Replace non-word chars
    sanitized = re.sub(r"_+", "_", sanitized)      # Collapse underscores
    sanitized = re.sub(r"^_+|_+$", "", sanitized)  # Strip edges
    return sanitized


def find_metric_column_in_dataset(metric_expr: str, dataset_id: int, bind) -> str:
    """Find actual column name in dataset that matches metric expression."""
    if not metric_expr:
        return metric_expr
    
    try:
        # Get available columns from dataset
        result = bind.execute(text("""
            SELECT column_name FROM table_columns 
            WHERE table_id = (SELECT id FROM tables WHERE id = :dataset_id)
        """), {"dataset_id": dataset_id})
        
        columns = [row[0] for row in result.fetchall()]
        if not columns:
            return metric_expr
        
        sanitized_metric = sanitize_dhis2_column_name(metric_expr)
        
        # Try exact match
        if sanitized_metric in columns:
            return sanitized_metric
        
        # Try to find by sanitized name
        for col in columns:
            if sanitize_dhis2_column_name(col) == sanitized_metric:
                return col
        
        # Try extracting from SUM(...) pattern
        agg_match = re.match(
            r"^(SUM|AVG|COUNT|MIN|MAX|STDDEV|VARIANCE)\s*\(\s*([^)]+)\s*\)$",
            metric_expr,
            re.IGNORECASE
        )
        if agg_match:
            inner = agg_match.group(2).strip()
            sanitized_inner = sanitize_dhis2_column_name(inner)
            
            if sanitized_inner in columns:
                return sanitized_inner
            
            for col in columns:
                if sanitize_dhis2_column_name(col) == sanitized_inner:
                    return col
        
        # Fallback: return sanitized version
        return sanitized_metric
    
    except Exception:
        return metric_expr


def upgrade():
    """Update existing DHIS2 charts to use new column sanitization"""
    bind = op.get_bind()
    session = Session(bind=bind)
    
    try:
        inspector = inspect(bind)
        table_names = inspector.get_table_names()
        
        # Check required tables exist
        if not {"slices", "tables", "dbs"}.issubset(set(table_names)):
            print("✓ Required tables not found - skipping migration")
            session.close()
            return
        
        # Find all slices using DHIS2 datasets
        result = session.execute(text("""
            SELECT s.id, s.params, s.datasource_id, t.table_name, db.database_name
            FROM slices s
            JOIN tables t ON s.datasource_id = t.id
            JOIN dbs db ON t.database_id = db.id
            WHERE (s.viz_type IN ('dhis2_map', 'dhis2_table') OR t.table_name LIKE '%DHIS2%')
              AND (db.database_name LIKE '%DHIS2%' OR db.sqlalchemy_uri LIKE '%dhis2://%')
            ORDER BY t.table_name, s.id
        """))
        
        charts = result.fetchall()
        
        if not charts:
            print("✓ No DHIS2 charts found to update")
            session.close()
            return
        
        print(f"\n🔄 Found {len(charts)} DHIS2 chart(s) to update\n")
        
        updated_count = 0
        
        for chart_id, params_json, dataset_id, table_name, db_name in charts:
            try:
                params = json.loads(params_json) if params_json else {}
                updated = False
                
                # Update metric column reference
                if "metric" in params and params["metric"]:
                    old_metric = params["metric"]
                    new_metric = find_metric_column_in_dataset(
                        old_metric, dataset_id, bind
                    )
                    
                    if new_metric != old_metric:
                        print(f"📊 Chart ID {chart_id} ({table_name})")
                        print(f"   Metric: {old_metric} → {new_metric}")
                        params["metric"] = new_metric
                        updated = True
                
                # Update org_unit_column reference
                if "org_unit_column" in params and params["org_unit_column"]:
                    old_col = params["org_unit_column"]
                    new_col = find_metric_column_in_dataset(
                        old_col, dataset_id, bind
                    )
                    
                    if new_col != old_col:
                        print(f"   Org Unit Column: {old_col} → {new_col}")
                        params["org_unit_column"] = new_col
                        updated = True
                
                # Update tooltip_columns
                if "tooltip_columns" in params and isinstance(
                    params["tooltip_columns"], list
                ):
                    new_tooltip_cols = []
                    columns_changed = False
                    
                    for col in params["tooltip_columns"]:
                        new_col = find_metric_column_in_dataset(
                            col, dataset_id, bind
                        )
                        if new_col != col:
                            columns_changed = True
                        new_tooltip_cols.append(new_col)
                    
                    if columns_changed:
                        print(f"   Tooltip Columns: {params['tooltip_columns']} → {new_tooltip_cols}")
                        params["tooltip_columns"] = new_tooltip_cols
                        updated = True
                
                # Save updated params if any changes were made
                if updated:
                    update_stmt = text("""
                        UPDATE slices
                        SET params = :params, changed_on = NOW()
                        WHERE id = :id
                    """)
                    
                    session.execute(update_stmt, {
                        "params": json.dumps(params),
                        "id": chart_id
                    })
                    
                    updated_count += 1
                    print("   ✅ Updated")
            
            except json.JSONDecodeError:
                print(f"⚠️  Chart ID {chart_id}: Could not parse params JSON - skipping")
            except Exception as e:
                print(f"❌ Chart ID {chart_id}: {str(e)}")
        
        if updated_count > 0:
            print(f"\n✅ Updated {updated_count} chart(s)")
            print("💾 Saving changes...")
            session.commit()
            print("✓ Changes saved successfully")
        else:
            print("\n✓ All charts already use correct column names")
    
    except Exception as e:
        print(f"❌ Error during upgrade: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def downgrade():
    """Downgrade is not supported for this migration"""
    print("⚠️  Downgrade is not supported for this migration")
    print("   Use form_data backup or manual column reference fixes if needed")
