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
import {
  forwardRef,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  css,
  getExtensionsRegistry,
  QueryData,
  styled,
  t,
  useTheme,
} from '@superset-ui/core';
import { useUiConfig } from 'src/components/UiConfigContext';
import { isEmbedded } from 'src/dashboard/util/isEmbedded';
import { Tooltip, EditableTitle, Icons } from '@superset-ui/core/components';
import { useSelector } from 'react-redux';
import SliceHeaderControls from 'src/dashboard/components/SliceHeaderControls';
import { SliceHeaderControlsProps } from 'src/dashboard/components/SliceHeaderControls/types';
import FiltersBadge from 'src/dashboard/components/FiltersBadge';
import GroupByBadge from 'src/dashboard/components/GroupByBadge';
import { RootState } from 'src/dashboard/types';
import RowCountLabel from 'src/components/RowCountLabel';
import { URL_PARAMS } from 'src/constants';
import { DashboardPageIdContext } from 'src/dashboard/containers/DashboardPage';
import { ensureIsArray } from '@superset-ui/core';

const extensionsRegistry = getExtensionsRegistry();

type SliceHeaderProps = SliceHeaderControlsProps & {
  updateSliceName?: (arg0: string) => void;
  editMode?: boolean;
  annotationQuery?: object;
  annotationError?: object;
  sliceName?: string;
  filters: object;
  handleToggleFullSize: () => void;
  formData: object;
  width: number;
  height: number;
  exportPivotExcel?: (arg0: string) => void;
};

const annotationsLoading = t('Annotation layers are still loading.');
const annotationsError = t('One or more annotation layers failed loading.');
const CrossFilterIcon = styled(Icons.ApartmentOutlined)`
  ${({ theme }) => `
    cursor: default;
    color: ${theme.colorPrimary};
    line-height: 1.8;
  `}
`;

const ChartHeaderStyles = styled.div`
  ${({ theme }) => css`
    font-size: var(--pro-density-chart-title, ${(theme as any).fontSizeBase || theme.fontSize}px);
    font-weight: 600;
    margin-bottom: 0;
    display: flex;
    max-width: 100%;
    align-items: center;
    min-height: 32px;
    padding: 6px var(--pro-density-header-h, 10px);
    border-bottom: 2px solid var(--pro-blue, ${theme.colorPrimary});
    background: linear-gradient(
      180deg,
      ${theme.colorBgContainer} 0%,
      ${theme.colorFillAlter || theme.colorBgLayout} 100%
    );

    & > .header-title {
      overflow: visible;
      white-space: normal;
      word-break: break-word;
      max-width: calc(100% - ${theme.sizeUnit * 6}px);
      flex: 1 1 0%;
      display: flex;
      flex-direction: column;
      color: var(--pro-navy, ${theme.colorText});
      letter-spacing: -0.01em;

      .chart-auto-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pro-text-secondary, ${theme.colorTextDescription});
        margin-bottom: 2px;
        line-height: 1.3;
      }

      .chart-title-main {
        display: block;
      }

      & > span.ant-tooltip-open {
        display: inline;
      }
    }

    & > .header-controls {
      display: flex;
      align-items: center;
      height: 24px;
      flex-shrink: 0;
      gap: 2px;
    }

    .chart-filter-context {
      font-size: 11px;
      font-weight: 400;
      color: var(--pro-text-secondary, ${theme.colorTextDescription});
      margin-top: 1px;
      line-height: 1.3;
      opacity: 0.85;
    }

    @media (max-width: 767px) {
      padding: 2px 8px;
      font-size: 13px;

      & > .header-title {
        max-width: calc(100% - ${theme.sizeUnit * 4}px);
      }
    }

    .dropdown.btn-group {
      pointer-events: none;
      vertical-align: top;
      & > * {
        pointer-events: auto;
      }
    }

    .dropdown-toggle.btn.btn-default {
      background: none;
      border: none;
      box-shadow: none;
    }

    .dropdown-menu.dropdown-menu-right {
      top: ${theme.sizeUnit * 5}px;
    }

    .divider {
      margin: ${theme.sizeUnit}px 0;
    }

    .refresh-tooltip {
      display: block;
      height: ${theme.sizeUnit * 4}px;
      margin: ${theme.sizeUnit}px 0;
      color: ${theme.colorTextLabel};
    }
  `}
`;

function formatReadableLabel(value: string | null | undefined): string | null {
  const candidate = String(value || '').trim();
  if (!candidate) return null;

  // Filter out meaningless labels
  const lowerCandidate = candidate.toLowerCase();
  const meaninglessPatterns = [
    'no filter',
    'undefined',
    'null',
    'none',
    'select',
    'choose',
    'all',
  ];

  if (meaninglessPatterns.some(pattern => lowerCandidate === pattern)) {
    return null;
  }

  // Clean up labels like "ou_level" → "OU Level", "sum_of_cases" → "Sum of Cases"
  const cleaned = candidate
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
}

