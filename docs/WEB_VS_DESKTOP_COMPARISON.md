# WEB VS DESKTOP SPREADSHEET COMPARISON
## Functional Parity Gap Analysis

**Date:** 2025-01-XX  
**Purpose:** Identify gaps between desktop and web implementations

---

## ✅ IMPLEMENTED FEATURES

### 1. Formula Engine
- ✅ Statistical functions: AVERAGE, STDEV, STDEV.P, TINV, DEGREES
- ✅ Mathematical functions: SUM, MAX, MIN, COUNT, SQRT, POWER, ABS, ROUND
- ✅ Logical functions: IF, AND, OR, NOT
- ✅ Cell references: Full (A1, B2) and column-only (A, B)
- ✅ Formula evaluation with dependency tracking
- ✅ Circular reference detection

### 2. Data Model
- ✅ Raw values stored separately from display values
- ✅ Cell structure with `rawValue` and `displayValue`
- ✅ Column definitions with formulas, precision, validation
- ✅ Column order preservation via `columnOrder` array

### 3. Precision & Formatting
- ✅ Per-column precision support
- ✅ Decimal places control
- ✅ Alignment (left, center, right)
- ✅ Format masks

### 4. Row Operations
- ✅ Row insertion with formula reference shifting
- ✅ Row deletion with formula reference shifting
- ✅ Formula shifter utility

### 5. Template System
- ✅ Template selection and application
- ✅ Column definitions from template
- ✅ Column order preservation

### 6. UI Features
- ✅ Formatting toolbar (alignment, decimal precision)
- ✅ Clear cells button
- ✅ Reset formatting button
- ✅ Template selector

---

## ⚠️ POTENTIAL GAPS / VERIFICATION NEEDED

### 1. Scientific Notation Parsing
**Desktop:** Uses `parse_number_with_scientific()` function
- Explicitly handles `2.55E20`, `1.5e-10`
- Removes whitespace and commas
- Returns `float` or `None`

**Web:** Need to verify
- [ ] NUMBER token regex handles scientific notation: `/^-?\d+\.?\d*(?:[eE][+-]?\d+)?/`
- [ ] Parsing logic matches desktop behavior
- [ ] Used for NUMBER and SCIENTIFIC data types

**Action Required:** Verify scientific notation parsing in `spreadsheetEngine.ts`

### 2. STDEV vs STDEV.P Implementation
**Desktop:**
- `STDEV` / `STDEV.S`: Uses `statistics.stdev()` (sample, n-1 correction)
  - Requires ≥2 values, returns 0.0 if <2
- `STDEV.P` / `STDEVP`: Uses `statistics.pstdev()` (population, n)
  - Requires ≥1 value, returns 0.0 if <1

**Web:** Need to verify
- [ ] STDEV uses sample standard deviation (n-1)
- [ ] STDEV.P uses population standard deviation (n)
- [ ] Error handling matches (0.0 for insufficient data)

**Action Required:** Verify STDEV implementations in `spreadsheetEngine.ts`

### 3. TINV Function
**Desktop:**
- Uses SciPy: `abs(scipy.stats.t.ppf(prob / 2, df))`
- 2-tailed distribution
- Validates: prob ∈ (0,1), df ≥ 1

**Web:**
- [ ] Uses approximation (no SciPy in browser)
- [ ] Approximation matches SciPy results closely
- [ ] Same validation rules

**Action Required:** Verify TINV approximation accuracy

### 4. Error Handling in Formulas
**Desktop:**
- Missing cells → `0` (not None, not empty string)
- Error cells → `0` when referenced
- Error display: "#REF!", "ERROR: ...", or "ERROR"

**Web:** Need to verify
- [ ] Missing cells return 0
- [ ] Error cells return 0 when referenced
- [ ] Error display matches desktop

**Action Required:** Verify error handling in `getCellValue()`

### 5. Validation Rules
**Desktop:**
- Min/max clamping (silent, no error messages)
- Invalid number → `None` (cell appears empty)
- Boolean parsing: 'true', '1', 'yes', 'on' → True

**Web:** Need to verify
- [ ] Min/max clamping behavior
- [ ] Invalid number handling
- [ ] Boolean parsing

**Action Required:** Verify validation in cell update logic

### 6. Data Serialization Format
**Desktop:**
```python
{
    'row_index': {
        'col_name': {
            'value': ...,  # Raw value
            'style': {...}  # Style dict
        }
    }
}
```

**Web:** Need to verify
- [ ] Serialization format matches
- [ ] Formula columns save calculated result (not formula)
- [ ] Empty cells included with `value: None`

**Action Required:** Verify serialization in save/load functions

