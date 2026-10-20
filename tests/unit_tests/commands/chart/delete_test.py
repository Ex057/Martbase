from __future__ import annotations

from types import SimpleNamespace

from flask import g

from superset.commands.chart.delete import DeleteChartCommand


def test_delete_ai_chart_records_tombstone_before_deleting(
    app_context: None,
    mocker,
) -> None:
    del app_context
    # Bypass the outer commit in the transaction decorator; the production
    # command still commits the tombstone and chart deletion atomically.
    g.in_transaction = True
    chart = SimpleNamespace(id=7, slice_name="AI admissions chart")
    command = DeleteChartCommand([7])
    command._models = [chart]
    mocker.patch.object(command, "validate")
    record_tombstone = mocker.patch(
        "superset.ai_insights.chart_identity.record_ai_chart_tombstone",
        return_value=True,
    )
    delete = mocker.patch("superset.commands.chart.delete.ChartDAO.delete")

    command.run()

    record_tombstone.assert_called_once_with(chart)
    delete.assert_called_once_with([chart])
