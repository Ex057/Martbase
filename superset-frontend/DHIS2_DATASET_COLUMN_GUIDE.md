# DHIS2 Dataset Column Flow & Verification Guide

## Expected Column Structure

Your dataset should have **10 total columns** organized as follows:

```
Dataset Columns (10 total)
├── Organization Hierarchy (5 levels)
│   ├── Level 1: National
│   ├── Level 2: Region
│   ├── Level 3: District
│   ├── Level 4: Sub County/Town Council/Div
│   └── Level 5: Health Facility
├── Time Dimension (1)
│   └── Period
└── Data Elements (4)
    ├── 105-EP01a. Suspected fever
    ├── 105-EP01b. Malaria Total
    ├── 105-EP01c. Malaria Confirmed (B/s and RDT Positive)
    └── 105-EP01d. Malaria cases treated
```

## Column Data Mapping

| Column Type | Format | Example |
|---|---|---|
| Hierarchy Level | `ou_level_1`, `ou_level_2`, ... `ou_level_5` | `ou_level_1` = "National", `ou_level_3` = "Kampala District" |
| Period | `period` | `202401` (YYYYMM for monthly) |
| Data Element | `de_{uid}` | `de_fbfJHSPpUQD` (matched with display name) |

## Verification Workflow

### Step 1: Column Preview (Before Save)

**Location**: Dataset Wizard → Step 5: "Column Preview"

**What to verify**:
1. Check console for log: `[StepColumnPreview] Generated columns:`
2. Verify counts match expected structure:
   ```
   hierarchyLevels: 5
   periodColumns: 1
   dataElementColumns: 4
   Total: 10
   ```

**Console Output Example**:
```
[StepColumnPreview] Generated columns: {
  count: 10,
  hierarchyLevels: 5,
  periodColumns: 1,
  dataElementColumns: 4,
  columns: [
    { name: 'ou_level_1', title: 'National' },
    { name: 'ou_level_2', title: 'Region' },
    ...
    { name: 'period', title: 'Period' },
    { name: 'de_fbfJHSPpUQD', title: '105-EP01a. Suspected fever' },
    ...
  ]
}
```

### Step 2: Data Preview (Generate Sample Data)

**Location**: Dataset Wizard → Step 6: "Data Preview"

**What to verify**:
1. Check console for: `[StepDataPreview] Fetching data with payload:`
   - Verify `include_children` value matches your selection
   - Verify all data elements are included
   - Verify periods are in correct format (YYYYMM for monthly)
   
2. Check console for: `[StepDataPreview] Generated column metadata:`
   - Should show same 10 columns as Column Preview step
   - Verify metadata includes `verbose_name` (display name for each column)

3. Verify sample data table shows:
   - All 10 columns in header
   - Row data populated for all columns
   - Period values in YYYYMM format
   - Hierarchy levels showing org unit names
   - Data element columns showing numeric values

**Console Output Example**:
```
[StepDataPreview] Generated column metadata: {
  count: 10,
  metadata: [
    { name: 'ou_level_1', type: 'STRING', verbose_name: 'National', is_dttm: false },
    { name: 'ou_level_2', type: 'STRING', verbose_name: 'Region', is_dttm: false },
    ...
    { name: 'period', type: 'STRING', verbose_name: 'Period', is_dttm: true },
    { name: 'de_fbfJHSPpUQD', type: 'STRING', verbose_name: '105-EP01a. Suspected fever', is_dttm: false },
    ...
  ]
}
```

### Step 3: Save Dataset

**Location**: Dataset Wizard → Step 7: "Review & Complete Setup"

**What to verify**:
1. Review Summary shows:
   - Dataset name
   - All data elements listed
   - All periods listed
   - Org units (with or without children)

2. Check console for: `[DHIS2 Wizard] Saving columns:`
   - Should show all 10 columns being saved
   - Example output:
   ```
   [DHIS2 Wizard] Saving columns: {
     columnCount: 10,
     columns: [
       { name: 'ou_level_1', ... },
       ...
     ]
   }
   ```

3. After save success, wizard redirects to Chart builder with pre-selected dataset

## Troubleshooting

### Issue: Column Preview shows fewer than 10 columns

**Possible causes**:
1. **Missing hierarchy levels**: Check if all 5 org unit levels are being returned from DHIS2
   - Console check: Look for hierarchy level count in `[StepColumnPreview] Generated columns:`
   - Solution: Ensure you selected org units from different hierarchy levels

