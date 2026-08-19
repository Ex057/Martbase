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
from __future__ import annotations

from collections import Counter
from typing import Any, Optional, TYPE_CHECKING

from flask import g
from flask_appbuilder.security.sqla.models import Role, User

from superset import security_manager
from superset.commands.exceptions import (
    DatasourceNotFoundValidationError,
    OwnersNotFoundValidationError,
    RolesNotFoundValidationError,
    TagForbiddenError,
    TagNotFoundValidationError,
)
from superset.daos.datasource import DatasourceDAO
from superset.daos.exceptions import DatasourceNotFound
from superset.daos.tag import TagDAO
from superset.tags.models import ObjectType, Tag, TagType
from superset.utils import json
from superset.utils.core import DatasourceType, get_user_id

if TYPE_CHECKING:
    from superset.connectors.sqla.models import BaseDatasource


def populate_owner_list(
    owner_ids: list[int] | None,
    default_to_user: bool,
) -> list[User]:
    """
    Helper function for commands, will fetch all users from owners id's

    :param owner_ids: list of owners by id's
    :param default_to_user: make user the owner if `owner_ids` is None or empty
    :raises OwnersNotFoundValidationError: if at least one owner id can't be resolved
    :returns: Final list of owners
    """
    owner_ids = owner_ids or []
    owners = []
    if not owner_ids and default_to_user:
        return [g.user]
    if not (security_manager.is_admin() or get_user_id() in owner_ids):
        # make sure non-admins can't remove themselves as owner by mistake
        owners.append(g.user)
    for owner_id in owner_ids:
        owner = security_manager.get_user_by_id(owner_id)
        if not owner:
            raise OwnersNotFoundValidationError()
        owners.append(owner)
    return owners


def compute_owner_list(
    current_owners: list[User] | None,
    new_owners: list[int] | None,
) -> list[User]:
    """
    Helper function for update commands, to properly handle the owners list.
    Preserve the previous configuration unless included in the update payload.

    :param current_owners: list of current owners
    :param new_owners: list of new owners specified in the update payload
    :returns: Final list of owners
    """
    current_owners = current_owners or []
    owners_ids = (
        [owner.id for owner in current_owners] if new_owners is None else new_owners
    )
    return populate_owner_list(owners_ids, default_to_user=False)


def populate_roles(role_ids: list[int] | None = None) -> list[Role]:
    """
    Helper function for commands, will fetch all roles from roles id's
     :raises RolesNotFoundValidationError: If a role in the input list is not found
    :param role_ids: A List of roles by id's
    """
    roles: list[Role] = []
    if role_ids:
        roles = security_manager.find_roles_by_id(role_ids)
        if len(roles) != len(role_ids):
            raise RolesNotFoundValidationError()
    return roles


def get_datasource_by_id(datasource_id: int, datasource_type: str) -> BaseDatasource:
    try:
        return DatasourceDAO.get_datasource(
            DatasourceType(datasource_type), datasource_id
        )
    except DatasourceNotFound as ex:
        raise DatasourceNotFoundValidationError() from ex


def get_dhis2_chart_identity(datasource: Any) -> dict[str, Any]:
    """Extract stable DHIS2 identity metadata from a datasource object."""
    extra: dict[str, Any] = {}
    if hasattr(datasource, "get_extra_dict"):
        try:
            extra = datasource.get_extra_dict() or {}
        except Exception:  # pylint: disable=broad-except
            extra = {}
    elif hasattr(datasource, "extra_dict"):
        try:
            extra = datasource.extra_dict or {}
        except Exception:  # pylint: disable=broad-except
            extra = {}

    identity: dict[str, Any] = {}

    staged_dataset_id = extra.get("dhis2_staged_dataset_id")
    try:
        staged_dataset_id = int(staged_dataset_id)
    except (TypeError, ValueError):
        staged_dataset_id = None
    if staged_dataset_id is not None:
        identity["dhis2_staged_dataset_id"] = staged_dataset_id

    dataset_role = getattr(datasource, "dataset_role", None)
    if isinstance(dataset_role, str) and dataset_role.strip():
        identity["dhis2_dataset_role"] = dataset_role.strip()

    return identity


def _update_query_context_dhis2_identity(
    query_context: dict[str, Any],
    identity: dict[str, Any],
) -> None:
    if not identity:
        return

    form_data = query_context.get("form_data")
    if not isinstance(form_data, dict):
        form_data = {}
    form_data.update(identity)
    query_context["form_data"] = form_data

    datasource = query_context.get("datasource")
    if isinstance(datasource, dict):
        datasource.update(identity)

    queries = query_context.get("queries")
    if isinstance(queries, list):
        for query in queries:
            if isinstance(query, dict):
                query_datasource = query.get("datasource")
                if isinstance(query_datasource, dict):
                    query_datasource.update(identity)


