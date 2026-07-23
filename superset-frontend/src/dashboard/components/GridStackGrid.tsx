/**
 * GridStack-powered dashboard grid.
 *
 * Behaviour:
 *  • float:false  → widgets fall upward into gaps (gravity packing)
 *  • compact('compact') after every change → optimal space usage
 *  • Dropped charts auto-fit width, auto-adjust height
 *  • Drag moves neighbours one step only — minimal reflow
 *  • Accepts new charts via "Add to Dashboard" buttons in sidebar
 *  • Accepts react-dnd drops from SliceAdder sidebar for positional placement
 *  • In-place updates: moving/resizing does NOT rebuild the grid — only
 *    adding/removing widgets triggers a full rebuild.
 */
import { useEffect, useRef, useMemo, useState, useCallback, memo } from 'react';
import type { MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { css, styled, t } from '@superset-ui/core';
import { GridStack } from 'gridstack';
import { useDrop } from 'react-dnd';
import 'gridstack/dist/gridstack.min.css';

import DashboardComponent from '../containers/DashboardComponent';
import DeleteComponentButton from './DeleteComponentButton';
import {
  GRID_COLUMN_COUNT,
  GRID_BASE_UNIT,
  GRID_GUTTER_SIZE,
  NEW_COMPONENTS_SOURCE_ID,
} from '../util/constants';
import { CHART_TYPE } from '../util/componentTypes';
import {
  layoutToWidgets,
  widgetsToLayout,
  DashboardWidget,
} from '../util/gridstackConverter';
import {
  updateComponents,
  handleComponentDrop,
  deleteComponent as deleteDashboardComponent,
} from '../actions/dashboardLayout';
import { setUnsavedChanges } from '../actions/dashboardState';

const CELL_HEIGHT = GRID_BASE_UNIT * 6; // 48px
const DEFAULT_WIDGET_WIDTH_MULTIPLE = 4;

const getFiniteNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

interface GridStackGridProps {
  gridComponent: any;
  width: number;
  editMode: boolean;
  isComponentVisible: boolean;
  depth: number;
  handleComponentDrop: Function;
  resizeComponent: Function;
  setDirectPathToChild: Function;
}

/* ------------------------------------------------------------------ */
/*  Styled container                                                   */
/* ------------------------------------------------------------------ */
const GridStackContainer = styled.div<{
  $editMode: boolean;
  $fullSizeActive: boolean;
}>`
  ${({ theme, $editMode, $fullSizeActive }) => css`
    position: relative;
    min-height: 120px;

    /* While a chart is in fullscreen, its overlay is a DOM descendant of
       .grid-stack-item-content. That element's hover transform creates a
       containing block (and overflow:hidden clips) that traps the position:fixed
       overlay to the tile. Neutralize both while fullscreen so the overlay
       resolves against the viewport and fills the screen. */
    ${$fullSizeActive &&
    css`
      .grid-stack > .grid-stack-item > .grid-stack-item-content,
      .grid-stack > .grid-stack-item > .grid-stack-item-content:hover {
        transform: none !important;
        overflow: visible !important;
      }
    `}

    .grid-stack {
      min-height: 60px !important;
      ${$editMode &&
      css`
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent ${CELL_HEIGHT - 1}px,
          ${theme.colorBorderSecondary}18 ${CELL_HEIGHT - 1}px,
          ${theme.colorBorderSecondary}18 ${CELL_HEIGHT}px
        );
      `}
    }

    .grid-stack-item {
      overflow: visible;
    }

    .grid-stack > .grid-stack-item > .grid-stack-item-content {
      overflow: hidden !important;
      border-radius: ${theme.borderRadiusLG}px;
      background: ${theme.colorBgContainer};
      /* Theme-adaptive card: border + accent follow the active preset and
         light/dark mode; a gentle hover lift makes tiles feel tactile. */
      border: 1px solid ${theme.colorBorderSecondary};
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.05),
        0 1px 2px rgba(0, 0, 0, 0.03);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.15s ease;

      &:hover {
        border-color: ${theme.colorPrimaryBorder};
        box-shadow:
          0 6px 18px rgba(0, 0, 0, 0.1),
          0 2px 6px rgba(0, 0, 0, 0.06);
        transform: translateY(-2px);
      }
    }

    /* ---- Edit mode ---- */
    ${$editMode &&
    css`
      .grid-stack-item {
        cursor: grab;
      }
      .grid-stack-item.ui-draggable-dragging {
        cursor: grabbing;
        z-index: 100 !important;
        opacity: 0.92;
      }
      .grid-stack > .grid-stack-item > .grid-stack-item-content {
        outline: 1px dashed ${theme.colorBorderSecondary};
        outline-offset: -1px;
      }
      .grid-stack > .grid-stack-item:hover > .grid-stack-item-content {
        outline-color: ${theme.colorPrimary};
      }
      .grid-stack-placeholder > .placeholder-content {
        background: ${theme.colorPrimaryBg} !important;
        border: 2px dashed ${theme.colorPrimary} !important;
        border-radius: ${theme.borderRadiusLG}px !important;
        opacity: 0.4;
      }
      .ui-resizable-se {
        width: 14px !important;
        height: 14px !important;
        bottom: 2px !important;
        right: 2px !important;
        border-right: 3px solid ${theme.colorPrimary};
        border-bottom: 3px solid ${theme.colorPrimary};
        border-radius: 0 0 ${theme.borderRadius}px 0;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .grid-stack-item:hover .ui-resizable-se {
        opacity: 0.8;
      }
    `}

    ${!$editMode &&
    css`
      .grid-stack > .grid-stack-item > .grid-stack-item-content {
        outline: none;
      }
    `}

    /* ---- Drop indicators ---- */
    .gs-drop-indicator {
      position: absolute;
      z-index: 50;
      pointer-events: none;
      transition:
        top 0.1s ease,
        left 0.1s ease,
        height 0.1s ease,
        width 0.1s ease;
    }
    .gs-drop-indicator--horizontal {
      height: 3px;
      left: 0;
      right: 0;
      background: ${theme.colorPrimary};
      border-radius: 2px;
      &::before {
        content: '';
        position: absolute;
        left: 50%;
        top: -8px;
        transform: translateX(-50%);
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${theme.colorPrimary};
        opacity: 0.3;
      }
    }
    .gs-drop-indicator--vertical {
      width: 3px;
      background: ${theme.colorPrimary};
      border-radius: 2px;
      &::before {
        content: '';
        position: absolute;
        top: 50%;
        left: -8px;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${theme.colorPrimary};
        opacity: 0.3;
      }
    }
    .gs-drop-overlay {
      position: absolute;
      inset: 0;
      z-index: 40;
      border: 2px dashed ${theme.colorPrimary};
      border-radius: ${theme.borderRadiusLG}px;
      background: ${theme.colorPrimaryBg};
      opacity: 0.4;
      pointer-events: none;
    }

    /* Empty grid placeholder — visible drop zone when dashboard has no content */
    .gs-empty-placeholder {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
      border: 2px dashed ${theme.colorBorderSecondary};
      border-radius: ${theme.borderRadiusLG}px;
      color: ${theme.colorTextDescription};
      font-size: 14px;
      padding: 24px;
      text-align: center;
      background: linear-gradient(
        135deg,
        rgba(248, 250, 252, 0.5) 0%,
        rgba(241, 245, 249, 0.3) 100%
      );
      transition:
        border-color 0.2s ease,
        background 0.2s ease,
        transform 0.2s ease;
    }
    .gs-empty-placeholder:hover {
      border-color: ${theme.colorPrimaryBorderHover};
      background: linear-gradient(
        135deg,
        rgba(248, 250, 252, 0.8) 0%,
        rgba(241, 245, 249, 0.5) 100%
      );
    }
    .gs-empty-placeholder.gs-empty-placeholder--active {
      border-color: ${theme.colorPrimary};
      background: ${theme.colorPrimaryBg};
      transform: scale(1.005);
    }
    .gs-empty-placeholder-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${theme.colorPrimaryBg};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }
    .gs-empty-placeholder-icon svg {
      width: 28px;
      height: 28px;
      color: ${theme.colorPrimary};
    }
    .gs-empty-placeholder-title {
      font-size: 16px;
      font-weight: 600;
      color: ${theme.colorText};
      margin-bottom: 4px;
    }
    .gs-empty-placeholder-hint {
      font-size: 13px;
      color: ${theme.colorTextSecondary};
      max-width: 320px;
      line-height: 1.5;
    }

    /* ---- Widget inner content ---- */
    .gs-widget-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .gs-widget-inner .dashboard-component-chart-holder {
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      padding: 4px !important;
      display: flex !important;
      flex-direction: column !important;
    }
    .gs-widget-inner .resizable-container,
    .gs-widget-inner .dragdroppable {
      width: 100% !important;
      height: 100% !important;
    }
    .gs-widget-inner .grid-row {
      flex-wrap: wrap;
      width: 100%;
      height: 100%;
    }
    /* Chart header — clean, modern design */
    .gs-widget-inner .slice-header,
    .gs-widget-inner .chart-header,
    .gs-widget-inner [data-test='slice-header'] {
      min-height: 36px;
      flex-shrink: 0;
      padding: 8px 12px !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.15) !important;
      background: linear-gradient(
        180deg,
        ${theme.colorBgContainer} 0%,
        rgba(248, 250, 252, 0.5) 100%
      );
      margin: 0 !important;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .gs-widget-inner [data-test='slice-header'] .header-title {
      font-size: var(--pro-density-chart-title, 13px);
      font-weight: 600;
      color: var(--pro-navy, ${theme.colorText});
      letter-spacing: -0.01em;
      line-height: 1.3;
    }
    .gs-widget-inner [data-test='slice-header'] .editable-title input,
    .gs-widget-inner [data-test='slice-header'] .editable-title span {
      font-weight: 600 !important;
      color: var(--pro-navy, ${theme.colorText}) !important;
    }
    .gs-widget-inner .chart-filter-context {
      font-size: 11px;
      color: var(--pro-text-secondary, ${theme.colorTextDescription});
      margin-top: 2px;
      opacity: 0.75;
    }
    /* Chart action buttons - subtle by default */
    .gs-widget-inner .slice-header .right-side,
    .gs-widget-inner [data-test='slice-header'] .chart-controls {
      opacity: 0.5;
      transition: opacity 0.15s ease;
    }
    .grid-stack-item:hover .gs-widget-inner .slice-header .right-side,
    .grid-stack-item:hover
      .gs-widget-inner
      [data-test='slice-header']
      .chart-controls {
      opacity: 1;
    }
    .gs-widget-inner .chart-container,
    .gs-widget-inner .slice_container {
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
    }
    /* Chart visualization wrapper — fill available space */
    .gs-widget-inner .chart-slice {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
    }
    .gs-widget-inner .dashboard-chart,
    .gs-widget-inner .chart-wrapper {
      flex: 1 1 0 !important;
      min-height: 0 !important;
      max-width: 100% !important;
    }
    /* BigNumber / summary charts — center content and balance spacing */
    .gs-widget-inner .superset-legacy-chart-big-number,
    .gs-widget-inner .superset-legacy-chart-big-number-total,
    .gs-widget-inner [class*='BigNumber'] {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      width: 100% !important;
      padding: 0 !important;
    }
    .gs-widget-inner [class*='BigNumber'] .text-container {
      align-items: center !important;
      width: 100% !important;
      text-align: center;
    }
    .gs-widget-inner [class*='BigNumber'] .header-line {
      justify-content: center !important;
      text-align: center !important;
      width: 100% !important;
    }
    .gs-widget-inner [class*='BigNumber'] .subheader-line,
    .gs-widget-inner [class*='BigNumber'] .kicker,
    .gs-widget-inner [class*='BigNumber'] .metric-name,
    .gs-widget-inner [class*='BigNumber'] .subtitle-line {
      text-align: center !important;
      width: 100% !important;
    }
    /* Loading placeholder */
    .gs-widget-loading {
      display: flex;
      position: relative;
      align-items: center;
      justify-content: center;
    }
    .gs-widget-loading-delete {
      position: absolute;
      top: ${theme.sizeUnit * 2}px;
      right: ${theme.sizeUnit * 2}px;
      z-index: 12;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: ${theme.sizeUnit}px;
      border: 1px solid ${theme.colorBorder};
      border-radius: ${theme.borderRadius}px;
      background: ${theme.colorBgContainer};
      box-shadow: ${theme.boxShadowSecondary};
    }
    .gs-widget-loading-message {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: ${theme.colorTextSecondary};
      font-size: 13px;
      padding: ${theme.sizeUnit * 4}px;
      text-align: center;
    }
    .gs-widget-measuring {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: ${GRID_BASE_UNIT * 8}px;
      color: ${theme.colorTextTertiary};
      font-size: 12px;
      padding: ${theme.sizeUnit * 4}px;
      text-align: center;
    }

    /* Orphaned widget - component doesn't exist in layout */
    .gs-widget-orphaned {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-linear-gradient(
        45deg,
        ${theme.colorErrorBg},
        ${theme.colorErrorBg} 10px,
        transparent 10px,
        transparent 20px
      );
      border: 2px dashed ${theme.colorError};
      border-radius: ${theme.borderRadius}px;
    }
    .gs-widget-orphaned-delete {
      position: absolute;
      top: ${theme.sizeUnit * 2}px;
      right: ${theme.sizeUnit * 2}px;
      z-index: 10;
      padding: ${theme.sizeUnit * 1.5}px;
      border: 2px solid ${theme.colorError};
      border-radius: ${theme.borderRadius}px;
      background: ${theme.colorError};
      cursor: pointer;
      transition: transform 0.2s ease;

      &:hover {
        transform: scale(1.15);
      }

      svg {
        color: white;
      }
    }
    .gs-widget-orphaned-message {
      text-align: center;
      padding: ${theme.sizeUnit * 4}px;
      background: ${theme.colorBgContainer};
      border-radius: ${theme.borderRadius}px;
      box-shadow: ${theme.boxShadowSecondary};
    }
    .gs-widget-orphaned-icon {
      font-size: 28px;
      color: ${theme.colorError};
      margin-bottom: ${theme.sizeUnit}px;
    }
    .gs-widget-orphaned-title {
      font-size: 14px;
      font-weight: 600;
      color: ${theme.colorError};
      margin-bottom: ${theme.sizeUnit}px;
    }
    .gs-widget-orphaned-hint {
      font-size: 12px;
      color: ${theme.colorTextSecondary};
    }
  `}
`;