### 7. Column-Only References
**Desktop:**
- Column-only references (`A`, `B`) refer to current row
- Pattern: `r'\b' + re.escape(col_letter) + r'(?!\d)\b'`
- Replaced with value from current row

**Web:** Need to verify
- [ ] Column-only references work correctly
- [ ] Pattern matching matches desktop
- [ ] Current row context preserved

**Action Required:** Verify column-only reference handling

### 8. Auto-Recalculations
**Desktop:**
- Triggers on `setData()` → `engine.set_cell_value()`
- Finds dependent formulas via pattern matching
- Updates all dependent cells

**Web:** Need to verify
- [ ] Recalculation triggers on cell change
- [ ] Dependency tracking works correctly
- [ ] All dependent cells update

**Action Required:** Verify auto-recalculation logic

### 9. Formula Column Read-Only
**Desktop:**
- `type == 'formula'` → Read-only
- `flags()` returns `ItemIsEnabled | ItemIsSelectable` (no `ItemIsEditable`)

**Web:** Need to verify
- [ ] Formula columns cannot be edited
- [ ] `isLocked: true` set for formula cells
- [ ] UI prevents editing

**Action Required:** Verify read-only behavior

### 10. Precision Application
**Desktop:**
- Formatting ONLY in DisplayRole
- EditRole returns raw value
- Format mask: `f"0.{'0' * precision}"`

**Web:** Need to verify
- [ ] Formatting only in display
- [ ] Edit shows raw value
- [ ] Precision format matches

**Action Required:** Verify precision formatting

---

## 🔴 KNOWN DIFFERENCES (UNAVOIDABLE)

### 1. TINV Implementation
**Desktop:** Uses SciPy (native Python library)
**Web:** Uses JavaScript approximation

**Reason:** SciPy not available in browser
**Mitigation:** Approximation algorithm matches SciPy results within acceptable tolerance

**Status:** ✅ Implemented with approximation

### 2. Data Structure
**Desktop:** Python dicts and tuples
**Web:** TypeScript Maps and objects

**Reason:** Language differences
**Mitigation:** Conversion utilities ensure compatibility

**Status:** ✅ Handled via `dataFormatConverter.ts`

---

## 📋 VERIFICATION CHECKLIST

### Critical Features
- [ ] Scientific notation parsing works identically
- [ ] STDEV vs STDEV.P distinction correct
- [ ] TINV approximation accurate
- [ ] Error handling matches (0 for missing, error strings)
- [ ] Validation rules match (min/max clamping)
- [ ] Column-only references work
- [ ] Formula columns are read-only
- [ ] Precision formatting matches
- [ ] Data serialization format matches
- [ ] Auto-recalculation works

### Data Integrity
- [ ] Raw values never modified by formatting
- [ ] Display values calculated at render time
- [ ] Column order preserved exactly
- [ ] Formula results match desktop calculations

### User Experience
- [ ] Cell editing behavior matches
- [ ] Navigation (Enter/Tab) works
- [ ] Formatting toolbar functions correctly
- [ ] Template application preserves order

---

## 🎯 ACTION ITEMS

1. **Verify Scientific Notation Parsing**
   - Test: `2.55E20`, `1.5e-10`, `999999999`
   - Ensure NUMBER token regex handles all cases
   - Verify used for NUMBER/SCIENTIFIC types

2. **Verify STDEV Implementations**
   - Test STDEV with <2 values (should return 0.0)
   - Test STDEV.P with <1 value (should return 0.0)
   - Verify sample vs population distinction

3. **Verify Error Handling**
   - Test missing cell references (should return 0)
   - Test error cell references (should return 0)
   - Verify error display strings

4. **Verify Validation Rules**
   - Test min/max clamping
   - Test invalid number handling
   - Test boolean parsing

5. **Verify Data Serialization**
   - Compare save format with desktop
   - Verify formula columns save calculated result
   - Verify empty cells included

6. **Test Column-Only References**
   - Test formulas like `=A+B` (current row)
   - Verify pattern matching
   - Verify current row context

7. **Test Auto-Recalculations**
   - Change cell value
   - Verify dependent formulas update
   - Verify all dependent cells refresh

8. **Test Formula Column Read-Only**
   - Try to edit formula column
   - Verify prevented
   - Verify UI feedback

9. **Test Precision Formatting**
   - Set precision to 2, 3, etc.
   - Verify display format
   - Verify edit shows raw value

10. **End-to-End Test**
    - Create template with formulas
    - Enter data
    - Verify calculations match desktop
    - Save and reload
    - Verify data integrity

---

**END OF COMPARISON**