function summarizeMetric(formData: Record<string, any>): string | null {
  const metrics = ensureIsArray(formData.metrics).filter(Boolean);
  const metric = metrics[0] || formData.metric;
  if (!metric) {
    return null;
  }

  let label: string | null = null;

  if (typeof metric === 'string') {
    label = formatReadableLabel(metric);
  } else if (typeof metric === 'object') {
    label =
      formatReadableLabel(metric.label) ||
      formatReadableLabel(metric.metric_name) ||
      formatReadableLabel(metric.column?.label) ||
      formatReadableLabel(metric.column?.column_name) ||
      formatReadableLabel(metric.expressionType === 'SQL' ? metric.sqlExpression : '');
  }

  // Clean up common metric formatting issues
  if (label) {
    // Remove redundant "Sum Of" or "Count Of" prefixes when they're generic
    label = label
      .replace(/^(Sum|Count|Avg|Average|Min|Max)\s+Of\s+(.+)$/i, (_, agg, col) => {
        // Only simplify if the column name already indicates aggregation
        const colLower = col.toLowerCase();
        if (
          colLower.includes('total') ||
          colLower.includes('count') ||
          colLower.includes('sum')
        ) {
          return col;
        }
        return `${agg} of ${col}`;
      })
      .trim();

    // Remove generic suffixes like "Level" from abbreviated column names
    label = label.replace(/^([A-Z]{2,3})\s+Level$/i, '$1').trim();
  }

  return label || null;
}

function summarizeTimeRange(formData: Record<string, any>): string | null {
  // Try DHIS2 period formatting first
  if (Array.isArray(formData.dhis2_period_filter_values) && formData.dhis2_period_filter_values.length > 0) {
    try {
      const { formatDHIS2Period } = require('@superset-ui/core/utils/dhis2Period');
      const formatted = formData.dhis2_period_filter_values
        .map((p: string) => formatDHIS2Period(p) || p)
        .join(', ');
      if (formatted) return formatted;
    } catch (e) {
      // Fallback if module not available
    }
  }

  if (formData.dhis2_period_label) {
    try {
      const { formatDHIS2Period } = require('@superset-ui/core/utils/dhis2Period');
      const formatted = formatDHIS2Period(String(formData.dhis2_period_label));
      if (formatted) return formatted;
    } catch (e) {
      // Fallback
    }
  }

  return (
    formatReadableLabel(formData.dhis2_period_filter_values?.join?.(', ')) ||
    formatReadableLabel(formData.dhis2_period_label) ||
    formatReadableLabel(formData.time_range) ||
    formatReadableLabel(formData.granularity_sqla)
  );
}

function filterStateLabel(filterState: Record<string, any> | null | undefined) {
  if (!filterState) {
    return null;
  }
  if (
    filterState.label &&
    !String(filterState.label).toLowerCase().includes('undefined')
  ) {
    return formatReadableLabel(String(filterState.label));
  }
  if (filterState.value) {
    return formatReadableLabel(ensureIsArray(filterState.value).join(', '));
  }
  if (filterState.extraFormData?.filters) {
    const values = ensureIsArray(filterState.extraFormData.filters)
      .map((item: any) => item?.val ?? item?.value)
      .flat()
      .filter(Boolean)
      .join(', ');
    return formatReadableLabel(values);
  }
  return null;
}

function filterTargetName(filter: Record<string, any>): string {
  const firstTarget = ensureIsArray(filter?.targets)[0] || {};
  return String(
    firstTarget?.column?.name ||
      firstTarget?.column ||
      firstTarget?.datasetColumnName ||
      firstTarget?.dataset_col ||
      filter?.name ||
      filter?.filterName ||
      '',
  ).toLowerCase();
}

function buildAutoTitle(
  sliceName: string,
  formData: Record<string, any>,
  filterContext: { ou: string | null; period: string | null } | null,
): string {
  const metric = summarizeMetric(formData);
  const orgUnit =
    formatReadableLabel(filterContext?.ou) ||
    formatReadableLabel(formData.entity_name) ||
    formatReadableLabel(formData.org_unit_name) ||
    formatReadableLabel(formData.district_city);
  const period =
    formatReadableLabel(filterContext?.period) || summarizeTimeRange(formData);

  // Use professional templates instead of simple concatenation
  if (metric && orgUnit && period) {
    // Template: "Metric in OrgUnit during Period"
    return `${metric} in ${orgUnit} during ${period}`;
  }

  if (metric && orgUnit) {
    // Template: "Metric in OrgUnit"
    return `${metric} in ${orgUnit}`;
  }

  if (metric && period) {
    // Template: "Metric for Period"
    return `${metric} for ${period}`;
  }

  if (orgUnit && period) {
    // Template: "OrgUnit, Period"
    return `${orgUnit}, ${period}`;
  }

  // Single element
  if (metric) return metric;
  if (orgUnit) return orgUnit;
  if (period) return period;

  // Fallback to original chart name
  return sliceName;
}

