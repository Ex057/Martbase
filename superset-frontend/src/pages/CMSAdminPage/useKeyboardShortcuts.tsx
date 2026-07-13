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

import { useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { t } from '@superset-ui/core';

export interface KeyboardShortcutActions {
  duplicateBlock?: (blockUid: string) => void;
  removeBlock?: (blockUid: string) => void;
  moveBlockUp?: (blockUid: string) => void;
  moveBlockDown?: (blockUid: string) => void;
  copyBlock?: (blockUid: string) => void;
  pasteBlock?: () => void;
  undo?: () => void;
  redo?: () => void;
  save?: () => void;
  preview?: () => void;
  toggleViewMode?: () => void;
  selectAllBlocks?: () => void;
  deselectAllBlocks?: () => void;
  createNewBlock?: (type?: string) => void;
  searchBlocks?: () => void;
  toggleSidebar?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  resetZoom?: () => void;
}

export interface UseKeyboardShortcutsOptions {
  selectedBlockUid?: string | null;
  actions: KeyboardShortcutActions;
  enabled?: boolean;
  showHelp?: boolean;
}

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
}

// Define all keyboard shortcuts
const SHORTCUTS: Record<string, Shortcut> = {
  // Block operations
  DUPLICATE: { key: 'd', meta: true, description: t('Duplicate block') },
  DELETE: { key: 'Delete', meta: false, description: t('Delete block') },
  BACKSPACE: { key: 'Backspace', meta: false, description: t('Delete block') },
  COPY: { key: 'c', meta: true, description: t('Copy block') },
  PASTE: { key: 'v', meta: true, description: t('Paste block') },
  CUT: { key: 'x', meta: true, description: t('Cut block') },

  // Navigation
  MOVE_UP: { key: 'ArrowUp', alt: true, description: t('Move block up') },
  MOVE_DOWN: { key: 'ArrowDown', alt: true, description: t('Move block down') },

  // History
  UNDO: { key: 'z', meta: true, description: t('Undo') },
  REDO: { key: 'z', meta: true, shift: true, description: t('Redo') },

  // File operations
  SAVE: { key: 's', meta: true, description: t('Save') },

  // View operations
  PREVIEW: { key: 'p', meta: true, shift: true, description: t('Toggle preview') },
  TOGGLE_MODE: { key: 'e', meta: true, description: t('Toggle edit mode') },

  // Selection
  SELECT_ALL: { key: 'a', meta: true, description: t('Select all blocks') },
  DESELECT_ALL: { key: 'Escape', meta: false, description: t('Deselect all') },

  // Creation
  NEW_BLOCK: { key: 'n', meta: true, description: t('New block') },
  NEW_TEXT: { key: 't', meta: true, description: t('New text block') },
  NEW_IMAGE: { key: 'i', meta: true, description: t('New image block') },

  // UI
  SEARCH: { key: 'f', meta: true, description: t('Search blocks') },
  TOGGLE_SIDEBAR: { key: 'b', meta: true, description: t('Toggle sidebar') },

  // Zoom
  ZOOM_IN: { key: '=', meta: true, description: t('Zoom in') },
  ZOOM_OUT: { key: '-', meta: true, description: t('Zoom out') },
  RESET_ZOOM: { key: '0', meta: true, description: t('Reset zoom') },

  // Help
  SHOW_HELP: { key: '?', shift: true, description: t('Show shortcuts help') },
};

