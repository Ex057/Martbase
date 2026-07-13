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

import { useState, useCallback, useRef, useEffect } from 'react';
import { message } from 'antd';
import { t } from '@superset-ui/core';

interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UndoRedoOptions {
  maxHistorySize?: number;
  debounceMs?: number;
  onStateChange?: (state: any) => void;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UndoRedoOptions = {},
) {
  const {
    maxHistorySize = 50,
    debounceMs = 500,
    onStateChange,
  } = options;

  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<T>(initialState);

  // Save current state to history
  const saveToHistory = useCallback((newState: T) => {
    setState(prevState => {
      // Don't save if state hasn't changed
      if (JSON.stringify(prevState.present) === JSON.stringify(newState)) {
        return prevState;
      }

      // Limit history size
      const past = [...prevState.past, prevState.present];
      if (past.length > maxHistorySize) {
        past.shift(); // Remove oldest entry
      }

      return {
        past,
        present: newState,
        future: [], // Clear future when new change is made
      };
    });

    if (onStateChange) {
      onStateChange(newState);
    }
  }, [maxHistorySize, onStateChange]);

  // Debounced save to history
  const debouncedSave = useCallback((newState: T) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Update present immediately for UI responsiveness
    setState(prev => ({
      ...prev,
      present: newState,
    }));

    // Debounce the actual history save
    debounceTimerRef.current = setTimeout(() => {
      saveToHistory(newState);
      lastSavedStateRef.current = newState;
    }, debounceMs);
  }, [saveToHistory, debounceMs]);

  // Update state immediately without debouncing
  const updateStateImmediate = useCallback((newState: T) => {
    saveToHistory(newState);
    lastSavedStateRef.current = newState;
  }, [saveToHistory]);

  // Undo to previous state
  const undo = useCallback(() => {
    setState(prevState => {
      if (prevState.past.length === 0) {
        message.info(t('Nothing to undo'));
        return prevState;
      }

      const previous = prevState.past[prevState.past.length - 1];
      const newPast = prevState.past.slice(0, prevState.past.length - 1);

      if (onStateChange) {
        onStateChange(previous);
      }

      return {
        past: newPast,
        present: previous,
        future: [prevState.present, ...prevState.future],
      };
    });
  }, [onStateChange]);

  // Redo to future state
  const redo = useCallback(() => {
    setState(prevState => {
      if (prevState.future.length === 0) {
        message.info(t('Nothing to redo'));
        return prevState;
      }

      const next = prevState.future[0];
      const newFuture = prevState.future.slice(1);

      if (onStateChange) {
        onStateChange(next);
      }

      return {
        past: [...prevState.past, prevState.present],
        present: next,
        future: newFuture,
      };
    });
  }, [onStateChange]);

  // Reset to initial state
  const reset = useCallback((newInitialState?: T) => {
    const resetState = newInitialState || initialState;
    setState({
      past: [],
      present: resetState,
      future: [],
    });

    if (onStateChange) {
      onStateChange(resetState);
    }
  }, [initialState, onStateChange]);

  // Clear all history
  const clearHistory = useCallback(() => {
    setState(prevState => ({
      past: [],
      present: prevState.present,
      future: [],
    }));
  }, []);

  // Get history stats
  const getHistoryInfo = useCallback(() => ({
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    historyLength: state.past.length,
    futureLength: state.future.length,
    totalChanges: state.past.length + state.future.length,
  }), [state]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    state: state.present,
    setState: debouncedSave,
    setStateImmediate: updateStateImmediate,
    undo,
    redo,
    reset,
    clearHistory,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    historyInfo: getHistoryInfo(),
  };
}

// History viewer component interface for debugging
// The actual component should be implemented in a separate .tsx file if needed
export interface HistoryViewerProps<T> {
  history: UndoRedoState<T>;
  onJumpTo: (index: number, type: 'past' | 'future') => void;
}

// Action tracker for named changes
export interface TrackedAction {
  id: string;
  name: string;
  timestamp: number;
  type: 'add' | 'edit' | 'delete' | 'move' | 'style' | 'other';
  details?: any;
}

export function useActionTracker(maxActions = 20) {
  const [actions, setActions] = useState<TrackedAction[]>([]);

  const trackAction = useCallback((action: Omit<TrackedAction, 'id' | 'timestamp'>) => {
    const newAction: TrackedAction = {
      ...action,
      id: `action-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };

    setActions(prev => {
      const updated = [newAction, ...prev];
      if (updated.length > maxActions) {
        return updated.slice(0, maxActions);
      }
      return updated;
    });

    return newAction.id;
  }, [maxActions]);

  const clearActions = useCallback(() => {
    setActions([]);
  }, []);

  const getRecentActions = useCallback((count = 5) => {
    return actions.slice(0, count);
  }, [actions]);

  return {
    actions,
    trackAction,
    clearActions,
    getRecentActions,
  };
}