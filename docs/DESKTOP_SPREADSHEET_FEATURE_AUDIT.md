# DESKTOP SPREADSHEET FEATURE AUDIT
## Functional Parity Migration - Complete Feature Inventory

**Date:** 2025-01-XX  
**Purpose:** Document ALL desktop spreadsheet features for exact replication in web app

---

## 1. DATA MODEL & STRUCTURE

### 1.1 Core Data Structure
**Desktop Format:**
```python
# Engine data structure
self.data = {
    row_index: {
        col_name: value  # Raw input values (int, float, str, None)
    }
}

# Model cell data
self._cell_data = {
    (row, col): {
        'value': ...,      # Raw value
        'style': {...},    # Formatting/style info
        'formula': None    # Formulas stored in column_definitions
    }
}

# Column definitions
self.column_definitions = {
    col_name: {
        'type': 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC' | 'formula',
        'formula': '=A1+B1',  # If type is 'formula'
        'data_type': 'NUMBER',
        'precision': 2,
        'format_mask': '0.00',
        'validation_rules': {'min': 0, 'max': 100},
        'is_read_only': False,  # Formula columns are read-only
        'is_printable': True,
        'alignment': 'left' | 'center' | 'right'
    }
}

# Column order (CRITICAL for display)
self.column_names = ['Column1', 'Column2', ...]  # Explicit order array
```

**Key Rules:**
- Raw values stored separately from formatted display values
- Formatting applied ONLY at render time (DisplayRole)
- Column order preserved explicitly via `column_names` array
- Formula columns are read-only (type='formula')
- Scientific notation supported for NUMBER/SCIENTIFIC types

---

## 2. FORMULA ENGINE

### 2.1 Supported Functions
**Statistical Functions:**
- `AVERAGE` / `MEAN` - Mean calculation (handles lists and separate args)
- `STDEV` / `STDEV.S` - Sample standard deviation (requires ≥2 values, returns 0.0 if <2)
- `STDEV.P` / `STDEVP` - Population standard deviation (requires ≥1 value, returns 0.0 if <1)
- `TINV(probability, degrees_freedom)` - T-Distribution Inverse (2-tailed, Excel-compatible)
  - Uses SciPy: `abs(scipy.stats.t.ppf(prob / 2, df))`
  - Validates: prob ∈ (0,1), df ≥ 1
- `DEGREES(count)` - Degrees of freedom (count - 1)

**Mathematical Functions:**
- `SUM` - Sum all numeric arguments
- `MAX` - Maximum value
- `MIN` - Minimum value
- `COUNT` - Count numeric values
- `SQRT(x)` - Square root (returns 0.0 if x < 0)
- `POWER(x, y)` - Power function
- `ABS(x)` - Absolute value
- `ROUND(x, decimals=0)` - Round to specified decimals

**Logical Functions:**
- `IF(condition, value_if_true, value_if_false)`
- `AND(*args)` - All must be true
- `OR(*args)` - Any must be true
- `NOT(condition)` - Boolean negation

### 2.2 Cell Reference Types
**Full Cell References:**
- Format: `A1`, `B2`, `AA10`
- References specific row and column
- Case-insensitive matching

**Column-Only References:**
- Format: `A`, `B`, `AA` (without row number)
- References current row in that column
- Used in formulas like `=A+B` (means current row's A + current row's B)

**Column Name References:**
- Direct column name references (if column name matches pattern)
- Converted to column letter internally

### 2.3 Formula Evaluation Rules
1. **Preprocessing:** Excel-style functions rewritten to internal names
   - `TINV` → `_stat_tinv`
2. **Substitution:** Cell references replaced with actual values
   - Full references: `A1` → value from row 0, column A
   - Column-only: `A` → value from current row, column A
   - Missing cells → `0` (not None, not empty string)
   - Error cells → `0` (not propagated)
3. **Evaluation:** Using SimpleEval with explicit function map
4. **Error Handling:**
   - `NameNotDefined` → Check for unsupported Excel functions
   - `ValueError` → Return error message string
   - Other exceptions → Return "ERROR" string

### 2.4 Scientific Notation Support
**Parser:** `parse_number_with_scientific(value)`
- Supports: `2.55E20`, `1.5e-10`, `999999999`
- Removes whitespace and commas
- Returns `float` or `None` on failure
- Used for NUMBER and SCIENTIFIC data types

---

## 3. PRECISION & FORMATTING

### 3.1 Precision Rules
**Per-Column Precision:**
- Stored in `column_definitions[col_name]['precision']` (default: 2)
- Applied via `StyleManager.format_value(value, f"0.{'0' * precision}")`
- Format mask can override: `format_mask` in style or column definition

**Format Mask:**
- Format: `"0.00"` (2 decimals), `"0.000"` (3 decimals), etc.
- Applied at display time only
- Raw value never modified