/* ------------------------------------------------------------------ */
/*  Widget content (memo'd)                                            */
/* ------------------------------------------------------------------ */
const WidgetContent = memo(
  ({
    componentId,
    parentId,
    depth,
    columnWidth,
    isComponentVisible,
    editMode,
  }: {
    componentId: string;
    parentId: string;
    depth: number;
    columnWidth: number;
    isComponentVisible: boolean;
    editMode: boolean;
  }) => {
    const dispatch = useDispatch();
    const containerRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const mountedRef = useRef(true);

    // While any chart is fullscreen, the grid is hidden behind the fixed overlay,
    // so this widget must NOT re-measure or dispatch synthetic window resizes:
    // doing so makes GridStack relayout and re-apply the tile transform, which
    // fights the overlay and produces a flicker loop. The ref lets the
    // once-created ResizeObserver callback read the latest value.
    const isAnyFullSize = useSelector(
      (state: any) => (state.dashboardState?.fullSizeChartId ?? null) != null,
    );
    const fullSizeRef = useRef(isAnyFullSize);
    fullSizeRef.current = isAnyFullSize;

    useEffect(
      () => () => {
        mountedRef.current = false;
      },
      [],
    );

    // Measure actual container width via ResizeObserver so charts
    // fill the gridstack widget instead of relying on column math
    useEffect(() => {
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(entries => {
        // Freeze measurements while a chart is fullscreen (see fullSizeRef note).
        if (fullSizeRef.current) return;
        for (const entry of entries) {
          if (mountedRef.current) {
            setMeasuredWidth(entry.contentRect.width);
          }
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      if (ready) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const raf = requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        const el = containerRef.current;
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          setMeasuredWidth(el.offsetWidth);
          setReady(true);
        } else {
          timer = setTimeout(() => {
            if (!mountedRef.current) return;
            const retryEl = containerRef.current;
            if (
              retryEl &&
              retryEl.offsetWidth > 0 &&
              retryEl.offsetHeight > 0
            ) {
              setMeasuredWidth(retryEl.offsetWidth);
              setReady(true);
            }
          }, 200);
        }
      });
      return () => {
        cancelAnimationFrame(raf);
        if (timer) {
          clearTimeout(timer);
        }
      };
    }, [ready]);

    useEffect(() => {
      // Don't dispatch synthetic resizes while fullscreen — it drives the
      // GridStack relayout ↔ overlay flicker loop.
      if (!ready || measuredWidth <= 0 || isAnyFullSize) return;
      const raf = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
      return () => cancelAnimationFrame(raf);
    }, [ready, measuredWidth, isAnyFullSize]);

    useEffect(() => {
      if (!ready) return;
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const measure = () => {
        if (!mountedRef.current || fullSizeRef.current) return;
        const el = containerRef.current;
        if (el && el.offsetWidth > 0) {
          setMeasuredWidth(current => (current > 0 ? current : el.offsetWidth));
          window.dispatchEvent(new Event('resize'));
        }
        attempts += 1;
        if (attempts < 5 && mountedRef.current) {
          timer = setTimeout(measure, 150);
        }
      };

      timer = setTimeout(measure, 0);
      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }, [ready]);

    // Check if this component exists in layout
    const layout = useSelector(
      (state: any) => state.dashboardLayout?.present || state.dashboardLayout,
    );
    const component = layout[componentId];
    const chartId = component?.meta?.chartId;
    const chartExists = useSelector(
      (state: any) => !chartId || !!state.charts?.[chartId],
    );
    const sliceExists = useSelector(
      (state: any) => !chartId || !!state.sliceEntities?.slices?.[chartId],
    );
    const handleDelete = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dispatch(deleteDashboardComponent(componentId, parentId) as any);
      },
      [componentId, dispatch, parentId],
    );

    // Compute a corrected columnWidth that compensates for the GridStack
    // widget's actual size vs the standard grid math in ChartHolder.
    // ChartHolder does: width = widthMultiple * cw + (widthMultiple-1) * gutter - 64
    // We want: width ≈ measuredWidth - 8 (our 4px padding each side)
    // So: measuredWidth - 8 = wm * cw + (wm-1) * gutter - 64
    //     cw = (measuredWidth - 8 + 64 - (wm-1) * gutter) / wm
    // For simplicity, assume widthMultiple = component?.meta?.width || 4
    const effectiveColumnWidth = useMemo(() => {
      if (!measuredWidth || measuredWidth < 50) return columnWidth;
      const wm = getFiniteNumber(
        component?.meta?.width,
        DEFAULT_WIDGET_WIDTH_MULTIPLE,
      );
      // Target: chart should fill container minus 8px total padding
      const targetChartWidth = measuredWidth - 8;
      // Reverse ChartHolder's formula: width = wm*cw + (wm-1)*gutter - CHART_MARGIN
      const corrected =
        (targetChartWidth + 64 - (wm - 1) * GRID_GUTTER_SIZE) / wm;
      return Number.isFinite(corrected) ? Math.max(corrected, 10) : columnWidth;
    }, [measuredWidth, columnWidth, component?.meta?.width]);

    // If component doesn't exist in layout, show orphaned widget placeholder
    // with delete button so user can remove it
    if (!component) {
      return (
        <div className="gs-widget-inner gs-widget-orphaned" ref={containerRef}>
          {editMode && (
            <div
              className="gs-widget-orphaned-delete"
              data-test="dashboard-delete-component-button"
              role="presentation"
              onMouseDown={event => event.stopPropagation()}
            >
              <DeleteComponentButton onDelete={handleDelete} iconSize="m" />
            </div>
          )}
          <div className="gs-widget-orphaned-message">
            <div className="gs-widget-orphaned-icon">✕</div>
            <div className="gs-widget-orphaned-title">
              {t('Orphaned Container')}
            </div>
            <div className="gs-widget-orphaned-hint">
              {editMode
                ? t('Click the delete button to remove')
                : t('Enter edit mode to remove')}
            </div>
          </div>
        </div>
      );
    }

    // If chart ID exists but chart/slice data is missing, show a
    // graceful placeholder instead of the MissingChart error
    if (chartId && (!chartExists || !sliceExists)) {
      return (
        <div className="gs-widget-inner gs-widget-loading" ref={containerRef}>
          {editMode && (
            <div
              className="gs-widget-loading-delete"
              data-test="dashboard-delete-component-button"
              role="presentation"
              onMouseDown={event => event.stopPropagation()}
            >
              <DeleteComponentButton onDelete={handleDelete} iconSize="m" />
            </div>
          )}
          <div className="gs-widget-loading-message">
            {t('Loading chart...')}
          </div>
        </div>
      );
    }

    return (
      <div className="gs-widget-inner" ref={containerRef}>
        {ready ? (
          <DashboardComponent
            id={componentId}
            parentId={parentId}
            depth={depth}
            index={0}
            availableColumnCount={GRID_COLUMN_COUNT}
            columnWidth={effectiveColumnWidth}
            isComponentVisible={isComponentVisible}
            onResizeStart={() => {}}
            onResize={() => {}}
            onResizeStop={() => {}}
            onChangeTab={() => {}}
          />
        ) : (
          <div className="gs-widget-measuring">{t('Preparing chart...')}</div>
        )}
      </div>
    );
  },
);
WidgetContent.displayName = 'WidgetContent';

