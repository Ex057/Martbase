# Martbase CMS & DHIS2 Integration - Implementation Checklist

**Project Goal:** Improve the CMS dynamic pages system, enhance user experience, and fix DHIS2 visualization issues.

---

## 🎯 HIGH PRIORITY - Core Functionality

### 1. Role-Based Authenticated Home Pages ⏳
**Status:** Not Started
**Priority:** HIGH
**Issue:** `authenticatedHomeRoleDashboardPaths` is defined in config but not implemented in the welcome logic.

- [ ] Modify `_configured_authenticated_home_target()` in `superset/views/core.py` to check role-based paths
- [ ] Implement role-to-dashboard mapping fallback chain:
  1. Check role-specific dashboard path from `authenticatedHomeRoleDashboardPaths`
  2. Fall back to global `authenticatedHomeDashboardId`
  3. Fall back to user's personal welcome dashboard
  4. Fall back to default welcome page
- [ ] Update Portal Settings UI to configure role-based dashboards
- [ ] Add role selector dropdown in CMS Admin → Portal Settings
- [ ] Add dashboard picker for each role
- [ ] Test with multiple roles (Admin, Data Management, Analytics, End user)
- [ ] Write unit tests for role-based routing logic

**Files to modify:**
- `superset/views/core.py` (lines 183-194)
- `superset-frontend/src/pages/CMSAdminPage/index.tsx` (Portal Settings tab)
- `tests/unit_tests/views/core_home_test.py`

---

### 2. End User Role Configuration ⏳
**Status:** Not Started
**Priority:** HIGH
**Goal:** End users should only see: Home dashboard → Dashboards → Charts (everything else hidden)

- [ ] Review current "End user" role permissions in `superset/security/manager.py`
- [ ] Ensure these permissions are REVOKED for End user:
  - [ ] SQL Lab access (`can_sqllab`, `can_sqllab_history`)
  - [ ] Database/Dataset lists (`can_list DatabaseView`, `can_list TableModelView`)
  - [ ] All CMS admin permissions (pages, media, menus, layout, themes, templates, styles)
  - [ ] DHIS2 Admin (`can_list DHIS2AdminView`)
  - [ ] AI Management (`can_list AIManagement`, `can_read AIManagement`, `can_write AIManagement`)
- [ ] Ensure these permissions are GRANTED for End user:
  - [ ] View shared dashboards (`can_read Dashboard`)
  - [ ] View shared charts (`can_read Chart`)
  - [ ] Access home page (`can_welcome`)
  - [ ] Basic menu navigation
- [ ] Hide menu items for End user role:
  - [ ] "Dynamic Pages" menu section
  - [ ] "SQL Lab" menu section
  - [ ] "Data" menu section
  - [ ] "Settings" menu section
- [ ] Test End user experience:
  - [ ] Login → redirects to configured dashboard
  - [ ] Can navigate to Dashboards list
  - [ ] Can navigate to Charts list
  - [ ] Cannot access hidden sections
- [ ] Update navigation menu logic in `superset-frontend/src/features/home/Menu.tsx`

**Files to modify:**
- `superset/security/manager.py` (PRODUCTION_CUSTOM_ROLE_SPECS)
- `superset-frontend/src/features/home/Menu.tsx`
- `tests/unit_tests/security/manager_test.py`

---

## 🎨 UI/UX Improvements

### 3. Simplify CMS Pages Interface ⏳
**Status:** Not Started
**Priority:** HIGH
**Issue:** CMS Admin has too much content that confuses users.

- [ ] Audit current CMS Admin UI tabs and features
- [ ] Identify rarely-used or confusing sections
- [ ] Consolidate related settings into fewer tabs
- [ ] Proposed simplified structure:
  - [ ] **Pages** - List and manage pages only
  - [ ] **Studio** - Visual page builder (simplified)
  - [ ] **Settings** - Portal settings, menus, themes combined
  - [ ] **Media** - Asset library
