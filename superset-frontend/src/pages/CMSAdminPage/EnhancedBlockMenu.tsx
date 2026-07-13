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

import { useState, useMemo } from 'react';
import { styled, t } from '@superset-ui/core';
import { Input, Tabs, Badge, Tooltip, Empty } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  FileTextOutlined,
  PictureOutlined,
  LayoutOutlined,
  TableOutlined,
  CodeOutlined,
  ProfileOutlined,
  DashboardOutlined,
  FontSizeOutlined,
  MenuOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  LinkOutlined,
  NotificationOutlined,
  LineChartOutlined,
  BorderOutlined,
  ColumnHeightOutlined,
  Html5Outlined,
  MinusOutlined,
  GroupOutlined,
  UnorderedListOutlined,
  PaperClipOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';

const { TabPane } = Tabs;

// Block type definitions with icons and categories
export const ENHANCED_BLOCK_TYPES = [
  // Basic Blocks
  {
    type: 'heading',
    label: t('Heading'),
    category: 'basic',
    icon: <FontSizeOutlined />,
    description: t('Add a heading with customizable level'),
    preview: 'A clear, prominent heading for sections',
  },
  {
    type: 'paragraph',
    label: t('Paragraph'),
    category: 'basic',
    icon: <FileTextOutlined />,
    description: t('Add a text paragraph'),
    preview: 'Standard text content block',
  },
  {
    type: 'rich_text',
    label: t('Rich Text'),
    category: 'basic',
    icon: <FileTextOutlined />,
    description: t('Rich text editor with formatting'),
    preview: 'Advanced text with formatting options',
  },
  {
    type: 'list',
    label: t('List'),
    category: 'basic',
    icon: <UnorderedListOutlined />,
    description: t('Ordered or unordered list'),
    preview: 'Bulleted or numbered list items',
  },
  {
    type: 'quote',
    label: t('Quote'),
    category: 'basic',
    icon: <ProfileOutlined />,
    description: t('Blockquote with attribution'),
    preview: 'Highlighted quotation block',
  },
  {
    type: 'button',
    label: t('Button'),
    category: 'basic',
    icon: <BorderOutlined />,
    description: t('Call-to-action button'),
    preview: 'Interactive button element',
  },
  {
    type: 'divider',
    label: t('Divider'),
    category: 'basic',
    icon: <MinusOutlined />,
    description: t('Visual separator line'),
    preview: 'Horizontal line separator',
  },
  {
    type: 'spacer',
    label: t('Spacer'),
    category: 'basic',
    icon: <ColumnHeightOutlined />,
    description: t('Add vertical space'),
    preview: 'Empty space for layout',
  },

  // Layout Blocks
  {
    type: 'section',
    label: t('Section'),
    category: 'layout',
    icon: <LayoutOutlined />,
    description: t('Container section with padding'),
    preview: 'Full-width section container',
  },
  {
    type: 'columns',
    label: t('Columns'),
    category: 'layout',
    icon: <AppstoreOutlined />,
    description: t('Multi-column layout'),
    preview: 'Side-by-side column layout',
  },
  {
    type: 'group',
    label: t('Group'),
    category: 'layout',
    icon: <GroupOutlined />,
    description: t('Group blocks together'),
    preview: 'Container for grouped elements',
  },
  {
    type: 'card',
    label: t('Card'),
    category: 'layout',
    icon: <BorderOutlined />,
    description: t('Card with title and content'),
    preview: 'Bordered content card',
  },
  {
    type: 'hero',
    label: t('Hero'),
    category: 'layout',
    icon: <PictureOutlined />,
    description: t('Hero section with background'),
    preview: 'Large hero banner section',
  },
  {
    type: 'callout',
    label: t('Callout'),
    category: 'layout',
    icon: <NotificationOutlined />,
    description: t('Highlighted message box'),
    preview: 'Attention-grabbing message',
  },

  // Media Blocks
  {
    type: 'image',
    label: t('Image'),
    category: 'media',
    icon: <FileImageOutlined />,
    description: t('Single image with caption'),
    preview: 'Display an image',
  },
  {
    type: 'gallery',
    label: t('Gallery'),
    category: 'media',
    icon: <PictureOutlined />,
    description: t('Image gallery grid'),
    preview: 'Multiple images in grid',
  },
  {
    type: 'video',
    label: t('Video'),
    category: 'media',
    icon: <VideoCameraOutlined />,
    description: t('Embedded video player'),
    preview: 'Video content player',
  },
  {
    type: 'embed',
    label: t('Embed'),
    category: 'media',
    icon: <PlayCircleOutlined />,
    description: t('Embed external content'),
    preview: 'External content embed',
  },
  {
    type: 'file',
    label: t('File'),
    category: 'media',
    icon: <PaperClipOutlined />,
    description: t('File attachment link'),
    preview: 'Downloadable file link',
  },
  {
    type: 'download',
    label: t('Download'),
    category: 'media',
    icon: <DownloadOutlined />,
    description: t('Download button'),
    preview: 'File download button',
  },

  // Data Blocks
  {
    type: 'chart',
    label: t('Chart'),
    category: 'data',
    icon: <BarChartOutlined />,
    description: t('Embed a Superset chart'),
    preview: 'Interactive data chart',
  },
  {
    type: 'dashboard',
    label: t('Dashboard'),
    category: 'data',
    icon: <DashboardOutlined />,
    description: t('Embed a full dashboard'),
    preview: 'Complete dashboard view',
  },
  {
    type: 'table',
    label: t('Table'),
    category: 'data',
    icon: <TableOutlined />,
    description: t('Data table'),
    preview: 'Structured data table',
  },
  {
    type: 'statistic',
    label: t('Statistic'),
    category: 'data',
    icon: <LineChartOutlined />,
    description: t('Single statistic display'),
    preview: 'Key metric display',
  },
  {
    type: 'dynamic_widget',
    label: t('Dynamic Widget'),
    category: 'data',
    icon: <AppstoreOutlined />,
    description: t('Dynamic data widget'),
    preview: 'Real-time data widget',
  },

  // Advanced Blocks
  {
    type: 'html',
    label: t('HTML'),
    category: 'advanced',
    icon: <Html5Outlined />,
    description: t('Custom HTML code'),
    preview: 'Raw HTML content',
  },
  {
    type: 'menu',
    label: t('Menu'),
    category: 'advanced',
    icon: <MenuOutlined />,
    description: t('Navigation menu'),
    preview: 'Site navigation menu',
  },
  {
    type: 'breadcrumb',
    label: t('Breadcrumb'),
    category: 'advanced',
    icon: <LinkOutlined />,
    description: t('Breadcrumb navigation'),
    preview: 'Page path navigation',
  },
  {
    type: 'page_title',
    label: t('Page Title'),
    category: 'advanced',
    icon: <FontSizeOutlined />,
    description: t('Dynamic page title'),
    preview: 'Current page title',
  },
];

