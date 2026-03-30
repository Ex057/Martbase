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
"""Add display_order column to dashboards table

Revision ID: add_display_order_dashboards
Revises: sanitize_dhis2_columns
Create Date: 2025-12-15 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "add_display_order_dashboards"
down_revision = "sanitize_dhis2_columns"


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Only add column if it doesn't already exist
    if not column_exists("dashboards", "display_order"):
        op.add_column(
            "dashboards",
            sa.Column("display_order", sa.Integer(), nullable=True),
        )


def downgrade():
    # Only drop column if it exists
    if column_exists("dashboards", "display_order"):
        op.drop_column("dashboards", "display_order")
