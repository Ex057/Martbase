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

import { CSSProperties, useState } from 'react';
import { styled, keyframes, t } from '@superset-ui/core';
import { PlusOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface DropZoneProps {
  isActive?: boolean;
  isOver?: boolean;
  position?: 'before' | 'after' | 'inside';
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  label?: string;
  style?: CSSProperties;
  className?: string;
}

const pulseAnimation = keyframes`
  0% {
    opacity: 0.4;
    transform: scaleX(1);
  }
  50% {
    opacity: 0.8;
    transform: scaleX(1.02);
  }
  100% {
    opacity: 0.4;
    transform: scaleX(1);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const DropZoneContainer = styled.div<{
  isActive?: boolean;
  isOver?: boolean;
  position?: 'before' | 'after' | 'inside';
}>`
  position: relative;
  min-height: ${({ position }) => (position === 'inside' ? '60px' : '4px')};
  margin: ${({ position }) =>
    position === 'inside' ? '8px 0' : position === 'before' ? '4px 0 8px 0' : '8px 0 4px 0'};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  transition: all 0.2s ease;

  ${({ isActive }) =>
    isActive &&
    `
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(32, 167, 201, 0.1),
        transparent
      );
      animation: ${pulseAnimation} 1.5s ease-in-out infinite;
    }
  `}

  ${({ isOver, position }) =>
    isOver &&
    position !== 'inside' &&
    `
    background: linear-gradient(
      90deg,
      transparent,
      rgba(32, 167, 201, 0.3),
      transparent
    );
    box-shadow: 0 0 10px rgba(32, 167, 201, 0.3);
    min-height: 8px;
  `}

  ${({ isOver, position }) =>
    isOver &&
    position === 'inside' &&
    `
    background: rgba(32, 167, 201, 0.05);
    border: 2px dashed rgba(32, 167, 201, 0.5);
    box-shadow: inset 0 0 10px rgba(32, 167, 201, 0.1);
  `}
`;

const DropIndicator = styled.div<{ isVisible?: boolean }>`
  display: ${({ isVisible }) => (isVisible ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  color: ${({ theme }) => theme.colorPrimary || '#1890ff'};
  font-size: 12px;
  font-weight: 500;
  animation: ${fadeIn} 0.3s ease;

  .anticon {
    font-size: 16px;
  }
`;

const DragGhost = styled.div<{ isDragging?: boolean }>`
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  opacity: ${({ isDragging }) => (isDragging ? 0.8 : 0)};
  transition: opacity 0.2s ease;
  background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
  border: 2px solid ${({ theme }) => theme.colorPrimary || '#1890ff'};
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
  padding: 12px 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 200px;

  .ghost-icon {
    font-size: 20px;
    color: ${({ theme }) => theme.colorPrimary || '#1890ff'};
  }

  .ghost-label {
    font-size: 14px;
    font-weight: 500;
    color: ${({ theme }) => theme.colorText || '#333'};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const BlockOutline = styled.div<{ isSelected?: boolean; isDragOver?: boolean }>`
  position: relative;
  outline: ${({ isSelected, isDragOver, theme }) =>
    isSelected
      ? `2px solid ${theme.colorPrimary || '#1890ff'}`
      : isDragOver
      ? `2px dashed ${theme.colorPrimaryHover || '#69c0ff'}`
      : 'none'};
  outline-offset: 2px;
  border-radius: ${({ theme }) => theme.borderRadius || 4}px;
  transition: outline 0.2s ease;

  &::after {
    content: '';
    position: absolute;
    top: -4px;
    left: -4px;
    right: -4px;
    bottom: -4px;
    pointer-events: none;
    border-radius: ${({ theme }) => theme.borderRadius}px;
    background: ${({ isDragOver }) =>
      isDragOver ? 'rgba(32, 167, 201, 0.05)' : 'transparent'};
    transition: background 0.2s ease;
  }
`;

const InsertionPoint = styled.div<{ isVisible?: boolean }>`
  position: relative;
  height: ${({ isVisible }) => (isVisible ? '32px' : '0')};
  margin: ${({ isVisible }) => (isVisible ? '8px 0' : '0')};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    background: ${({ theme, isVisible }) =>
      isVisible ? theme.colorPrimary || '#1890ff' : 'transparent'};
    transform: translateY(-50%);
  }

  button {
    position: relative;
    z-index: 1;
    background: ${({ theme }) => theme.colorBgLayout || '#f8f9fa'};
    border: 1px solid ${({ theme }) => theme.colorPrimary || '#1890ff'};
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: ${({ isVisible }) => (isVisible ? 'flex' : 'none')};
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: ${({ theme }) => theme.colorPrimaryBgHover || '#e6f7ff'};
      transform: scale(1.1);
    }
  }
`;

export function DropZone({
  isActive = false,
  isOver = false,
  position = 'after',
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  label,
  style,
  className,
}: DropZoneProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDragOver) onDragOver(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) onDrop(e);
  };

  return (
    <DropZoneContainer
      isActive={isActive}
      isOver={isOver}
      position={position}
      onDragOver={handleDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
      style={style}
      className={className}
    >
      <DropIndicator isVisible={isOver}>
        {position === 'inside' ? <PlusOutlined /> : <ArrowDownOutlined />}
        <span>{label || t('Drop here')}</span>
      </DropIndicator>
    </DropZoneContainer>
  );
}

interface DragGhostProps {
  isDragging: boolean;
  x: number;
  y: number;
  icon?: React.ReactNode;
  label: string;
}

export function DragGhostOverlay({ isDragging, x, y, icon, label }: DragGhostProps) {
  if (!isDragging) return null;

  return (
    <DragGhost
      isDragging={isDragging}
      style={{
        left: x + 16,
        top: y + 16,
      }}
    >
      <span className="ghost-icon">{icon}</span>
      <span className="ghost-label">{label}</span>
    </DragGhost>
  );
}

export function BlockDragOutline({
  isSelected = false,
  isDragOver = false,
  children,
}: {
  isSelected?: boolean;
  isDragOver?: boolean;
  children: React.ReactNode;
}) {
  return (
    <BlockOutline isSelected={isSelected} isDragOver={isDragOver}>
      {children}
    </BlockOutline>
  );
}

export function BlockInsertionPoint({
  isVisible = false,
  onClick,
}: {
  isVisible?: boolean;
  onClick?: () => void;
}) {
  return (
    <InsertionPoint isVisible={isVisible}>
      {isVisible && (
        <button onClick={onClick} type="button">
          <PlusOutlined />
        </button>
      )}
    </InsertionPoint>
  );
}

// Export a hook for managing drag state
export function useDragDropState() {
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>('after');
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleDragStart = (item: any, e: React.DragEvent) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    if (e.dataTransfer.setDragImage) {
      // Create a custom drag image
      const dragImage = new Image();
      dragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
      e.dataTransfer.setDragImage(dragImage, 0, 0);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverTarget(null);
    setDropPosition('after');
  };

  const handleDragOver = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(targetId);

    // Determine drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDropPosition('before');
    } else if (y > height * 0.75) {
      setDropPosition('after');
    } else {
      setDropPosition('inside');
    }

    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (targetId: string, e: React.DragEvent, onDrop: (item: any, position: string) => void) => {
    e.preventDefault();
    if (draggedItem) {
      onDrop(draggedItem, dropPosition);
    }
    handleDragEnd();
  };

  return {
    draggedItem,
    dragOverTarget,
    dropPosition,
    mousePosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}