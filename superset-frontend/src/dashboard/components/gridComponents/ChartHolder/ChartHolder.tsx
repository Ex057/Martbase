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
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  memo,
} from 'react';

import { ResizeCallback, ResizeStartCallback } from 're-resizable';
import cx from 'classnames';
import { useSelector } from 'react-redux';
import { css, styled, useTheme } from '@superset-ui/core';
import { LayoutItem, RootState } from 'src/dashboard/types';
import AnchorLink from 'src/dashboard/components/AnchorLink';
import Chart from 'src/dashboard/components/gridComponents/Chart';
import DeleteComponentButton from 'src/dashboard/components/DeleteComponentButton';
import { Draggable } from 'src/dashboard/components/dnd/DragDroppable';
import HoverMenu from 'src/dashboard/components/menu/HoverMenu';
import ResizableContainer from 'src/dashboard/components/resizable/ResizableContainer';
import getChartAndLabelComponentIdFromPath from 'src/dashboard/util/getChartAndLabelComponentIdFromPath';
import useFilterFocusHighlightStyles from 'src/dashboard/util/useFilterFocusHighlightStyles';
import { COLUMN_TYPE, ROW_TYPE } from 'src/dashboard/util/componentTypes';
import {
  GRID_BASE_UNIT,
  GRID_GUTTER_SIZE,
  GRID_MIN_COLUMN_COUNT,
  GRID_MIN_ROW_UNITS,
} from 'src/dashboard/util/constants';

// Must match the total horizontal padding of .dashboard-component-chart-holder
// (padding: theme.sizeUnit * 4 = 32px on each side = 64px total)
export const CHART_MARGIN = 64;
const DEFAULT_CHART_HEIGHT_MULTIPLE = 10;

const getFiniteNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const PersistentDeleteMenu = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.sizeUnit * 2}px;
  right: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 12;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.sizeUnit * 1.5}px;
  border: 2px solid ${({ theme }) => theme.colorError};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  background: ${({ theme }) => theme.colorErrorBg};
  box-shadow: ${({ theme }) => theme.boxShadowSecondary};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colorError};
    transform: scale(1.1);

    svg {
      color: white;
    }
  }

  svg {
    color: ${({ theme }) => theme.colorError};
  }
