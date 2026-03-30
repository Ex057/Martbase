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
"""Integration tests for DHIS2 boundary API."""

import pytest
from superset.dhis2.geojson_utils import convert_to_geojson, build_ou_parameter


class TestGeoJSONUtils:
    """Test GeoJSON conversion utilities."""

    def test_convert_to_geojson_empty_list(self):
        """Test converting empty geoFeatures list."""
        result = convert_to_geojson([])
        assert result['type'] == 'FeatureCollection'
        assert result['features'] == []

    def test_convert_to_geojson_with_features(self):
        """Test converting geoFeatures to GeoJSON."""
        geo_features = [
            {
                'id': 'test-id-1',
                'na': 'Test Region',
                'le': 2,
                'pi': 'parent-id',
                'pn': 'Parent Region',
                'ty': 2,
                'co': '[[0, 0], [1, 1], [1, 0]]',
                'hcd': True,
                'hcu': False,
            }
        ]

        result = convert_to_geojson(geo_features)

        assert result['type'] == 'FeatureCollection'
        assert len(result['features']) == 1

        feature = result['features'][0]
        assert feature['id'] == 'test-id-1'
        assert feature['properties']['name'] == 'Test Region'
        assert feature['properties']['level'] == 2
        assert feature['geometry']['type'] == 'Polygon'

    def test_build_ou_parameter_with_parent(self):
        """Test building OU parameter with parent ID."""
        result = build_ou_parameter(2, 'parent-uid')
        assert result == 'parent-uid'

    def test_build_ou_parameter_with_level(self):
        """Test building OU parameter with level."""
        result = build_ou_parameter(2, None)
        assert result == 'ou:LEVEL-2'

    def test_build_ou_parameter_defaults(self):
        """Test building OU parameter with defaults."""
        result = build_ou_parameter(None, None)
        assert result == 'ou:USER_ORGUNIT'