2. **Missing data elements**: Check if all 4 data elements are included
   - Console check: Verify `dataElementColumns: 4` in column preview log
   - Solution: Verify all 4 data elements were selected in Step 2

3. **Missing period column**: Check if period is included
   - Console check: Verify `periodColumns: 1` in column preview log
   - Solution: Verify at least 1 period was selected in Step 3

### Issue: Data Preview shows no records (empty table)

**Possible causes**:
1. **Include Children not working**: Toggle the radio button and click "Refresh Data"
   - Console check: Verify `include_children` value in `[StepDataPreview] Fetching data with payload:`
   
2. **Period format issue**: Fixed periods must be YYYYMM format
   - Console check: Look for period values in `[StepDataPreview] Fetching data with payload:`
   - Example: `202401` (Jan 2024), NOT `January 2024`

3. **API connection issue**: Check browser console for error messages
   - Console check: Look for `[StepDataPreview] Error fetching data:` with error details

### Issue: Saved dataset doesn't show columns in Chart Creator

**Possible causes**:
1. **Columns not saved**: Check if columns were actually saved
   - Console check: Verify `[DHIS2 Wizard] Saving columns:` shows all 10 columns
   - Look in browser console during save for any errors

2. **Dataset refresh failed**: Column discovery may have failed
   - Console check: Look for `[DHIS2 Wizard] Background refresh` messages
   - Solution: Manually refresh the dataset in Admin panel

3. **Cache issue**: Clear browser cache
   - Press `F12` → DevTools
   - Right-click refresh button → "Empty cache and hard refresh"

## Step-by-Step Console Log Checklist

Use this checklist to verify each step of the wizard:

```
✓ Step 2 (Data Elements): [StepDataElements] logs period selections
✓ Step 3 (Periods):
  - [StepPeriods] Fetching fixed periods: with periodType and year
  - [StepPeriods] Received periods: with count
  - [StepPeriods] Selected period: when clicking periods
✓ Step 4 (Org Units):
  - [StepOrgUnits] Organization units loaded
  - [StepOrgUnits] Data scope changed to: Include children (Yes/No)
✓ Step 5 (Column Preview):
  - [StepColumnPreview] Generated columns: with count breakdown (5+1+4=10)
  - [StepColumnPreview] Updated wizard state with column preview
✓ Step 6 (Data Preview):
  - [StepDataPreview] Scheduling fetch with: parameter counts
  - [StepDataPreview] Executing fetch after debounce
  - [StepDataPreview] Fetching data with payload: full payload shown
  - [StepDataPreview] Received response: with row/column counts
  - [StepDataPreview] Generated column metadata: with 10 columns
  - [StepDataPreview] Updated wizard state with columns
✓ Step 7 (Save):
  - [DHIS2 Wizard] Saving columns: with count=10
  - Dataset created successfully!
```

## Technical Details

### Column Naming Convention
- Hierarchy: `ou_level_{N}` where N = 1-5
- Period: `period`
- Data Elements: `de_{UID}` where UID is the DHIS2 data element ID

### Column Metadata Fields
Each column in saved dataset has:
- `name`: Internal column identifier (e.g., `ou_level_1`, `de_fbfJHSPpUQD`)
- `type`: Data type (always `STRING` for DHIS2 data)
- `verbose_name`: Human-readable display name (e.g., "National", "105-EP01a. Suspected fever")
- `is_dttm`: Boolean, `true` only for period column

### Data Type Mapping

| DHIS2 Element | Saved Type | Display Format |
|---|---|---|
| Org Unit Levels | STRING | "National", "Region X", "District Y" |
| Periods | STRING | "202401" (YYYYMM) |
| Data Elements | STRING | "-" (missing), or numeric string "123.45" |

## Quick Debug Workflow

1. **Open DevTools**: F12
2. **Clear console**: Cmd+K or Ctrl+K
3. **Navigate to wizard step**
4. **Interact with UI** (select items, toggle options)
5. **Check console immediately** for relevant logs
6. **Copy log output** if reporting issues

### Export Logs
```javascript
// In browser console, run:
copy(document.body.innerText)
// Then paste into text editor
```

---

**Still having issues?** Share the console logs from Step 5 (Column Preview) onwards with:
- Full `[StepColumnPreview] Generated columns:` output
- Full `[StepDataPreview] Generated column metadata:` output
- Full `[DHIS2 Wizard] Saving columns:` output