`;

interface ChartHolderProps {
  id: string;
  parentId: string;
  dashboardId: number;
  component: LayoutItem;
  parentComponent: LayoutItem;
  getComponentById?: (id?: string) => LayoutItem | undefined;
  index: number;
  depth: number;
  editMode: boolean;
  directPathLastUpdated?: number;
  fullSizeChartId: number | null;
  isComponentVisible: boolean;

  // grid related
  availableColumnCount: number;
  columnWidth: number;
  onResizeStart: ResizeStartCallback;
  onResize: ResizeCallback;
  onResizeStop: ResizeCallback;

  // dnd
  deleteComponent: (id: string, parentId: string) => void;
  updateComponents: Function;
  handleComponentDrop: (...args: unknown[]) => unknown;
  setFullSizeChartId: (chartId: number | null) => void;
  isInView: boolean;
}

const ChartHolder = ({
  id,
  parentId,
  component,
  parentComponent,
  index,
  depth,
  availableColumnCount,
  columnWidth,
  onResizeStart,
  onResize,
  onResizeStop,
  editMode,
  isComponentVisible,
  dashboardId,
  fullSizeChartId,
  getComponentById = () => undefined,
  deleteComponent,
  updateComponents,
  handleComponentDrop,
  setFullSizeChartId,
  isInView,
}: ChartHolderProps) => {
  const theme = useTheme();
  const fullSizeStyle = css`
    && {
      position: fixed !important;
      z-index: 3000;
      /* Size purely from inset — the browser computes height = viewport − top
         and width = viewport − left/right. Do NOT use an explicit
         height/width calc with --dashboard-fullscreen-top-offset: that var
         resolves inconsistently inside calc() (it applied to 'top' but the
         'height' calc came out as full 100vh), leaving the overlay too tall so
         its bottom — the chart's x-axis/legend — fell below the viewport. */
      top: var(--dashboard-fullscreen-top-offset, 0);
      right: 0;
      bottom: 0;
      left: 0;
      padding: ${theme.sizeUnit * 2}px;
      overflow: hidden;
    }
  `;
  const { chartId } = component.meta;
  const isFullSize = fullSizeChartId === chartId;
  const chartEntity = useSelector(
    (state: RootState) => (state as any).charts?.[chartId],
  );
  const sliceEntity = useSelector(
    (state: RootState) => (state as any).sliceEntities?.slices?.[chartId],
  );
  const showPersistentDelete =
    editMode &&
    (!chartEntity ||
      !sliceEntity ||
      chartEntity.chartStatus === 'loading' ||
      chartEntity.chartStatus === 'failed');

  const focusHighlightStyles = useFilterFocusHighlightStyles(chartId);
  const directPathToChild = useSelector(
    (state: RootState) => state.dashboardState.directPathToChild,
  );
  const directPathLastUpdated = useSelector(
    (state: RootState) => state.dashboardState.directPathLastUpdated ?? 0,
  );

  const [extraControls, setExtraControls] = useState<Record<string, unknown>>(
    {},
  );
  const [outlinedComponentId, setOutlinedComponentId] = useState<string>();
  const [outlinedColumnName, setOutlinedColumnName] = useState<string>();
  const [currentDirectPathLastUpdated, setCurrentDirectPathLastUpdated] =
    useState(0);

  // Measure the fullscreen overlay's REAL available content size rather than
  // computing it from the navbar offset. The offset came from the
  // `--dashboard-fullscreen-top-offset` CSS var, but that var is only set on
  // ancestor elements (App.tsx Layout.Content / PublicLandingPage) and custom
  // properties don't inherit upward, so reading it at :root returned 0 — making
  // the fullsize chart too tall and clipping its x-axis/legend. Measuring the
  // overlay resolves the offset exactly (including the portal's calc()).
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const [fullSizeAvail, setFullSizeAvail] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const el = overlayElRef.current;
    if (!isFullSize) {
      // Clear any inline sizing we forced while fullscreen.
      if (el) {
        el.style.height = '';
        el.style.width = '';
      }
      setFullSizeAvail(null);
      return undefined;
    }
    const measure = () => {
      const node = overlayElRef.current;
      if (!node) return;
      // getBoundingClientRect is always viewport-relative, so this is robust
      // even when a `container-type`/`contain`/transform ancestor makes
      // position:fixed resolve against a non-viewport box (which left the
      // overlay full-height and pushed its bottom — the chart's x-axis/legend —
      // below the screen). Force the overlay to span from its top edge to the
      // viewport edges so its bottom lands exactly at the viewport bottom.
      const rect = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      const padX =
        (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY =
        (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const availH = Math.max(0, window.innerHeight - rect.top);
      const availW = Math.max(0, window.innerWidth - rect.left);
      node.style.height = `${availH}px`;
      node.style.width = `${availW}px`;
      const width = availW - padX;
      const height = availH - padY;
      setFullSizeAvail(prev =>
        prev && prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isFullSize]);

  const infoFromPath = useMemo(
    () => getChartAndLabelComponentIdFromPath(directPathToChild ?? []) as any,
    [directPathToChild],
  );

  // Calculate if the chart should be outlined
  useEffect(() => {
    const { label: columnName, chart: chartComponentId } = infoFromPath;

    if (
      directPathLastUpdated !== currentDirectPathLastUpdated &&
      component.id === chartComponentId
    ) {
      setCurrentDirectPathLastUpdated(directPathLastUpdated);
      setOutlinedComponentId(component.id);
      setOutlinedColumnName(columnName);
    }
  }, [
    component,
    currentDirectPathLastUpdated,
    directPathLastUpdated,
    infoFromPath,
  ]);

  // Remove the chart outline after a defined time
  useEffect(() => {
    let timerId: NodeJS.Timeout | undefined;
    if (outlinedComponentId) {
      timerId = setTimeout(() => {
        setOutlinedComponentId(undefined);
        setOutlinedColumnName(undefined);
      }, 2000);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [outlinedComponentId]);

  const widthMultiple = useMemo(() => {
    const columnParentWidth = getComponentById(
      parentComponent.parents?.find(parent => parent.startsWith(COLUMN_TYPE)),
    )?.meta?.width;

    let widthMultiple = getFiniteNumber(
      component.meta.width,
      GRID_MIN_COLUMN_COUNT,
    );
    if (parentComponent.type === COLUMN_TYPE) {
      widthMultiple = getFiniteNumber(
        parentComponent.meta.width,
        GRID_MIN_COLUMN_COUNT,
      );
    } else if (columnParentWidth && widthMultiple > columnParentWidth) {
      widthMultiple = columnParentWidth;
    }

    return widthMultiple;
  }, [
    component,
    getComponentById,
    parentComponent.meta.width,
    parentComponent.parents,
    parentComponent.type,
  ]);

  const { chartWidth, chartHeight } = useMemo(() => {
    let width = 0;
    let height = 0;

    if (isFullSize) {
      if (fullSizeAvail) {
        // Real measured content box of the fullscreen overlay (resolves the
        // navbar/portal-header offset exactly).
        width = fullSizeAvail.width;
        height = fullSizeAvail.height;
      } else {
        // First frame, before the layout-effect measurement lands. Estimate
        // from the viewport minus the overlay padding; corrected immediately.
        const pad = theme.sizeUnit * 2 * 2;
        width = (typeof window === 'undefined' ? 0 : window.innerWidth) - pad;
        height = (typeof window === 'undefined' ? 0 : window.innerHeight) - pad;
      }
    } else {
      const heightMultiple = getFiniteNumber(
        component.meta.height,
        DEFAULT_CHART_HEIGHT_MULTIPLE,
      );
      width = Math.floor(
        widthMultiple * columnWidth +
          (widthMultiple - 1) * GRID_GUTTER_SIZE -
          CHART_MARGIN,
      );
      height = Math.floor(heightMultiple * GRID_BASE_UNIT - CHART_MARGIN);
    }

    return {
      chartWidth: Number.isFinite(width) ? width : GRID_MIN_COLUMN_COUNT,
      chartHeight: Number.isFinite(height) ? height : GRID_BASE_UNIT,
    };
  }, [columnWidth, component, isFullSize, widthMultiple, fullSizeAvail, theme]);

  const handleDeleteComponent = useCallback(() => {
    deleteComponent(id, parentId);
  }, [deleteComponent, id, parentId]);

  const handleUpdateSliceName = useCallback(
    (nextName: string) => {
      updateComponents({
        [component.id]: {
          ...component,
          meta: {
            ...component.meta,
            sliceNameOverride: nextName,
          },
        },
      });
    },
    [component, updateComponents],
  );

  const handleToggleFullSize = useCallback(() => {
    setFullSizeChartId(isFullSize ? null : chartId);
  }, [chartId, isFullSize, setFullSizeChartId]);

  const handleExtraControl = useCallback((name: string, value: unknown) => {
    setExtraControls(current => ({
      ...current,
      [name]: value,
    }));
  }, []);

  const renderChild = useCallback(
    ({ dragSourceRef }) => (
      <ResizableContainer
        id={component.id}
        adjustableWidth={parentComponent.type === ROW_TYPE}
        adjustableHeight
        widthStep={columnWidth}
        widthMultiple={widthMultiple}
        heightStep={GRID_BASE_UNIT}
        heightMultiple={component.meta.height}
        minWidthMultiple={GRID_MIN_COLUMN_COUNT}
        minHeightMultiple={GRID_MIN_ROW_UNITS}
        maxWidthMultiple={availableColumnCount + widthMultiple}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeStop={onResizeStop}
        editMode={editMode}
      >
        <div
          ref={node => {
            // Compose: our own ref for fullscreen measurement + the drag source
            // ref (may be a function ref or an object ref).
            overlayElRef.current = node;
            if (typeof dragSourceRef === 'function') {
              dragSourceRef(node);
            } else if (dragSourceRef) {
              (dragSourceRef as any).current = node;
            }
          }}
          data-test="dashboard-component-chart-holder"
          style={focusHighlightStyles}
          css={isFullSize ? fullSizeStyle : undefined}
          className={cx(
            'dashboard-component',
            'dashboard-component-chart-holder',
            // The following class is added to support custom dashboard styling via the CSS editor
            `dashboard-chart-id-${chartId}`,
            outlinedComponentId ? 'fade-in' : 'fade-out',
          )}
        >
          {!editMode && (
            <AnchorLink
              id={component.id}
              scrollIntoView={outlinedComponentId === component.id}
            />
          )}
          {!!outlinedComponentId && (
            <style>
              {`label[for=${outlinedColumnName}] + .Select .Select__control {
                    border-color: #00736a;
                    transition: border-color 1s ease-in-out;
                  }`}
            </style>
          )}
          <Chart
            componentId={component.id}
            id={component.meta.chartId}
            dashboardId={dashboardId}
            width={chartWidth}
            height={chartHeight}
            sliceName={
              component.meta.sliceNameOverride || component.meta.sliceName || ''
            }
            updateSliceName={handleUpdateSliceName}
            isComponentVisible={isComponentVisible}
            handleToggleFullSize={handleToggleFullSize}
            isFullSize={isFullSize}
            setControlValue={handleExtraControl}
            extraControls={extraControls}
            isInView={isInView}
          />
          {showPersistentDelete && (
            <PersistentDeleteMenu data-test="dashboard-delete-component-button">
              <DeleteComponentButton
                onDelete={handleDeleteComponent}
                iconSize="m"
              />
            </PersistentDeleteMenu>
          )}
          {editMode && !showPersistentDelete && (
            <HoverMenu position="top">
              <div data-test="dashboard-delete-component-button">
                <DeleteComponentButton onDelete={handleDeleteComponent} />
              </div>
            </HoverMenu>
          )}
        </div>
      </ResizableContainer>
    ),
    [
      component.id,
      component.meta.height,
      component.meta.chartId,
      component.meta.sliceNameOverride,
      component.meta.sliceName,
      parentComponent.type,
      columnWidth,
      widthMultiple,
      availableColumnCount,
      onResizeStart,
      onResize,
      onResizeStop,
      editMode,
      focusHighlightStyles,
      isFullSize,
      fullSizeStyle,
      chartId,
      outlinedComponentId,
      outlinedColumnName,
      dashboardId,
      chartWidth,
      chartHeight,
      handleUpdateSliceName,
      isComponentVisible,
      handleToggleFullSize,
      handleExtraControl,
      extraControls,
      isInView,
      handleDeleteComponent,
      showPersistentDelete,
    ],
  );

  return (
    <Draggable
      component={component}
      parentComponent={parentComponent}
      orientation={parentComponent.type === ROW_TYPE ? 'column' : 'row'}
      index={index}
      depth={depth}
      onDrop={handleComponentDrop}
      disableDragDrop={false}
      editMode={editMode}
    >
      {renderChild}
    </Draggable>
  );
};

export default memo(ChartHolder);