- [ ] Add contextual help tooltips
- [ ] Add getting started wizard for new users
- [ ] Reduce visual clutter in BlockStudio
- [ ] Hide advanced options behind "Advanced" collapsible sections

**Files to modify:**
- `superset-frontend/src/pages/CMSAdminPage/index.tsx`
- `superset-frontend/src/pages/CMSAdminPage/BlockStudio.tsx`

---

### 4. Improve Block Studio Drag-and-Drop UX ⏳
**Status:** Not Started
**Priority:** HIGH
**Goal:** Make the visual page builder easier and more intuitive to use.

#### 4.1 Visual Feedback Enhancements
- [ ] Add ghost preview when dragging blocks
- [ ] Show drop zones with highlight/outline
- [ ] Add grid snap-to guidelines (12-column grid markers)
- [ ] Show block dimensions (width x height) during resize
- [ ] Add hover state with action buttons (edit, duplicate, delete, move)
- [ ] Add visual indicators for nested blocks (indent levels)

#### 4.2 Keyboard Shortcuts
- [ ] Implement Ctrl+Z / Cmd+Z for undo
- [ ] Implement Ctrl+Y / Cmd+Y for redo
- [ ] Implement Ctrl+S / Cmd+S for save
- [ ] Implement Ctrl+D / Cmd+D for duplicate
- [ ] Implement Delete key to remove selected block
- [ ] Implement Arrow keys for fine-tuning position
- [ ] Add keyboard shortcut help overlay (Ctrl+?)

#### 4.3 Command History (Undo/Redo)
- [ ] Create EditorCommand type definition
- [ ] Implement history state management
- [ ] Track operations: insert, move, update, delete
- [ ] Add undo button to toolbar
- [ ] Add redo button to toolbar
- [ ] Show operation history panel (optional)
- [ ] Limit history to last 50 operations

#### 4.4 Block Templates & Patterns
- [ ] Create reusable block library
- [ ] Add common layout patterns:
  - [ ] Hero + 3 charts grid
  - [ ] Dashboard embed + sidebar
  - [ ] KPI band + content sections
  - [ ] Two-column text + chart
- [ ] Add preview thumbnails for templates
- [ ] One-click insert from template library

#### 4.5 Better Block Management
- [ ] Add block tree/outline view in sidebar
- [ ] Click block in tree to select in canvas
- [ ] Drag blocks in tree to reorder
- [ ] Show/hide blocks without deleting
- [ ] Lock blocks to prevent accidental changes
- [ ] Add block search/filter in large pages

**Files to modify:**
- `superset-frontend/src/pages/CMSAdminPage/BlockStudio.tsx`
- `superset-frontend/src/pages/PublicLandingPage/blockUtils.ts`

---

### 5. Dynamic Font Size Controls for CMS Pages ⏳
**Status:** Not Started
**Priority:** MEDIUM
**Goal:** All visuals and dashboards should have dynamic font size controls like DHIS2.

- [ ] Research current font size implementation in CMS pages
- [ ] Add global typography settings in Portal Settings:
  - [ ] Base font size (default: 16px)
  - [ ] Heading scales (H1-H6 multipliers)
  - [ ] Chart title font size
  - [ ] Chart label font size
  - [ ] Dashboard title font size
- [ ] Add per-block font size overrides:
  - [ ] Text block font size
  - [ ] Heading block font size
  - [ ] Chart block title/label sizes
- [ ] Add font size presets: Small, Normal, Large
- [ ] Ensure responsive scaling on mobile devices
- [ ] Update BlockStudio inspector panel with font controls
- [ ] Apply font sizes to rendered blocks in PublicLandingPage

**Files to modify:**
- `superset-frontend/src/pages/CMSAdminPage/index.tsx` (Portal Settings)
- `superset-frontend/src/pages/CMSAdminPage/BlockStudio.tsx` (Block Inspector)
- `superset-frontend/src/pages/PublicLandingPage/BlockRenderer.tsx`
- `superset/public_page/models.py` (PageLayoutConfig)
- `superset/public_page/styling.py`

