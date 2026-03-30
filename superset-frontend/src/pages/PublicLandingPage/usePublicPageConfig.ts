/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useState, useEffect } from 'react';
import { SupersetClient } from '@superset-ui/core';
import {
  PublicPageLayoutConfig,
  DEFAULT_PUBLIC_PAGE_CONFIG,
  mergeConfig,
} from './config';

interface UsePublicPageConfigResult {
  config: PublicPageLayoutConfig;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage public page configuration
 * Falls back to default config if API is unavailable
 */
export function usePublicPageConfig(): UsePublicPageConfigResult {
  const [config, setConfig] = useState<PublicPageLayoutConfig>(
    DEFAULT_PUBLIC_PAGE_CONFIG,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await SupersetClient.get({
          endpoint: '/api/v1/public_page/config',
        });
        const serverConfig = response.json?.result || {};
        setConfig(mergeConfig(serverConfig));
      } catch (err) {
        // Use default config if API fails
        console.warn(
          'Failed to fetch public page config, using defaults:',
          err,
        );
        setConfig(DEFAULT_PUBLIC_PAGE_CONFIG);
        setError('Using default configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
}

export default usePublicPageConfig;