export function useKeyboardShortcuts({
  selectedBlockUid,
  actions,
  enabled = true,
  showHelp = true,
}: UseKeyboardShortcutsOptions) {
  const copiedBlockRef = useRef<any>(null);

  const showShortcutsHelp = useCallback(() => {
    const helpText = Object.values(SHORTCUTS)
      .map(shortcut => {
        let keys = [];
        if (shortcut.meta) keys.push('⌘/Ctrl');
        if (shortcut.shift) keys.push('Shift');
        if (shortcut.alt) keys.push('Alt');
        keys.push(shortcut.key);
        return `${keys.join('+')} - ${shortcut.description}`;
      })
      .join('\n');

    const fullMessage = `${t('Keyboard Shortcuts')}\n\n${helpText}`;

    message.info(fullMessage, 10);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const isContentEditable = target.contentEditable === 'true';

      // Allow some shortcuts even in input fields
      const allowInInput = ['SAVE', 'UNDO', 'REDO', 'SHOW_HELP'];

      // Check each shortcut
      Object.entries(SHORTCUTS).forEach(([name, shortcut]) => {
        const matchesMeta = shortcut.meta ? event.metaKey || event.ctrlKey : !shortcut.meta!;
        const matchesShift = shortcut.shift ? event.shiftKey : !shortcut.shift!;
        const matchesAlt = shortcut.alt ? event.altKey : !shortcut.alt!;
        const matchesKey = event.key === shortcut.key || event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (matchesMeta && matchesShift && matchesAlt && matchesKey) {
          // Skip if in input and not allowed
          if ((isInput || isContentEditable) && !allowInInput.includes(name)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          switch (name) {
            // Block operations
            case 'DUPLICATE':
              if (selectedBlockUid && actions.duplicateBlock) {
                actions.duplicateBlock(selectedBlockUid);
                message.success(t('Block duplicated'));
              }
              break;

            case 'DELETE':
            case 'BACKSPACE':
              if (selectedBlockUid && actions.removeBlock && !isInput && !isContentEditable) {
                actions.removeBlock(selectedBlockUid);
                message.success(t('Block deleted'));
              }
              break;

            case 'COPY':
              if (selectedBlockUid && actions.copyBlock) {
                actions.copyBlock(selectedBlockUid);
                copiedBlockRef.current = selectedBlockUid;
                message.success(t('Block copied'));
              }
              break;

            case 'PASTE':
              if (copiedBlockRef.current && actions.pasteBlock) {
                actions.pasteBlock();
                message.success(t('Block pasted'));
              }
              break;

            case 'CUT':
              if (selectedBlockUid && actions.copyBlock && actions.removeBlock) {
                actions.copyBlock(selectedBlockUid);
                copiedBlockRef.current = selectedBlockUid;
                actions.removeBlock(selectedBlockUid);
                message.success(t('Block cut'));
              }
              break;

            // Navigation
            case 'MOVE_UP':
              if (selectedBlockUid && actions.moveBlockUp) {
                actions.moveBlockUp(selectedBlockUid);
              }
              break;

            case 'MOVE_DOWN':
              if (selectedBlockUid && actions.moveBlockDown) {
                actions.moveBlockDown(selectedBlockUid);
              }
              break;

            // History
            case 'UNDO':
              if (actions.undo) {
                actions.undo();
                message.success(t('Undone'));
              }
              break;

            case 'REDO':
              if (actions.redo) {
                actions.redo();
                message.success(t('Redone'));
              }
              break;

            // File operations
            case 'SAVE':
              if (actions.save) {
                actions.save();
                message.success(t('Saved'));
              }
              break;

            // View operations
            case 'PREVIEW':
              if (actions.preview) {
                actions.preview();
              }
              break;

            case 'TOGGLE_MODE':
              if (actions.toggleViewMode) {
                actions.toggleViewMode();
              }
              break;

            // Selection
            case 'SELECT_ALL':
              if (actions.selectAllBlocks && !isInput && !isContentEditable) {
                actions.selectAllBlocks();
              }
              break;

            case 'DESELECT_ALL':
              if (actions.deselectAllBlocks) {
                actions.deselectAllBlocks();
              }
              break;

            // Creation
            case 'NEW_BLOCK':
              if (actions.createNewBlock && !isInput && !isContentEditable) {
                actions.createNewBlock();
              }
              break;

            case 'NEW_TEXT':
              if (actions.createNewBlock && !isInput && !isContentEditable) {
                actions.createNewBlock('paragraph');
              }
              break;

            case 'NEW_IMAGE':
              if (actions.createNewBlock && !isInput && !isContentEditable) {
                actions.createNewBlock('image');
              }
              break;

            // UI
            case 'SEARCH':
              if (actions.searchBlocks && !isInput && !isContentEditable) {
                actions.searchBlocks();
              }
              break;

            case 'TOGGLE_SIDEBAR':
              if (actions.toggleSidebar) {
                actions.toggleSidebar();
              }
              break;

            // Zoom
            case 'ZOOM_IN':
              if (actions.zoomIn) {
                actions.zoomIn();
              }
              break;

            case 'ZOOM_OUT':
              if (actions.zoomOut) {
                actions.zoomOut();
              }
              break;

            case 'RESET_ZOOM':
              if (actions.resetZoom) {
                actions.resetZoom();
              }
              break;

            // Help
            case 'SHOW_HELP':
              if (showHelp) {
                showShortcutsHelp();
              }
              break;

            default:
              break;
          }
        }
      });
    },
    [enabled, selectedBlockUid, actions, showHelp, showShortcutsHelp],
  );

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [enabled, handleKeyDown]);

  return {
    showShortcutsHelp,
  };
}

// Export shortcuts reference for documentation
export { SHORTCUTS };