const SliceHeader = forwardRef<HTMLDivElement, SliceHeaderProps>(
  (
    {
      forceRefresh = () => ({}),
      updateSliceName = () => ({}),
      toggleExpandSlice = () => ({}),
      logExploreChart = () => ({}),
      logEvent,
      exportCSV = () => ({}),
      exportXLSX = () => ({}),
      editMode = false,
      annotationQuery = {},
      annotationError = {},
      cachedDttm = null,
      updatedDttm = null,
      isCached = [],
      isExpanded = false,
      sliceName = '',
      supersetCanExplore = false,
      supersetCanShare = false,
      supersetCanCSV = false,
      exportPivotCSV,
      exportFullCSV,
      exportFullXLSX,
      slice,
      componentId,
      dashboardId,
      addSuccessToast,
      addDangerToast,
      handleToggleFullSize,
      isFullSize,
      chartStatus,
      formData,
      width,
      height,
      exportPivotExcel = () => ({}),
    },
    ref,
  ) => {
    const SliceHeaderExtension = extensionsRegistry.get(
      'dashboard.slice.header',
    );
    const uiConfig = useUiConfig();
    const shouldShowRowLimitWarning =
      !isEmbedded() || uiConfig.showRowLimitWarning;
    const [headerTooltip, setHeaderTooltip] = useState<ReactNode | null>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    // TODO: change to indicator field after it will be implemented
    const crossFilterValue = useSelector<RootState, any>(
      state => state.dataMask[slice?.slice_id]?.filterState?.value,
    );
    const isCrossFiltersEnabled = useSelector<RootState, boolean>(
      ({ dashboardInfo }) => dashboardInfo.crossFiltersEnabled,
    );

    const firstQueryResponse = useSelector<RootState, QueryData | undefined>(
      state => state.charts[slice.slice_id].queriesResponse?.[0],
    );

    const theme = useTheme();
    const dashboardPageId = useContext(DashboardPageIdContext);

    // Extract applied OU / Period filter context for display under the title
    const nativeFilters = useSelector<RootState, any>(
      state => state.nativeFilters?.filters,
    );
    const dataMask = useSelector<RootState, any>(state => state.dataMask);

    const filterContextLine = useMemo(() => {
      if (!nativeFilters || !dataMask) return null;

      const ouKeywords = [
        'national', 'region', 'district', 'county', 'province',
        'org_unit', 'orgunit', 'ou_', 'facility',
      ];
      const periodKeywords = [
        'period', 'quarter', 'month', 'year',
      ];

      let ouLabel: string | null = null;
      let periodLabel: string | null = null;

      const chartId = slice?.slice_id;
      const allFilters = Object.values(nativeFilters) as any[];

      for (const filter of allFilters) {
        // Only include filters that scope to this chart
        if (
          chartId &&
          Array.isArray(filter.chartsInScope) &&
          !filter.chartsInScope
            .map((value: string | number) => String(value))
            .includes(String(chartId))
        ) {
          continue;
        }

        const filterState = dataMask[filter.id]?.filterState;
        const label = filterStateLabel(filterState);
        if (!label) continue;

        const colName = filterTargetName(filter);

        if (!ouLabel && ouKeywords.some(k => colName.includes(k))) {
          ouLabel = label;
        }
        if (!periodLabel && periodKeywords.some(k => colName.includes(k))) {
          periodLabel = label;
        }
        if (ouLabel && periodLabel) break;
      }

      if (!ouLabel && !periodLabel) return null;
      return { ou: ouLabel, period: periodLabel };
    }, [nativeFilters, dataMask, slice?.slice_id]);

    const rowLimit = Number(formData.row_limit || -1);
    const sqlRowCount = Number(firstQueryResponse?.sql_rowcount || 0);
    const shouldAutoTitle =
      !editMode && Boolean((formData as Record<string, any>)?.auto_title);
    const autoTitle = shouldAutoTitle
      ? buildAutoTitle(
          sliceName,
          (formData as Record<string, any>) || {},
          filterContextLine,
        )
      : null;
    const displayTitle = sliceName;

    useEffect(() => {
      const headerElement = headerRef.current;
      if (
        headerElement &&
        (headerElement.scrollWidth > headerElement.offsetWidth ||
          headerElement.scrollHeight > headerElement.offsetHeight)
      ) {
        setHeaderTooltip(displayTitle ?? null);
      } else {
        setHeaderTooltip(null);
      }
    }, [displayTitle, width, height]);

    const exploreParams = new URLSearchParams({
      [URL_PARAMS.sliceId.name]: String(slice.slice_id),
    });
    if (dashboardPageId) {
      exploreParams.set(URL_PARAMS.dashboardPageId.name, dashboardPageId);
    }
    const exploreUrl = `/explore/?${exploreParams.toString()}`;

    return (
      <ChartHeaderStyles data-test="slice-header" ref={ref}>
        <div className="header-title" ref={headerRef}>
          <Tooltip title={headerTooltip}>
            {/* this div ensures the hover event triggers correctly and prevents flickering */}
            <div className="chart-title-main">
              <EditableTitle
                title={
                  autoTitle ||
                  displayTitle ||
                  (editMode
                    ? '---' // this makes an empty title clickable
                    : '')
                }
                canEdit={editMode}
                onSaveTitle={updateSliceName}
                showTooltip={false}
              />
            </div>
          </Tooltip>
          {filterContextLine && !editMode && !shouldAutoTitle && (
            <div className="chart-filter-context">
              {filterContextLine.ou && (
                <span>{filterContextLine.ou}</span>
              )}
              {filterContextLine.ou && filterContextLine.period && (
                <span className="context-separator">·</span>
              )}
              {filterContextLine.period && (
                <span>{filterContextLine.period}</span>
              )}
            </div>
          )}
          {!!Object.values(annotationQuery).length && (
            <Tooltip
              id="annotations-loading-tooltip"
              placement="top"
              title={annotationsLoading}
            >
              <Icons.ReloadOutlined
                className="warning"
                aria-label={annotationsLoading}
              />
            </Tooltip>
          )}
          {!!Object.values(annotationError).length && (
            <Tooltip
              id="annotation-errors-tooltip"
              placement="top"
              title={annotationsError}
            >
              <Icons.ExclamationCircleOutlined
                className="danger"
                aria-label={annotationsError}
              />
            </Tooltip>
          )}
        </div>
        <div className="header-controls">
          {!editMode && (
            <>
              {SliceHeaderExtension && (
                <SliceHeaderExtension
                  sliceId={slice.slice_id}
                  dashboardId={dashboardId}
                />
              )}
              {crossFilterValue && (
                <Tooltip
                  placement="top"
                  title={t(
                    'This chart applies cross-filters to charts whose datasets contain columns with the same name.',
                  )}
                >
                  <CrossFilterIcon iconSize="m" />
                </Tooltip>
              )}
              {!uiConfig.hideChartControls && (
                <GroupByBadge chartId={slice.slice_id} />
              )}

              {!uiConfig.hideChartControls && (
                <FiltersBadge chartId={slice.slice_id} />
              )}

              {shouldShowRowLimitWarning && sqlRowCount === rowLimit && (
                <RowCountLabel
                  rowcount={sqlRowCount}
                  limit={rowLimit}
                  label={
                    <Icons.WarningOutlined
                      iconSize="l"
                      iconColor={theme.colorWarning}
                      css={theme => css`
                        padding: ${theme.sizeUnit}px;
                      `}
                    />
                  }
                />
              )}
              {!uiConfig.hideChartControls && (
                <SliceHeaderControls
                  slice={slice}
                  isCached={isCached}
                  isExpanded={isExpanded}
                  cachedDttm={cachedDttm}
                  updatedDttm={updatedDttm}
                  toggleExpandSlice={toggleExpandSlice}
                  forceRefresh={forceRefresh}
                  logExploreChart={logExploreChart}
                  logEvent={logEvent}
                  exportCSV={exportCSV}
                  exportPivotCSV={exportPivotCSV}
                  exportFullCSV={exportFullCSV}
                  exportXLSX={exportXLSX}
                  exportFullXLSX={exportFullXLSX}
                  supersetCanExplore={supersetCanExplore}
                  supersetCanShare={supersetCanShare}
                  supersetCanCSV={supersetCanCSV}
                  componentId={componentId}
                  dashboardId={dashboardId}
                  addSuccessToast={addSuccessToast}
                  addDangerToast={addDangerToast}
                  handleToggleFullSize={handleToggleFullSize}
                  isFullSize={isFullSize}
                  isDescriptionExpanded={isExpanded}
                  chartStatus={chartStatus}
                  formData={formData}
                  exploreUrl={exploreUrl}
                  crossFiltersEnabled={isCrossFiltersEnabled}
                  exportPivotExcel={exportPivotExcel}
                />
              )}
            </>
          )}
        </div>
      </ChartHeaderStyles>
    );
  },
);

export default SliceHeader;