### 3.2 Display Formatting
**DisplayRole Logic:**
```python
if format_mask:
    return StyleManager.format_value(value, format_mask)
elif isinstance(value, (int, float)) and col_def.get('data_type') == 'NUMBER':
    precision = style.get('precision', col_def.get('precision', 2))
    return StyleManager.format_value(value, f"0.{'0' * precision}")
else:
    return str(value) if value is not None else ""
```

**Key Rules:**
- Formatting ONLY in DisplayRole
- EditRole returns raw value
- Raw value stored separately
- Formatting never modifies stored value

### 3.3 Alignment
**Options:** `'left'`, `'center'`, `'right'`
- Stored in cell style: `style['alignment']`
- Applied via `StyleManager.get_alignment(style)`
- Default: left

---

## 4. VALIDATION RULES

### 4.1 Type Validation
**NUMBER / SCIENTIFIC:**
- Uses `parse_number_with_scientific()` for parsing
- Returns `None` if parsing fails
- Validation applied in `set_cell_value()`:
  ```python
  if 'min' in validation_rules and value < validation_rules['min']:
      value = validation_rules['min']  # Clamp to min
  if 'max' in validation_rules and value > validation_rules['max']:
      value = validation_rules['max']  # Clamp to max
  ```

**BOOLEAN:**
- String: `'true'`, `'1'`, `'yes'`, `'on'` → `True`
- Number: non-zero → `True`, zero → `False`

**STRING:**
- No validation (accepts any string)

### 4.2 Read-Only Rules
**Formula Columns:**
- `type == 'formula'` → Read-only
- Cannot be edited via `setData()`
- Returns `ItemIsEnabled | ItemIsSelectable` (no `ItemIsEditable`)

---

## 5. ROW OPERATIONS

### 5.1 Row Insertion
**Behavior:**
- Shifts existing rows down
- Updates formula references via `FormulaShifter.shift_formula()`
- Parameters: `row_shift`, `inserted_at_row`
- Updates all formula column definitions

### 5.2 Row Deletion
**Behavior:**
- Removes row data
- Shifts remaining rows up
- Updates formula references (negative shift)
- Parameters: `row_shift`, `deleted_at_row`

### 5.3 Row Clearing
**Method:** `clear_contents(selection: List[Tuple[int, int]])`
- Clears cell values but keeps styles
- Updates engine: `engine.set_cell_value(row, col_name, None)`
- Emits `dataChanged` for affected cells

---

## 6. AUTO-RECALCULATION

### 6.1 Trigger Events
**Cell Value Change:**
- `setData()` → `engine.set_cell_value()` → `_recalculate_dependent_cells()`
- Finds all formula columns that reference changed cell
- Checks both full references (`A1`) and column-only (`A`)
- Recalculates dependent formulas
- Emits `dataChanged` for updated cells

### 6.2 Dependency Tracking
**Method:** `_recalculate_dependent_formulas(changed_row, changed_col_name)`
- Gets column letter for changed cell
- Checks all formula columns in all rows
- Pattern matching: `r'\b' + re.escape(cell_ref) + r'\b'`
- Updates cells via `engine.get_cell_value()` (forces recalculation)

---

## 7. DATA SERIALIZATION

### 7.1 Save Format
```python
{
    'row_index': {
        'col_name': {
            'value': ...,  # Raw value (int, float, str, None)
            'style': {...}  # Style dict
        }
    }
}
```

**Key Rules:**
- Row indices as string keys: `"0"`, `"1"`, etc.
- Column names as keys in row dict
- Formula columns: value is calculated result (not formula string)
- Empty cells: included with `value: None`
- ALL rows from 0 to `_row_count - 1` included (even empty)

### 7.2 Load Format
**Handles Both:**
- Old format: `{'row': {'col': value}}` (direct value)
- New format: `{'row': {'col': {'value': ..., 'style': {...}}}}`

**Behavior:**
- Expands rows to fit loaded data
- Sets `_row_count` to max row index + 1
- Recalculates all formula cells after load
- Preserves column order from `column_names`

---

## 8. COLUMN DEFINITIONS

### 8.1 Column Definition Structure
```python
{
    'type': 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC' | 'formula',
    'formula': '=A1+B1',  # Required if type='formula'
    'data_type': 'NUMBER',  # For validation/parsing
    'precision': 2,  # Decimal places
    'format_mask': '0.00',  # Override precision
    'validation_rules': {
        'min': 0,
        'max': 100
    },
    'is_read_only': False,  # Auto-set to True for formula columns
    'is_printable': True,
    'alignment': 'left' | 'center' | 'right',
    'conditional_formatting': {...}  # Optional
}
```

### 8.2 Column Order
**CRITICAL:** Column order preserved via `column_names` array
- Primary: Use `column_order` from template if provided
- Fallback: `sorted(definitions.keys())` if no order specified
- Filter: Only include columns that exist in definitions
- Append: Missing columns added at end (sorted)

---

## 9. TEMPLATE SYSTEM

### 9.1 Template Structure
```python
{
    'name': 'Template Name',
    'id': 'template_id',
    'columns': {
        'col_name': {  # Column definition dict
            'type': ...,
            'formula': ...,
            ...
        }
    },
    'columnOrder': ['Col1', 'Col2', ...],  # Explicit order array
    'templateId': '...',
    'templateName': '...'
}
```