---

## 📊 DHIS2 Visualization Improvements

### 6. Improve Auto-Generated Chart Titles ✅
**Status:** Research Complete - Ready for Implementation
**Priority:** HIGH
**Issue:** Chart titles use basic concatenation (e.g., "Uganda · 2024Q1 · Cases Reported") instead of professional phrasing.

**Research Findings:**

**Location:** `superset-frontend/src/dashboard/components/SliceHeader/index.tsx`

**Current Implementation Issues (Lines 252-273):**
1. Basic string concatenation with ` · ` separator
2. Only uses first metric, ignores others
3. No aggregation context (Sum, Average, etc.)
4. Period labels fall back to raw column names
5. Auto-title disabled by default
6. No templates or customization options

**Example Current Output:**
```
Uganda · 2024Q1 · Cases Reported
```

**Desired Professional Output:**
```
Cases Reported in Uganda during Q1 2024
or
Total Cases Reported across all districts, Last 12 months
```

**Implementation Tasks:**
- [ ] Refactor `buildAutoTitle()` function (Lines 252-273) to use templates:
  - [ ] Template: `{metric} in {orgUnit} during {period}`
  - [ ] Template: `{metric} across {orgUnitLevel}, {period}`
  - [ ] Template: `{aggregation} {metric} by {dimension}`
- [ ] Enhance `summarizeMetric()` (Lines 185-204):
  - [ ] Include aggregation type (Sum, Average, Count, etc.)
  - [ ] Handle multiple metrics gracefully ("3 indicators" or list top 2)
  - [ ] Extract from metric label or formData
- [ ] Improve `summarizeTimeRange()` (Lines 206-213):
  - [ ] Use DHIS2 period formatting utilities from `superset-ui-core/src/utils/dhis2Period.ts`
  - [ ] Convert period codes to readable phrases:
    - `202501` → "January 2025"
    - `2025Q1` → "Q1 2025" or "January – March 2025"
    - Multiple periods → "Last 12 months" (if relative)
- [ ] Add org unit hierarchy support:
  - [ ] Show level name instead of listing all units
  - [ ] "Chiefdom level units in Sierra Leone" not "Chiefdom A, Chiefdom B..."
- [ ] Enable auto-title by default in control panel (sections.tsx, Line 73)
- [ ] Add title template selector in chart options:
  - [ ] Auto (smart template selection)
  - [ ] Custom template with placeholders
  - [ ] Hidden
  - [ ] Static custom text
- [ ] Add title styling controls (new section in chartTitle.tsx):
  - [ ] Font size slider (12-32px)
  - [ ] Font weight (Normal/Bold)
  - [ ] Color picker
  - [ ] Alignment (Left/Center/Right)
  - [ ] Position (Above chart/Below chart)
- [ ] Add subtitle field with same template system

**Files to modify:**
- `superset-frontend/src/dashboard/components/SliceHeader/index.tsx` (Lines 185-273)
- `superset-frontend/src/explore/controlPanels/sections.tsx` (Lines 68-79)
- `superset-frontend/packages/superset-ui-chart-controls/src/sections/chartTitle.tsx`
- `superset-frontend/src/utils/dhis2MetricLabel.ts` (leverage existing utils)

---

### 7. Add Missing DHIS2 Visualization Settings ✅
**Status:** Research Complete - Ready for Implementation
**Priority:** HIGH
**Goal:** Match DHIS2 Data Visualizer appearance/style settings.

**Research Findings:**

**8 DHIS2/Health Chart Types Found:**
1. `dhis2_map` - DHIS2 Map (Choropleth) - Full control panel (1315 lines)
2. `small_multiples` - Small Multiples with DHIS2 preset support
3. `age_sex_pyramid` - Age-Sex Pyramid for demographics
4. `control_chart` - Statistical Process Control (SPC)
5. `cohort_cascade` - HIV/TB cascade analysis
6. `stock_status` - Pharmaceutical stock monitoring
7. `violin_distribution` - Statistical distribution widget
8. `comparison_kpi` - Multi-indicator comparison

