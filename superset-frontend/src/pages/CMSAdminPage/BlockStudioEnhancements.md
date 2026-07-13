# Block Studio Enhancement Integration Guide

## Overview

This guide shows how to integrate the newly created enhancement components into the existing BlockStudio component.

## Files Created

1. **EnhancedBlockMenu.tsx** - Visual block library with search and categories
2. **useKeyboardShortcuts.ts** - Keyboard shortcut hooks
3. **DragDropIndicators.tsx** - Visual drag & drop indicators
4. **TabbedPropertiesPanel.tsx** - Tabbed properties panel with style presets
5. **useUndoRedo.ts** - Undo/redo functionality

## Integration Steps

### 1. Import the New Components

Add these imports to `BlockStudio.tsx`:

```typescript
import EnhancedBlockMenu from './EnhancedBlockMenu';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import {
  DropZone,
  DragGhostOverlay,
  BlockDragOutline,
  useDragDropState
} from './DragDropIndicators';
import TabbedPropertiesPanel from './TabbedPropertiesPanel';
import { useUndoRedo, useActionTracker } from './useUndoRedo';
```

### 2. Initialize Hooks in BlockStudio

```typescript
export default function BlockStudio({ ... }) {
  // ... existing state ...

  // Initialize undo/redo
  const {
    state: pageState,
    setState: setPageState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo(draftPage, {
    maxHistorySize: 30,
    debounceMs: 500,
    onStateChange: onChangeDraftPage,
  });

  // Initialize action tracker
  const { trackAction, getRecentActions } = useActionTracker();

  // Initialize drag & drop
  const {
    draggedItem,
    dragOverTarget,
    dropPosition,
    mousePosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDragDropState();

  // Initialize keyboard shortcuts
  const keyboardActions = {
    duplicateBlock: (uid: string) => {
      duplicateBlockByUid(draftPage.blocks, uid);
      trackAction({ name: 'Duplicate block', type: 'add' });
    },
    removeBlock: (uid: string) => {
      removeBlockByUid(draftPage.blocks, uid);
      trackAction({ name: 'Delete block', type: 'delete' });
    },
    undo,
    redo,
    save: handleSave,
    preview: () => setCanvasMode(canvasMode === 'preview' ? 'compose' : 'preview'),
    toggleSidebar: () => setDesktopDockedPanels(!desktopDockedPanels),
  };

  useKeyboardShortcuts({
    selectedBlockUid: selectedBlock?.uid,
    actions: keyboardActions,
    enabled: !isPublishedPage,
  });

  // ... rest of component
}
```

### 3. Replace Block Insertion Menu

Replace the existing block insertion UI with the enhanced menu:

```typescript
// Replace the old block insertion drawer content with:
<Drawer
  title={t('Add Block')}
  placement="right"
  open={showBlockMenu}
  onClose={() => setShowBlockMenu(false)}
  width={400}
>
  <EnhancedBlockMenu
    onInsert={(blockType) => {
      insertBlock(blockType);
      setShowBlockMenu(false);
      trackAction({ name: `Add ${blockType} block`, type: 'add' });
    }}
    showSearch
    showCategories
  />
</Drawer>
```

### 4. Add Drag & Drop Indicators

Wrap block elements with drag indicators:

```typescript
// In the block rendering section:
<BlockDragOutline
  isSelected={selectedBlock?.uid === block.uid}
  isDragOver={dragOverTarget === block.uid}
>
  <div
    draggable
    onDragStart={(e) => handleDragStart(block, e)}
    onDragEnd={handleDragEnd}
    onDragOver={(e) => handleDragOver(block.uid, e)}
    onDragLeave={handleDragLeave}
    onDrop={(e) => handleDrop(block.uid, e, handleBlockDrop)}
  >
    {/* Existing block content */}
    <RenderBlockTree block={block} />
  </div>
</BlockDragOutline>

{/* Add drop zones between blocks */}
<DropZone
  isActive={draggedItem !== null}
  isOver={dragOverTarget === `after-${block.uid}` && dropPosition === 'after'}
  position="after"
  onDrop={(e) => handleDropAfter(block, e)}
  label={t('Insert here')}
/>

{/* Add drag ghost overlay */}
<DragGhostOverlay
  isDragging={!!draggedItem}
  x={mousePosition.x}
  y={mousePosition.y}
  icon={getBlockIcon(draggedItem?.block_type)}
  label={draggedItem?.label || t('Block')}
/>
```

### 5. Replace Properties Panel

Replace the existing properties panel with the tabbed version:

