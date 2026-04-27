# TEMPLATE MANAGER MIGRATION AUDIT
## Desktop → Web Feature Comparison

**Date:** 2025-01-XX  
**Purpose:** Verify complete migration of spreadsheet template manager

---

## DESKTOP TEMPLATE MANAGER FEATURES

### 1. Template Manager Dialog (`template_manager_dialog.py`)
**Features:**
- ✅ List all spreadsheet templates in table
- ✅ Columns: Template Name, Columns (count), Created, Actions
- ✅ Create new template button (opens TemplateBuilderDialog)
- ✅ Edit template button (opens TemplateBuilderDialog with existing data)
- ✅ Delete template button (with confirmation)
- ✅ Refresh button
- ✅ Equipment template replacement when deleting (if template in use)
- ✅ Empty state message when no templates

### 2. Template Builder Dialog (`template_builder_dialog.py`)
**Features:**
- ✅ Template name input
- ✅ Column definitions table with columns:
  - Column Name (editable)
  - Type (Input/Formula dropdown)
  - Data Type (STRING, NUMBER, SCIENTIFIC, DATETIME, BOOLEAN)
  - Precision (0-10, enabled only for NUMBER/SCIENTIFIC)
  - Alignment (LEFT, CENTER, RIGHT)
  - Formula Expression (editable only for Formula type)
  - Show in Report (checkbox - is_printable)
  - Actions (Move Up, Move Down, Properties, Delete)
- ✅ Add Column button
- ✅ Formula Help button (opens FormulaHelpDialog)
- ✅ Save Template button
- ✅ Column order preservation (via columnOrder array)
- ✅ Column properties dialog (validation rules: min/max)
- ✅ Move Up/Down buttons (reorder columns)
- ✅ Delete column with confirmation
- ✅ Template validation (name required, at least one column, formula required for Formula type)

---

## WEB APP STATUS

### ✅ EXISTING
- `templateService.ts` - CRUD operations for templates
- Template schema and types defined
- Template loading in EquipmentSpreadsheetModal

### ❌ MISSING
- **SpreadsheetTemplateManagerModal** - No UI for managing templates
- **SpreadsheetTemplateBuilderModal** - No UI for building templates
- Integration in Settings page

---

## REQUIRED COMPONENTS TO CREATE

1. **SpreadsheetTemplateBuilderModal.tsx**
   - Match desktop TemplateBuilderDialog features
   - Column definitions table
   - All column properties
   - Formula help integration
   - Save/validation logic

2. **SpreadsheetTemplateManagerModal.tsx**
   - Match desktop TemplateManagerDialog features
   - Template list table
   - Create/Edit/Delete actions
   - Integration with builder modal

3. **Settings Page Integration**
   - Add "Spreadsheet Template Manager" card
   - Similar to PDF Template Manager

---

**END OF AUDIT**