const BLOCK_CATEGORIES = [
  { key: 'all', label: t('All Blocks'), icon: <AppstoreOutlined /> },
  { key: 'basic', label: t('Basic'), icon: <FileTextOutlined /> },
  { key: 'layout', label: t('Layout'), icon: <LayoutOutlined /> },
  { key: 'media', label: t('Media'), icon: <PictureOutlined /> },
  { key: 'data', label: t('Data'), icon: <BarChartOutlined /> },
  { key: 'advanced', label: t('Advanced'), icon: <CodeOutlined /> },
];

const Container = styled.div`
  padding: 16px;
  background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
`;

const SearchBar = styled(Input.Search)`
  margin-bottom: 16px;
`;

const BlockGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
`;

const BlockCard = styled.div<{ selected?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  border: 2px solid
    ${({ theme, selected }) =>
      selected ? theme.colorPrimary || '#1890ff' : theme.colorBorder || '#e0e0e0'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 100px;

  &:hover {
    border-color: ${({ theme }) => theme.colorPrimary || '#1890ff'};
    background: ${({ theme }) => theme.colorBgTextHover || '#f0f0f0'};
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .anticon {
    font-size: 24px;
    margin-bottom: 8px;
    color: ${({ theme }) => theme.colorPrimary || '#1890ff'};
  }

  .block-label {
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    color: ${({ theme }) => theme.colorText || '#333'};
  }

  .block-description {
    font-size: 10px;
    color: ${({ theme }) => theme.colorTextSecondary || '#666'};
    text-align: center;
    margin-top: 4px;
    display: none;
  }

  &:hover .block-description {
    display: block;
  }
`;

const CategoryTabs = styled(Tabs)`
  .ant-tabs-tab {
    margin-right: 8px;
  }

  .ant-tabs-tab-btn {
    display: flex;
    align-items: center;
    gap: 4px;
  }
`;

const EmptyState = styled(Empty)`
  margin: 32px 0;
`;

interface EnhancedBlockMenuProps {
  onInsert: (blockType: string) => void;
  selectedCategory?: string;
  showSearch?: boolean;
  showCategories?: boolean;
}

export default function EnhancedBlockMenu({
  onInsert,
  selectedCategory = 'all',
  showSearch = true,
  showCategories = true,
}: EnhancedBlockMenuProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(selectedCategory);

  const filteredBlocks = useMemo(() => {
    return ENHANCED_BLOCK_TYPES.filter(block => {
      const matchesSearch =
        !search ||
        block.label.toLowerCase().includes(search.toLowerCase()) ||
        block.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        category === 'all' || block.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [search, category]);

  const blockCountByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: ENHANCED_BLOCK_TYPES.length };
    ENHANCED_BLOCK_TYPES.forEach(block => {
      counts[block.category] = (counts[block.category] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <Container>
      {showSearch && (
        <SearchBar
          placeholder={t('Search blocks...')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          prefix={<SearchOutlined />}
          allowClear
        />
      )}

      {showCategories && (
        <CategoryTabs activeKey={category} onChange={setCategory}>
          {BLOCK_CATEGORIES.map(cat => (
            <TabPane
              tab={
                <span>
                  {cat.icon}
                  {cat.label}
                  <Badge
                    count={blockCountByCategory[cat.key] || 0}
                    style={{ marginLeft: 4 }}
                  />
                </span>
              }
              key={cat.key}
            />
          ))}
        </CategoryTabs>
      )}

      {filteredBlocks.length > 0 ? (
        <BlockGrid>
          {filteredBlocks.map(block => (
            <Tooltip key={block.type} title={block.preview} placement="top">
              <BlockCard onClick={() => onInsert(block.type)}>
                {block.icon}
                <div className="block-label">{block.label}</div>
                <div className="block-description">{block.description}</div>
              </BlockCard>
            </Tooltip>
          ))}
        </BlockGrid>
      ) : (
        <EmptyState
          description={
            search
              ? t('No blocks found matching "%s"', search)
              : t('No blocks in this category')
          }
        />
      )}
    </Container>
  );
}