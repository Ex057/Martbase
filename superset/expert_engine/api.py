from __future__ import annotations

import csv
import json

from flask import Response, request
from flask_appbuilder.api import expose, protect, safe
from flask_appbuilder.security.decorators import permission_name
from marshmallow import Schema, fields, ValidationError

from superset.expert_engine.service import (
    ExpertEngineError,
    activate_bundle,
    build_bundle,
    bundle_preview_markdown,
    list_bundles,
    preview_csv,
    validate_mapping,
)
from superset.views.base_api import BaseSupersetApi, requires_json


class ActivateSchema(Schema):
    version = fields.String(required=True)


class ExpertEngineRestApi(BaseSupersetApi):
    """Admin-only local research bundle workflow."""

    class_permission_name = "AIManagement"
    resource_name = "expert"
    allow_browser_login = True

    @expose("/bundles", methods=("GET",))
    @protect()
    @safe
    @permission_name("read")
    def bundles(self) -> Response:
        return self.response(200, result=list_bundles())

    @expose("/validate", methods=("POST",))
    @protect()
    @safe
    @permission_name("write")
    @requires_json
    def validate(self) -> Response:
        mapping = (request.json or {}).get("mapping") or {}
        return self.response(200, result={"errors": validate_mapping(mapping)})

    @expose("/preview", methods=("POST",))
    @protect()
    @safe
    @permission_name("write")
    def preview(self) -> Response:
        try:
            upload = request.files.get("file")
            mapping = json.loads(request.form.get("mapping") or "{}")
            if not upload or not upload.filename:
                raise ExpertEngineError("A CSV file is required.")
            if not upload.filename.lower().endswith(".csv"):
                raise ExpertEngineError("Only CSV files are accepted.")
            return self.response(200, result=preview_csv(upload.read(), mapping))
        except (json.JSONDecodeError, ValidationError, UnicodeError, csv.Error) as ex:
            return self.response_400(message=str(ex))
        except ExpertEngineError as ex:
            return self.response(ex.status_code, message=ex.message)

    @expose("/bundles", methods=("POST",))
    @protect()
    @safe
    @permission_name("write")
    def create_bundle(self) -> Response:
        try:
            uploads = request.files.getlist("files") or request.files.getlist("file")
            if not uploads:
                uploads = list(request.files.values())
            mapping = json.loads(request.form.get("mapping") or "{}")
            if not uploads or not all(upload.filename for upload in uploads):
                raise ExpertEngineError("At least one CSV file is required.")
            if not all(upload.filename.lower().endswith(".csv") for upload in uploads):
                raise ExpertEngineError("Only CSV files are accepted.")
            raw_files = {upload.filename: upload.read() for upload in uploads}
            if len(raw_files) != len(uploads):
                raise ExpertEngineError("Each uploaded CSV must have a unique filename.")
            # The uploaded content is never persisted; only its derived artifact
            # and provenance hash are retained.
            bundle = build_bundle(raw_files, None, mapping)
            return self.response(201, result={**bundle, "preview_markdown": bundle_preview_markdown(bundle)})
        except (json.JSONDecodeError, ValidationError, UnicodeError, csv.Error) as ex:
            return self.response_400(message=str(ex))
        except ExpertEngineError as ex:
            return self.response(ex.status_code, message=ex.message)

    @expose("/activate", methods=("POST",))
    @protect()
    @safe
    @permission_name("write")
    @requires_json
    def activate(self) -> Response:
        try:
            payload = ActivateSchema().load(request.json or {})
            return self.response(200, result=activate_bundle(payload["version"]))
        except ValidationError as ex:
            return self.response_400(message=ex.messages)
        except ExpertEngineError as ex:
            return self.response(ex.status_code, message=ex.message)
