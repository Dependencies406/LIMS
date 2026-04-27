# Equipment → Spreadsheet Binding Implementation

## ✅ Implementation Complete

The spreadsheet module has been successfully bound to Equipment within Jobs, following all architectural requirements.

## Architecture

### Data Ownership
```
Job (owns)
  └── Equipment[] (owns)
      └── EquipmentSpreadsheetData (one per equipment)
          ├── spreadsheetModel
          ├── uncertaintyModel
          ├── measurementResult
          └── metadata
```

**Key Principle**: Equipment → Spreadsheet is ONE-WAY dependency
- Equipment owns spreadsheet data
- Spreadsheet module does NOT know about Job or Equipment
- Spreadsheet module is pure calculation + UI only

## Implementation Details

### 1. Data Model Extension

**File**: `src/types/index.ts`

Extended `Equipment` interface:
```typescript
export interface Equipment {
  // ... existing fields
  spreadsheetData?: EquipmentSpreadsheetData;
}

export interface EquipmentSpreadsheetData {
  spreadsheetId: string;
  spreadsheetModel: any; // SpreadsheetModel
  uncertaintyModel?: any; // UncertaintyModel
  measurementResult?: number;
  unit?: string;
  method?: string;
  analyst?: string;
  calculatedAt?: Date;
  calculatedBy?: string;
}
```

### 2. UI Component

**File**: `src/components/EquipmentSpreadsheetModal.tsx`

- Modal wrapper component (part of Job module, NOT Spreadsheet module)
- Loads spreadsheet data from Equipment
- Enforces read-only based on Job status
- Saves data back to Equipment via callback
- NO Firestore logic
- NO PDF logic
- NO approval logic

### 3. Job Detail Page Integration

**File**: `src/pages/JobDetailPage.tsx`

**Added**:
- State for spreadsheet modal (`showSpreadsheetModal`, `selectedEquipmentIndex`)
- "Open Calculation" button on each equipment
- Visual indicator (green) when equipment has calculation data
- Save handler (`handleSpreadsheetSave`) that updates equipment state
- Modal component integration

**Read-Only Enforcement**:
```typescript
// Spreadsheet is editable only when Job is in Draft or Pending
const isReadOnly = job.status !== 'Pending' && job.status !== 'Draft';
```

### 4. Data Flow

```
User clicks "Open Calculation" button
  ↓
EquipmentSpreadsheetModal opens
  ↓
Loads spreadsheetData from Equipment (or creates new)
  ↓
User edits spreadsheet (if not read-only)
  ↓
User clicks "Save Changes"
  ↓
handleSpreadsheetSave callback
  ↓
Updates Equipment state in JobDetailPage
  ↓
Equipment data saved when Job is saved (via handleSubmit)
```

## Features

### ✅ Multi-Equipment Support
- Each equipment has independent spreadsheet instance
- No shared memory between equipment spreadsheets
- Switching equipment loads different spreadsheet

### ✅ Read-Only Enforcement
- Draft/Pending → Editable
- All other statuses → Read-only
- Spreadsheet module only obeys `isReadOnly` prop
- Job module controls editability

### ✅ Data Persistence
- Spreadsheet data stored in Equipment.spreadsheetData
- Saved with Job when handleSubmit is called
- Equipment array includes spreadsheetData in Firestore

### ✅ Visual Indicators
- "Open Calculation" button on each equipment
- Green indicator when equipment has calculation data
- "Calculated" badge in equipment summary

## Validation Checklist

- [x] Each equipment opens its own spreadsheet
- [x] Editing one equipment does NOT affect others
- [x] Spreadsheet becomes read-only when job leaves Draft/Pending
- [x] Spreadsheet contains no Firestore imports
- [x] Spreadsheet contains no PDF imports
- [x] Spreadsheet contains no approval logic
- [x] Parent Job module fully owns persistence
- [x] Spreadsheet is a pure calculation engine only
- [x] Equipment → Spreadsheet is one-way dependency
- [x] Missing spreadsheet data handled gracefully

## File Structure

```
src/
├── types/
│   └── index.ts (Equipment interface extended)
├── components/
│   └── EquipmentSpreadsheetModal.tsx (NEW - Job module component)
├── pages/
│   └── JobDetailPage.tsx (Modified - Added spreadsheet integration)
└── modules/
    └── spreadsheet/ (UNCHANGED - Pure calculation + UI)
        ├── models/
        ├── services/
        ├── components/
        └── utils/
```

## Usage

1. **Open Equipment Calculation**:
   - Navigate to Job Detail Page
   - Go to Equipment tab
   - Click "Open Calculation" button on any equipment
   - Modal opens with spreadsheet for that equipment

2. **Edit Calculation** (if Job is Draft/Pending):
   - Edit cells, formulas, uncertainty components
   - Click "Save Changes" to save to equipment
   - Data persists when job is saved

3. **View Calculation** (if Job is not Draft/Pending):
   - Spreadsheet opens in read-only mode
   - Can view all calculations and results
   - Cannot edit

## Data Serialization

When saving to Firestore, Maps are serialized:
```typescript
const serializedSpreadsheet = {
  ...spreadsheet,
  cells: Object.fromEntries(spreadsheet.cells),
  formulas: Object.fromEntries(spreadsheet.formulas),
  variables: Object.fromEntries(spreadsheet.variables),
};
```

When loading from Firestore, Maps are restored:
```typescript
if (loadedSpreadsheet.cells && !(loadedSpreadsheet.cells instanceof Map)) {
  loadedSpreadsheet.cells = new Map(Object.entries(loadedSpreadsheet.cells));
}
```

## Compliance

✅ **NO Firestore in Spreadsheet Module**
✅ **NO PDF Logic in Spreadsheet Module**
✅ **NO Approval Logic in Spreadsheet Module**
✅ **NO Document Control in Spreadsheet Module**
✅ **Pure Calculation + UI Only**

All persistence, workflow, and document control handled by Job module.