### 9.2 Template Application
**Process:**
1. Extract `columns` dict and `columnOrder` array
2. Validate columns exist
3. Show confirmation if switching templates
4. Build template structure with preserved order
5. Call `model.set_column_definitions(definitions, column_order)`
6. Load existing data if available
7. Recalculate all formulas

---

## 10. ERROR HANDLING

### 10.1 Formula Errors
**Error Types:**
- `NameNotDefined` → Check for unsupported Excel functions
- `ValueError` → Return error message string
- Other exceptions → Return "ERROR" string

**Error Display:**
- `#REF!` → Displayed as "#REF!"
- `"ERROR: ..."` → Displayed as error message
- Error cells return `0` when referenced in other formulas

### 10.2 Validation Errors
**Behavior:**
- Invalid number → `None` (cell appears empty)
- Out of range → Clamped to min/max
- No error messages shown (silent clamping)

---

## 11. UI BEHAVIORS

### 11.1 Cell Editing
- Enter/Tab navigation
- Formula columns: Not editable (read-only)
- EditRole returns raw value
- DisplayRole returns formatted value

### 11.2 Formatting Toolbar
**Alignment:**
- Left, Center, Right buttons
- Exclusive selection (button group)
- Updates cell style

**Decimal Precision:**
- Increase/Decrease buttons
- Range: 0-10 decimal places
- Updates cell style precision

**Content:**
- Clear Cells button
- Reset Formatting button

### 11.3 Template Selection
- Dropdown with template list
- "Select Template" as first item
- Shows template name with icon
- Triggers template application on selection

---

## 12. STATISTICAL FUNCTION DETAILS

### 12.1 TINV Implementation
```python
def _stat_tinv(probability, degrees_freedom):
    prob = float(probability)
    df = float(degrees_freedom)
    
    # Validation
    if prob <= 0 or prob >= 1:
        raise ValueError(f"TINV: probability must be between 0 and 1, got {prob}")
    if df < 1:
        raise ValueError(f"TINV: degrees of freedom must be >= 1, got {df}")
    
    # Excel TINV is 2-tailed: TINV(prob, df) = t.ppf(1 - prob/2, df)
    result = abs(scipy.stats.t.ppf(prob / 2, df))
    return result
```

**Key Points:**
- Uses SciPy (requires `scipy` package)
- 2-tailed distribution
- Returns absolute value
- Validates inputs strictly

### 12.2 STDEV vs STDEV.P
**STDEV (Sample):**
- Uses `statistics.stdev()` (Bessel's correction: n-1)
- Requires ≥2 values, returns 0.0 if <2

**STDEV.P (Population):**
- Uses `statistics.pstdev()` (no correction: n)
- Requires ≥1 value, returns 0.0 if <1

---

## 13. CRITICAL BEHAVIORS

### 13.1 Raw vs Display Values
**NEVER mix:**
- Raw value: stored in `_cell_data[(row, col)]['value']` or `engine.data[row][col]`
- Display value: calculated in `data(DisplayRole)`
- Edit value: returned in `data(EditRole)` as raw value

### 13.2 Formula Column Behavior
- Type: `'formula'` (not `'NUMBER'` or other)
- Read-only: Cannot be edited
- Value: Calculated via `engine.get_cell_value()`
- Formula: Stored in `column_definitions[col_name]['formula']`

### 13.3 Column Order Preservation
**CRITICAL:** Must preserve exact visual order
- Use `columnOrder` array from template
- Fallback to sorted keys only if no order provided
- Filter to valid columns only
- Append missing columns at end

---

## 14. KNOWN CONSTRAINTS

### 14.1 Row Management
- Rows must be manually added (no auto-expansion)
- Start with 0 rows (user adds rows)
- Row count tracked in `_row_count`

### 14.2 Column Management
- Columns defined by template (cannot add/remove at runtime)
- Column insertion/removal prevented (requires template modification)

### 14.3 Formula Reference Shifting
- Handled by `FormulaShifter.shift_formula()`
- Updates column definition formulas
- Rebuilds engine dependencies

---

## 15. VERIFICATION CHECKLIST

- [ ] Raw values stored separately from formatted values
- [ ] Formatting applied only at render time
- [ ] Column order preserved exactly
- [ ] Formula columns are read-only
- [ ] Scientific notation parsing works
- [ ] TINV function uses SciPy (or equivalent approximation)
- [ ] STDEV vs STDEV.P distinction correct
- [ ] Column-only references work (`A`, `B` in formulas)
- [ ] Row operations shift formula references correctly
- [ ] Auto-recalculation triggers on cell change
- [ ] Error handling matches desktop (0 for missing, error strings for failures)
- [ ] Precision rules match (per-column precision)
- [ ] Validation rules match (min/max clamping)
- [ ] Data serialization format matches
- [ ] Template application preserves column order

---

**END OF AUDIT**