**What's Currently Available (DHIS2 Map):**
- ✅ Color schemes (sequential/categorical) - Lines 632-838
- ✅ Legend configuration (position, display type) - Lines 1150-1201
- ✅ Label customization (font size, content) - Lines 1105-1148
- ✅ Map styling (opacity, borders, colors) - Lines 842-1102
- ✅ Boundary level colors - Lines 498-603

**Missing Features Identified:**

#### 7.1 Style Tab - All Chart Types
- [ ] **Value Label Controls:**
  - [ ] "Show values" toggle for data labels on charts
  - [ ] Value label font size/color/weight
  - [ ] Value label position (above/center/below)
  - [ ] Number format (thousands separator, decimals)
- [ ] **Color Set Selector (standardized):**
  - [ ] Default, Basic, Extended, Bright, Dark, Gray
  - [ ] Color blind safe palettes
  - [ ] Patterns (for printing/accessibility)
  - Currently: each chart has custom color scheme logic
- [ ] **Series/Legend Improvements:**
  - [ ] "No space between bars/columns" option
  - [ ] Legend font size control
  - [ ] Legend item spacing
  - [ ] Legend title customization
  - [ ] Custom legend item order
- [ ] **Title/Subtitle in Viz Config:**
  - Currently only at dashboard level
  - Need in-chart title/subtitle fields
  - Position controls (top/bottom/left/right)
- [ ] **Digit Group Separator:**
  - [ ] Global setting (Comma/Space/None)
  - [ ] Apply to all numeric displays

#### 7.2 Style Tab - Pivot Tables (NEW)
- [ ] Table title/subtitle controls
- [ ] Display density (Comfortable/Normal/Compact)
- [ ] Font size presets (Large/Normal/Small)
- [ ] Fix column headers to top (freeze)
- [ ] Fix row headers to left (freeze)
- [ ] Display organisation unit hierarchy path

#### 7.3 Legend Tab Enhancements
- [ ] Legend style for pivot tables (text color vs background color)
- [ ] Useful for scorecard-style visualizations
- [ ] Show legend key with value range descriptions

#### 7.4 Axes Tab for Standard Charts
- [ ] Apply to ECharts visualizations (Bar, Line, Area, etc.)
- [ ] Axis label styling (font size, color, bold/italic)
- Currently exists in some charts, needs standardization

**Hardcoded Limitations to Remove:**

1. **Small Multiples Chart Type Limits** (Lines 374-391):
   - Currently limited to 10 chart types
   - Should support all ECharts types (waterfall, funnel, etc.)

2. **DHIS2 Map Boundary Methods** (Lines 476-495):
   - Only 3 methods, one seems Uganda-specific (`ug_geojson`)
   - Need extensible geometry loader system

3. **Color Range Configuration** (Lines 785-798):
   - Manual breaks require comma-separated text input
   - Should have visual editor with +/- buttons

**Files to modify:**
- `superset-frontend/src/visualizations/DHIS2Map/controlPanel.ts` (1315 lines)
- `superset-frontend/src/visualizations/SmallMultiples/controlPanel.ts` (711 lines)
- `superset-frontend/src/visualizations/AgeSexPyramid/controlPanel.ts` (313 lines)
- `superset-frontend/src/visualizations/presets/MainPreset.js` (register new features)
- `superset-frontend/plugins/plugin-chart-echarts/src/Timeseries/Regular/Bar/controlPanel.tsx` (standardize)
- Create new shared control files:
  - `superset-frontend/packages/superset-ui-chart-controls/src/shared-controls/valueLabelControls.ts` (NEW)
  - `superset-frontend/packages/superset-ui-chart-controls/src/shared-controls/colorSetControls.ts` (NEW)
  - `superset-frontend/packages/superset-ui-chart-controls/src/shared-controls/legendControls.ts` (enhance existing)

---

