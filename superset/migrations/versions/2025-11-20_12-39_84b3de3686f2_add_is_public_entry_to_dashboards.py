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
"""add_is_public_entry_to_dashboards

Revision ID: 84b3de3686f2
Revises: f80f89fd0494
Create Date: 2025-11-20 12:39:46.857604

"""

# revision identifiers, used by Alembic.
revision = '84b3de3686f2'
down_revision = 'f80f89fd0494'

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


def upgrade():
    # Add is_public_entry column to dashboards table (FR-1.2)
    # Check if column already exists to avoid duplicate column error
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns('dashboards')]

    if 'is_public_entry' not in columns:
        # SQLite doesn't support ALTER COLUMN, so use batch_alter_table
        with op.batch_alter_table('dashboards') as batch_op:
            batch_op.add_column(
                sa.Column('is_public_entry', sa.Boolean(), nullable=False, server_default=sa.false())
            )


def downgrade():
    # Remove is_public_entry column
    op.drop_column('dashboards', 'is_public_entry')
