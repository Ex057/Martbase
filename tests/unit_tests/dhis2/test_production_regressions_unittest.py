"""Pytest-free regressions runnable by ``scripts/run_unit_tests.py``."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from superset.connectors.sqla.models import SqlaTable
from superset.models.core import Database


class TestDHIS2ServingMetadataWrapper(unittest.TestCase):
    def setUp(self) -> None:
        self.source_database = Database(
            id=5,
            database_name="UG Malaria Repository",
            sqlalchemy_uri="dhis2://",
        )
        self.serving_database = Database(
            id=4,
            database_name="DHIS2 Serving (ClickHouse)",
            sqlalchemy_uri="clickhousedb://",
        )
        self.dataset = SqlaTable(
            table_name="MAL Pregnancy",
            schema="dhis2_serving",
            sql="SELECT * FROM `dhis2_serving`.`sv_34_mal_preg_dataset_mart`",
            dataset_role="METADATA",
            extra=(
                '{"dhis2_staged_local": true, '
                '"dhis2_staged_dataset_id": 34, '
                '"dhis2_serving_database_id": 4, '
                '"dhis2_serving_table_ref": '
                '"dhis2_serving.sv_34_mal_preg_dataset_mart"}'
            ),
            database=self.source_database,
            database_id=5,
        )

    def test_runtime_repair_keeps_metadata_on_serving_database(self) -> None:
        with patch.object(
            self.dataset,
            "get_serving_database",
            return_value=self.serving_database,
        ):
            self.dataset.repair_staged_local_database_binding()

        self.assertIs(self.dataset.database, self.serving_database)
        self.assertEqual(self.dataset.database_id, 4)
        self.assertEqual(self.dataset.schema, "dhis2_serving")
        self.assertEqual(
            self.dataset.sql,
            "SELECT * FROM `dhis2_serving`.`sv_34_mal_preg_dataset_mart`",
        )

    def test_external_metadata_uses_repaired_serving_wrapper(self) -> None:
        with patch.object(
            self.dataset,
            "get_serving_database",
            return_value=self.serving_database,
        ), patch(
            "superset.connectors.sqla.models.get_virtual_table_metadata",
            return_value=[{"column_name": "period", "type": "STRING"}],
        ) as get_virtual_table_metadata:
            metadata = self.dataset.external_metadata()

        self.assertEqual(metadata, [{"column_name": "period", "type": "STRING"}])
        self.assertIs(self.dataset.database, self.serving_database)
        self.assertEqual(self.dataset.schema, "dhis2_serving")
        get_virtual_table_metadata.assert_called_once_with(dataset=self.dataset)
