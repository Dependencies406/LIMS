# 🔢 Job ID Configuration System

## Overview

The LIMS application now features a sophisticated Job ID configuration system that allows administrators to control the format and numbering of job IDs.

---

## 📋 **Job ID Format**

### **Format Structure**
```
[ORG]-[TYPE]-[YY][XXX]
```

### **Example**
```
CPN-CAL-25001
```

### **Components**
- **ORG** (Organization Prefix): Company or organization abbreviation (e.g., "CPN")
- **TYPE** (Job Type Prefix): Type of job (e.g., "CAL" for Calibration)
- **YY** (Year): Last 2 digits of current year (e.g., "25" for 2025)
- **XXX** (Sequence): 3-digit sequential number with leading zeros (e.g., "001", "042", "999")

---

## ⚙️ **Configuration Settings**

### **Configurable Fields**

| Field | Description | Example | Rules |
|-------|-------------|---------|-------|
| **Organization Prefix** | Company/organization code | `CPN` | Uppercase letters & numbers, max 10 chars |
| **Job Type Prefix** | Type of job identifier | `CAL` | Uppercase letters & numbers, max 10 chars |
| **Current Year** | Year for job IDs | `2025` | Between 2000 and current year + 10 |
| **Current Sequence** | Next sequence number | `1` to `999` | 1-999, resets yearly if enabled |
| **Yearly Reset** | Auto-reset sequence on Jan 1 | `true/false` | Boolean toggle |

---

## 🚀 **Features**

### **1. Automatic Generation**
- Job IDs are **automatically generated** when creating a new job
- Sequence number **auto-increments** with each new job
- Year is automatically updated when changed

### **2. Yearly Reset**
- When enabled, sequence resets to `001` on January 1st
- Year updates automatically
- Prevents manual intervention for year changes

### **3. Real-Time Preview**
- **Current Job ID**: Shows what the next job will be numbered
- **Next Job ID**: Shows what the job after that will be numbered
- Updates instantly as you change settings

### **4. Validation**
- Prevents empty prefixes
- Enforces uppercase for consistency
- Limits prefix length
- Validates sequence range (1-999)
- Validates year range

### **5. Admin-Only Access**
- Only administrators can configure job ID settings
- Settings are stored in Firestore
- Accessible through Settings page

---

## 📍 **How to Use**

### **For Administrators**

#### **Step 1: Access Settings**
1. Log in as an administrator
2. Navigate to **Settings** page (sidebar)
3. Find **🔢 Job ID Configuration** section
4. Click **⚙️ Configure Job IDs** button

#### **Step 2: Configure Settings**
1. **Set Organization Prefix** (e.g., "CPN")
   - Use your company abbreviation
   - Uppercase letters and numbers only
   - Max 10 characters

2. **Set Job Type Prefix** (e.g., "CAL")
   - Use job category abbreviation
   - Common examples: CAL (Calibration), MAINT (Maintenance), INSP (Inspection)
   - Uppercase letters and numbers only
   - Max 10 characters

3. **Review Year**
   - Usually set to current year
   - Displays as last 2 digits (2025 → 25)
   - Updates automatically if yearly reset is enabled

4. **Set Current Sequence**
   - Starts at 1 for new implementations
   - Adjust if migrating from another system
   - Must be between 1-999

5. **Enable/Disable Yearly Reset**
   - ✅ **Enabled**: Sequence resets to 1 on January 1st each year
   - ❌ **Disabled**: Sequence continues incrementing indefinitely

#### **Step 3: Preview & Save**
1. **Review Preview**:
   - Check "Current Job ID" format
   - Verify "Next Job ID" looks correct

2. **Validate**:
   - Ensure no validation errors appear
   - Red error box will show if settings are invalid

3. **Save**:
   - Click **Save Settings** button
   - Success toast confirms save
   - Settings apply immediately to all new jobs

### **For Users Creating Jobs**

1. Click **+ Create Job** on the Jobs page
2. Job ID is **automatically generated** and displayed
3. Job ID field is **disabled** (read-only)
4. Continue filling out the rest of the job form
5. Job ID is saved with the job

---

## 🔧 **Technical Implementation**

### **Files Created/Modified**

1. **`src/types/index.ts`**
   - Added `JobIdSettings` interface

2. **`src/services/jobIdService.ts`**
   - Job ID generation logic
   - Settings load/save to Firestore
   - Sequence incrementing
   - Year change detection
   - Validation functions

3. **`src/hooks/useJobIdSettings.tsx`**
   - React hook for managing job ID settings
   - Loading state management
   - Error handling

