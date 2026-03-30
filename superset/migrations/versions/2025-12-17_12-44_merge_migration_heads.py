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
"""Merge multiple migration heads into a single head

This migration consolidates all parallel migration branches that developed
over time. It does not make any schema changes - it simply merges the
migration history into a linear sequence.

Revision ID: merge_migration_heads
Revises: Multiple heads (see down_revision tuple)
Create Date: 2025-12-17 12:44:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "merge_migration_heads"
down_revision = (
    "0b1f1ab473c0",
    "130915240929",
    "15a2c68a2e6b",
    "175ea3592453",
    "19a814813610",
    "1d2ddd543133",
    "1d9e835a84f9",
    "2e5a0ee25ed4",
    "30bb17c0dc76",
    "33d996bcc382",
    "3b626e2a6783",
    "3dfd0e78650e",
    "3e1b21cd94a4",
    "4451805bbaa1",
    "46ba6aaaac97",
    "472d2f73dfd4",
    "525c854f0005",
    "58d051681a3b",
    "65903709c321",
    "705732c70154",
    "732f1c06bcbf",
    "7467e77870e4",
    "763d4b211ec9",
    "7b17aa722e30",
    "836c0bf75904",
    "8b70aa3d0f87",
    "8b841273bec3",
    "96164e3017c6",
    "978245563a02",
    "a2d606a761d9",
    "a33a03f16c4a",
    "a99f2f7c195a",
    "a9c47e2c1547",
    "ab3d66c4246e",
    "b0d0249074e4",
    "bcf3126872fc",
    "bebcf3fed1fe",
    "bf706ae5eb46",
    "c82ee8a39623",
    "c9495751e314",
    "cefabc8f7d38",
    "d39b1e37131d",
    "db527d8c4c78",
    "ddd6ebdd853b",
    "df3d7e2eb9a4",
    "e3970889f38e",
    "e553e78e90c5",
    "e863403c0c50",
    "ea033256294a",
    "ec1f88a35cc6",
    "f120347acb39",
    "f1f2d4af5b90",
    "fbd55e0f83eb",
    "update_dhis2_chart_columns",
)


def upgrade():
    pass


def downgrade():
    pass