### 8. Add DHIS2 Period Filter Functionality ⏳
**Status:** Research Pending
**Priority:** HIGH
**Issue:** Missing period selection for DHIS2 datasets.

**Research needed:**
- [ ] Find current period filter implementation
- [ ] Document what's missing vs DHIS2 native filters
- [ ] Find where period selection UI should be added

**Implementation tasks (after research):**
- [ ] Add relative period support:
  - [ ] Last X days/weeks/months/quarters/years
  - [ ] This day/week/month/quarter/year
  - [ ] Yesterday, Last week, Last month, etc.
- [ ] Add fixed period support:
  - [ ] Date range picker
  - [ ] Month picker
  - [ ] Quarter picker
  - [ ] Year picker
- [ ] Add period type selector
- [ ] Add multiple period selection
- [ ] Display selected periods as readable phrases
- [ ] Update chart queries to use selected periods
- [ ] Persist period filter state
- [ ] Add period filter to chart embed options

**Files to modify:** (TBD after research)

---

## 🔍 Research & Documentation

### 8.1 Fix Period Display on Public Pages (Quick Fix) ✅
**Status:** Research Complete
**Priority:** HIGH (Quick Fix)
**Issue:** Period codes show as raw digits (202603) instead of "March 2026" when logged out on public pages.

**Implementation Tasks:**
- [ ] Find where periods are displayed on public landing pages
- [ ] Ensure formatDhis2Period() is called for public views
- [ ] Fix PublicChartContainer to format period labels
- [ ] Test logged-in vs logged-out period display

**Files to modify:**
- `superset-frontend/src/pages/PublicLandingPage/PublicChartContainer.tsx`
- `superset-frontend/src/pages/PublicLandingPage/BlockRenderer.tsx`

---

### 9. DHIS2 Chart Issues - Comprehensive Audit ✅
**Status:** Completed
**Priority:** HIGH

Research agent completed with detailed findings. All sub-tasks updated above.

---

## 🧪 Testing & Validation

### 10. End-to-End User Testing ⏳
**Status:** Not Started
**Priority:** MEDIUM

- [ ] Test End User role workflow:
  - [ ] Create new End user account
  - [ ] Login and verify home dashboard redirect
  - [ ] Navigate dashboards and charts
  - [ ] Verify hidden menu sections
- [ ] Test different role home pages:
  - [ ] Admin sees admin home
  - [ ] Analytics sees analytics home
  - [ ] End user sees configured dashboard
- [ ] Test CMS page creation workflow
- [ ] Test Block Studio with new improvements
- [ ] Test DHIS2 chart customization
- [ ] Test period filters on DHIS2 data

---

## 📦 Deployment & Documentation

### 11. Documentation Updates ⏳
**Status:** Not Started
**Priority:** LOW

- [ ] Update user guide for simplified CMS interface
- [ ] Create Block Studio user guide with shortcuts
- [ ] Document role-based home page configuration
- [ ] Document DHIS2 visualization options
- [ ] Create End user onboarding guide

---

## Progress Summary

**Total Tasks:** 11 major areas
**Completed:** 2 (Checklist creation, DHIS2 research)
**In Progress:** 0
**Not Started:** 9
**Ready for Implementation:** 6 (with detailed specs from research)

**Next Steps:** Start with role-based home pages and End user configuration

---

## Notes & Decisions

- **CHECKLIST.md** is added to `.gitignore` for local tracking only
- Prioritizing role-based home pages and End user experience first
- DHIS2 improvements dependent on research findings
- UI/UX improvements can be done incrementally

---

**Last Updated:** 2026-07-07
**Next Review:** After DHIS2 research agent completes


Quick Win: Fix period display on public pages (30 min)
High Impact: Implement role-based home pages (2-3 hours)
User ExperienceQuality: Improve auto-generated titles 
Polish: Simplify CMS interface & improve Block Studio UX : Configure End user role properly (1-2 hours)
(1-2 days)
Advanced: Add DHIS2 viz settings & font controls (2-3 days)