4. **`src/components/JobIdSettingsModal.tsx`**
   - Admin modal for configuration
   - Real-time preview
   - Validation UI
   - Form handling

5. **`src/pages/SettingsPage.tsx`**
   - Integration of job ID settings
   - Preview display
   - Modal triggering

6. **`src/components/JobModal.tsx`**
   - Uses `generateNextJobId()` for new jobs
   - Automatic job ID population

### **Data Storage**

**Firestore Document Path:**
```
system/jobIdSettings
```

**Document Structure:**
```typescript
{
  organizationPrefix: "CPN",
  jobTypePrefix: "CAL",
  currentYear: 2025,
  currentSequence: 42,
  yearlyReset: true
}
```

---

## 🔒 **Security**

### **Firebase Security Rules**

The `system/jobIdSettings` document requires special security rules:

```javascript
match /system/{document} {
  // Allow all authenticated users to read system settings
  allow read: if request.auth != null;
  
  // Only admins can write to system settings
  allow write: if request.auth != null && 
                  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

---

## 📊 **Examples**

### **Example 1: Standard Calibration Lab**
```typescript
{
  organizationPrefix: "CALLAB",
  jobTypePrefix: "CAL",
  currentYear: 2025,
  currentSequence: 1,
  yearlyReset: true
}
```
**Result**: `CALLAB-CAL-25001`, `CALLAB-CAL-25002`, etc.

### **Example 2: Multi-Type Organization**
```typescript
{
  organizationPrefix: "ACME",
  jobTypePrefix: "MAINT",
  currentYear: 2025,
  currentSequence: 150,
  yearlyReset: false
}
```
**Result**: `ACME-MAINT-25150`, `ACME-MAINT-25151`, etc.

### **Example 3: Simple Numbering**
```typescript
{
  organizationPrefix: "LAB",
  jobTypePrefix: "JOB",
  currentYear: 2025,
  currentSequence: 1,
  yearlyReset: true
}
```
**Result**: `LAB-JOB-25001`, `LAB-JOB-25002`, etc.

---

## ⚠️ **Important Notes**

### **Do's**
✅ Set up job ID settings **before** creating your first job  
✅ Use **consistent abbreviations** that make sense to your team  
✅ Enable **yearly reset** if you want to start fresh each year  
✅ **Preview** your format before saving  
✅ Keep prefixes **short and memorable** (2-5 characters recommended)

### **Don'ts**
❌ Don't change settings frequently (causes inconsistent numbering)  
❌ Don't manually set sequence to a number that's already been used  
❌ Don't use special characters or spaces in prefixes  
❌ Don't set sequence above 999 (resets to error state)  
❌ Don't modify existing job IDs after creation

### **Migration Considerations**
- If migrating from another system, set `currentSequence` to your last job number + 1
- Existing jobs keep their old IDs
- Only new jobs use the configured format

---

## 🐛 **Troubleshooting**

### **Job ID Not Generating**
- Check Firebase connection
- Verify admin has set up initial configuration
- Check browser console for errors
- Fallback ID (timestamp-based) will be used if generation fails

### **Sequence Not Incrementing**
- Verify Firestore permissions
- Check that `currentSequence` is updating in database
- Refresh settings page to see current state

### **Duplicate Job IDs**
- Should not occur with proper setup
- Contact administrator if duplicates appear
- Check Firestore for sequence corruption

### **Year Not Updating**
- Ensure `yearlyReset` is enabled
- Check system date/time is correct
- Manually adjust year in settings if needed

---

## 🔄 **Yearly Maintenance**

If **yearly reset is disabled**, you may need to manually:
1. Update the year to current year
2. Reset sequence to 1
3. Save settings

This happens automatically if yearly reset is enabled.

---

## 📝 **Best Practices**

1. **Planning**
   - Decide on prefixes before going live
   - Document your naming convention
   - Train staff on the format

2. **Consistency**
   - Don't change prefixes mid-year
   - Keep format stable for record-keeping

3. **Monitoring**
   - Check sequence numbers periodically
   - Verify yearly reset triggers correctly
   - Monitor for approaching 999 limit

4. **Backup**
   - Document current settings
   - Back up Firestore data regularly
   - Keep record of job ID format changes

---

## ✅ **Summary**

The Job ID Configuration system provides:
- ✅ **Automatic** job ID generation
- ✅ **Customizable** format
- ✅ **Sequential** numbering
- ✅ **Yearly** reset option
- ✅ **Real-time** preview
- ✅ **Admin-only** access
- ✅ **Validation** and error handling
- ✅ **Firestore** persistence

**Your job IDs will now be professional, consistent, and automatically managed!** 🎉