/* ------------------------------------------------------------------ */
/*  Drop position calculator — supports both horizontal & vertical     */
/* ------------------------------------------------------------------ */
type DropIndicatorState = {
  orientation: 'horizontal' | 'vertical';
  top: number;
  left: number;
  width?: number;
  height?: number;
} | null;

type DropPositionResult = {
  /** Index in the grid's children array where the new item goes */
  index: number;
  indicator: DropIndicatorState;
};

export function calcDropPosition(
  containerEl: HTMLDivElement | null,
  gsInstance: GridStack | null,
  clientOffset: { x: number; y: number } | null,
  widgets: DashboardWidget[],
): DropPositionResult {
  const empty: DropPositionResult = {
    index: widgets.length,
    indicator: null,
  };
  if (!containerEl || !clientOffset) return empty;

  // Empty grid: place at the top
  if (widgets.length === 0) {
    const rect = containerEl.getBoundingClientRect();
    return {
      index: 0,
      indicator: {
        orientation: 'horizontal',
        top: 0,
        left: 0,
        width: rect.width,
      },
    };
  }

  const rect = containerEl.getBoundingClientRect();
  const relX = clientOffset.x - rect.left;
  const relY = clientOffset.y - rect.top + containerEl.scrollTop;

  // Gather the rendered positions of every gridstack item
  const items = gsInstance?.getGridItems() || [];
  type ItemPos = {
    idx: number;
    top: number;
    left: number;
    width: number;
    height: number;
    midX: number;
    midY: number;
  };
  const positions: ItemPos[] = [];

  items.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    const top = r.top - rect.top + containerEl.scrollTop;
    const left = r.left - rect.left;
    positions.push({
      idx,
      top,
      left,
      width: r.width,
      height: r.height,
      midX: left + r.width / 2,
      midY: top + r.height / 2,
    });
  });

  // Find the closest widget to the cursor
  let closest: ItemPos | null = null;
  let minDist = Infinity;
  for (const p of positions) {
    const dx = relX - p.midX;
    const dy = relY - p.midY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      closest = p;
    }
  }

  if (!closest) return empty;

  // Determine if the cursor is to the left/right or above/below
  const dx = relX - closest.midX;
  const dy = relY - closest.midY;
  // Normalise by item dimensions to treat tall and wide items equally
  const normDx = Math.abs(dx) / (closest.width || 1);
  const normDy = Math.abs(dy) / (closest.height || 1);

  if (normDx > normDy) {
    // Horizontal proximity wins → vertical indicator (left or right of item)
    const isRight = dx > 0;
    return {
      index: isRight ? closest.idx + 1 : closest.idx,
      indicator: {
        orientation: 'vertical',
        top: closest.top,
        left: isRight ? closest.left + closest.width : closest.left,
        height: closest.height,
      },
    };
  }
  // Vertical proximity wins → horizontal indicator (above or below item)
  const isBelow = dy > 0;
  return {
    index: isBelow ? closest.idx + 1 : closest.idx,
    indicator: {
      orientation: 'horizontal',
      top: isBelow ? closest.top + closest.height : closest.top,
      left: 0,
      width: rect.width,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Sorted, deduplicated set of widget IDs — order-independent key */
export function stableIdKey(widgets: DashboardWidget[]): string {
  return Array.from(new Set(widgets.map(w => w.id)))
    .sort()
    .join(',');
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
const GridStackGrid = ({
  gridComponent,
  width,
  editMode,
  isComponentVisible,
  depth,
  handleComponentDrop: onComponentDrop,
}: GridStackGridProps) => {
  const dispatch = useDispatch();
  const gridRef = useRef<HTMLDivElement>(null);
  const gsRef = useRef<GridStack | null>(null);
  const portalTargets = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressSync = useRef(false);
  const isDraggingRef = useRef(false);
  // Tracks the last known-good set of widget IDs.  syncToRedux() must
  // never dispatch an update that shrinks this set — that would cause
  // the idSetKey to change mid-drag and trigger a full grid rebuild
  // (destroying portal targets and charts).
  const knownWidgetIdsRef = useRef<Set<string>>(new Set());
  // Track if a rebuild was requested while dragging - will be executed on drag stop
  const pendingRebuildRef = useRef(false);
  // Track the sync version to detect stale updates
  const syncVersionRef = useRef(0);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>(null);
  const [portalRevision, setPortalRevision] = useState(0);
  // Force rebuild trigger - incremented when a deferred rebuild should execute
  const [rebuildTrigger, setRebuildTrigger] = useState(0);

  const layout = useSelector(
    (state: any) => state.dashboardLayout?.present || state.dashboardLayout,
  );

  // A chart is in fullscreen when its id is set here; used to neutralize the
  // GridStack tile transform/overflow that would otherwise trap the overlay.
  const fullSizeChartId = useSelector(
    (state: any) => state.dashboardState?.fullSizeChartId ?? null,
  );

  const columnWidth = useMemo(
    () => (width + GRID_GUTTER_SIZE) / GRID_COLUMN_COUNT - GRID_GUTTER_SIZE,
    [width],
  );

  const widgets = useMemo(
    () => layoutToWidgets(layout, gridComponent?.id),
    [layout, gridComponent?.id],
  );

  /**
   * KEY INSIGHT: Use a **sorted** set of IDs so that reordering /
   * repositioning widgets does NOT trigger a full grid rebuild.
   * Only actual add/remove of widgets changes this key.
   */
  const idSetKey = useMemo(() => stableIdKey(widgets), [widgets]);

  // Keep knownWidgetIdsRef in sync with the canonical widget list
  useEffect(() => {
    knownWidgetIdsRef.current = new Set(widgets.map(w => w.id));
  }, [widgets]);

  /* ---- Add component programmatically (called from sidebar button) ---- */
  const addComponentToGrid = useCallback(
    (componentType: string, componentId: string, meta: Record<string, any>) => {
      const dropResult = {
        source: {
          id: NEW_COMPONENTS_SOURCE_ID,
          type: 'NEW_COMPONENT_SOURCE',
          index: 0,
        },
        destination: {
          id: gridComponent?.id,
          type: gridComponent?.type,
          index: gridComponent?.children?.length || 0,
        },
        dragging: {
          id: componentId,
          type: componentType,
          meta,
        },
      };
      dispatch(handleComponentDrop(dropResult) as any);
    },
    [dispatch, gridComponent],
  );

  // Backward-compat wrapper for chart-specific adds
  const addChartToGrid = useCallback(
    (chartId: number, sliceName: string) => {
      addComponentToGrid(CHART_TYPE, 'NEW_CHART_ID', { chartId, sliceName });
    },
    [addComponentToGrid],
  );

  useEffect(() => {
    (window as any).__gridstack_addChart = addChartToGrid;
    (window as any).__gridstack_addComponent = addComponentToGrid;
    return () => {
      delete (window as any).__gridstack_addChart;
      delete (window as any).__gridstack_addComponent;
    };
  }, [addChartToGrid, addComponentToGrid]);

  /* ---- React-DND drop target (sidebar → grid) ---- */
  const [{ isOver, canDrop }, dropRef] = useDrop({
    accept: 'DRAG_DROPPABLE',
    canDrop: () => editMode,
    hover: (_item: any, monitor: any) => {
      if (!editMode || !monitor.isOver({ shallow: true })) {
        setDropIndicator(null);
        return;
      }
      const offset = monitor.getClientOffset();
      const pos = calcDropPosition(
        gridRef.current,
        gsRef.current,
        offset,
        widgets,
      );
      setDropIndicator(pos.indicator);
    },
    drop: (item: any, monitor: any) => {
      setDropIndicator(null);
      if (!editMode || !monitor.isOver({ shallow: true })) return undefined;

      const meta = item.meta || {};
      const dragType = item.type || CHART_TYPE;
      const dragId = item.id || 'NEW_CHART_ID';

      // Accept any component type from the sidebar (charts, headers,
      // markdown, dividers, blocks, etc.)
      const offset = monitor.getClientOffset();
      const pos = calcDropPosition(
        gridRef.current,
        gsRef.current,
        offset,
        widgets,
      );

      const dropResult = {
        source: {
          id: NEW_COMPONENTS_SOURCE_ID,
          type: 'NEW_COMPONENT_SOURCE' as const,
          index: 0,
        },
        destination: {
          id: gridComponent?.id,
          type: gridComponent?.type,
          index: pos.index,
        },
        dragging: {
          id: dragId,
          type: dragType,
          meta,
        },
      };
      dispatch(handleComponentDrop(dropResult) as any);
      return undefined;
    },
    collect: (monitor: any) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  useEffect(() => {
    if (!isOver) setDropIndicator(null);
  }, [isOver]);

  /* ---- Safely call methods on the GridStack instance ---- */
  const safeGs = useCallback((fn: (gs: GridStack) => void) => {
    const gs = gsRef.current;
    if (!gs) return;
    try {
      // Ensure GridStack's internal engine is still alive.
      // After gs.destroy() the engine is nulled; calling any
      // method on that instance would throw.
      if (!(gs as any).engine) return;
      fn(gs);
    } catch {
      // Instance already torn down — ignore.
    }
  }, []);

  /* ---- Sync gridstack → Redux (position / size only) ---- */
  const syncToRedux = useCallback(() => {
    const gs = gsRef.current;
    if (!gs || suppressSync.current) return;

    try {
      // Ensure the GridStack engine is still alive
      if (!(gs as any).engine) return;

      const items = gs.getGridItems();
      const orphanedElements: HTMLElement[] = [];
      const currentWidgets: DashboardWidget[] = items
        .map(el => {
          const n = el.gridstackNode;
          const id = n?.id || el.getAttribute('gs-id') || '';
          if (!id) return null;
          const orig = widgets.find(w => w.id === id);

          // CRITICAL: If we can't find the original widget, we MUST preserve
          // the existing layout data to avoid losing chartId and other metadata.
          // Skip widgets that have no corresponding layout entry - they are
          // orphaned GridStack DOM elements that should not corrupt the state.
          if (!orig) {
            console.warn(
              `GridStack sync: widget ${id} not found in layout - scheduling cleanup`,
            );
            orphanedElements.push(el);
            return null;
          }

          return {
            id,
            x: n?.x ?? 0,
            y: n?.y ?? 0,
            w: n?.w ?? 4,
            h: n?.h ?? 4,
            componentType: orig.componentType || 'CHART',
            meta: orig.meta || {},
            parentRowId: orig.parentRowId,
          };
        })
        .filter(Boolean) as DashboardWidget[];

      // Clean up orphaned DOM elements from GridStack after a short delay
      // to avoid disrupting the current sync cycle
      if (orphanedElements.length > 0 && !isDraggingRef.current) {
        requestAnimationFrame(() => {
          safeGs(currentGs => {
            for (const el of orphanedElements) {
              try {
                currentGs.removeWidget(el, false);
                portalTargets.current.delete(el.getAttribute('gs-id') || '');
              } catch {
                // Element may already be removed
              }
            }
          });
        });
      }

      if (currentWidgets.length === 0) return;

      // CRITICAL GUARD: never dispatch a sync that loses widgets.
      // During a drag, some gridstackNodes may temporarily lack an ID
      // or not appear in getGridItems().  If any known widget is
      // missing from currentWidgets, skip this sync entirely — the
      // next dragstop/change will retry with the complete set.
      const currentIds = new Set(currentWidgets.map(w => w.id));
      const knownIds = Array.from(knownWidgetIdsRef.current);
      for (let i = 0; i < knownIds.length; i++) {
        if (!currentIds.has(knownIds[i])) {
          // A widget we know about is missing from GridStack's items.
          // This is transient — do NOT dispatch or we'll lose it.
          return;
        }
      }

      const newLayout = widgetsToLayout(
        currentWidgets,
        layout,
        gridComponent?.id,
      );

      const diff: Record<string, any> = {};
      for (const [key, value] of Object.entries(newLayout)) {
        if (JSON.stringify(value) !== JSON.stringify(layout[key])) {
          diff[key] = value;
        }
      }

      if (Object.keys(diff).length > 0) {
        suppressSync.current = true;
        // Track sync version to detect stale updates
        const thisVersion = ++syncVersionRef.current;
        dispatch(updateComponents(diff));
        dispatch(setUnsavedChanges(true));
        // Double-rAF: let React commit the Redux update so the
        // layout selector re-runs *before* we allow the next sync.
        // This prevents a feedback loop where Redux → widgets →
        // widgetKey change → full rebuild during a drag.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Only unsuppress if no newer sync has started
            if (syncVersionRef.current === thisVersion) {
              suppressSync.current = false;
            }
          });
        });
      }
    } catch (e) {
      console.warn('GridStack sync error (safe to ignore):', e);
    }
  }, [dispatch, layout, widgets, gridComponent?.id, safeGs]);

  /* ---- Build / rebuild GridStack ---- */
  useEffect(() => {
    if (!gridRef.current) return;

    // NEVER rebuild while the user is actively dragging — GridStack's
    // internal DDDraggable still holds mouse listeners.  Destroying the
    // grid mid-drag leaves those listeners dangling, and the subsequent
    // mouseup fires _triggerChangeEvent on a destroyed engine (the
    // "Cannot read properties of undefined (reading 'batchMode')" crash).
    if (isDraggingRef.current) {
      // Mark that a rebuild is needed once drag completes
      pendingRebuildRef.current = true;
      return;
    }
    pendingRebuildRef.current = false;

    // --- Tear down any existing grid ---
    if (gsRef.current) {
      try {
        const gs = gsRef.current;
        gs.off('change');
        gs.off('dragstart');
        gs.off('dragstop');
        gs.off('resizestart');
        gs.off('resizestop');
        gs.setStatic(true);
        gs.destroy(false);
      } catch {
        // already torn down
      }
      gsRef.current = null;
    }

    const container = gridRef.current;
    container.innerHTML = '';
    portalTargets.current.clear();

    // --- Create DOM items ---
    for (const w of widgets) {
      const item = document.createElement('div');
      item.className = 'grid-stack-item';
      item.setAttribute('gs-id', w.id);
      item.setAttribute('gs-x', String(w.x));
      item.setAttribute('gs-y', String(w.y));
      item.setAttribute('gs-w', String(w.w));
      item.setAttribute('gs-h', String(w.h));
      item.setAttribute('gs-min-w', '1');
      item.setAttribute('gs-min-h', '2');

      const content = document.createElement('div');
      content.className = 'grid-stack-item-content';

      const portal = document.createElement('div');
      portal.style.cssText = 'width:100%;height:100%';
      content.appendChild(portal);
      portalTargets.current.set(w.id, portal);

      item.appendChild(content);
      container.appendChild(item);
    }
    setPortalRevision(current => current + 1);

    // --- Initialise GridStack ---
    const gs = GridStack.init(
      {
        column: GRID_COLUMN_COUNT,
        cellHeight: CELL_HEIGHT,
        // Tight visual gutter between tiles (4px). This is GridStack's own render
        // margin and is independent of the ChartHolder width formula, which
        // measures actual container width — so tiles just pack closer.
        margin: GRID_GUTTER_SIZE / 4,
        float: false,
        animate: true,
        staticGrid: !editMode,
        acceptWidgets: false,
        removable: false,
        resizable: { handles: 'e, se, s' },
        draggable: { handle: '.grid-stack-item-content' },
      },
      container,
    );

    try {
      gs.compact('compact');
    } catch {
      // ok
    }

    gsRef.current = gs;
    isDraggingRef.current = false;
    requestAnimationFrame(() => {
      safeGs(currentGrid => {
        try {
          currentGrid.compact('compact');
        } catch {
          // ok
        }
      });
      window.dispatchEvent(new Event('resize'));
    });
    return () => {
      if (gsRef.current) {
        try {
          gsRef.current.off('change');
          gsRef.current.off('dragstart');
          gsRef.current.off('dragstop');
          gsRef.current.off('resizestart');
          gsRef.current.off('resizestop');
          gsRef.current.setStatic(true);
          gsRef.current.destroy(false);
        } catch {
          // ok
        }
        gsRef.current = null;
      }
    };
    // ONLY rebuild when the set of widget IDs changes (add / remove),
    // NOT when positions change (drag / resize). Also rebuild when
    // rebuildTrigger changes (deferred rebuild after drag completes).
  }, [idSetKey, rebuildTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Toggle static / interactive ---- */
  useEffect(() => {
    safeGs(gs => {
      gs.setStatic(!editMode);
      gs.enableMove(editMode);
      gs.enableResize(editMode);
    });
  }, [editMode, safeGs]);

  /* ---- Attach event listeners (re-attach when syncToRedux changes) ---- */
  useEffect(() => {
    const gs = gsRef.current;
    if (!gs) return;

    const onDragResizeStart = () => {
      isDraggingRef.current = true;
    };

    const onDragResizeStop = () => {
      isDraggingRef.current = false;
      // Guard: gsRef may have been cleared if a rebuild happened
      safeGs(g => {
        try {
          g.compact('compact');
        } catch {
          /* ignore */
        }
      });
      syncToRedux();
      // If a rebuild was requested during drag, trigger it now
      if (pendingRebuildRef.current) {
        pendingRebuildRef.current = false;
        setRebuildTrigger(prev => prev + 1);
      }
    };

    const onChange = () => {
      // Skip sync during active drag/resize — we sync on stop
      if (isDraggingRef.current) return;
      safeGs(g => {
        try {
          g.compact('compact');
        } catch {
          /* ignore */
        }
      });
      syncToRedux();
    };

    gs.on('change', onChange);
    gs.on('dragstart', onDragResizeStart);
    gs.on('resizestart', onDragResizeStart);
    gs.on('dragstop', onDragResizeStop);
    gs.on('resizestop', onDragResizeStop);

    return () => {
      try {
        gs.off('change');
        gs.off('dragstart');
        gs.off('resizestart');
        gs.off('dragstop');
        gs.off('resizestop');
      } catch {
        // ignore
      }
    };
  }, [syncToRedux, safeGs]);

  if (!gridComponent || !gridComponent.children) return null;

  const isEmpty = widgets.length === 0;

  return (
    <GridStackContainer
      $editMode={editMode}
      $fullSizeActive={fullSizeChartId != null}
      ref={dropRef}
    >
      <div ref={gridRef} className="grid-stack" />

      {/* Empty-state drop zone when dashboard has no content yet */}
      {editMode && isEmpty && (
        <div
          className={`gs-empty-placeholder${
            isOver && canDrop ? ' gs-empty-placeholder--active' : ''
          }`}
        >
          <div className="gs-empty-placeholder-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div className="gs-empty-placeholder-title">
            {isOver && canDrop
              ? t('Release to add')
              : t('Build your dashboard')}
          </div>
          <div className="gs-empty-placeholder-hint">
            {isOver && canDrop
              ? t('Drop to add this component to your dashboard')
              : t(
                  'Drag charts and components from the sidebar to create your visualization',
                )}
          </div>
        </div>
      )}

      {/* Drop overlay when dragging from sidebar over populated grid */}
      {editMode && isOver && canDrop && !isEmpty && (
        <div className="gs-drop-overlay" />
      )}

      {/* Drop position indicator (horizontal or vertical) */}
      {editMode &&
        isOver &&
        canDrop &&
        dropIndicator &&
        (dropIndicator.orientation === 'horizontal' ? (
          <div
            className="gs-drop-indicator gs-drop-indicator--horizontal"
            style={{ top: dropIndicator.top }}
          />
        ) : (
          <div
            className="gs-drop-indicator gs-drop-indicator--vertical"
            style={{
              top: dropIndicator.top,
              left: dropIndicator.left,
              height: dropIndicator.height,
            }}
          />
        ))}

      {/* React portals into gridstack DOM */}
      {widgets.map(w => {
        const target = portalTargets.current.get(w.id);
        if (!target) return null;
        return createPortal(
          <WidgetContent
            key={`${w.id}-${portalRevision}`}
            componentId={w.id}
            parentId={w.parentRowId || gridComponent.id}
            depth={depth + 2}
            columnWidth={columnWidth}
            isComponentVisible={isComponentVisible}
            editMode={editMode}
          />,
          target,
        );
      })}
    </GridStackContainer>
  );
};

export default memo(GridStackGrid);
