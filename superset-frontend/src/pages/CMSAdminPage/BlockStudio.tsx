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
/* eslint-disable no-restricted-imports, theme-colors/no-literal-colors, import/no-extraneous-dependencies */

import { useEffect, useMemo, useState } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BorderOutlined,
  CodeOutlined,
  ColumnHeightOutlined,
  CopyOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DesktopOutlined,
  EditOutlined,
  EyeOutlined,
  FileImageOutlined,
  FileOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  LayoutOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
  PlusOutlined,
  NotificationOutlined,
  PaperClipOutlined,
  PictureOutlined,
  ProfileOutlined,
  SaveOutlined,
  TableOutlined,
  TabletOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { styled, SupersetClient, t } from '@superset-ui/core';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
} from 'antd';
import {
  groupBlocksBySlot,
  RenderBlockTree,
} from 'src/pages/PublicLandingPage/BlockRenderer';
import { isMapLikeViz } from 'src/pages/PublicLandingPage/PublicChartContainer';
import {
  addRootBlock,
  cloneBlockTree,
  cloneBlocksForInsertion,
  createGridTemplateBlock,
  createReusableReferenceBlock,
  createEmptyBlock,
  detachReusableBlockByUid,
  duplicateBlockByUid,
  ensurePageBlocks,
  flattenBlocks,
  insertBlocksRelative,
  insertBlockRelative,
  isContainerBlock,
  moveBlockByUid,
  normalizeBlocks,
  removeBlockByUid,
  setColumnsBlockTemplateByUid,
  splitBlockIntoColumnsByUid,
  updateBlockByUid,
  updateBlockContent,
  updateBlockSettings,
  updateBlockStyles,
} from 'src/pages/PublicLandingPage/blockUtils';
import type {
  PortalBlockDefinition,
  PortalChartSummary,
  PortalDashboardSummary,
  PortalMediaAsset,
  PortalNavigationMenu,
  PortalPage,
  PortalPageBlock,
  PortalPageSummary,
  PortalReusableBlock,
  PortalStarterPattern,
  PortalStyleBundle,
  PortalTemplate,
  PortalTheme,
} from 'src/pages/PublicLandingPage/types';
import { resolvePortalPagePath } from 'src/pages/PublicLandingPage/portalUtils';
import RichTextComposer, { extractPlainText } from './RichTextComposer';
import AIPageGenerator from './AIPageGenerator';

// ============================================================================
// NEW 3-PANEL LAYOUT COMPONENTS
// ============================================================================

const StudioRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 76px);
  overflow: hidden;
  background: #f1f5f9;
`;

const StudioHeader = styled.header`
  display: grid;
  /*
    minmax(0, auto) rather than auto on the outer columns: a grid item's
    automatic minimum size is its content, so a long page title in the left
    group would grow past its track and shunt the centred mode chips into the
    right-hand group. Allowing the tracks to shrink below content lets the
    children below ellipsise instead.
  */
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  height: 52px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  flex-shrink: 0;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;

  /* Let the page picker give way rather than push the rest of the header. */
  .ant-select {
    min-width: 0;
  }
`;

const HeaderCenter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  justify-content: flex-end;
`;

const StudioWorkspace = styled.div<{ $leftCollapsed?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $leftCollapsed }) =>
    $leftCollapsed ? '56px 1fr 280px' : '260px 1fr 280px'};
  flex: 1;
  overflow: hidden;
  transition: grid-template-columns 0.2s ease;

  @media (max-width: 1200px) {
    grid-template-columns: ${({ $leftCollapsed }) =>
      $leftCollapsed ? '56px 1fr 260px' : '220px 1fr 260px'};
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const LibraryPanel = styled.aside<{ $collapsed?: boolean }>`
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-right: 1px solid #e2e8f0;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 900px) {
    position: absolute;
    left: 0;
    top: 52px;
    height: calc(100vh - 128px);
    width: 280px;
    transform: translateX(${({ $collapsed }) => ($collapsed ? '-100%' : '0')});
    transition: transform 0.3s ease;
    z-index: 50;
    box-shadow: ${({ $collapsed }) =>
      $collapsed ? 'none' : '4px 0 24px rgba(0,0,0,0.12)'};
  }
`;

const LibraryHeader = styled.div<{ $collapsed?: boolean }>`
  padding: ${({ $collapsed }) => ($collapsed ? '12px 8px' : '14px 16px')};
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  flex-shrink: 0;
`;

const LibraryTitle = styled.h3<{ $collapsed?: boolean }>`
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #1e293b;
  display: ${({ $collapsed }) => ($collapsed ? 'none' : 'block')};
`;

const LibraryCollapseBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;

  &:hover {
    background: #f1f5f9;
    border-color: #0f766e;
    color: #0f766e;
  }
`;

const LibraryIconTabs = styled.div<{ $collapsed?: boolean }>`
  display: flex;
  flex-direction: ${({ $collapsed }) => ($collapsed ? 'column' : 'row')};
  gap: ${({ $collapsed }) => ($collapsed ? '8px' : '6px')};
  padding: ${({ $collapsed }) => ($collapsed ? '16px 8px' : '14px 16px')};
  border-bottom: ${({ $collapsed }) => ($collapsed ? 'none' : '1px solid #e2e8f0')};
  background: ${({ $collapsed }) => ($collapsed ? 'transparent' : '#fafbfc')};
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'flex-start' : 'flex-start')};
  flex: ${({ $collapsed }) => ($collapsed ? '1' : '0 0 auto')};
  overflow-y: ${({ $collapsed }) => ($collapsed ? 'auto' : 'visible')};
`;

const LibraryIconTab = styled.button<{ $active?: boolean; $collapsed?: boolean }>`
  width: ${({ $collapsed }) => ($collapsed ? '40px' : '42px')};
  height: ${({ $collapsed }) => ($collapsed ? '40px' : '42px')};
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? '#0f766e' : 'transparent')};
  background: ${({ $active }) =>
    $active
      ? 'linear-gradient(135deg, rgba(15, 118, 110, 0.12) 0%, rgba(15, 118, 110, 0.06) 100%)'
      : 'transparent'};
  color: ${({ $active }) => ($active ? '#0f766e' : '#64748b')};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ $collapsed }) => ($collapsed ? '18px' : '20px')};
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(15, 118, 110, 0.08);
    color: #0f766e;
    border-color: rgba(15, 118, 110, 0.3);
  }
`;

const LibraryContent = styled.div<{ $collapsed?: boolean }>`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${({ $collapsed }) => ($collapsed ? '0' : '16px')};
  display: ${({ $collapsed }) => ($collapsed ? 'none' : 'block')};

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
`;

const ComponentCategory = styled.div`
  margin-bottom: 24px;
`;

const ComponentCategoryLabel = styled.h4`
  margin: 0 0 12px 0;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f766e;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, transparent 100%);
  border-radius: 8px;
  border-left: 3px solid #0f766e;
`;

const ComponentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
`;

const ComponentCard = styled.button<{ disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 10px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &:hover:not(:disabled) {
    background: #f0fdfa;
    border-color: #0f766e;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(15, 118, 110, 0.12);
  }

  .icon {
    font-size: 26px;
    color: #0f766e;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: rgba(15, 118, 110, 0.08);
    border-radius: 12px;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    color: #1e293b;
    text-align: center;
    line-height: 1.3;
    word-break: break-word;
  }
`;

const CanvasPanel = styled.main`
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
  overflow: hidden;
  position: relative;
`;

const CanvasTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
`;

const CanvasContainer = styled.div`
  flex: 1;
  padding: 32px;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }
`;

const SelectionBreadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  color: #f1f5f9;
  font-size: 13px;
  flex-shrink: 0;
  font-weight: 500;

  .separator {
    color: #64748b;
  }
  .item {
    cursor: pointer;
    transition: color 0.15s ease;
    &:hover {
      color: #38bdf8;
    }
  }
  .current {
    color: #fbbf24;
    font-weight: 600;
  }
`;

const PropertiesPanel = styled.aside<{ $collapsed?: boolean }>`
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-left: 1px solid #e2e8f0;
  overflow: hidden;

  @media (max-width: 900px) {
    position: absolute;
    right: 0;
    top: 52px;
    height: calc(100vh - 128px);
    width: 300px;
    transform: translateX(${({ $collapsed }) => ($collapsed ? '100%' : '0')});
    transition: transform 0.3s ease;
    z-index: 50;
    box-shadow: ${({ $collapsed }) =>
      $collapsed ? 'none' : '-4px 0 24px rgba(0,0,0,0.12)'};
  }
`;

const PropertiesTabs = styled.div`
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  background: #ffffff;
`;

const PropertiesTab = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 14px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: none;
  background: ${({ $active }) => ($active ? '#ffffff' : 'transparent')};
  color: ${({ $active }) => ($active ? '#0f766e' : '#64748b')};
  cursor: pointer;
  border-bottom: 3px solid
    ${({ $active }) => ($active ? '#0f766e' : 'transparent')};
  margin-bottom: -1px;
  transition: all 0.15s ease;

  &:hover {
    color: #0f766e;
    background: ${({ $active }) => ($active ? '#ffffff' : '#f8fafc')};
  }
`;

const PropertiesContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
`;

const PropertySection = styled.div`
  margin-bottom: 24px;
`;

const PropertySectionHeader = styled.button<{ $expanded?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: ${({ $expanded }) =>
    $expanded ? 'linear-gradient(90deg, rgba(15, 118, 110, 0.06) 0%, transparent 100%)' : '#f8fafc'};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${({ $expanded }) => ($expanded ? '#0f766e' : '#475569')};
  transition: all 0.15s ease;
  margin-bottom: 4px;

  &:hover {
    background: rgba(15, 118, 110, 0.08);
    color: #0f766e;
  }

  .chevron {
    transform: rotate(${({ $expanded }) => ($expanded ? '180deg' : '0')});
    transition: transform 0.2s ease;
    color: ${({ $expanded }) => ($expanded ? '#0f766e' : '#94a3b8')};
  }
`;

const PropertySectionContent = styled.div<{ $expanded?: boolean }>`
  display: ${({ $expanded }) => ($expanded ? 'block' : 'none')};
  padding: 12px 0 8px;
`;

const EffectToggle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 10px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  }

  .ant-switch-checked {
    background: #0f766e;
  }
`;

const SavePresetButton = styled.button`
  margin: 16px 0;
  padding: 14px;
  width: 100%;
  border-radius: 10px;
  border: 1px dashed #0f766e;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.06) 0%, rgba(15, 118, 110, 0.02) 100%);
  color: #0f766e;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(15, 118, 110, 0.1);
    border-style: solid;
    transform: translateY(-1px);
  }
`;

// ============================================================================
// LEGACY COMPONENTS (kept for compatibility with existing render functions)
// ============================================================================

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`;

const PanelTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 700;
`;

const SectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CardButton = styled.button<{ $active?: boolean; $depth?: number }>`
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  margin-left: ${({ $depth = 0 }) => $depth * 12}px;
  border-radius: 14px;
  border: 1px solid
    ${({ $active }) =>
      $active ? 'rgba(15, 118, 110, 0.35)' : 'rgba(148, 163, 184, 0.22)'};
  background: ${({ $active }) =>
    $active ? 'rgba(15, 118, 110, 0.08)' : '#ffffff'};
  cursor: pointer;
`;

const TinyMeta = styled.div`
  color: ${({ theme }) => theme.colorTextSecondary};
  font-size: 12px;
`;

const FieldBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FieldLabel = styled.div`
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colorTextLabel};
`;

const StudioModeChip = styled.button<{ $active?: boolean }>`
  border: 1px solid
    ${({ $active }) =>
      $active ? 'rgba(15, 118, 110, 0.45)' : 'rgba(148, 163, 184, 0.22)'};
  border-radius: 999px;
  background: ${({ $active }) => ($active ? '#ccfbf1' : '#ffffff')};
  color: ${({ $active }) => ($active ? '#115e59' : '#334155')};
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
`;

const ViewportFrame = styled.div<{
  $mode: 'desktop' | 'tablet' | 'mobile';
}>`
  width: 100%;
  max-width: ${({ $mode }) =>
    $mode === 'mobile' ? '430px' : $mode === 'tablet' ? '820px' : '100%'};
  margin: 0 auto;
  transition: max-width 0.2s ease;
`;

const StudioViewport = styled.div`
  min-height: 72vh;
  padding: 32px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.22);

  @media (max-width: 768px) {
    padding: 18px;
  }
`;

const RegionGrid = styled.div`
  display: grid;
  gap: 14px;
`;

const RegionCard = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
`;

const SlotLabel = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const DrawerStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const DrawerSection = styled.div`
  padding: 14px 16px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.18);
`;

const RegionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const RegionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
`;

const InlinePills = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

type BlockStudioProps = {
  draftPage: PortalPage | null;
  pages: PortalPageSummary[];
  charts: PortalChartSummary[];
  dashboards: PortalDashboardSummary[];
  mediaAssets: PortalMediaAsset[];
  portalLayout?: Record<string, any>;
  navigationMenus?: {
    header: PortalNavigationMenu[];
    footer: PortalNavigationMenu[];
  };
  styleBundles: PortalStyleBundle[];
  themes: PortalTheme[];
  templates: PortalTemplate[];
  blockTypes?: PortalBlockDefinition[];
  reusableBlocks?: PortalReusableBlock[];
  starterPatterns?: PortalStarterPattern[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPage: (pageSlug: string | null) => void;
  onNewPage: () => void;
  onChangeDraftPage: (nextPage: PortalPage) => void;
  onChangePortalLayout?: (nextLayout: Record<string, any>) => void;
  onSavePortalLayout?: () => void;
  onSaveDraft?: () => void;
  savingDraft?: boolean;
  savingPortalLayout?: boolean;
};

type Selection = { type: 'page' } | { type: 'block'; uid: string };

type ReusableDraft = {
  id?: number | null;
  title: string;
  description: string;
  category: string;
};

type StatusMessage = {
  type: 'success' | 'error' | 'info';
  message: string;
};

const SLOT_OPTIONS = [
  { value: 'header', label: t('Header') },
  { value: 'hero', label: t('Hero') },
  { value: 'content', label: t('Content') },
  { value: 'sidebar', label: t('Sidebar') },
  { value: 'cta', label: t('CTA') },
  { value: 'footer', label: t('Footer') },
] as const;

const GRID_TEMPLATE_OPTIONS = [
  { value: 1, label: t('1 Col') },
  { value: 2, label: t('2 Col') },
  { value: 3, label: t('3 Col') },
  { value: 4, label: t('4 Col') },
] as const;

const PAGE_TYPE_OPTIONS = [
  { value: 'content', label: t('Standard Page') },
  { value: 'landing', label: t('Landing Page') },
  { value: 'dashboard', label: t('Dashboard Page') },
  { value: 'documentation', label: t('Documentation') },
  { value: 'faq', label: t('FAQ') },
  { value: 'policy', label: t('Policy') },
  { value: 'utility', label: t('Utility') },
] as const;

const PREVIEW_VIEWPORTS = [
  { value: 'desktop', label: t('Desktop') },
  { value: 'tablet', label: t('Tablet') },
  { value: 'mobile', label: t('Mobile') },
] as const;

const SURFACE_PRESET_OPTIONS = [
  { value: 'custom', label: t('Custom') },
  { value: 'plain', label: t('Plain') },
  { value: 'subtle', label: t('Subtle Card') },
  { value: 'outlined', label: t('Outlined Card') },
  { value: 'elevated', label: t('Elevated Card') },
  { value: 'inverse', label: t('Inverse Card') },
] as const;

const BORDER_STYLE_OPTIONS = [
  { value: 'solid', label: t('Solid') },
  { value: 'dashed', label: t('Dashed') },
  { value: 'dotted', label: t('Dotted') },
  { value: 'double', label: t('Double') },
  { value: 'none', label: t('None') },
] as const;

const CONTENT_ALIGN_OPTIONS = [
  { value: 'stretch', label: t('Stretch') },
  { value: 'start', label: t('Left') },
  { value: 'center', label: t('Center') },
  { value: 'end', label: t('Right') },
] as const;

const HERO_ACTION_ALIGN_OPTIONS = [
  { value: 'start', label: t('Left') },
  { value: 'center', label: t('Center') },
  { value: 'end', label: t('Right') },
] as const;

const OVERFLOW_OPTIONS = [
  { value: 'visible', label: t('Visible') },
  { value: 'hidden', label: t('Hidden') },
  { value: 'auto', label: t('Auto') },
  { value: 'scroll', label: t('Scroll') },
] as const;

const BACKGROUND_SIZE_OPTIONS = [
  { value: 'cover', label: t('Cover') },
  { value: 'contain', label: t('Contain') },
  { value: 'auto', label: t('Auto') },
] as const;

const BACKGROUND_REPEAT_OPTIONS = [
  { value: 'no-repeat', label: t('No Repeat') },
  { value: 'repeat', label: t('Repeat') },
  { value: 'repeat-x', label: t('Repeat Horizontally') },
  { value: 'repeat-y', label: t('Repeat Vertically') },
] as const;

const CHART_SURFACE_OPTIONS = [
  { value: 'default', label: t('Default Card') },
  { value: 'borderless', label: t('Borderless') },
  { value: 'map_focus', label: t('Map Focus') },
] as const;

const CHART_LEGEND_OPTIONS = [
  { value: 'default', label: t('Inherit Chart') },
  { value: 'horizontal_top', label: t('Horizontal Top') },
  { value: 'horizontal_bottom', label: t('Horizontal Bottom') },
  { value: 'vertical_right', label: t('Vertical Right') },
  { value: 'hidden', label: t('Hide Legend') },
] as const;

const LIBRARY_CATEGORIES = [
  {
    id: 'essentials',
    label: 'Essentials',
    blocks: ['heading', 'paragraph', 'rich_text', 'button', 'image'],
  },
  {
    id: 'layout',
    label: 'Layout',
    blocks: ['section', 'columns', 'group', 'card', 'hero', 'callout'],
  },
  {
    id: 'media',
    label: 'Media',
    blocks: ['image', 'gallery', 'video', 'embed', 'file', 'download'],
  },
  {
    id: 'data',
    label: 'Data',
    blocks: ['chart', 'dashboard', 'table', 'statistic', 'dynamic_widget'],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blocks: ['html', 'menu', 'breadcrumb', 'page_title', 'divider', 'spacer'],
  },
] as const;

const AUTO_GENERATE_TEMPLATES = [
  {
    id: 'dashboard-overview',
    label: 'Dashboard Overview',
    icon: 'dashboard',
    description: 'Hero + 4 charts in 2x2 grid',
    blocks: [
      {
        block_type: 'hero',
        slot: 'hero',
        content: { title: 'Dashboard Title', text: 'Add your dashboard description here...' },
        settings: { showButton: false },
      },
      {
        block_type: 'section',
        slot: 'content',
        content: { title: 'Key Metrics' },
        children: [
          {
            block_type: 'columns',
            settings: { columns: 2 },
            children: [
              { block_type: 'chart', content: { title: 'Chart 1' }, settings: { chart_id: null, placeholder: true } },
              { block_type: 'chart', content: { title: 'Chart 2' }, settings: { chart_id: null, placeholder: true } },
            ],
          },
          {
            block_type: 'columns',
            settings: { columns: 2 },
            children: [
              { block_type: 'chart', content: { title: 'Chart 3' }, settings: { chart_id: null, placeholder: true } },
              { block_type: 'chart', content: { title: 'Chart 4' }, settings: { chart_id: null, placeholder: true } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'data-report',
    label: 'Data Report',
    icon: 'table',
    description: 'Heading + chart + table',
    blocks: [
      {
        block_type: 'heading',
        slot: 'content',
        content: { text: 'Report Title' },
        settings: { level: 1 },
      },
      {
        block_type: 'paragraph',
        slot: 'content',
        content: { text: 'Add your report introduction and summary here...' },
      },
      {
        block_type: 'chart',
        slot: 'content',
        content: { title: 'Main Chart' },
        settings: { chart_id: null, placeholder: true },
      },
      {
        block_type: 'table',
        slot: 'content',
        content: { title: 'Data Table' },
        settings: { placeholder: true },
      },
    ],
  },
  {
    id: 'map-focus',
    label: 'Map + Stats',
    icon: 'picture',
    description: 'Large map with statistics sidebar',
    blocks: [
      {
        block_type: 'heading',
        slot: 'content',
        content: { text: 'Regional Overview' },
        settings: { level: 1 },
      },
      {
        block_type: 'columns',
        slot: 'content',
        settings: { columns: 2, ratio: '2:1' },
        children: [
          { block_type: 'chart', content: { title: 'Map View' }, settings: { chart_id: null, placeholder: true, surface: 'map_focus' } },
          {
            block_type: 'group',
            children: [
              { block_type: 'statistic', content: { title: 'Total', value: '...' } },
              { block_type: 'statistic', content: { title: 'Average', value: '...' } },
              { block_type: 'statistic', content: { title: 'Trend', value: '...' } },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'landing-page',
    label: 'Landing Page',
    icon: 'layout',
    description: 'Hero + features + CTA',
    blocks: [
      {
        block_type: 'hero',
        slot: 'hero',
        content: {
          title: 'Welcome to Your Portal',
          text: 'Add a compelling description here...',
        },
        settings: { showButton: true, buttonLabel: 'Get Started', buttonUrl: '#' },
      },
      {
        block_type: 'section',
        slot: 'content',
        content: { title: 'Features' },
        children: [
          {
            block_type: 'columns',
            settings: { columns: 3 },
            children: [
              { block_type: 'card', content: { title: 'Feature 1', text: 'Description...' } },
              { block_type: 'card', content: { title: 'Feature 2', text: 'Description...' } },
              { block_type: 'card', content: { title: 'Feature 3', text: 'Description...' } },
            ],
          },
        ],
      },
      {
        block_type: 'callout',
        slot: 'cta',
        content: { title: 'Ready to get started?', text: 'Contact us today.' },
        settings: { showButton: true, buttonLabel: 'Contact', buttonUrl: '#' },
      },
    ],
  },
] as const;

type PropertiesTabType = 'design' | 'config' | 'interactions';
type LibraryCategoryType = 'essentials' | 'layout' | 'media' | 'data' | 'advanced' | 'saved';

function blockKey(block: PortalPageBlock) {
  return block.uid || String(block.id);
}

function createReusableDraft(
  reusableBlock?: PortalReusableBlock | null,
  fallbackTitle?: string,
): ReusableDraft {
  return {
    id: reusableBlock?.id ?? null,
    title: reusableBlock?.title || fallbackTitle || '',
    description: reusableBlock?.description || '',
    category: reusableBlock?.category || 'custom',
  };
}

function sortReusableLibrary(reusableBlocks: PortalReusableBlock[]) {
  return [...(reusableBlocks || [])].sort((left, right) =>
    (left.title || '').localeCompare(right.title || ''),
  );
}

function sameReusableLibrary(
  left: PortalReusableBlock[],
  right: PortalReusableBlock[],
) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other?.id &&
      item.title === other?.title &&
      item.changed_on === other?.changed_on
    );
  });
}

function blockIcon(type?: string, iconName?: string | null) {
  const resolved = iconName || type || 'paragraph';
  switch (resolved) {
    case 'layout':
    case 'section':
    case 'group':
    case 'columns':
    case 'column':
    case 'hero':
    case 'card':
      return <LayoutOutlined />;
    case 'paragraph':
    case 'rich_text':
    case 'heading':
    case 'title':
    case 'font-size':
      return <FontSizeOutlined />;
    case 'list':
    case 'unordered-list':
      return <ProfileOutlined />;
    case 'quote':
    case 'highlight':
    case 'callout':
      return <HighlightOutlined />;
    case 'picture':
    case 'image':
    case 'gallery':
      return <PictureOutlined />;
    case 'video':
    case 'video-camera':
    case 'embed':
      return <VideoCameraOutlined />;
    case 'paper-clip':
    case 'file':
    case 'download':
      return <PaperClipOutlined />;
    case 'button':
    case 'link':
      return <LinkOutlined />;
    case 'copy':
    case 'reusable_reference':
      return <CopyOutlined />;
    case 'divider':
    case 'minus':
      return <BorderOutlined />;
    case 'spacer':
    case 'column-height':
      return <ColumnHeightOutlined />;
    case 'chart':
    case 'bar-chart':
      return <BarChartOutlined />;
    case 'dashboard':
      return <DashboardOutlined />;
    case 'table':
      return <TableOutlined />;
    case 'page_title':
    case 'breadcrumb':
    case 'menu':
      return <MenuOutlined />;
    case 'dynamic_widget':
      return <AppstoreOutlined />;
    case 'html':
    case 'code':
      return <CodeOutlined />;
    case 'statistic':
      return <NotificationOutlined />;
    case 'file-image':
      return <FileImageOutlined />;
    case 'file-outlined':
      return <FileOutlined />;
    default:
      return <FileTextOutlined />;
  }
}

const FALLBACK_BLOCK_TYPES: PortalBlockDefinition[] = [
  {
    type: 'section',
    label: t('Section'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'group',
    label: t('Group'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'columns',
    label: t('Columns'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'column',
    label: t('Column'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'hero',
    label: t('Hero'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'card',
    label: t('Card'),
    category: 'layout',
    is_container: true,
  },
  {
    type: 'reusable_reference',
    label: t('Reusable Section'),
    category: 'layout',
    is_container: false,
  },
  {
    type: 'rich_text',
    label: t('Rich Text'),
    category: 'text',
    is_container: false,
  },
  {
    type: 'paragraph',
    label: t('Paragraph'),
    category: 'text',
    is_container: false,
  },
  {
    type: 'heading',
    label: t('Heading'),
    category: 'text',
    is_container: false,
  },
  {
    type: 'list',
    label: t('List'),
    category: 'text',
    is_container: false,
  },
  {
    type: 'quote',
    label: t('Quote'),
    category: 'text',
    is_container: false,
  },
  {
    type: 'image',
    label: t('Image'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'gallery',
    label: t('Gallery'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'video',
    label: t('Video'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'embed',
    label: t('Embed'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'file',
    label: t('File'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'download',
    label: t('Download'),
    category: 'media',
    is_container: false,
  },
  {
    type: 'button',
    label: t('Button'),
    category: 'design',
    is_container: false,
  },
  {
    type: 'divider',
    label: t('Divider'),
    category: 'design',
    is_container: false,
  },
  {
    type: 'spacer',
    label: t('Spacer'),
    category: 'design',
    is_container: false,
  },
  {
    type: 'callout',
    label: t('Callout'),
    category: 'design',
    is_container: false,
  },
  {
    type: 'chart',
    label: t('Chart'),
    category: 'data',
    is_container: false,
  },
  {
    type: 'dashboard',
    label: t('Dashboard'),
    category: 'data',
    is_container: false,
  },
  {
    type: 'table',
    label: t('Table'),
    category: 'data',
    is_container: false,
  },
  {
    type: 'statistic',
    label: t('Statistic'),
    category: 'data',
    is_container: false,
  },
  {
    type: 'dynamic_widget',
    label: t('Dynamic Widget'),
    category: 'data',
    is_container: false,
  },
  {
    type: 'page_title',
    label: t('Page Title'),
    category: 'utility',
    is_container: false,
  },
  {
    type: 'breadcrumb',
    label: t('Breadcrumb'),
    category: 'utility',
    is_container: false,
  },
  {
    type: 'menu',
    label: t('Menu'),
    category: 'utility',
    is_container: false,
  },
  {
    type: 'html',
    label: t('HTML'),
    category: 'advanced',
    is_container: false,
  },
];

function formatGalleryImages(images?: Array<Record<string, any>>) {
  return (images || [])
    .map(image =>
      [image?.url || '', image?.alt || '', image?.caption || ''].join(' | '),
    )
    .join('\n');
}

function parseGalleryImages(rawValue: string) {
  return rawValue
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [url, alt = '', caption = ''] = line
        .split('|')
        .map(part => part.trim());
      return { url, alt, caption };
    });
}

function formatTableColumns(columns?: string[]) {
  return (columns || []).join(', ');
}

function parseTableColumns(rawValue: string) {
  return rawValue
    .split(',')
    .map(column => column.trim())
    .filter(Boolean);
}

function formatTableRows(rows?: string[][]) {
  return (rows || []).map(row => row.join(' | ')).join('\n');
}

function parseTableRows(rawValue: string) {
  return rawValue
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split('|').map(cell => cell.trim()));
}

function viewportIcon(mode: 'desktop' | 'tablet' | 'mobile') {
  switch (mode) {
    case 'tablet':
      return <TabletOutlined />;
    case 'mobile':
      return <ColumnHeightOutlined rotate={90} />;
    case 'desktop':
    default:
      return <DesktopOutlined />;
  }
}

function richTextValue(
  block: PortalPageBlock | null,
  fallback = t('No content yet.'),
) {
  if (!block) {
    return '';
  }
  return (
    block.content?.html ||
    block.content?.body_html ||
    block.content?.body ||
    block.content?.quote ||
    fallback
  );
}

function richFieldValue(
  block: PortalPageBlock | null,
  field: string,
  fallback = '',
) {
  if (!block) {
    return fallback;
  }
  return block.content?.[`${field}_html`] || block.content?.[field] || fallback;
}

function settingsFieldValue(
  block: PortalPageBlock | null,
  field: string,
  fallback = '',
) {
  if (!block) {
    return fallback;
  }
  return (
    block.settings?.[`${field}_html`] || block.settings?.[field] || fallback
  );
}

function normalizedStyleValue(value: any) {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return value;
}

function numericStyleValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px?$/i);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function pixelStyleValue(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return `${Math.max(Number(value), 0)}px`;
}

function surfacePresetStyles(preset: string) {
  switch (preset) {
    case 'plain':
      return {
        backgroundColor: 'transparent',
        color: undefined,
        borderColor: 'transparent',
        borderStyle: 'solid',
        borderWidth: '0px',
        boxShadow: 'none',
      };
    case 'subtle':
      return {
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        color: undefined,
        borderColor: 'rgba(255, 255, 255, 0.02)',
        borderStyle: 'solid',
        borderWidth: '1px',
        boxShadow: '0 14px 36px rgba(15, 23, 42, 0.08)',
      };
    case 'outlined':
      return {
        backgroundColor: '#ffffff',
        color: undefined,
        borderColor: 'rgba(148, 163, 184, 0.35)',
        borderStyle: 'solid',
        borderWidth: '1px',
        boxShadow: 'none',
      };
    case 'elevated':
      return {
        backgroundColor: 'rgba(255, 255, 255, 0.88)',
        color: undefined,
        borderColor: 'rgba(255, 255, 255, 0.02)',
        borderStyle: 'solid',
        borderWidth: '1px',
        boxShadow: '0 18px 42px rgba(15, 23, 42, 0.1)',
      };
    case 'inverse':
      return {
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        borderColor: '#0f172a',
        borderStyle: 'solid',
        borderWidth: '1px',
        boxShadow: '0 18px 42px rgba(15, 23, 42, 0.2)',
      };
    default:
      return {};
  }
}

const FIXED_HEIGHT_BLOCK_TYPES = new Set([
  'chart',
  'dashboard',
  'embed',
  'video',
  'spacer',
]);

function normalizedBlockDimension(value: any, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function blockResizeHeight(block: PortalPageBlock | null, fallback = 0) {
  if (!block) {
    return fallback;
  }
  if (block.block_type === 'columns') {
    return normalizedBlockDimension(
      block.settings?.rowMinHeight ?? block.settings?.minHeight,
      fallback,
    );
  }
  if (FIXED_HEIGHT_BLOCK_TYPES.has(block.block_type)) {
    return normalizedBlockDimension(
      block.settings?.height ?? block.settings?.minHeight,
      fallback,
    );
  }
  return normalizedBlockDimension(block.settings?.minHeight, fallback);
}

function buildBlockHeightSettingsPatch(
  block: PortalPageBlock,
  nextHeight: number,
) {
  const height = Math.max(Math.round(nextHeight || 0), 0);
  if (block.block_type === 'columns') {
    return {
      minHeight: height,
      rowMinHeight: height,
    };
  }
  if (FIXED_HEIGHT_BLOCK_TYPES.has(block.block_type)) {
    return {
      minHeight: height,
      height,
    };
  }
  return {
    minHeight: height,
  };
}

export default function BlockStudio({
  draftPage,
  pages,
  charts,
  dashboards,
  mediaAssets,
  portalLayout = {},
  navigationMenus = { header: [], footer: [] },
  styleBundles,
  themes,
  templates,
  blockTypes = [],
  reusableBlocks = [],
  starterPatterns = [],
  search,
  onSearchChange,
  onSelectPage,
  onNewPage,
  onChangeDraftPage,
  onChangePortalLayout,
  onSavePortalLayout,
  onSaveDraft,
  savingDraft = false,
  savingPortalLayout = false,
}: BlockStudioProps) {
  const [selection, setSelection] = useState<Selection>({ type: 'page' });
  const [quickInsertSlot, setQuickInsertSlot] = useState<string>('content');
  const [previewViewport, setPreviewViewport] = useState<
    'desktop' | 'tablet' | 'mobile'
  >('desktop');
  const [canvasMode, setCanvasMode] = useState<'compose' | 'preview'>(
    'compose',
  );
  const [documentOpen, setDocumentOpen] = useState(false);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [reusableLibrary, setReusableLibrary] = useState<PortalReusableBlock[]>(
    () => sortReusableLibrary(reusableBlocks),
  );
  const [selectedReusableId, setSelectedReusableId] = useState<number | null>(
    reusableBlocks[0]?.id || null,
  );
  const [reusableDraft, setReusableDraft] = useState<ReusableDraft>(() =>
    createReusableDraft(reusableBlocks[0] || null),
  );
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<StatusMessage | null>(
    null,
  );
  const [activePropertiesTab, setActivePropertiesTab] =
    useState<PropertiesTabType>('config');
  const [activeLibraryCategory, setActiveLibraryCategory] =
    useState<LibraryCategoryType>('essentials');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    typography: true,
    spacing: true,
    size: true,
    effects: false,
  });
  const blocks = useMemo(() => ensurePageBlocks(draftPage), [draftPage]);
  const slotGroups = useMemo(() => groupBlocksBySlot(blocks), [blocks]);
  const flattenedBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);
  const isPublishedPage = Boolean(draftPage?.is_published);
  const selectedBlock =
    selection.type === 'block'
      ? flattenedBlocks.find(({ block }) => blockKey(block) === selection.uid)
          ?.block || null
      : null;
  const filteredPages = useMemo(
    () =>
      (pages || []).filter(page => {
        const haystack = `${page.title} ${page.slug || ''}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      }),
    [pages, search],
  );
  const mediaOptions = useMemo(
    () =>
      (mediaAssets || []).map(asset => ({
        value: asset.id,
        label: `${asset.title} · ${asset.asset_type || 'file'}`,
      })),
    [mediaAssets],
  );
  const menuOptions = useMemo(
    () =>
      [
        ...(navigationMenus.header || []),
        ...(navigationMenus.footer || []),
      ].map(menu => ({
        value: menu.slug,
        label: `${menu.title} · ${menu.location}`,
      })),
    [navigationMenus],
  );
  const insertableBlockTypes = blockTypes.length
    ? blockTypes
    : FALLBACK_BLOCK_TYPES;
  const selectedReusableBlock =
    reusableLibrary.find(
      reusableBlock => reusableBlock.id === selectedReusableId,
    ) || null;
  const reusableBlockOptions = useMemo(
    () =>
      reusableLibrary.map(reusableBlock => ({
        value: reusableBlock.id,
        label: `${reusableBlock.title} · ${reusableBlock.category || 'custom'}`,
      })),
    [reusableLibrary],
  );
  const selectedBlockCanSeedReusable =
    Boolean(selectedBlock) &&
    selectedBlock?.block_type !== 'reusable_reference';

  useEffect(() => {
    setSelection({ type: 'page' });
  }, [draftPage?.id]);

  useEffect(() => {
    const nextLibrary = sortReusableLibrary(reusableBlocks);
    if (sameReusableLibrary(nextLibrary, reusableLibrary)) {
      return;
    }
    setReusableLibrary(nextLibrary);
    setSelectedReusableId(previous => {
      if (previous && nextLibrary.some(item => item.id === previous)) {
        return previous;
      }
      return nextLibrary[0]?.id || null;
    });
  }, [reusableBlocks, reusableLibrary]);

  useEffect(() => {
    setReusableDraft(
      createReusableDraft(
        selectedReusableBlock,
        selectedBlock?.content?.title ||
          selectedBlock?.content?.text ||
          selectedBlock?.metadata?.label,
      ),
    );
  }, [
    selectedBlock?.content?.text,
    selectedBlock?.content?.title,
    selectedBlock?.metadata?.label,
    selectedReusableBlock,
  ]);

  useEffect(() => {
    if (selection.type === 'block' && !selectedBlock) {
      setSelection({ type: 'page' });
    }
  }, [selectedBlock, selection.type]);

  function pushBlocks(nextBlocks: PortalPageBlock[]) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    onChangeDraftPage({
      ...draftPage,
      blocks: nextBlocks,
    });
  }

  function handleApplyAIBlocks(aiBlocks: PortalPageBlock[]) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const makeUid = () => `blk_${Math.random().toString(36).slice(2, 10)}`;
    const normalizedBlocks = aiBlocks.map((block, index) => ({
      ...block,
      uid: block.uid || makeUid(),
      sort_order: blocks.length + index,
      slot: block.slot || 'content',
      is_container: block.is_container ?? false,
      content: block.content || {},
      settings: block.settings || {},
      styles: block.styles || {},
      metadata: block.metadata || {},
      children: (block.children || []).map((child: any, childIndex: number) => ({
        ...child,
        uid: child.uid || makeUid(),
        sort_order: childIndex,
        is_container: child.is_container ?? false,
        content: child.content || {},
        settings: child.settings || {},
        styles: child.styles || {},
        metadata: child.metadata || {},
        children: child.children || [],
      })),
    }));
    pushBlocks([...blocks, ...normalizedBlocks]);
  }

  function updatePage(patch: Partial<PortalPage>) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    onChangeDraftPage({
      ...draftPage,
      ...patch,
      blocks,
    });
  }

  function updatePageSettings(patch: Record<string, any>) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const nextSettings = {
      ...(draftPage.settings || {}),
    };
    Object.entries(patch).forEach(([key, value]) => {
      nextSettings[key] = normalizedStyleValue(value);
    });
    updatePage({ settings: nextSettings });
  }

  function updatePageRichText(field: 'description' | 'excerpt', html: string) {
    updatePage({
      [field]: field === 'excerpt' ? extractPlainText(html) : html,
    } as Partial<PortalPage>);
  }

  function addBlock(blockType: string) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const targetUid = selection.type === 'block' ? selection.uid : null;
    let nextBlocks = targetUid
      ? insertBlockRelative(
          blocks,
          targetUid,
          blockType,
          selectedBlock && isContainerBlock(selectedBlock.block_type)
            ? 'child'
            : 'after',
        )
      : addRootBlock(blocks, blockType);
    const existingKeys = new Set(
      flattenedBlocks.map(({ block }) => blockKey(block)),
    );
    let insertedBlock = flattenBlocks(nextBlocks)
      .map(({ block }) => block)
      .find(block => !existingKeys.has(blockKey(block)));
    if (insertedBlock) {
      const insertedKey = blockKey(insertedBlock);
      const resolvedSlot =
        selectedBlock?.slot ||
        quickInsertSlot ||
        insertedBlock.slot ||
        'content';
      nextBlocks = updateBlockByUid(nextBlocks, insertedKey, {
        slot: resolvedSlot,
      });
      insertedBlock =
        flattenBlocks(nextBlocks)
          .map(({ block }) => block)
          .find(block => blockKey(block) === insertedKey) || insertedBlock;
    }
    pushBlocks(nextBlocks);
    if (insertedBlock) {
      setSelection({ type: 'block', uid: blockKey(insertedBlock) });
    }
  }

  function addBlockToSlot(blockType: string, slot: string) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const nextBlock = createEmptyBlock(blockType);
    nextBlock.slot = blockType === 'hero' ? 'hero' : slot || 'content';
    pushBlocks([...cloneBlockTree(blocks), nextBlock]);
    setSelection({ type: 'block', uid: blockKey(nextBlock) });
  }

  function addBlockRelativeToBlock(
    block: PortalPageBlock,
    mode: 'after' | 'child',
    blockType = 'paragraph',
  ) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const targetUid = blockKey(block);
    const existingKeys = new Set(
      flattenBlocks(blocks).map(({ block: item }) => blockKey(item)),
    );
    let nextBlocks = insertBlockRelative(blocks, targetUid, blockType, mode);
    let insertedBlock = flattenBlocks(nextBlocks)
      .map(({ block: item }) => item)
      .find(item => !existingKeys.has(blockKey(item)));
    if (insertedBlock) {
      const insertedKey = blockKey(insertedBlock);
      const resolvedSlot =
        block.block_type === 'hero'
          ? 'hero'
          : block.slot || quickInsertSlot || insertedBlock.slot || 'content';
      nextBlocks = updateBlockByUid(nextBlocks, insertedKey, {
        slot: resolvedSlot,
      });
      insertedBlock =
        flattenBlocks(nextBlocks)
          .map(({ block: item }) => item)
          .find(item => blockKey(item) === insertedKey) || insertedBlock;
    }
    pushBlocks(nextBlocks);
    if (insertedBlock) {
      setSelection({ type: 'block', uid: blockKey(insertedBlock) });
    }
  }

  function insertGridTemplate(
    columnCount: number,
    targetBlock?: PortalPageBlock | null,
    mode?: 'after' | 'child',
  ) {
    if (!draftPage || isPublishedPage) {
      return;
    }
    const templateBlock = createGridTemplateBlock(columnCount, {
      slot:
        targetBlock?.block_type === 'hero'
          ? 'hero'
          : targetBlock?.slot || quickInsertSlot || 'content',
      rowMinHeight:
        Number(targetBlock?.settings?.rowMinHeight) ||
        Number(targetBlock?.settings?.minHeight) ||
        240,
    });
    const nextBlocks = insertBlocksRelative(
      blocks,
      targetBlock ? blockKey(targetBlock) : null,
      [templateBlock],
      mode ||
        (targetBlock && isContainerBlock(targetBlock.block_type)
          ? 'child'
          : 'after'),
    );
    pushBlocks(nextBlocks);
    setSelection({ type: 'block', uid: blockKey(templateBlock) });
  }

  function resolveInsertionMode() {
    return selectedBlock && isContainerBlock(selectedBlock.block_type)
      ? 'child'
      : 'after';
  }

  function applyInsertionSlot(nextBlocks: PortalPageBlock[]) {
    const preferredSlot = selectedBlock?.slot || quickInsertSlot || 'content';
    return nextBlocks.map(block => ({
      ...block,
      slot:
        block.block_type === 'hero'
          ? 'hero'
          : preferredSlot || block.slot || 'content',
    }));
  }

  function insertPreparedBlocks(preparedBlocks: PortalPageBlock[]) {
    if (!draftPage || isPublishedPage || !preparedBlocks.length) {
      return;
    }
    const targetUid = selection.type === 'block' ? selection.uid : null;
    const nextInsertedBlocks = applyInsertionSlot(
      cloneBlockTree(preparedBlocks),
    );
    const nextBlocks = insertBlocksRelative(
      blocks,
      targetUid,
      nextInsertedBlocks,
      resolveInsertionMode(),
    );
    pushBlocks(nextBlocks);
    setSelection({ type: 'block', uid: blockKey(nextInsertedBlocks[0]) });
  }

  function syncReusableReferences(nextReusableBlock: PortalReusableBlock) {
    if (!draftPage) {
      return;
    }
    const nextBlocks = cloneBlockTree(blocks);
    function walk(items: PortalPageBlock[]): PortalPageBlock[] {
      return items.map(item => {
        const reusableBlockId =
          item.settings?.reusable_block_id ||
          item.settings?.reusable_block_ref?.id ||
          item.reusable_block?.id;
        const children = walk(item.children || []);
        if (reusableBlockId !== nextReusableBlock.id) {
          return { ...item, children };
        }
        return {
          ...item,
          content: {
            ...(item.content || {}),
            title: item.content?.title || nextReusableBlock.title,
          },
          metadata: {
            ...(item.metadata || {}),
            label: nextReusableBlock.title,
          },
          settings: {
            ...(item.settings || {}),
            reusable_block_id: nextReusableBlock.id,
            reusable_block_ref: { id: nextReusableBlock.id },
          },
          reusable_block: nextReusableBlock,
          children,
        };
      });
    }
    pushBlocks(walk(nextBlocks));
  }

  function markReusableReferencesUnavailable(reusableBlockId: number) {
    if (!draftPage) {
      return;
    }
    const nextBlocks = cloneBlockTree(blocks);
    function walk(items: PortalPageBlock[]): PortalPageBlock[] {
      return items.map(item => {
        const referencedId =
          item.settings?.reusable_block_id ||
          item.settings?.reusable_block_ref?.id ||
          item.reusable_block?.id;
        const children = walk(item.children || []);
        if (referencedId !== reusableBlockId) {
          return { ...item, children };
        }
        return {
          ...item,
          reusable_block: null,
          settings: {
            ...(item.settings || {}),
            render_error: t('Reusable section is unavailable for rendering'),
          },
          children,
        };
      });
    }
    pushBlocks(walk(nextBlocks));
  }

  async function saveReusableBlockDraft(options?: { overwrite?: boolean }) {
    const overwrite = options?.overwrite ?? false;
    const sourceBlocks = selectedBlockCanSeedReusable
      ? cloneBlocksForInsertion([selectedBlock as PortalPageBlock])
      : selectedReusableBlock?.blocks || [];
    if (!sourceBlocks.length) {
      setLibraryStatus({
        type: 'error',
        message: t('Select a non-synced block or reusable item before saving.'),
      });
      return;
    }
    const title =
      reusableDraft.title.trim() ||
      selectedBlock?.content?.title ||
      selectedBlock?.content?.text ||
      selectedReusableBlock?.title ||
      t('Reusable Section');
    setLibraryBusy(true);
    setLibraryStatus(null);
    try {
      const response = await SupersetClient.post({
        endpoint: '/api/v1/public_page/admin/reusable-blocks',
        jsonPayload: {
          id: overwrite ? reusableDraft.id || selectedReusableId : null,
          title,
          description: reusableDraft.description.trim(),
          category: reusableDraft.category.trim() || 'custom',
          status: selectedReusableBlock?.status || 'active',
          is_active: selectedReusableBlock?.is_active ?? true,
          settings: { ...(selectedReusableBlock?.settings || {}) },
          blocks: normalizeBlocks(sourceBlocks),
        },
      });
      const savedReusableBlock = response.json?.result as PortalReusableBlock;
      setReusableLibrary(previous => {
        const nextLibrary = previous.filter(
          item => item.id !== savedReusableBlock.id,
        );
        return sortReusableLibrary([...nextLibrary, savedReusableBlock]);
      });
      setSelectedReusableId(savedReusableBlock.id);
      setReusableDraft(createReusableDraft(savedReusableBlock));
      syncReusableReferences(savedReusableBlock);
      setLibraryStatus({
        type: 'success',
        message: overwrite
          ? t('Reusable section updated from the current selection.')
          : t('Reusable section saved from the current selection.'),
      });
    } catch (error) {
      setLibraryStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('Failed to save the reusable section.'),
      });
    } finally {
      setLibraryBusy(false);
    }
  }

  async function deleteSelectedReusableBlock() {
    if (!selectedReusableId) {
      return;
    }
    setLibraryBusy(true);
    setLibraryStatus(null);
    try {
      await SupersetClient.delete({
        endpoint: `/api/v1/public_page/admin/reusable-blocks/${selectedReusableId}`,
      });
      const remainingLibrary = reusableLibrary.filter(
        reusableBlock => reusableBlock.id !== selectedReusableId,
      );
      setReusableLibrary(remainingLibrary);
      markReusableReferencesUnavailable(selectedReusableId);
      setSelectedReusableId(remainingLibrary[0]?.id || null);
      setReusableDraft(createReusableDraft(remainingLibrary[0] || null));
      setLibraryStatus({
        type: 'success',
        message: t(
          'Reusable section deleted. Existing synced references were marked unavailable.',
        ),
      });
    } catch (error) {
      setLibraryStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('Failed to delete the reusable section.'),
      });
    } finally {
      setLibraryBusy(false);
    }
  }

  function insertReusableReference(reusableBlock: PortalReusableBlock) {
    insertPreparedBlocks([createReusableReferenceBlock(reusableBlock)]);
    setLibraryStatus({
      type: 'info',
      message: t('Inserted a synced reusable section into the page.'),
    });
  }

  function insertReusableCopy(reusableBlock: PortalReusableBlock) {
    insertPreparedBlocks(cloneBlocksForInsertion(reusableBlock.blocks || []));
    setLibraryStatus({
      type: 'info',
      message: t('Inserted a detached copy of the reusable section.'),
    });
  }

  function insertStarterPattern(pattern: PortalStarterPattern) {
    insertPreparedBlocks(cloneBlocksForInsertion(pattern.blocks || []));
    setLibraryStatus({
      type: 'info',
      message: t('Starter pattern inserted into the draft page.'),
    });
  }

  function detachSelectedReusableReference() {
    if (!selectedBlock || selectedBlock.block_type !== 'reusable_reference') {
      return;
    }
    const existingKeys = new Set(
      flattenedBlocks.map(({ block }) => blockKey(block)),
    );
    const nextBlocks = detachReusableBlockByUid(
      blocks,
      blockKey(selectedBlock),
    );
    const firstInsertedBlock = flattenBlocks(nextBlocks)
      .map(({ block }) => block)
      .find(block => !existingKeys.has(blockKey(block)));
    pushBlocks(nextBlocks);
    if (firstInsertedBlock) {
      setSelection({ type: 'block', uid: blockKey(firstInsertedBlock) });
    }
    setLibraryStatus({
      type: 'info',
      message: t('Detached the synced section into local editable blocks.'),
    });
  }

  function updateSelectedBlock(patch: Partial<PortalPageBlock>) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(updateBlockByUid(blocks, blockKey(selectedBlock), patch));
  }

  function updateSelectedBlockContent(patch: Record<string, any>) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(updateBlockContent(blocks, blockKey(selectedBlock), patch));
  }

  function updateSelectedRichText(
    html: string,
    field: 'body' | 'quote' = 'body',
  ) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    const plainText = extractPlainText(html);
    if (field === 'quote') {
      updateSelectedBlockContent({
        html,
        body_html: html,
        quote: plainText,
      });
      return;
    }
    updateSelectedBlockContent({
      html,
      body_html: html,
      body: plainText,
    });
  }

  function updateRichTextBlock(
    block: PortalPageBlock,
    html: string,
    field: 'body' | 'quote' = 'body',
  ) {
    if (isPublishedPage) {
      return;
    }
    const plainText = extractPlainText(html);
    const patch =
      field === 'quote'
        ? {
            html,
            body_html: html,
            quote: plainText,
          }
        : {
            html,
            body_html: html,
            body: plainText,
          };
    pushBlocks(updateBlockContent(blocks, blockKey(block), patch));
    setSelection({ type: 'block', uid: blockKey(block) });
  }

  function updateSelectedBlockSettings(patch: Record<string, any>) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(updateBlockSettings(blocks, blockKey(selectedBlock), patch));
  }

  function updateSelectedBlockStyles(patch: Record<string, any>) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    const normalizedPatch = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [
        key,
        normalizedStyleValue(value),
      ]),
    );
    pushBlocks(
      updateBlockStyles(blocks, blockKey(selectedBlock), normalizedPatch),
    );
  }

  function updateSelectedBlockStylesAndSettings(
    stylePatch: Record<string, any>,
    settingsPatch: Record<string, any>,
  ) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    const normalizedStylePatch = Object.fromEntries(
      Object.entries(stylePatch).map(([key, value]) => [
        key,
        normalizedStyleValue(value),
      ]),
    );
    const nextBlocks = updateBlockSettings(
      updateBlockStyles(blocks, blockKey(selectedBlock), normalizedStylePatch),
      blockKey(selectedBlock),
      settingsPatch,
    );
    pushBlocks(nextBlocks);
  }

  function updateSelectedBlockRichField(field: string, html: string) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    updateSelectedBlockContent({
      [field]: extractPlainText(html),
      [`${field}_html`]: html,
    });
  }

  function updateSelectedBlockSettingsRichField(field: string, html: string) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    updateSelectedBlockSettings({
      [field]: extractPlainText(html),
      [`${field}_html`]: html,
    });
  }

  function removeSelectedBlock() {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(removeBlockByUid(blocks, blockKey(selectedBlock)));
    setSelection({ type: 'page' });
  }

  function removeBlockFromCanvas(block: PortalPageBlock) {
    if (isPublishedPage) {
      return;
    }
    const uid = blockKey(block);
    pushBlocks(removeBlockByUid(blocks, uid));
    setSelection(current =>
      current.type === 'block' && current.uid === uid
        ? { type: 'page' }
        : current,
    );
  }

  function duplicateSelectedBlock() {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(duplicateBlockByUid(blocks, blockKey(selectedBlock)));
  }

  function moveSelectedBlock(direction: -1 | 1) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    pushBlocks(moveBlockByUid(blocks, blockKey(selectedBlock), direction));
  }

  function moveBlockFromCanvas(block: PortalPageBlock, direction: -1 | 1) {
    if (isPublishedPage) {
      return;
    }
    pushBlocks(moveBlockByUid(blocks, blockKey(block), direction));
  }

  function resizeSelectedBlock(
    axis: 'gridSpan' | 'minHeight',
    direction: -1 | 1,
  ) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    if (axis === 'gridSpan') {
      const currentSpan = Number(selectedBlock.settings?.gridSpan) || 12;
      updateSelectedBlockSettings({
        gridSpan: Math.min(Math.max(currentSpan + direction, 1), 12),
      });
      return;
    }
    const currentHeight = blockResizeHeight(selectedBlock);
    updateSelectedBlockSettings(
      buildBlockHeightSettingsPatch(
        selectedBlock,
        Math.max(currentHeight + direction * 40, 0),
      ),
    );
  }

  function applySurfacePreset(preset: string) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    updateSelectedBlockSettings({ surfacePreset: preset });
    if (preset !== 'custom') {
      updateSelectedBlockStyles(surfacePresetStyles(preset));
    }
  }

  function handleResizeBlock(
    block: PortalPageBlock,
    patch: { gridSpan: number; minHeight: number },
  ) {
    if (isPublishedPage) {
      return;
    }
    pushBlocks(
      updateBlockSettings(blocks, blockKey(block), {
        gridSpan: patch.gridSpan,
        ...buildBlockHeightSettingsPatch(block, patch.minHeight),
      }),
    );
  }

  function splitSelectedBlockIntoColumns(columnCount = 2) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    const result = splitBlockIntoColumnsByUid(
      blocks,
      blockKey(selectedBlock),
      columnCount,
    );
    pushBlocks(result.blocks);
    if (result.focusUid) {
      setSelection({ type: 'block', uid: result.focusUid });
    }
  }

  function applySelectedGridTemplate(columnCount: number) {
    if (!selectedBlock || isPublishedPage) {
      return;
    }
    if (selectedBlock.block_type === 'column') {
      insertGridTemplate(columnCount, selectedBlock, 'child');
      return;
    }
    if (selectedBlock.block_type === 'columns') {
      pushBlocks(
        setColumnsBlockTemplateByUid(
          blocks,
          blockKey(selectedBlock),
          columnCount,
        ),
      );
      setSelection({ type: 'block', uid: blockKey(selectedBlock) });
      return;
    }
    if (columnCount === 1) {
      insertGridTemplate(1, selectedBlock);
      return;
    }
    splitSelectedBlockIntoColumns(columnCount);
  }

  function renderInspector() {
    if (!draftPage) {
      return <Empty description={t('Choose a page or create a new one.')} />;
    }
    if (!selectedBlock) {
      return (
        <SectionList>
          {isPublishedPage ? (
            <Alert
              showIcon
              type="info"
              message={t(
                'Published pages are read-only. Unpublish to edit content.',
              )}
            />
          ) : null}
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Title')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.title}
                onChange={event => updatePage({ title: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Slug')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.slug || ''}
                onChange={event => updatePage({ slug: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Path Label')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.navigation_label || ''}
                onChange={event =>
                  updatePage({ navigation_label: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Display Order')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                value={draftPage.display_order ?? 0}
                onChange={value =>
                  updatePage({ display_order: Number(value) || 0 })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Parent Page')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                value={draftPage.parent_page_id || undefined}
                options={(pages || [])
                  .filter(page => page.id !== draftPage.id)
                  .map(page => ({
                    value: page.id,
                    label: page.path || page.slug || page.title,
                  }))}
                onChange={value =>
                  updatePage({
                    parent_page_id: value || null,
                    parent_page: pages.find(page => page.id === value) || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Page Type')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={draftPage.page_type || 'content'}
                options={PAGE_TYPE_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value => updatePage({ page_type: value })}
              />
              <TinyMeta>
                {t(
                  'Standard pages follow the page hierarchy. Landing, dashboard, documentation, FAQ, policy, and utility pages are promoted to top-level public navigation.',
                )}
              </TinyMeta>
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Subtitle')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.subtitle || ''}
                onChange={event => updatePage({ subtitle: event.target.value })}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Visibility')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={draftPage.visibility || 'draft'}
                onChange={value => updatePage({ visibility: value })}
                options={[
                  { value: 'draft', label: t('Draft') },
                  { value: 'authenticated', label: t('Authenticated') },
                  { value: 'public', label: t('Public') },
                ]}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Theme')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                value={draftPage.theme_id || undefined}
                options={themes.map(theme => ({
                  value: theme.id,
                  label: theme.title,
                }))}
                onChange={value =>
                  updatePage({
                    theme_id: value || null,
                    theme: themes.find(theme => theme.id === value) || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Template')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                value={draftPage.template_id || undefined}
                options={templates.map(template => ({
                  value: template.id,
                  label: template.title,
                }))}
                onChange={value =>
                  updatePage({
                    template_id: value || null,
                    template:
                      templates.find(template => template.id === value) || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Style Bundle')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                value={draftPage.style_bundle_id || undefined}
                options={styleBundles.map(bundle => ({
                  value: bundle.id,
                  label: bundle.title,
                }))}
                onChange={value =>
                  updatePage({
                    style_bundle_id: value || null,
                    style_bundle:
                      styleBundles.find(bundle => bundle.id === value) || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Content Width')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(draftPage.settings?.pageMaxWidth || '')}
                placeholder={t('100%, 1280px, 90rem')}
                onChange={event =>
                  updatePageSettings({ pageMaxWidth: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Sidebar Width')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(draftPage.settings?.sidebarWidth || '')}
                placeholder={t('320px')}
                onChange={event =>
                  updatePageSettings({ sidebarWidth: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Content Gap')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(draftPage.settings?.contentAreaGap || '')}
                placeholder={t('24px')}
                onChange={event =>
                  updatePageSettings({ contentAreaGap: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Page Padding')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(draftPage.settings?.pagePadding || '')}
                placeholder={t('0, 28px 24px 72px')}
                onChange={event =>
                  updatePageSettings({ pagePadding: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>
                {t('Use Featured Image as Page Background')}
              </FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={Boolean(
                  draftPage.settings?.useFeaturedImageAsBackground,
                )}
                onChange={checked =>
                  updatePageSettings({
                    useFeaturedImageAsBackground: checked || undefined,
                  })
                }
              />
              <TinyMeta>
                {t(
                  'Uses the selected featured image as a full-page background behind all blocks.',
                )}
              </TinyMeta>
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Page Background Image Opacity')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={
                  draftPage.settings?.pageBackgroundImageOpacity === undefined
                    ? 1
                    : Number(draftPage.settings?.pageBackgroundImageOpacity)
                }
                onChange={value =>
                  updatePageSettings({
                    pageBackgroundImageOpacity:
                      value === null ? undefined : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Published')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={draftPage.is_published}
                onChange={checked => updatePage({ is_published: checked })}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Landing Page')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={draftPage.is_homepage}
                onChange={checked => updatePage({ is_homepage: checked })}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Template Key')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.template_key || ''}
                onChange={event =>
                  updatePage({ template_key: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Scheduled Publish')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                type="datetime-local"
                value={
                  draftPage.scheduled_publish_at
                    ? draftPage.scheduled_publish_at.slice(0, 16)
                    : ''
                }
                onChange={event =>
                  updatePage({
                    scheduled_publish_at: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Featured Image')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                showSearch
                optionFilterProp="label"
                value={draftPage.featured_image_asset_id || undefined}
                options={mediaOptions.filter(option => {
                  const asset = mediaAssets.find(
                    item => item.id === option.value,
                  );
                  return asset?.asset_type === 'image';
                })}
                onChange={value =>
                  updatePage({
                    featured_image_asset_id: value || null,
                    featured_image_asset:
                      mediaAssets.find(asset => asset.id === value) || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('OG Image')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                showSearch
                optionFilterProp="label"
                value={draftPage.og_image_asset_id || undefined}
                options={mediaOptions.filter(option => {
                  const asset = mediaAssets.find(
                    item => item.id === option.value,
                  );
                  return asset?.asset_type === 'image';
                })}
                onChange={value =>
                  updatePage({
                    og_image_asset_id: value || null,
                    og_image_asset:
                      mediaAssets.find(asset => asset.id === value) || null,
                  })
                }
              />
            </FieldBlock>
          </FieldGrid>
          <FieldBlock>
            <FieldLabel>{t('Excerpt')}</FieldLabel>
            <Input.TextArea
              disabled={isPublishedPage}
              rows={3}
              value={draftPage.excerpt || ''}
              onChange={event => updatePage({ excerpt: event.target.value })}
            />
          </FieldBlock>
          <FieldBlock>
            <FieldLabel>{t('Description')}</FieldLabel>
            <RichTextComposer
              readOnly={isPublishedPage}
              minHeight={180}
              value={draftPage.description || ''}
              helperText={t(
                'Formatted page descriptions are shown in studio and preview surfaces.',
              )}
              onChange={value => updatePageRichText('description', value)}
            />
          </FieldBlock>
          {onChangePortalLayout ? (
            <SectionList>
              <FieldBlock>
                <FieldLabel>{t('Footer Text')}</FieldLabel>
                <Input
                  value={portalLayout.footerText || ''}
                  onChange={event =>
                    onChangePortalLayout({
                      ...portalLayout,
                      footerText: event.target.value,
                    })
                  }
                />
                <TinyMeta>
                  {t(
                    'This updates the shared public footer shell while you stay in the main page studio.',
                  )}
                </TinyMeta>
              </FieldBlock>
              {onSavePortalLayout ? (
                <Space wrap>
                  <Button
                    type="default"
                    icon={<SaveOutlined />}
                    loading={savingPortalLayout}
                    onClick={onSavePortalLayout}
                  >
                    {t('Save Footer Settings')}
                  </Button>
                </Space>
              ) : null}
            </SectionList>
          ) : null}
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('SEO Title')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={draftPage.seo_title || ''}
                onChange={event =>
                  updatePage({ seo_title: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('SEO Description')}</FieldLabel>
              <Input.TextArea
                disabled={isPublishedPage}
                rows={3}
                value={draftPage.seo_description || ''}
                onChange={event =>
                  updatePage({ seo_description: event.target.value })
                }
              />
            </FieldBlock>
          </FieldGrid>
          <TinyMeta>
            {t('Public path')}:{' '}
            {resolvePortalPagePath({
              ...draftPage,
              slug: draftPage.slug || 'page-slug',
            })}
          </TinyMeta>
          {draftPage.parent_page ? (
            <TinyMeta>
              {t('Parent')}:{' '}
              {draftPage.parent_page.title || draftPage.parent_page.slug}
            </TinyMeta>
          ) : null}
        </SectionList>
      );
    }

    return (
      <SectionList>
        {isPublishedPage ? (
          <Alert
            showIcon
            type="info"
            message={t(
              'Published pages are read-only. Unpublish to edit content.',
            )}
          />
        ) : null}
        <FieldGrid>
          <FieldBlock>
            <FieldLabel>{t('Block Type')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              value={selectedBlock.block_type}
              options={insertableBlockTypes.map(definition => ({
                value: definition.type,
                label: definition.label,
              }))}
              onChange={value => {
                const nextDefinition = createEmptyBlock(value);
                updateSelectedBlock({
                  block_type: nextDefinition.block_type,
                  is_container: nextDefinition.is_container,
                  content: nextDefinition.content,
                  settings: {
                    ...selectedBlock.settings,
                    ...nextDefinition.settings,
                  },
                  styles: nextDefinition.styles,
                  metadata: {
                    ...selectedBlock.metadata,
                    ...nextDefinition.metadata,
                  },
                  reusable_block:
                    value === 'reusable_reference'
                      ? selectedBlock.reusable_block || null
                      : null,
                  children:
                    nextDefinition.is_container ||
                    !selectedBlock.children.length
                      ? selectedBlock.children
                      : [],
                });
              }}
            />
          </FieldBlock>
          <FieldBlock>
            <FieldLabel>{t('Slot')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              value={selectedBlock.slot || 'content'}
              onChange={value => updateSelectedBlock({ slot: value })}
              options={SLOT_OPTIONS.map(option => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </FieldBlock>
        </FieldGrid>
        <FieldGrid>
          <FieldBlock>
            <FieldLabel>{t('Status')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              value={selectedBlock.status || 'active'}
              onChange={value => updateSelectedBlock({ status: value })}
              options={[
                { value: 'active', label: t('Active') },
                { value: 'hidden', label: t('Hidden') },
              ]}
            />
          </FieldBlock>
          <FieldBlock>
            <FieldLabel>{t('Style Bundle')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              allowClear
              value={selectedBlock.style_bundle_id || undefined}
              options={styleBundles.map(bundle => ({
                value: bundle.id,
                label: bundle.title,
              }))}
              onChange={value =>
                updateSelectedBlock({ style_bundle_id: value || null })
              }
            />
          </FieldBlock>
        </FieldGrid>
        <FieldGrid>
          <FieldBlock>
            <FieldLabel>{t('Label')}</FieldLabel>
            <Input
              disabled={isPublishedPage}
              value={selectedBlock.metadata?.label || ''}
              onChange={event =>
                updateSelectedBlock({
                  metadata: {
                    ...(selectedBlock.metadata || {}),
                    label: event.target.value,
                  },
                })
              }
            />
          </FieldBlock>
          <FieldBlock>
            <FieldLabel>{t('Column Span')}</FieldLabel>
            <InputNumber
              disabled={isPublishedPage}
              style={{ width: '100%' }}
              min={1}
              max={12}
              value={Number(selectedBlock.settings?.gridSpan) || 12}
              onChange={value =>
                updateSelectedBlockSettings({
                  gridSpan: Math.min(Math.max(Number(value) || 12, 1), 12),
                })
              }
            />
          </FieldBlock>
          <FieldBlock>
            <FieldLabel>{t('Min Height')}</FieldLabel>
            <InputNumber
              disabled={isPublishedPage}
              style={{ width: '100%' }}
              min={0}
              step={40}
              value={blockResizeHeight(selectedBlock)}
              onChange={value =>
                updateSelectedBlockSettings(
                  buildBlockHeightSettingsPatch(
                    selectedBlock,
                    Math.max(Number(value) || 0, 0),
                  ),
                )
              }
            />
          </FieldBlock>
        </FieldGrid>
        {(selectedBlock.block_type === 'rich_text' ||
          selectedBlock.block_type === 'paragraph' ||
          selectedBlock.block_type === 'card' ||
          selectedBlock.block_type === 'group' ||
          selectedBlock.block_type === 'section' ||
          selectedBlock.block_type === 'callout') && (
          <FieldBlock>
            <FieldLabel>{t('Body')}</FieldLabel>
            <RichTextComposer
              readOnly={isPublishedPage}
              minHeight={selectedBlock.block_type === 'rich_text' ? 220 : 180}
              value={richTextValue(selectedBlock)}
              onChange={value => updateSelectedRichText(value)}
            />
          </FieldBlock>
        )}
        {(selectedBlock.block_type === 'heading' ||
          selectedBlock.block_type === 'hero' ||
          selectedBlock.block_type === 'card' ||
          selectedBlock.block_type === 'group' ||
          selectedBlock.block_type === 'section' ||
          selectedBlock.block_type === 'chart' ||
          selectedBlock.block_type === 'dashboard' ||
          selectedBlock.block_type === 'dynamic_widget' ||
          selectedBlock.block_type === 'callout' ||
          selectedBlock.block_type === 'statistic' ||
          selectedBlock.block_type === 'file' ||
          selectedBlock.block_type === 'download') && (
          <FieldBlock>
            <FieldLabel>{t('Title')}</FieldLabel>
            <RichTextComposer
              readOnly={isPublishedPage}
              minHeight={120}
              value={richFieldValue(selectedBlock, 'title')}
              onChange={value => updateSelectedBlockRichField('title', value)}
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'heading' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Text')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={120}
                value={richFieldValue(selectedBlock, 'text')}
                onChange={value => updateSelectedBlockRichField('text', value)}
              />
            </FieldBlock>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Level')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={1}
                  max={6}
                  value={Number(selectedBlock.content?.level) || 2}
                  onChange={value =>
                    updateSelectedBlockContent({ level: Number(value) || 2 })
                  }
                />
              </FieldBlock>
            </FieldGrid>
          </SectionList>
        )}
        {selectedBlock.block_type === 'hero' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Eyebrow')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'eyebrow')}
                onChange={value =>
                  updateSelectedBlockRichField('eyebrow', value)
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Subtitle')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={140}
                value={richFieldValue(selectedBlock, 'subtitle')}
                onChange={value =>
                  updateSelectedBlockRichField('subtitle', value)
                }
              />
            </FieldBlock>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Full Bleed Hero')}</FieldLabel>
                <Switch
                  disabled={isPublishedPage}
                  checked={selectedBlock.settings?.fullBleed !== false}
                  onChange={checked =>
                    updateSelectedBlockSettings({
                      fullBleed: checked,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Hero Actions Align')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.heroActionsAlign || 'start'}
                  options={HERO_ACTION_ALIGN_OPTIONS.map(option => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      heroActionsAlign: value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Space Below Hero (px)')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={0}
                  max={120}
                  value={
                    selectedBlock.settings?.sectionGap === undefined
                      ? undefined
                      : Number(selectedBlock.settings?.sectionGap)
                  }
                  placeholder={t('Use page default')}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      sectionGap:
                        value === null || value === undefined
                          ? undefined
                          : Number(value),
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Space Above Hero (px)')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={0}
                  max={120}
                  value={
                    selectedBlock.settings?.sectionTopGap === undefined
                      ? undefined
                      : Number(selectedBlock.settings?.sectionTopGap)
                  }
                  placeholder={t('Use page default')}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      sectionTopGap:
                        value === null || value === undefined
                          ? undefined
                          : Number(value),
                      section_top_gap:
                        value === null || value === undefined
                          ? undefined
                          : Number(value),
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Primary Action Label')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={settingsFieldValue(
                    selectedBlock,
                    'primaryActionLabel',
                  )}
                  onChange={value =>
                    updateSelectedBlockSettingsRichField(
                      'primaryActionLabel',
                      value,
                    )
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Primary Action URL')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.primaryActionUrl || ''}
                  onChange={event =>
                    updateSelectedBlockSettings({
                      primaryActionUrl: event.target.value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Secondary Action Label')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={settingsFieldValue(
                    selectedBlock,
                    'secondaryActionLabel',
                  )}
                  onChange={value =>
                    updateSelectedBlockSettingsRichField(
                      'secondaryActionLabel',
                      value,
                    )
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Secondary Action URL')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.secondaryActionUrl || ''}
                  onChange={event =>
                    updateSelectedBlockSettings({
                      secondaryActionUrl: event.target.value,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Hero Panel Background')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.heroPanelBackground || ''}
                  placeholder={t('rgba(255,255,255,0.08)')}
                  onChange={event =>
                    updateSelectedBlockSettings({
                      heroPanelBackground: event.target.value || undefined,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Hero Panel Opacity')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    selectedBlock.settings?.heroPanelOpacity === undefined
                      ? 0
                      : Number(selectedBlock.settings?.heroPanelOpacity)
                  }
                  onChange={value =>
                    updateSelectedBlockSettings({
                      heroPanelOpacity:
                        value === null ? undefined : Number(value),
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Hero Button Background')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.heroButtonBackground || ''}
                  placeholder={t('rgba(255,255,255,0.92)')}
                  onChange={event =>
                    updateSelectedBlockSettings({
                      heroButtonBackground: event.target.value || undefined,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Hero Button Opacity')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    selectedBlock.settings?.heroButtonOpacity === undefined
                      ? 1
                      : Number(selectedBlock.settings?.heroButtonOpacity)
                  }
                  onChange={value =>
                    updateSelectedBlockSettings({
                      heroButtonOpacity:
                        value === null ? undefined : Number(value),
                    })
                  }
                />
              </FieldBlock>
            </FieldGrid>
          </SectionList>
        )}
        {selectedBlock.block_type === 'card' && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Button Label')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={richFieldValue(selectedBlock, 'buttonLabel')}
                  onChange={value =>
                    updateSelectedBlockRichField('buttonLabel', value)
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Button URL')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.buttonUrl || ''}
                  onChange={event =>
                    updateSelectedBlockSettings({
                      buttonUrl: event.target.value,
                    })
                  }
                />
              </FieldBlock>
            </FieldGrid>
          </SectionList>
        )}
        {selectedBlock.block_type === 'list' && (
          <FieldBlock>
            <FieldLabel>{t('Items')}</FieldLabel>
            <RichTextComposer
              readOnly={isPublishedPage}
              minHeight={180}
              value={richFieldValue(selectedBlock, 'items')}
              onChange={value => updateSelectedBlockRichField('items', value)}
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'quote' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Quote')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={140}
                value={richTextValue(
                  selectedBlock,
                  selectedBlock.content?.quote,
                )}
                onChange={value => updateSelectedRichText(value, 'quote')}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Citation')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'citation')}
                onChange={value =>
                  updateSelectedBlockRichField('citation', value)
                }
              />
            </FieldBlock>
          </SectionList>
        )}
        {selectedBlock.block_type === 'image' && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Image Asset')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={
                    selectedBlock.settings?.asset_ref?.id ||
                    selectedBlock.content?.asset?.id ||
                    undefined
                  }
                  options={mediaOptions.filter(option => {
                    const asset = mediaAssets.find(
                      item => item.id === option.value,
                    );
                    return asset?.asset_type === 'image';
                  })}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      asset_ref: value ? { id: value } : null,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Image URL')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.content?.url || ''}
                  onChange={event =>
                    updateSelectedBlockContent({ url: event.target.value })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Alt Text')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.content?.alt || ''}
                  onChange={event =>
                    updateSelectedBlockContent({ alt: event.target.value })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Caption')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={120}
                  value={richFieldValue(selectedBlock, 'caption')}
                  onChange={value =>
                    updateSelectedBlockRichField('caption', value)
                  }
                />
              </FieldBlock>
            </FieldGrid>
          </SectionList>
        )}
        {selectedBlock.block_type === 'gallery' && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Columns')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={1}
                  max={6}
                  value={Number(selectedBlock.settings?.columns) || 3}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      columns: Number(value) || 3,
                    })
                  }
                />
              </FieldBlock>
            </FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Images')}</FieldLabel>
              <Input.TextArea
                disabled={isPublishedPage}
                rows={6}
                value={formatGalleryImages(selectedBlock.content?.images)}
                onChange={event =>
                  updateSelectedBlockContent({
                    images: parseGalleryImages(event.target.value),
                  })
                }
                placeholder={t('One image per line: URL | Alt text | Caption')}
              />
            </FieldBlock>
          </SectionList>
        )}
        {(selectedBlock.block_type === 'embed' ||
          selectedBlock.block_type === 'video') && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Title')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={richFieldValue(selectedBlock, 'title')}
                  onChange={value =>
                    updateSelectedBlockRichField('title', value)
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('URL')}</FieldLabel>
                <Input
                  disabled={isPublishedPage}
                  value={selectedBlock.content?.url || ''}
                  onChange={event =>
                    updateSelectedBlockContent({ url: event.target.value })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Caption')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={richFieldValue(selectedBlock, 'caption')}
                  onChange={value =>
                    updateSelectedBlockRichField('caption', value)
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Height')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={120}
                  value={blockResizeHeight(selectedBlock, 360)}
                  onChange={value =>
                    updateSelectedBlockSettings(
                      buildBlockHeightSettingsPatch(
                        selectedBlock,
                        Math.max(Number(value) || 360, 120),
                      ),
                    )
                  }
                />
              </FieldBlock>
            </FieldGrid>
          </SectionList>
        )}
        {(selectedBlock.block_type === 'file' ||
          selectedBlock.block_type === 'download') && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('File Asset')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={
                    selectedBlock.settings?.asset_ref?.id ||
                    selectedBlock.content?.asset?.id ||
                    undefined
                  }
                  options={mediaOptions}
                  onChange={value =>
                    updateSelectedBlockSettings({
                      asset_ref: value ? { id: value } : null,
                    })
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Button Label')}</FieldLabel>
                <RichTextComposer
                  readOnly={isPublishedPage}
                  minHeight={100}
                  value={richFieldValue(selectedBlock, 'buttonLabel')}
                  onChange={value =>
                    updateSelectedBlockRichField('buttonLabel', value)
                  }
                />
              </FieldBlock>
            </FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Description')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={160}
                value={richTextValue(selectedBlock)}
                onChange={value => updateSelectedRichText(value)}
              />
            </FieldBlock>
          </SectionList>
        )}
        {selectedBlock.block_type === 'button' && (
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Label')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'label')}
                onChange={value => updateSelectedBlockRichField('label', value)}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('URL')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={selectedBlock.settings?.url || ''}
                onChange={event =>
                  updateSelectedBlockSettings({ url: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Variant')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.variant || 'primary'}
                onChange={value =>
                  updateSelectedBlockSettings({ variant: value })
                }
                options={[
                  { value: 'primary', label: t('Primary') },
                  { value: 'default', label: t('Default') },
                  { value: 'dashed', label: t('Dashed') },
                  { value: 'link', label: t('Link') },
                  { value: 'text', label: t('Text') },
                ]}
              />
            </FieldBlock>
            {selectedBlock.slot === 'hero' ? (
              <FieldBlock>
                <FieldLabel>{t('Hero Placement')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  value={selectedBlock.settings?.heroPlacement || 'panel'}
                  onChange={value =>
                    updateSelectedBlockSettings({ heroPlacement: value })
                  }
                  options={[
                    { value: 'panel', label: t('Right Panel') },
                    { value: 'content', label: t('Under Text') },
                  ]}
                />
              </FieldBlock>
            ) : null}
            <FieldBlock>
              <FieldLabel>{t('Button Surface Opacity')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={
                  selectedBlock.settings?.buttonBackgroundOpacity === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.buttonBackgroundOpacity)
                }
                placeholder={t('Default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    buttonBackgroundOpacity:
                      value === null ? undefined : Number(value),
                  })
                }
              />
            </FieldBlock>
          </FieldGrid>
        )}
        {selectedBlock.block_type === 'chart' && (
          <>
            <FieldBlock>
              <FieldLabel>{t('Chart')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                showSearch
                optionFilterProp="label"
                value={selectedBlock.settings?.chart_ref?.id || undefined}
                options={charts.map(chart => ({
                  value: chart.id,
                  label: `${chart.slice_name} (${chart.viz_type || t('Chart')})${
                    chart.is_public === false
                      ? ` • ${t('Currently private')}`
                      : ''
                  }`,
                }))}
                onChange={value => {
                  const selectedChart =
                    charts.find(chart => chart.id === value) || null;
                  if (!selectedChart) {
                    updateSelectedBlockSettings({
                      chart_ref: value ? { id: value } : null,
                    });
                    return;
                  }
                  const mapLike = isMapLikeViz(selectedChart.viz_type);
                  const currentTitle = String(
                    selectedBlock.content?.title || '',
                  ).trim();
                  const currentCaption = String(
                    selectedBlock.content?.caption || '',
                  ).trim();
                  const normalizedTitle = currentTitle.toLowerCase();
                  const normalizedSliceName = String(
                    selectedChart.slice_name || '',
                  )
                    .trim()
                    .toLowerCase();
                  const nextSettings = {
                    ...(selectedBlock.settings || {}),
                    chart_ref: value ? { id: value } : null,
                  } as Record<string, any>;
                  const nextContent = {
                    ...(selectedBlock.content || {}),
                  } as Record<string, any>;

                  if (mapLike) {
                    if (
                      !selectedBlock.settings?.surface_preset ||
                      selectedBlock.settings?.surface_preset === 'default'
                    ) {
                      nextSettings.surface_preset = 'map_focus';
                    }
                    if (
                      !selectedBlock.settings?.legend_preset ||
                      selectedBlock.settings?.legend_preset === 'default'
                    ) {
                      nextSettings.legend_preset = 'horizontal_bottom';
                    }
                    if (
                      !selectedBlock.settings?.height ||
                      Number(selectedBlock.settings?.height) < 560
                    ) {
                      nextSettings.height = 560;
                    }
                    if (
                      !currentCaption &&
                      (!normalizedTitle ||
                        normalizedTitle === 'chart' ||
                        normalizedTitle === normalizedSliceName)
                    ) {
                      nextSettings.show_header = false;
                      if (
                        normalizedTitle === 'chart' ||
                        normalizedTitle === normalizedSliceName
                      ) {
                        nextContent.title = '';
                        nextContent.title_html = '';
                      }
                    }
                  }

                  updateSelectedBlock({
                    content: nextContent,
                    settings: nextSettings,
                  });
                }}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Caption')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={120}
                value={richFieldValue(selectedBlock, 'caption')}
                onChange={value =>
                  updateSelectedBlockRichField('caption', value)
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Height')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                value={blockResizeHeight(selectedBlock, 360)}
                onChange={value =>
                  updateSelectedBlockSettings(
                    buildBlockHeightSettingsPatch(
                      selectedBlock,
                      Math.max(Number(value) || 360, 120),
                    ),
                  )
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Space Above Chart (px)')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={120}
                value={
                  selectedBlock.settings?.sectionTopGap === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.sectionTopGap)
                }
                placeholder={t('Use page default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    sectionTopGap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                    section_top_gap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Space Below Chart (px)')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={120}
                value={
                  selectedBlock.settings?.sectionGap === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.sectionGap)
                }
                placeholder={t('Use page default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    sectionGap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                    section_gap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Show Header')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={selectedBlock.settings?.show_header ?? true}
                onChange={checked =>
                  updateSelectedBlockSettings({ show_header: checked })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Presentation')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.surface_preset || 'default'}
                options={CHART_SURFACE_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockSettings({ surface_preset: value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Legend')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.legend_preset || 'default'}
                options={CHART_LEGEND_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockSettings({ legend_preset: value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Frame Opacity')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={
                  selectedBlock.settings?.frameOpacity === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.frameOpacity)
                }
                placeholder={t('Default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    frameOpacity: value === null ? undefined : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Chart Background Image Asset')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                showSearch
                optionFilterProp="label"
                value={
                  selectedBlock.settings?.chart_background_asset_ref?.id ||
                  selectedBlock.settings?.chartBackgroundAssetRef?.id ||
                  undefined
                }
                options={mediaOptions.filter(option => {
                  const asset = mediaAssets.find(
                    item => item.id === option.value,
                  );
                  return asset?.asset_type === 'image';
                })}
                onChange={value =>
                  updateSelectedBlockSettings({
                    chart_background_asset_ref: value ? { id: value } : null,
                    chartBackgroundAssetRef: value ? { id: value } : null,
                    chart_background_asset_id: value || null,
                    chartBackgroundAssetId: value || null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Chart Background Image URL')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={
                  selectedBlock.settings?.chartBackgroundImageUrl ||
                  selectedBlock.settings?.chart_background_image_url ||
                  ''
                }
                placeholder={t('https://...')}
                onChange={event =>
                  updateSelectedBlockSettings({
                    chartBackgroundImageUrl: event.target.value || undefined,
                    chart_background_image_url:
                      event.target.value || undefined,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Chart Background Image Opacity')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={
                  selectedBlock.settings?.chartBackgroundImageOpacity ===
                    undefined &&
                  selectedBlock.settings?.chart_background_image_opacity ===
                    undefined
                    ? undefined
                    : Number(
                        selectedBlock.settings?.chartBackgroundImageOpacity ??
                          selectedBlock.settings
                            ?.chart_background_image_opacity,
                      )
                }
                placeholder={t('Default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    chartBackgroundImageOpacity:
                      value === null ? undefined : Number(value),
                    chart_background_image_opacity:
                      value === null ? undefined : Number(value),
                  })
                }
              />
            </FieldBlock>
          </>
        )}
        {selectedBlock.block_type === 'dashboard' && (
          <>
            <FieldBlock>
              <FieldLabel>{t('Dashboard')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.dashboard_ref?.id || undefined}
                options={dashboards.map(dashboard => ({
                  value: dashboard.id,
                  label: dashboard.dashboard_title,
                }))}
                onChange={value =>
                  updateSelectedBlockSettings({
                    dashboard_ref: value ? { id: value } : null,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Height')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                value={blockResizeHeight(selectedBlock, 720)}
                onChange={value =>
                  updateSelectedBlockSettings(
                    buildBlockHeightSettingsPatch(
                      selectedBlock,
                      Math.max(Number(value) || 720, 240),
                    ),
                  )
                }
              />
            </FieldBlock>
          </>
        )}
        {selectedBlock.block_type === 'columns' && (
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Column Count')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={1}
                max={4}
                value={Number(selectedBlock.settings?.columnCount) || 2}
                onChange={value =>
                  applySelectedGridTemplate(Number(value) || 2)
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Gap')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                value={Number(selectedBlock.settings?.gap) || 12}
                onChange={value =>
                  updateSelectedBlockSettings({ gap: Number(value) || 12 })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Row Height')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                step={20}
                value={blockResizeHeight(selectedBlock, 240)}
                onChange={value =>
                  updateSelectedBlockSettings(
                    buildBlockHeightSettingsPatch(
                      selectedBlock,
                      Math.max(Number(value) || 0, 0),
                    ),
                  )
                }
              />
            </FieldBlock>
          </FieldGrid>
        )}
        {selectedBlock.block_type === 'section' && (
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Anchor')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={selectedBlock.settings?.anchor || ''}
                onChange={event =>
                  updateSelectedBlockSettings({ anchor: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={selectedBlock.settings?.background || ''}
                onChange={event =>
                  updateSelectedBlockSettings({
                    background: event.target.value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Columns')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={1}
                max={4}
                value={Number(selectedBlock.settings?.columns) || 1}
                onChange={value =>
                  updateSelectedBlockSettings({ columns: Number(value) || 1 })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Space Above Section (px)')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={120}
                value={
                  selectedBlock.settings?.sectionTopGap === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.sectionTopGap)
                }
                placeholder={t('Use page default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    sectionTopGap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                    section_top_gap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Space Below Section (px)')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={120}
                value={
                  selectedBlock.settings?.sectionGap === undefined
                    ? undefined
                    : Number(selectedBlock.settings?.sectionGap)
                }
                placeholder={t('Use page default')}
                onChange={value =>
                  updateSelectedBlockSettings({
                    sectionGap:
                      value === null || value === undefined
                        ? undefined
                        : Number(value),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Container')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.container || 'default'}
                onChange={value =>
                  updateSelectedBlockSettings({ container: value })
                }
                options={[
                  { value: 'default', label: t('Default') },
                  { value: 'full', label: t('Full Width') },
                  { value: 'narrow', label: t('Narrow') },
                ]}
              />
            </FieldBlock>
          </FieldGrid>
        )}
        {selectedBlock.block_type === 'table' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Title')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'title')}
                onChange={value => updateSelectedBlockRichField('title', value)}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Columns')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={formatTableColumns(selectedBlock.content?.columns)}
                onChange={event =>
                  updateSelectedBlockContent({
                    columns: parseTableColumns(event.target.value),
                  })
                }
                placeholder={t('Comma-separated column titles')}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Rows')}</FieldLabel>
              <Input.TextArea
                disabled={isPublishedPage}
                rows={6}
                value={formatTableRows(selectedBlock.content?.rows)}
                onChange={event =>
                  updateSelectedBlockContent({
                    rows: parseTableRows(event.target.value),
                  })
                }
                placeholder={t('One row per line. Separate cells with |')}
              />
            </FieldBlock>
          </SectionList>
        )}
        {selectedBlock.block_type === 'dynamic_widget' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Subtitle')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={120}
                value={richFieldValue(selectedBlock, 'subtitle')}
                onChange={value =>
                  updateSelectedBlockRichField('subtitle', value)
                }
              />
            </FieldBlock>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Widget Type')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  value={
                    selectedBlock.settings?.widgetType || 'indicator_highlights'
                  }
                  onChange={value =>
                    updateSelectedBlockSettings({ widgetType: value })
                  }
                  options={[
                    {
                      value: 'indicator_highlights',
                      label: t('Indicator Highlights'),
                    },
                    { value: 'dashboard_list', label: t('Dashboard List') },
                  ]}
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Limit')}</FieldLabel>
                <InputNumber
                  disabled={isPublishedPage}
                  style={{ width: '100%' }}
                  min={1}
                  max={24}
                  value={Number(selectedBlock.settings?.limit) || 6}
                  onChange={value =>
                    updateSelectedBlockSettings({ limit: Number(value) || 6 })
                  }
                />
              </FieldBlock>
            </FieldGrid>
            {selectedBlock.settings?.widgetType === 'indicator_highlights' && (
              <>
                <FieldBlock>
                  <FieldLabel>{t('Widget Note')}</FieldLabel>
                  <RichTextComposer
                    readOnly={isPublishedPage}
                    minHeight={100}
                    value={richFieldValue(selectedBlock, 'note')}
                    onChange={value =>
                      updateSelectedBlockRichField('note', value)
                    }
                  />
                </FieldBlock>
                <FieldGrid>
                  <FieldBlock>
                    <FieldLabel>{t('Empty Message')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.emptyMessage || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          emptyMessage: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                  <FieldBlock>
                    <FieldLabel>{t('Dataset Label')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.datasetFallbackLabel || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          datasetFallbackLabel: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                  <FieldBlock>
                    <FieldLabel>{t('Latest Period Label')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.latestPeriodLabel || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          latestPeriodLabel: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                </FieldGrid>
              </>
            )}
            {selectedBlock.settings?.widgetType === 'dashboard_list' && (
              <>
                <FieldGrid>
                  <FieldBlock>
                    <FieldLabel>{t('Card Eyebrow')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.cardEyebrow || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          cardEyebrow: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                  <FieldBlock>
                    <FieldLabel>{t('Action Label')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.actionLabel || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          actionLabel: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                  <FieldBlock>
                    <FieldLabel>{t('Slug Fallback Label')}</FieldLabel>
                    <Input
                      disabled={isPublishedPage}
                      value={selectedBlock.content?.slugFallbackLabel || ''}
                      onChange={event =>
                        updateSelectedBlockContent({
                          slugFallbackLabel: event.target.value,
                        })
                      }
                    />
                  </FieldBlock>
                </FieldGrid>
                <FieldBlock>
                  <FieldLabel>{t('Card Description')}</FieldLabel>
                  <Input.TextArea
                    disabled={isPublishedPage}
                    rows={3}
                    value={selectedBlock.content?.cardDescription || ''}
                    onChange={event =>
                      updateSelectedBlockContent({
                        cardDescription: event.target.value,
                      })
                    }
                  />
                </FieldBlock>
                <FieldBlock>
                  <FieldLabel>{t('Empty Message')}</FieldLabel>
                  <Input.TextArea
                    disabled={isPublishedPage}
                    rows={3}
                    value={selectedBlock.content?.emptyMessage || ''}
                    onChange={event =>
                      updateSelectedBlockContent({
                        emptyMessage: event.target.value,
                      })
                    }
                  />
                </FieldBlock>
              </>
            )}
          </SectionList>
        )}
        {selectedBlock.block_type === 'page_title' && (
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Show Subtitle')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={selectedBlock.settings?.showSubtitle !== false}
                onChange={checked =>
                  updateSelectedBlockSettings({ showSubtitle: checked })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Show Excerpt')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={selectedBlock.settings?.showExcerpt === true}
                onChange={checked =>
                  updateSelectedBlockSettings({ showExcerpt: checked })
                }
              />
            </FieldBlock>
          </FieldGrid>
        )}
        {selectedBlock.block_type === 'breadcrumb' && (
          <FieldBlock>
            <FieldLabel>{t('Show Current Page')}</FieldLabel>
            <Switch
              disabled={isPublishedPage}
              checked={selectedBlock.settings?.showCurrentPage !== false}
              onChange={checked =>
                updateSelectedBlockSettings({ showCurrentPage: checked })
              }
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'menu' && (
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Menu')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                value={selectedBlock.settings?.menu_slug || undefined}
                options={menuOptions}
                onChange={value =>
                  updateSelectedBlockSettings({ menu_slug: value || null })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Orientation')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.orientation || 'horizontal'}
                onChange={value =>
                  updateSelectedBlockSettings({ orientation: value })
                }
                options={[
                  { value: 'horizontal', label: t('Horizontal') },
                  { value: 'vertical', label: t('Vertical') },
                ]}
              />
            </FieldBlock>
          </FieldGrid>
        )}
        {selectedBlock.block_type === 'reusable_reference' && (
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Reusable Section')}</FieldLabel>
                <Select
                  disabled={isPublishedPage}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={selectedBlock.settings?.reusable_block_id || undefined}
                  options={reusableBlockOptions}
                  onChange={value => {
                    const reusableBlock =
                      reusableLibrary.find(item => item.id === value) || null;
                    updateSelectedBlock({
                      content: {
                        ...(selectedBlock.content || {}),
                        title: reusableBlock?.title || t('Reusable Section'),
                      },
                      metadata: {
                        ...(selectedBlock.metadata || {}),
                        label: reusableBlock?.title || t('Reusable Section'),
                      },
                      settings: {
                        ...(selectedBlock.settings || {}),
                        reusable_block_id: value || null,
                        reusable_block_ref: value ? { id: value } : null,
                        render_error: undefined,
                      },
                      reusable_block: reusableBlock,
                    });
                  }}
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Delivery')}</FieldLabel>
                <Input disabled value={t('Synced from library')} />
              </FieldBlock>
            </FieldGrid>
            {selectedBlock.reusable_block ? (
              <TinyMeta>
                {selectedBlock.reusable_block.description ||
                  t('This section stays synced to the reusable block library.')}
              </TinyMeta>
            ) : null}
            {selectedBlock.settings?.render_error ? (
              <Alert
                showIcon
                type="warning"
                message={selectedBlock.settings.render_error}
              />
            ) : null}
            <Space wrap>
              <Button
                disabled={isPublishedPage}
                onClick={detachSelectedReusableReference}
              >
                <CopyOutlined /> {t('Detach To Local')}
              </Button>
              {selectedBlock.reusable_block?.id ? (
                <Button
                  disabled={isPublishedPage}
                  onClick={() => {
                    setSelectedReusableId(
                      selectedBlock.reusable_block?.id || null,
                    );
                    setDocumentOpen(true);
                  }}
                >
                  {t('Open Library Entry')}
                </Button>
              ) : null}
            </Space>
          </SectionList>
        )}
        {selectedBlock.block_type === 'callout' && (
          <FieldBlock>
            <FieldLabel>{t('Tone')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              value={selectedBlock.settings?.tone || 'info'}
              onChange={value => updateSelectedBlockSettings({ tone: value })}
              options={[
                { value: 'info', label: t('Info') },
                { value: 'success', label: t('Success') },
                { value: 'warning', label: t('Warning') },
                { value: 'error', label: t('Error') },
              ]}
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'statistic' && (
          <SectionList>
            <FieldBlock>
              <FieldLabel>{t('Value')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'value')}
                onChange={value => updateSelectedBlockRichField('value', value)}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Caption')}</FieldLabel>
              <RichTextComposer
                readOnly={isPublishedPage}
                minHeight={100}
                value={richFieldValue(selectedBlock, 'caption')}
                onChange={value =>
                  updateSelectedBlockRichField('caption', value)
                }
              />
            </FieldBlock>
          </SectionList>
        )}
        {selectedBlock.block_type === 'divider' && (
          <FieldBlock>
            <FieldLabel>{t('Style')}</FieldLabel>
            <Select
              disabled={isPublishedPage}
              value={selectedBlock.settings?.style || 'solid'}
              onChange={value => updateSelectedBlockSettings({ style: value })}
              options={[
                { value: 'solid', label: t('Solid') },
                { value: 'dashed', label: t('Dashed') },
                { value: 'dotted', label: t('Dotted') },
              ]}
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'spacer' && (
          <FieldBlock>
            <FieldLabel>{t('Height')}</FieldLabel>
            <InputNumber
              disabled={isPublishedPage}
              style={{ width: '100%' }}
              min={8}
              value={blockResizeHeight(selectedBlock, 48)}
              onChange={value =>
                updateSelectedBlockSettings(
                  buildBlockHeightSettingsPatch(
                    selectedBlock,
                    Math.max(Number(value) || 48, 8),
                  ),
                )
              }
            />
          </FieldBlock>
        )}
        {selectedBlock.block_type === 'html' && (
          <FieldBlock>
            <FieldLabel>{t('HTML')}</FieldLabel>
            <Input.TextArea
              disabled={isPublishedPage}
              rows={8}
              value={selectedBlock.content?.html || ''}
              onChange={event =>
                updateSelectedBlockContent({ html: event.target.value })
              }
            />
          </FieldBlock>
        )}
        <SectionList>
          <InlinePills>
            <Tag>{t('Layout & Style')}</Tag>
          </InlinePills>
          <TinyMeta>
            {t(
              'These options are saved with the draft and rendered the same way on public and authenticated page views.',
            )}
          </TinyMeta>
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Width')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.width || '')}
                placeholder={t('100%, 420px, auto')}
                onChange={event =>
                  updateSelectedBlockStyles({ width: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Max Width')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.maxWidth || '')}
                placeholder={t('960px')}
                onChange={event =>
                  updateSelectedBlockStyles({ maxWidth: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Height')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.height || '')}
                placeholder={t('auto, 360px, 75vh')}
                onChange={event =>
                  updateSelectedBlockStyles({ height: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Max Height')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.maxHeight || '')}
                placeholder={t('640px')}
                onChange={event =>
                  updateSelectedBlockStyles({ maxHeight: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Padding')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.padding || '')}
                placeholder={t('24px or 16px 24px')}
                onChange={event =>
                  updateSelectedBlockStyles({ padding: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Margin')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.margin || '')}
                placeholder={t('0 auto')}
                onChange={event =>
                  updateSelectedBlockStyles({ margin: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Content Align')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.styles?.justifySelf || 'stretch'}
                options={CONTENT_ALIGN_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockStyles({
                    justifySelf: value === 'stretch' ? undefined : value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Overflow')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.styles?.overflow || 'visible'}
                options={OVERFLOW_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockStyles({
                    overflow: value === 'visible' ? undefined : value,
                  })
                }
              />
            </FieldBlock>
          </FieldGrid>
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Surface Preset')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.settings?.surfacePreset || 'custom'}
                options={SURFACE_PRESET_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value => applySurfacePreset(value)}
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Color')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.backgroundColor || '')}
                placeholder={t('#ffffff or rgba(...)')}
                onChange={event =>
                  updateSelectedBlockStyles({
                    backgroundColor: event.target.value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Image Asset')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                allowClear
                showSearch
                optionFilterProp="label"
                value={
                  selectedBlock.settings?.background_asset_ref?.id ||
                  selectedBlock.settings?.backgroundAssetRef?.id ||
                  undefined
                }
                options={mediaOptions.filter(option => {
                  const asset = mediaAssets.find(
                    item => item.id === option.value,
                  );
                  return asset?.asset_type === 'image';
                })}
                onChange={value => {
                  /*
                    Clear the URL fields as well. The server fills these in from
                    the asset when it serialises the page, so a value left here
                    is the PREVIOUS asset's URL — and it would shadow the newly
                    picked one, both in the free-text field below and when
                    rendering.
                  */
                  updateSelectedBlockStylesAndSettings(
                    { backgroundImage: null },
                    {
                      background_asset_ref: value ? { id: value } : null,
                      backgroundAssetRef: value ? { id: value } : null,
                      background_asset_id: value || null,
                      backgroundAssetId: value || null,
                      backgroundImageUrl: null,
                      background_image_url: null,
                    },
                  );
                }}
              />
              <TinyMeta>
                {t(
                  'Use this for hero and section backgrounds, including public dashboard landing pages.',
                )}
              </TinyMeta>
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Use Page Featured Image')}</FieldLabel>
              <Switch
                disabled={isPublishedPage}
                checked={Boolean(selectedBlock.settings?.usePageFeaturedImage)}
                onChange={checked =>
                  updateSelectedBlockSettings({
                    usePageFeaturedImage: checked || undefined,
                  })
                }
              />
              <TinyMeta>
                {t(
                  'Uses the page featured image as this block background when no block background image is selected.',
                )}
              </TinyMeta>
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Image URL')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(
                  selectedBlock.settings?.backgroundImageUrl ||
                    selectedBlock.settings?.background_image_url ||
                    selectedBlock.styles?.backgroundImage ||
                    '',
                )}
                placeholder={t('https://.../background.jpg')}
                onChange={event =>
                  updateSelectedBlockStylesAndSettings(
                    { backgroundImage: event.target.value },
                    {
                      backgroundImageUrl: event.target.value || undefined,
                      background_image_url: event.target.value || undefined,
                    },
                  )
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Image Opacity')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={
                  selectedBlock.settings?.backgroundImageOpacity === undefined
                    ? 1
                    : Number(selectedBlock.settings?.backgroundImageOpacity)
                }
                onChange={value =>
                  updateSelectedBlockSettings({
                    backgroundImageOpacity:
                      value === null ? undefined : Number(value),
                    background_image_opacity:
                      value === null ? undefined : Number(value),
                  })
                }
              />
              <TinyMeta>
                {t('Lower values make the background image fainter.')}
              </TinyMeta>
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Text Color')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.color || '')}
                placeholder={t('#0f172a')}
                onChange={event =>
                  updateSelectedBlockStyles({ color: event.target.value })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Size')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={
                  selectedBlock.styles?.backgroundSize ||
                  selectedBlock.settings?.backgroundSize ||
                  'cover'
                }
                options={BACKGROUND_SIZE_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockStylesAndSettings(
                    {
                      backgroundSize: value === 'cover' ? undefined : value,
                    },
                    {
                      backgroundSize: value === 'cover' ? undefined : value,
                    },
                  )
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Position')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(
                  selectedBlock.styles?.backgroundPosition ||
                    selectedBlock.settings?.backgroundPosition ||
                    '',
                )}
                placeholder={t('center center')}
                onChange={event =>
                  updateSelectedBlockStylesAndSettings(
                    {
                      backgroundPosition: event.target.value,
                    },
                    {
                      backgroundPosition: event.target.value || undefined,
                    },
                  )
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Background Repeat')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={
                  selectedBlock.styles?.backgroundRepeat ||
                  selectedBlock.settings?.backgroundRepeat ||
                  'no-repeat'
                }
                options={BACKGROUND_REPEAT_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockStylesAndSettings(
                    {
                      backgroundRepeat:
                        value === 'no-repeat' ? undefined : value,
                    },
                    {
                      backgroundRepeat:
                        value === 'no-repeat' ? undefined : value,
                    },
                  )
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Shadow')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.boxShadow || '')}
                placeholder={t('0 14px 36px rgba(15, 23, 42, 0.08)')}
                onChange={event =>
                  updateSelectedBlockStyles({ boxShadow: event.target.value })
                }
              />
            </FieldBlock>
          </FieldGrid>
          <FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Border Color')}</FieldLabel>
              <Input
                disabled={isPublishedPage}
                value={String(selectedBlock.styles?.borderColor || '')}
                placeholder={t('transparent')}
                onChange={event =>
                  updateSelectedBlockStyles({
                    borderColor: event.target.value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Border Style')}</FieldLabel>
              <Select
                disabled={isPublishedPage}
                value={selectedBlock.styles?.borderStyle || 'solid'}
                options={BORDER_STYLE_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={value =>
                  updateSelectedBlockStyles({
                    borderStyle: value === 'solid' ? undefined : value,
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Border Width')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                value={numericStyleValue(selectedBlock.styles?.borderWidth)}
                onChange={value =>
                  updateSelectedBlockStyles({
                    borderWidth:
                      value === null
                        ? undefined
                        : pixelStyleValue(Number(value)),
                  })
                }
              />
            </FieldBlock>
            <FieldBlock>
              <FieldLabel>{t('Corner Radius')}</FieldLabel>
              <InputNumber
                disabled={isPublishedPage}
                style={{ width: '100%' }}
                min={0}
                value={numericStyleValue(selectedBlock.styles?.borderRadius)}
                onChange={value =>
                  updateSelectedBlockStyles({
                    borderRadius:
                      value === null
                        ? undefined
                        : pixelStyleValue(Number(value)),
                  })
                }
              />
            </FieldBlock>
          </FieldGrid>
        </SectionList>
        <Space wrap>
          {onSaveDraft ? (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={savingDraft}
              disabled={isPublishedPage}
              onClick={onSaveDraft}
            >
              {t('Save Draft')}
            </Button>
          ) : null}
          <Button
            disabled={isPublishedPage}
            onClick={() => resizeSelectedBlock('gridSpan', -1)}
          >
            ← {t('Narrower')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() => resizeSelectedBlock('gridSpan', 1)}
          >
            → {t('Wider')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() => resizeSelectedBlock('minHeight', -1)}
          >
            ↓ {t('Shorter')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() => resizeSelectedBlock('minHeight', 1)}
          >
            ↑ {t('Taller')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() => moveSelectedBlock(-1)}
          >
            ↑ {t('Move')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() => moveSelectedBlock(1)}
          >
            ↓ {t('Move')}
          </Button>
          <Button disabled={isPublishedPage} onClick={duplicateSelectedBlock}>
            {t('Duplicate')}
          </Button>
          <Button
            disabled={isPublishedPage}
            onClick={() =>
              addBlockRelativeToBlock(
                selectedBlock,
                isContainerBlock(selectedBlock.block_type) ? 'child' : 'after',
              )
            }
          >
            {isContainerBlock(selectedBlock.block_type)
              ? t('Add Child')
              : t('Add After')}
          </Button>
          {GRID_TEMPLATE_OPTIONS.map(option => (
            <Button
              key={`selected-grid-${option.value}`}
              disabled={isPublishedPage}
              onClick={() => applySelectedGridTemplate(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            danger
            disabled={isPublishedPage}
            onClick={removeSelectedBlock}
          >
            {t('Delete')}
          </Button>
        </Space>
      </SectionList>
    );
  }

  function handleSelectBlock(block: PortalPageBlock) {
    setSelection({ type: 'block', uid: blockKey(block) });
  }

  function renderSlotRegion(
    slot: (typeof SLOT_OPTIONS)[number],
    showSlotChrome: boolean,
  ) {
    const slotBlocks = slotGroups[slot.value] || [];
    if (!showSlotChrome && !slotBlocks.length) {
      return null;
    }
    return (
      <RegionCard key={slot.value}>
        {showSlotChrome ? (
          <RegionHeader>
            <RegionTitle>
              <SlotLabel>
                {blockIcon(slot.value, 'layout')}
                <span>{slot.label}</span>
              </SlotLabel>
            </RegionTitle>
            <InlinePills>
              <Tag>{t('%s blocks', slotBlocks.length)}</Tag>
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={isPublishedPage}
                onClick={() => {
                  setQuickInsertSlot(slot.value);
                  addBlockToSlot('paragraph', slot.value);
                }}
              >
                {t('Add Here')}
              </Button>
            </InlinePills>
          </RegionHeader>
        ) : null}
        {slotBlocks.length ? (
          <RenderBlockTree
            blocks={slotBlocks}
            charts={charts}
            dashboards={dashboards}
            editorBlockTypes={
              showSlotChrome && !isPublishedPage
                ? insertableBlockTypes
                : undefined
            }
            chartEmbedAccess="authenticated"
            mediaAssets={mediaAssets}
            page={draftPage}
            navigation={navigationMenus}
            mode={showSlotChrome ? 'editor' : 'public'}
            selectedBlockUid={
              showSlotChrome && selection.type === 'block'
                ? selection.uid
                : undefined
            }
            onSelectBlock={showSlotChrome ? handleSelectBlock : undefined}
            onResizeBlock={showSlotChrome ? handleResizeBlock : undefined}
            onInlineRichTextChange={
              showSlotChrome ? updateRichTextBlock : undefined
            }
            onInsertBlockFromCanvas={
              showSlotChrome && !isPublishedPage
                ? (block, mode) => addBlockRelativeToBlock(block, mode)
                : undefined
            }
            onInsertBlockTypeFromCanvas={
              showSlotChrome && !isPublishedPage
                ? (block, mode, blockType) =>
                    addBlockRelativeToBlock(block, mode, blockType)
                : undefined
            }
            onInsertGridTemplateFromCanvas={
              showSlotChrome && !isPublishedPage
                ? (block, columnCount) =>
                    insertGridTemplate(columnCount, block, 'child')
                : undefined
            }
            onDeleteBlockFromCanvas={
              showSlotChrome && !isPublishedPage
                ? removeBlockFromCanvas
                : undefined
            }
            onMoveBlockFromCanvas={
              showSlotChrome && !isPublishedPage
                ? moveBlockFromCanvas
                : undefined
            }
          />
        ) : showSlotChrome ? (
          <Empty
            description={t(
              'No blocks in this region yet. Use Add Here to place content.',
            )}
          />
        ) : null}
      </RegionCard>
    );
  }

  function renderDocumentDrawer() {
    return (
      <DrawerStack>
        <DrawerSection>
          <PanelHeader>
            <PanelTitle>{t('Pages')}</PanelTitle>
            <Button size="small" icon={<PlusOutlined />} onClick={onNewPage}>
              {t('New')}
            </Button>
          </PanelHeader>
          <FieldBlock>
            <FieldLabel>{t('Find Page')}</FieldLabel>
            <Input
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder={t('Search by title or slug')}
            />
          </FieldBlock>
          <SectionList style={{ marginTop: 16 }}>
            {filteredPages.map(page => (
              <CardButton
                key={page.id}
                $active={page.slug === draftPage?.slug}
                onClick={() => {
                  onSelectPage(page.slug || null);
                  setDocumentOpen(false);
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <strong>{page.title}</strong>
                  <Tag color={page.visibility === 'public' ? 'green' : 'blue'}>
                    {page.visibility || 'draft'}
                  </Tag>
                </div>
                <TinyMeta>{page.path || page.slug}</TinyMeta>
              </CardButton>
            ))}
          </SectionList>
        </DrawerSection>
        {draftPage ? (
          <DrawerSection>
            <PanelHeader>
              <PanelTitle>{t('Block Outline')}</PanelTitle>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setSelection({ type: 'page' });
                }}
              >
                {t('Page')}
              </Button>
            </PanelHeader>
            <SectionList>
              {flattenedBlocks.length ? (
                flattenedBlocks.map(({ block, depth }) => (
                  <CardButton
                    key={blockKey(block)}
                    $depth={depth}
                    $active={
                      selection.type === 'block' &&
                      selection.uid === blockKey(block)
                    }
                    onClick={() => {
                      setSelection({ type: 'block', uid: blockKey(block) });
                      setDocumentOpen(false);
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <strong>
                        <InlinePills>
                          {blockIcon(
                            block.block_type,
                            insertableBlockTypes.find(
                              definition =>
                                definition.type === block.block_type,
                            )?.icon,
                          )}
                          <span>
                            {block.content?.title ||
                              block.content?.text ||
                              block.metadata?.label ||
                              t('Block')}
                          </span>
                        </InlinePills>
                      </strong>
                      <Tag>{block.block_type}</Tag>
                    </div>
                    <TinyMeta>{block.slot || 'content'}</TinyMeta>
                  </CardButton>
                ))
              ) : (
                <Empty
                  description={t('Add a block to start composing this page.')}
                />
              )}
            </SectionList>
          </DrawerSection>
        ) : null}
        {libraryStatus ? (
          <DrawerSection>
            <Alert
              showIcon
              type={libraryStatus.type}
              message={libraryStatus.message}
            />
          </DrawerSection>
        ) : null}
        <DrawerSection>
          <PanelHeader>
            <PanelTitle>{t('Starter Patterns')}</PanelTitle>
            <Tag icon={<AppstoreOutlined />}>{starterPatterns.length || 0}</Tag>
          </PanelHeader>
          <SectionList>
            {starterPatterns.length ? (
              starterPatterns.map(pattern => (
                <CardButton
                  key={pattern.id}
                  onClick={() => insertStarterPattern(pattern)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <strong>{pattern.title}</strong>
                    <Tag>{pattern.category || 'pattern'}</Tag>
                  </div>
                  <TinyMeta>{pattern.description}</TinyMeta>
                </CardButton>
              ))
            ) : (
              <Empty description={t('Starter patterns are loading.')} />
            )}
          </SectionList>
        </DrawerSection>
        <DrawerSection>
          <PanelHeader>
            <PanelTitle>{t('Reusable Sections')}</PanelTitle>
            <Button
              size="small"
              onClick={() => {
                setSelectedReusableId(null);
                setReusableDraft(
                  createReusableDraft(
                    null,
                    selectedBlock?.content?.title ||
                      selectedBlock?.content?.text ||
                      selectedBlock?.metadata?.label,
                  ),
                );
              }}
            >
              {t('New')}
            </Button>
          </PanelHeader>
          <SectionList>
            {reusableLibrary.length ? (
              reusableLibrary.map(reusableBlock => (
                <CardButton
                  key={reusableBlock.id}
                  $active={selectedReusableId === reusableBlock.id}
                  onClick={() => setSelectedReusableId(reusableBlock.id)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <strong>{reusableBlock.title}</strong>
                    <Tag color={reusableBlock.is_active ? 'green' : 'default'}>
                      {reusableBlock.category || 'custom'}
                    </Tag>
                  </div>
                  <TinyMeta>
                    {reusableBlock.description || t('Reusable synced section')}
                  </TinyMeta>
                  <Space wrap style={{ marginTop: 10 }}>
                    <Button
                      size="small"
                      disabled={isPublishedPage}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        insertReusableReference(reusableBlock);
                      }}
                    >
                      <LinkOutlined /> {t('Insert Synced')}
                    </Button>
                    <Button
                      size="small"
                      disabled={isPublishedPage}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        insertReusableCopy(reusableBlock);
                      }}
                    >
                      <CopyOutlined /> {t('Insert Copy')}
                    </Button>
                  </Space>
                </CardButton>
              ))
            ) : (
              <Empty
                description={t(
                  'Save a selected block to start your reusable library.',
                )}
              />
            )}
          </SectionList>
        </DrawerSection>
        <DrawerSection>
          <PanelHeader>
            <PanelTitle>
              {selectedReusableId
                ? t('Reusable Details')
                : t('Save Selection As Reusable')}
            </PanelTitle>
          </PanelHeader>
          <SectionList>
            <FieldGrid>
              <FieldBlock>
                <FieldLabel>{t('Title')}</FieldLabel>
                <Input
                  disabled={isPublishedPage || libraryBusy}
                  value={reusableDraft.title}
                  onChange={event =>
                    setReusableDraft(previous => ({
                      ...previous,
                      title: event.target.value,
                    }))
                  }
                />
              </FieldBlock>
              <FieldBlock>
                <FieldLabel>{t('Category')}</FieldLabel>
                <Input
                  disabled={isPublishedPage || libraryBusy}
                  value={reusableDraft.category}
                  onChange={event =>
                    setReusableDraft(previous => ({
                      ...previous,
                      category: event.target.value,
                    }))
                  }
                />
              </FieldBlock>
            </FieldGrid>
            <FieldBlock>
              <FieldLabel>{t('Description')}</FieldLabel>
              <Input.TextArea
                disabled={isPublishedPage || libraryBusy}
                rows={3}
                value={reusableDraft.description}
                onChange={event =>
                  setReusableDraft(previous => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </FieldBlock>
            <TinyMeta>
              {selectedBlockCanSeedReusable
                ? t(
                    'Saving uses the currently selected local block subtree as the reusable source.',
                  )
                : selectedReusableBlock
                  ? t(
                      'No local source is selected. Saving will update metadata and keep the current reusable content.',
                    )
                  : t(
                      'Select any non-synced block in the page canvas to save it as a reusable section.',
                    )}
            </TinyMeta>
            <Space wrap>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={libraryBusy}
                disabled={isPublishedPage || !selectedBlockCanSeedReusable}
                onClick={() => saveReusableBlockDraft({ overwrite: false })}
              >
                {t('Save New')}
              </Button>
              {selectedReusableId ? (
                <Button
                  icon={<EditOutlined />}
                  loading={libraryBusy}
                  disabled={
                    isPublishedPage ||
                    (!selectedBlockCanSeedReusable && !selectedReusableBlock)
                  }
                  onClick={() => saveReusableBlockDraft({ overwrite: true })}
                >
                  {t('Update Selected')}
                </Button>
              ) : null}
              {selectedReusableId ? (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={libraryBusy}
                  disabled={isPublishedPage}
                  onClick={deleteSelectedReusableBlock}
                >
                  {t('Delete')}
                </Button>
              ) : null}
            </Space>
          </SectionList>
        </DrawerSection>
      </DrawerStack>
    );
  }

  function applyAutoGenerateTemplate(templateId: string) {
    const template = AUTO_GENERATE_TEMPLATES.find(t => t.id === templateId);
    if (!template || !draftPage) return;

    const generateBlockWithUid = (
      blockDef: any,
      sortOrder: number,
    ): PortalPageBlock => {
      const uid = `${blockDef.block_type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const block: PortalPageBlock = {
        uid,
        block_type: blockDef.block_type,
        slot: blockDef.slot || 'content',
        // Every generated block used to be sort_order 0, which left the order
        // within a slot undefined once the server round-tripped them.
        sort_order: sortOrder,
        is_container: isContainerBlock(blockDef.block_type),
        content: blockDef.content || {},
        settings: blockDef.settings || {},
        styles: blockDef.styles || {},
        metadata: {},
        children: blockDef.children
          ? blockDef.children.map((child: any, childIndex: number) =>
              generateBlockWithUid(child, childIndex),
            )
          : [],
      };
      return block;
    };

    // Append after whatever is already on the page, keeping existing order.
    const existingBlocks = draftPage.blocks || [];
    const nextSortOrder = existingBlocks.reduce(
      (highest, existing) => Math.max(highest, Number(existing.sort_order) || 0),
      -1,
    );
    const newBlocks = template.blocks.map((blockDef: any, index: number) =>
      generateBlockWithUid(blockDef, nextSortOrder + 1 + index),
    );

    const updatedPage = {
      ...draftPage,
      blocks: [...existingBlocks, ...newBlocks],
    };
    onChangeDraftPage(updatedPage);
  }

  function renderLibraryPanel() {
    const categoryBlocks: readonly string[] = LIBRARY_CATEGORIES.find(
      cat => cat.id === activeLibraryCategory,
    )?.blocks || [];
    const filteredBlocks = insertableBlockTypes.filter(def =>
      categoryBlocks.includes(def.type),
    );

    return (
      <LibraryPanel $collapsed={leftPanelCollapsed}>
        <LibraryHeader $collapsed={leftPanelCollapsed}>
          <LibraryTitle $collapsed={leftPanelCollapsed}>{t('Library')}</LibraryTitle>
          <LibraryCollapseBtn
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            title={leftPanelCollapsed ? t('Expand') : t('Collapse')}
          >
            {leftPanelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </LibraryCollapseBtn>
        </LibraryHeader>
        <LibraryIconTabs $collapsed={leftPanelCollapsed}>
          <LibraryIconTab
            $active={activeLibraryCategory === 'essentials'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('essentials');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Essentials')}
          >
            <FontSizeOutlined />
          </LibraryIconTab>
          <LibraryIconTab
            $active={activeLibraryCategory === 'layout'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('layout');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Layout')}
          >
            <LayoutOutlined />
          </LibraryIconTab>
          <LibraryIconTab
            $active={activeLibraryCategory === 'media'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('media');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Media')}
          >
            <PictureOutlined />
          </LibraryIconTab>
          <LibraryIconTab
            $active={activeLibraryCategory === 'data'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('data');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Data')}
          >
            <BarChartOutlined />
          </LibraryIconTab>
          <LibraryIconTab
            $active={activeLibraryCategory === 'advanced'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('advanced');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Advanced')}
          >
            <CodeOutlined />
          </LibraryIconTab>
          <LibraryIconTab
            $active={activeLibraryCategory === 'saved'}
            $collapsed={leftPanelCollapsed}
            onClick={() => {
              setActiveLibraryCategory('saved');
              if (leftPanelCollapsed) setLeftPanelCollapsed(false);
            }}
            title={t('Saved')}
          >
            <CopyOutlined />
          </LibraryIconTab>
        </LibraryIconTabs>
        <LibraryContent $collapsed={leftPanelCollapsed}>
          <ComponentCategory>
            <ComponentCategoryLabel>{t('Auto Generate')}</ComponentCategoryLabel>
            <ComponentGrid>
              {AUTO_GENERATE_TEMPLATES.map(template => (
                <ComponentCard
                  key={template.id}
                  onClick={() => applyAutoGenerateTemplate(template.id)}
                  disabled={isPublishedPage || !draftPage}
                  title={template.description}
                >
                  <span className="icon">{blockIcon(template.icon)}</span>
                  <span className="label">{template.label}</span>
                </ComponentCard>
              ))}
            </ComponentGrid>
          </ComponentCategory>

          {activeLibraryCategory === 'saved' ? (
            <ComponentCategory>
              <ComponentCategoryLabel>{t('Reusable Sections')}</ComponentCategoryLabel>
              {reusableLibrary.length ? (
                <ComponentGrid>
                  {reusableLibrary.map(reusable => (
                    <ComponentCard
                      key={reusable.id}
                      onClick={() => insertReusableReference(reusable)}
                      disabled={isPublishedPage}
                    >
                      <span className="icon">
                        <CopyOutlined />
                      </span>
                      <span className="label">{reusable.title}</span>
                    </ComponentCard>
                  ))}
                </ComponentGrid>
              ) : (
                <Empty
                  description={t('No saved sections yet')}
                  style={{ padding: 24 }}
                />
              )}
            </ComponentCategory>
          ) : (
            <ComponentCategory>
              <ComponentCategoryLabel>
                {LIBRARY_CATEGORIES.find(cat => cat.id === activeLibraryCategory)?.label || activeLibraryCategory}
              </ComponentCategoryLabel>
              <ComponentGrid>
                {filteredBlocks.map(def => (
                  <ComponentCard
                    key={def.type}
                    onClick={() => addBlock(def.type)}
                    disabled={isPublishedPage}
                  >
                    <span className="icon">{blockIcon(def.type, def.icon)}</span>
                    <span className="label">{def.label}</span>
                  </ComponentCard>
                ))}
              </ComponentGrid>
            </ComponentCategory>
          )}
          {activeLibraryCategory === 'layout' && (
            <ComponentCategory>
              <ComponentCategoryLabel>{t('Grid Templates')}</ComponentCategoryLabel>
              <ComponentGrid>
                {GRID_TEMPLATE_OPTIONS.map(option => (
                  <ComponentCard
                    key={`grid-${option.value}`}
                    onClick={() =>
                      insertGridTemplate(
                        option.value,
                        selection.type === 'block' ? selectedBlock : null,
                      )
                    }
                    disabled={isPublishedPage}
                  >
                    <span className="icon">
                      <AppstoreOutlined />
                    </span>
                    <span className="label">{option.label}</span>
                  </ComponentCard>
                ))}
              </ComponentGrid>
            </ComponentCategory>
          )}
        </LibraryContent>
      </LibraryPanel>
    );
  }

  function renderPropertiesPanel() {
    return (
      <PropertiesPanel $collapsed={rightPanelCollapsed}>
        <PropertiesTabs>
          <PropertiesTab
            $active={activePropertiesTab === 'design'}
            onClick={() => setActivePropertiesTab('design')}
          >
            {t('Design')}
          </PropertiesTab>
          <PropertiesTab
            $active={activePropertiesTab === 'config'}
            onClick={() => setActivePropertiesTab('config')}
          >
            {t('Config')}
          </PropertiesTab>
          <PropertiesTab
            $active={activePropertiesTab === 'interactions'}
            onClick={() => setActivePropertiesTab('interactions')}
          >
            {t('Interactions')}
          </PropertiesTab>
        </PropertiesTabs>
        <PropertiesContent>
          {activePropertiesTab === 'design' && selectedBlock && (
            <>
              <PropertySection>
                <PropertySectionHeader
                  $expanded={expandedSections.typography}
                  onClick={() =>
                    setExpandedSections(prev => ({
                      ...prev,
                      typography: !prev.typography,
                    }))
                  }
                >
                  <span>{t('Typography')}</span>
                  <span className="chevron">
                    {expandedSections.typography ? '▲' : '▼'}
                  </span>
                </PropertySectionHeader>
                <PropertySectionContent $expanded={expandedSections.typography}>
                  <FieldGrid>
                    <FieldBlock>
                      <FieldLabel>{t('Font Size')}</FieldLabel>
                      <InputNumber
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        min={8}
                        max={120}
                        value={numericStyleValue(selectedBlock.styles?.fontSize)}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            fontSize: value ? `${value}px` : undefined,
                          })
                        }
                      />
                    </FieldBlock>
                    <FieldBlock>
                      <FieldLabel>{t('Font Weight')}</FieldLabel>
                      <Select
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        value={selectedBlock.styles?.fontWeight || 'normal'}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            fontWeight: value === 'normal' ? undefined : value,
                          })
                        }
                        options={[
                          { value: 'normal', label: t('Normal') },
                          { value: 'bold', label: t('Bold') },
                          { value: '300', label: t('Light') },
                          { value: '500', label: t('Medium') },
                          { value: '700', label: t('Bold') },
                          { value: '900', label: t('Black') },
                        ]}
                      />
                    </FieldBlock>
                    <FieldBlock>
                      <FieldLabel>{t('Text Align')}</FieldLabel>
                      <Select
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        value={selectedBlock.styles?.textAlign || 'left'}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            textAlign: value === 'left' ? undefined : value,
                          })
                        }
                        options={[
                          { value: 'left', label: t('Left') },
                          { value: 'center', label: t('Center') },
                          { value: 'right', label: t('Right') },
                          { value: 'justify', label: t('Justify') },
                        ]}
                      />
                    </FieldBlock>
                    <FieldBlock>
                      <FieldLabel>{t('Text Color')}</FieldLabel>
                      <Input
                        disabled={isPublishedPage}
                        value={String(selectedBlock.styles?.color || '')}
                        placeholder="#0f172a"
                        onChange={e =>
                          updateSelectedBlockStyles({ color: e.target.value })
                        }
                      />
                    </FieldBlock>
                  </FieldGrid>
                </PropertySectionContent>
              </PropertySection>

              <PropertySection>
                <PropertySectionHeader
                  $expanded={expandedSections.spacing}
                  onClick={() =>
                    setExpandedSections(prev => ({
                      ...prev,
                      spacing: !prev.spacing,
                    }))
                  }
                >
                  <span>{t('Layout & Spacing')}</span>
                  <span className="chevron">
                    {expandedSections.spacing ? '▲' : '▼'}
                  </span>
                </PropertySectionHeader>
                <PropertySectionContent $expanded={expandedSections.spacing}>
                  <FieldGrid>
                    <FieldBlock>
                      <FieldLabel>{t('Padding')}</FieldLabel>
                      <InputNumber
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        min={0}
                        value={numericStyleValue(selectedBlock.styles?.padding)}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            padding: value ? `${value}px` : undefined,
                          })
                        }
                      />
                    </FieldBlock>
                    <FieldBlock>
                      <FieldLabel>{t('Margin')}</FieldLabel>
                      <InputNumber
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        min={0}
                        value={numericStyleValue(selectedBlock.styles?.margin)}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            margin: value ? `${value}px` : undefined,
                          })
                        }
                      />
                    </FieldBlock>
                  </FieldGrid>
                </PropertySectionContent>
              </PropertySection>

              <PropertySection>
                <PropertySectionHeader
                  $expanded={expandedSections.size}
                  onClick={() =>
                    setExpandedSections(prev => ({
                      ...prev,
                      size: !prev.size,
                    }))
                  }
                >
                  <span>{t('Size')}</span>
                  <span className="chevron">
                    {expandedSections.size ? '▲' : '▼'}
                  </span>
                </PropertySectionHeader>
                <PropertySectionContent $expanded={expandedSections.size}>
                  <FieldGrid>
                    <FieldBlock>
                      <FieldLabel>{t('Width')}</FieldLabel>
                      <Input
                        disabled={isPublishedPage}
                        value={String(selectedBlock.styles?.width || '')}
                        placeholder="auto"
                        onChange={e =>
                          updateSelectedBlockStyles({ width: e.target.value })
                        }
                      />
                    </FieldBlock>
                    <FieldBlock>
                      <FieldLabel>{t('Corner Radius')}</FieldLabel>
                      <InputNumber
                        disabled={isPublishedPage}
                        style={{ width: '100%' }}
                        min={0}
                        value={numericStyleValue(selectedBlock.styles?.borderRadius)}
                        onChange={value =>
                          updateSelectedBlockStyles({
                            borderRadius: value ? `${value}px` : undefined,
                          })
                        }
                      />
                    </FieldBlock>
                  </FieldGrid>
                </PropertySectionContent>
              </PropertySection>

              <PropertySection>
                <PropertySectionHeader
                  $expanded={expandedSections.effects}
                  onClick={() =>
                    setExpandedSections(prev => ({
                      ...prev,
                      effects: !prev.effects,
                    }))
                  }
                >
                  <span>{t('Effects')}</span>
                  <span className="chevron">
                    {expandedSections.effects ? '▲' : '▼'}
                  </span>
                </PropertySectionHeader>
                <PropertySectionContent $expanded={expandedSections.effects}>
                  <EffectToggle>
                    <span>{t('Drop Shadow')}</span>
                    <Switch
                      disabled={isPublishedPage}
                      checked={Boolean(selectedBlock.styles?.boxShadow)}
                      onChange={checked =>
                        updateSelectedBlockStyles({
                          boxShadow: checked
                            ? '0 4px 12px rgba(0,0,0,0.15)'
                            : undefined,
                        })
                      }
                    />
                  </EffectToggle>
                  <EffectToggle>
                    <span>{t('Background Color')}</span>
                    <Input
                      disabled={isPublishedPage}
                      style={{ width: 100 }}
                      value={String(selectedBlock.styles?.backgroundColor || '')}
                      placeholder="#fff"
                      onChange={e =>
                        updateSelectedBlockStyles({
                          backgroundColor: e.target.value,
                        })
                      }
                    />
                  </EffectToggle>
                </PropertySectionContent>
              </PropertySection>
            </>
          )}
          {activePropertiesTab === 'design' && !selectedBlock && (
            <Empty
              description={t('Select a block to edit its design')}
              style={{ marginTop: 48 }}
            />
          )}
          {activePropertiesTab === 'config' && renderInspector()}
          {activePropertiesTab === 'interactions' && (
            <Empty
              description={t('Interactions coming soon')}
              style={{ marginTop: 48 }}
            />
          )}
        </PropertiesContent>
        {activePropertiesTab === 'design' && selectedBlock && (
          <SavePresetButton onClick={() => setDocumentOpen(true)}>
            <SaveOutlined style={{ marginRight: 8 }} />
            {t('Save as Reusable')}
          </SavePresetButton>
        )}
      </PropertiesPanel>
    );
  }

  function getSelectionBreadcrumb() {
    if (!selectedBlock) return ['Page'];
    const path = ['Page'];
    if (selectedBlock.slot) path.push(selectedBlock.slot);
    path.push(selectedBlock.block_type);
    return path;
  }

  return (
    <StudioRoot>
      <StudioHeader>
        <HeaderLeft>
          <Select
            bordered={false}
            style={{ minWidth: 200 }}
            value={draftPage?.slug || undefined}
            placeholder={t('Select a page')}
            onChange={slug => onSelectPage(slug)}
            options={filteredPages.map(page => ({
              value: page.slug,
              label: page.title,
            }))}
          />
          <Button size="small" type="dashed" onClick={onNewPage}>
            <PlusOutlined /> {t('New Page')}
          </Button>
          {draftPage && (
            <Tag color={draftPage.is_published ? 'green' : 'blue'}>
              {draftPage.is_published ? t('Published') : t('Draft')}
            </Tag>
          )}
        </HeaderLeft>
        <HeaderCenter>
          {/*
            Labelled, not icon-only: these two chips were otherwise visually
            identical apart from the glyph, with the mode readable only from a
            hover tooltip.
          */}
          <StudioModeChip
            type="button"
            $active={canvasMode === 'compose'}
            onClick={() => setCanvasMode('compose')}
            title={t('Edit mode')}
            aria-pressed={canvasMode === 'compose'}
          >
            <EditOutlined /> {t('Edit')}
          </StudioModeChip>
          <StudioModeChip
            type="button"
            $active={canvasMode === 'preview'}
            onClick={() => setCanvasMode('preview')}
            title={t('Preview mode')}
            aria-pressed={canvasMode === 'preview'}
          >
            <EyeOutlined /> {t('Preview')}
          </StudioModeChip>
          <span style={{ width: 12 }} />
          {PREVIEW_VIEWPORTS.map(viewport => (
            <Button
              key={viewport.value}
              size="small"
              type={previewViewport === viewport.value ? 'primary' : 'text'}
              icon={viewportIcon(viewport.value)}
              onClick={() => setPreviewViewport(viewport.value)}
              title={viewport.label}
            />
          ))}
        </HeaderCenter>
        <HeaderRight>
          {onSaveDraft && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={savingDraft}
              disabled={isPublishedPage}
              onClick={onSaveDraft}
            >
              {t('Save')}
            </Button>
          )}
          <Button
            type="text"
            icon={rightPanelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            title={rightPanelCollapsed ? t('Show Properties') : t('Hide Properties')}
          />
        </HeaderRight>
      </StudioHeader>

      <StudioWorkspace $leftCollapsed={leftPanelCollapsed}>
        {renderLibraryPanel()}

        <CanvasPanel>
          <CanvasTopBar>
            <Space>
              <span style={{ fontSize: 12, color: '#64748b' }}>{t('Insert to:')}</span>
              <Select
                size="small"
                style={{ minWidth: 120 }}
                value={quickInsertSlot}
                onChange={value => setQuickInsertSlot(value)}
                options={SLOT_OPTIONS.map(option => ({
                  value: option.value,
                  label: option.label,
                }))}
                disabled={isPublishedPage}
              />
            </Space>
            <Space>
              {selection.type === 'block' && selectedBlock && (
                <Tag color="processing">
                  {blockIcon(selectedBlock.block_type)} {selectedBlock.block_type}
                </Tag>
              )}
            </Space>
          </CanvasTopBar>

          <CanvasContainer>
            {draftPage ? (
              <ViewportFrame $mode={previewViewport}>
                <StudioViewport>
                  {isPublishedPage && (
                    <Alert
                      showIcon
                      type="info"
                      style={{ marginBottom: 16 }}
                      message={t('Published pages are read-only.')}
                    />
                  )}
                  <RegionGrid>
                    {SLOT_OPTIONS.map(slot =>
                      renderSlotRegion(slot, canvasMode === 'compose'),
                    )}
                  </RegionGrid>
                </StudioViewport>
              </ViewportFrame>
            ) : (
              <Empty
                description={t('Select or create a page to start editing')}
                style={{ marginTop: 120 }}
              >
                <Button type="primary" onClick={onNewPage}>
                  <PlusOutlined /> {t('Create Page')}
                </Button>
              </Empty>
            )}
          </CanvasContainer>

          {(selection.type === 'block' || draftPage) && (
            <SelectionBreadcrumb>
              {getSelectionBreadcrumb().map((item, index, arr) => (
                <span key={index}>
                  <span
                    className={index === arr.length - 1 ? 'current' : 'item'}
                    onClick={() => {
                      if (index === 0) setSelection({ type: 'page' });
                    }}
                  >
                    {item}
                  </span>
                  {index < arr.length - 1 && (
                    <span className="separator"> &gt; </span>
                  )}
                </span>
              ))}
            </SelectionBreadcrumb>
          )}
        </CanvasPanel>

        {renderPropertiesPanel()}
      </StudioWorkspace>

      <Drawer
        title={t('Document & Reusable Sections')}
        placement="left"
        open={documentOpen}
        width="min(560px, calc(100vw - 24px))"
        mask={false}
        push={false}
        styles={{
          wrapper: {
            top: 52,
            height: 'calc(100vh - 52px)',
          },
          body: {
            overflowY: 'auto',
            paddingBottom: 24,
          },
        }}
        onClose={() => setDocumentOpen(false)}
      >
        {renderDocumentDrawer()}
      </Drawer>

      <AIPageGenerator
        open={aiGeneratorOpen}
        onClose={() => setAiGeneratorOpen(false)}
        onApplyBlocks={handleApplyAIBlocks}
        availableCharts={charts.map(c => ({ id: c.id, name: c.slice_name }))}
        availableDashboards={dashboards.map(d => ({
          id: d.id,
          name: d.dashboard_title,
        }))}
      />
    </StudioRoot>
  );
}
