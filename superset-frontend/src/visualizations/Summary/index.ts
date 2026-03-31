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
import { ChartMetadata, ChartPlugin, t } from '@superset-ui/core';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import SummaryViz from './SummaryViz';
import thumbnail from './images/thumbnailUrl';
import transformProps from './transformProps';

const metadata = new ChartMetadata({
  name: t('Summary'),
  description: t(
    'Compact multi-indicator summary panel for KPI blocks, executive statistics, operational snapshots, and dense analytics cards.',
  ),
  category: t('KPI'),
  tags: [
    t('Summary'),
    t('KPI'),
    t('Indicators'),
    t('Executive'),
    t('Compact'),
    t('Multi-metric'),
  ],
  thumbnail,
});

export default class SummaryChartPlugin extends ChartPlugin {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => Promise.resolve(SummaryViz),
      metadata,
      transformProps,
    });
  }
}