```typescript
// Replace the existing properties panel with:
<TabbedPropertiesPanel
  block={selectedBlock}
  contentProperties={[
    {
      key: 'title',
      label: t('Title'),
      type: 'text',
      value: selectedBlock?.content?.title || '',
      group: 'General',
    },
    // Add more content properties
  ]}
  styleProperties={[
    {
      key: 'backgroundColor',
      label: t('Background Color'),
      type: 'color',
      value: selectedBlock?.styles?.backgroundColor || '#ffffff',
      group: 'colors',
    },
    {
      key: 'padding',
      label: t('Padding'),
      type: 'slider',
      value: selectedBlock?.styles?.padding || 16,
      min: 0,
      max: 64,
      step: 4,
      group: 'spacing',
    },
    // Add more style properties
  ]}
  advancedProperties={[
    {
      key: 'cssClass',
      label: t('CSS Class'),
      type: 'text',
      value: selectedBlock?.settings?.cssClass || '',
      tooltip: t('Custom CSS class names'),
    },
    // Add more advanced properties
  ]}
  onPropertyChange={(key, value) => {
    updateBlockProperty(selectedBlock.uid, key, value);
    trackAction({ name: `Update ${key}`, type: 'edit' });
  }}
  isReadOnly={isPublishedPage}
/>
```

### 6. Add Undo/Redo Controls

Add undo/redo buttons to the toolbar:

```typescript
<Space>
  <Button
    icon={<UndoOutlined />}
    onClick={undo}
    disabled={!canUndo || isPublishedPage}
    title={t('Undo (Cmd+Z)')}
  />
  <Button
    icon={<RedoOutlined />}
    onClick={redo}
    disabled={!canRedo || isPublishedPage}
    title={t('Redo (Cmd+Shift+Z)')}
  />
  <Button
    icon={<QuestionCircleOutlined />}
    onClick={() => message.info(t('Press Shift+? for keyboard shortcuts'))}
    title={t('Keyboard Shortcuts')}
  />
</Space>
```

## Usage Examples

### Using the Enhanced Block Menu

```typescript
// Standalone usage
<EnhancedBlockMenu
  onInsert={(blockType) => console.log('Insert:', blockType)}
  selectedCategory="data"
  showSearch={true}
/>
```

### Using Keyboard Shortcuts

```typescript
// The shortcuts are automatically active when the component mounts
// Press Shift+? to see all available shortcuts
// Common shortcuts:
// - Cmd/Ctrl+D: Duplicate block
// - Delete: Delete block
// - Cmd/Ctrl+Z: Undo
// - Cmd/Ctrl+Shift+Z: Redo
// - Cmd/Ctrl+S: Save
```

### Using Drag & Drop

```typescript
// Blocks are automatically draggable
// Visual indicators show where blocks can be dropped
// The ghost overlay follows the cursor during drag
```

### Using the Tabbed Properties Panel

```typescript
// The panel automatically organizes properties into logical groups
// Style presets provide quick styling options
// Responsive controls allow per-device settings
```

## Benefits

1. **Improved User Experience**: Visual block library makes it easier to find and insert blocks
2. **Faster Workflows**: Keyboard shortcuts speed up common tasks
3. **Better Visual Feedback**: Drag & drop indicators make it clear where blocks will be placed
4. **Organized Properties**: Tabbed panel makes it easier to find and modify settings
5. **Safety**: Undo/redo prevents accidental data loss
6. **Professional Feel**: The enhancements make the studio feel like a commercial page builder

## Performance Considerations

- The undo/redo system uses debouncing to prevent excessive memory usage
- Drag & drop uses React's built-in drag events for efficiency
- The enhanced block menu uses memoization to prevent unnecessary re-renders
- Properties panel updates are batched for better performance

## Next Steps

1. Test the integration thoroughly
2. Add animations for smoother transitions
3. Implement block templates and patterns
4. Add collaborative editing features
5. Integrate with version control
6. Add export/import capabilities

## Troubleshooting

### Keyboard shortcuts not working
- Check that the component is not in read-only mode
- Ensure focus is not in an input field
- Verify that `enabled` prop is true

### Drag & drop not working
- Ensure blocks have the draggable attribute
- Check that event handlers are properly attached
- Verify that the drag state is being managed correctly

### Undo/redo not working
- Check that state changes are being tracked
- Ensure debounce time is appropriate
- Verify that the history size limit hasn't been reached

### Properties not updating
- Check that onPropertyChange is properly wired
- Ensure the block is not in read-only mode
- Verify that the property key matches the expected format