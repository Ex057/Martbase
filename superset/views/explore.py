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
from flask import abort, request
from flask_appbuilder import permission_name
from flask_appbuilder.api import expose
from flask_appbuilder.security.decorators import has_access

from superset import db, event_logger
from superset.models.slice import Slice
from superset.superset_typing import FlaskResponse

from .base import BaseSupersetView


class ExploreView(BaseSupersetView):
    route_base = "/explore"
    class_permission_name = "Explore"

    @expose("/")
    @has_access
    @permission_name("read")
    @event_logger.log_this
    def root(self) -> FlaskResponse:
        return super().render_app_template()


class ExplorePermalinkView(BaseSupersetView):
    route_base = "/superset"
    class_permission_name = "Explore"

    @expose("/explore/p/<key>/")
    @has_access
    @permission_name("read")
    @event_logger.log_this
    # pylint: disable=unused-argument
    def permalink(self, key: str) -> FlaskResponse:
        return super().render_app_template()


class PublicExploreView(BaseSupersetView):
    """Public explore view for charts marked as is_public=True"""

    route_base = "/superset"
    class_permission_name = "Public"
    default_view = "public_explore"

    @expose("/explore/public/", methods=("GET",))
    @event_logger.log_this
    def public_explore(self) -> FlaskResponse:
        """Render explore view for public charts without authentication"""
        # Get slice_id from query params
        slice_id = request.args.get("slice_id")
        if not slice_id:
            abort(400, description="slice_id parameter is required")

        try:
            slice_id_int = int(slice_id)
        except ValueError:
            abort(400, description="slice_id must be an integer")

        # Check if chart exists and is public
        chart = db.session.query(Slice).filter_by(id=slice_id_int).first()
        if not chart:
            abort(404, description="Chart not found")

        if not getattr(chart, "is_public", False):
            abort(
                403,
                description="This chart is not public. Please log in to view it.",
            )

        # Render the explore template
        return super().render_app_template()