def inject_chart_dhis2_identity(
    config: dict[str, Any],
    datasource: Any,
) -> dict[str, Any]:
    """Inject stable DHIS2 dataset identity into chart save/import payloads."""
    identity = get_dhis2_chart_identity(datasource)
    if not identity:
        return config

    params = config.get("params")
    if params is None:
        params = {}
    elif isinstance(params, str):
        try:
            params = json.loads(params)
        except (TypeError, json.JSONDecodeError):
            params = {}
    elif not isinstance(params, dict):
        params = {}
    params.update(identity)
    config["params"] = json.dumps(params)

    query_context = config.get("query_context")
    if query_context is None:
        return config
    if isinstance(query_context, str):
        try:
            query_context = json.loads(query_context)
        except (TypeError, json.JSONDecodeError):
            query_context = {}
    elif not isinstance(query_context, dict):
        query_context = {}

    _update_query_context_dhis2_identity(query_context, identity)
    config["query_context"] = json.dumps(query_context)
    return config


def validate_tags(
    object_type: ObjectType,
    current_tags: list[Tag],
    new_tag_ids: Optional[list[int]],
) -> None:
    """
    Helper function for update commands, to validate the tags list. Users
    with `can_write` on `Tag` are allowed to both create new tags and manage
    tag association with objects. Users with `can_tag` on `object_type` are
    only allowed to manage existing existing tags' associations with the object.

    :param current_tags: list of current tags
    :param new_tag_ids: list of tags specified in the update payload
    """

    # `tags` not part of the update payload
    if new_tag_ids is None:
        return

    # No changes in the list
    current_custom_tags = [tag.id for tag in current_tags if tag.type == TagType.custom]
    if Counter(current_custom_tags) == Counter(new_tag_ids):
        return

    # No perm to tags assets
    if not (
        security_manager.can_access("can_write", "Tag")
        or security_manager.can_access("can_tag", object_type.name.capitalize())
    ):
        validation_error = (
            f"You do not have permission to manage tags on {object_type.name}s"
        )
        raise TagForbiddenError(validation_error)

    # Validate if new tags already exist
    additional_tags = [tag for tag in new_tag_ids if tag not in current_custom_tags]
    for tag_id in additional_tags:
        if not TagDAO.find_by_id(tag_id):
            validation_error = f"Tag ID {tag_id} not found"
            raise TagNotFoundValidationError(validation_error)

    return


def update_tags(
    object_type: ObjectType,
    object_id: int,
    current_tags: list[Tag],
    new_tag_ids: list[int],
) -> None:
    """
    Helper function for update commands, to update the tag relationship.

    :param object_id: The object (dashboard, chart, etc) ID
    :param object_type: The object type
    :param current_tags: list of current tags
    :param new_tag_ids: list of tags specified in the update payload
    """

    current_custom_tags = [tag for tag in current_tags if tag.type == TagType.custom]
    current_custom_tag_ids = [
        tag.id for tag in current_tags if tag.type == TagType.custom
    ]

    tags_to_delete = [tag for tag in current_custom_tags if tag.id not in new_tag_ids]
    for tag in tags_to_delete:
        TagDAO.delete_tagged_object(object_type, object_id, tag.name)

    tag_ids_to_add = [
        tag_id for tag_id in new_tag_ids if tag_id not in current_custom_tag_ids
    ]
    if tag_ids_to_add:
        tags_to_add = TagDAO.find_by_ids(tag_ids_to_add)
        TagDAO.create_custom_tagged_objects(
            object_type, object_id, [tag.name for tag in tags_to_add]
        )


def update_chart_config_dataset(
    config: dict[str, Any], dataset_info: dict[str, Any]
) -> dict[str, Any]:
    """
    Update the chart configuration and query_context with new dataset information

    :param config: The original chart configuration
    :param dataset_info: Dict with datasource_id, datasource_type, and datasource_name
    :return: The updated chart configuration
    """
    # Update datasource id, type, and name
    config.update(dataset_info)

    dataset_uid = f"{dataset_info['datasource_id']}__{dataset_info['datasource_type']}"
    config["params"].update({"datasource": dataset_uid})

    identity = {
        key: value
        for key, value in dataset_info.items()
        if key in {"dhis2_staged_dataset_id", "dhis2_dataset_role"} and value is not None
    }
    if identity:
        config["params"].update(identity)

    if "query_context" in config and config["query_context"] is not None:
        try:
            query_context = json.loads(config["query_context"])

            query_context["datasource"] = {
                "id": dataset_info["datasource_id"],
                "type": dataset_info["datasource_type"],
            }

            if "form_data" in query_context:
                query_context["form_data"]["datasource"] = dataset_uid
                query_context["form_data"].update(identity)

            query_context["datasource"].update(identity)

            if "queries" in query_context:
                for query in query_context["queries"]:
                    if "datasource" in query:
                        query["datasource"] = query_context["datasource"]

            config["query_context"] = json.dumps(query_context)
        except json.JSONDecodeError:
            config["query_context"] = None

    return config
