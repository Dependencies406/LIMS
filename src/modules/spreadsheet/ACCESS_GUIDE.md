# How to Access the Spreadsheet Module

## Quick Access

1. **Navigate to Spreadsheets**:
   - Click the **📊 Spreadsheets** link in the sidebar
   - Or go directly to: `/spreadsheets`

2. **Create/Open a Spreadsheet**:
   - To create new: `/spreadsheets` (no ID)
   - To open existing: `/spreadsheets/:spreadsheetId`

## Integration Steps

### 1. Route is Already Added
The route has been added to `src/App.tsx`:
```tsx
<Route path="spreadsheets/:spreadsheetId?" element={<SpreadsheetPage />} />
```

### 2. Navigation Link is Added
The sidebar link has been added to `src/components/Layout.tsx`:
```tsx
<Link to="/spreadsheets">📊 Spreadsheets</Link>
```

### 3. Using the Spreadsheet Page

The `SpreadsheetPage` component is located at:
- `src/modules/spreadsheet/pages/SpreadsheetPage.tsx`

## Current Implementation

The page currently:
- ✅ Creates a demo spreadsheet on load
- ✅ Shows all spreadsheet components (Grid, FormulaBar, UncertaintyPanel, etc.)
- ✅ Supports read-only mode when status is 'approved'
- ⚠️ **TODO**: Needs Firestore integration for persistence

## Next Steps (To Complete Integration)

### 1. Add Firestore Service

Create `src/services/spreadsheetService.ts`:

```typescript
import { db, collection, doc, getDoc, setDoc, updateDoc } from './firebase';
import type { SpreadsheetModel } from '../modules/spreadsheet/models';

export const spreadsheetService = {
  async getSpreadsheet(id: string): Promise<SpreadsheetModel | null> {
    const docRef = doc(db, 'spreadsheets', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as SpreadsheetModel;
    }
    return null;
  },

  async saveSpreadsheet(spreadsheet: SpreadsheetModel): Promise<void> {
    const docRef = doc(db, 'spreadsheets', spreadsheet.id);
    await setDoc(docRef, spreadsheet, { merge: true });
  },

  async updateSpreadsheet(id: string, updates: Partial<SpreadsheetModel>): Promise<void> {
    const docRef = doc(db, 'spreadsheets', id);
    await updateDoc(docRef, updates);
  },
};
```

### 2. Update SpreadsheetPage

Replace the TODO comments in `SpreadsheetPage.tsx` with actual Firestore calls:

```typescript
// In loadSpreadsheet:
const doc = await getDoc(doc(db, 'spreadsheets', spreadsheetId));
if (doc.exists()) {
  setSpreadsheet(doc.data() as SpreadsheetModel);
}

// In handleCellUpdate:
await updateDoc(doc(db, 'spreadsheets', spreadsheet.id), {
  cells: Array.from(updatedCells.entries()),
  updatedAt: serverTimestamp(),
  updatedBy: currentUser.uid,
});
```

### 3. Add Spreadsheet List Page (Optional)

Create a list page to show all spreadsheets:
- `src/modules/spreadsheet/pages/SpreadsheetListPage.tsx`
- Route: `/spreadsheets` (list view)
- Route: `/spreadsheets/:id` (detail view)

## Usage Example

```tsx
// Navigate to spreadsheet
navigate('/spreadsheets/my-spreadsheet-id');

// Or create new
navigate('/spreadsheets');
```

## Features Available

✅ **Excel-like Grid**: Click cells, edit values, use formulas  
✅ **Formula Bar**: Edit formulas with validation  
✅ **Uncertainty Panel**: Add Type A and Type B uncertainty components  
✅ **Result Summary**: View final measurement with expanded uncertainty  
✅ **Calculation Preview**: See formula evaluation and dependencies  
✅ **Read-only Mode**: Automatically enabled when status is 'approved'  

## Component Structure

```
SpreadsheetPage
├── FormulaBar (top)
├── SpreadsheetGrid (main area)
├── UncertaintyPanel (sidebar)
├── ResultSummaryPanel (sidebar)
└── CalculationPreview (below grid)
```

All components are ready to use and integrated with the app!

