# Server-Side PDF Generation - Verification Checklist

## Pre-Test Setup

### ✅ 1. Check Server Status

**PDF Server:**
```bash
cd server
npm start
```
Expected output:
```
PDF Server running on port 3001
Health check: http://localhost:3001/health
```

**Health Check:**
Visit: `http://localhost:3001/health`
Expected response:
```json
{"status":"OK","message":"PDF Server is running"}
```

**Frontend:**
```bash
npm run dev
```
Expected output:
```
Local: http://localhost:5173/
```

### ✅ 2. Dependencies Installed

- [ ] Frontend `node_modules` exists
- [ ] Server `node_modules` exists
- [ ] Puppeteer Chromium downloaded (happens automatically on first run)

## Test Cases

### Test 1: Basic PDF Generation (English Content)

**Steps:**
1. Login to the application
2. Navigate to Jobs page
3. Click on any job
4. Click "Export" button
5. PDF should download

**Expected Result:**
- ✅ PDF downloads successfully
- ✅ All job information visible
- ✅ Equipment table rendered correctly
- ✅ No errors in console

**Status:** [ ]

---

### Test 2: Thai Character Rendering

**Steps:**
1. Create or edit a job with Thai content:
   - Title: `งานทดสอบเครื่องมือวัด`
   - Customer: `บริษัท ทดสอบ จำกัด`
   - Notes: `หมายเหตุการทำงาน`
2. Add equipment with Thai name: `เครื่องวัดอุณหภูมิ`
3. Save the job
4. Export to PDF

**Expected Result:**
- ✅ Thai characters render correctly (NOT as `?`)
- ✅ Font is readable (Noto Sans Thai)
- ✅ All Thai text visible in PDF
- ✅ No encoding errors

**Status:** [ ]

---

### Test 3: PDF Settings Modal

**Steps:**
1. Login as admin
2. Go to Settings page
3. Click "PDF Settings"
4. Change settings:
   - Uncheck some job columns
   - Uncheck some equipment columns
   - Change font sizes
5. Select a job from dropdown
6. Observe PDF preview
7. Save settings
8. Export a job PDF

**Expected Result:**
- ✅ Preview updates in real-time
- ✅ Settings persist after page refresh
- ✅ Unchecked columns don't appear in PDF
- ✅ Font sizes applied correctly

**Status:** [ ]

---

### Test 4: Equipment Table with Thai Content

**Steps:**
1. Create job with equipment containing Thai text:
   ```
   Name: เครื่องวัดอุณหภูมิ
   Manufacturer: Fluke
   Model: 52-II
   Machine Location: ห้องปฏิบัติการ A
   Remark: ทดสอบเป็นประจำทุกเดือน
   ```
2. Export to PDF

**Expected Result:**
- ✅ Equipment table shows all Thai text
- ✅ Table borders rendered correctly
- ✅ Text wrapping works properly
- ✅ No overflow or cut-off text

**Status:** [ ]

---

### Test 5: Job ID Generation

**Steps:**
1. Go to Settings > Job ID Configuration
2. Set prefix: `SCS-CAL`
3. Check "Next Job Will Be"
4. Create new job
5. Verify Job ID
6. Create another job
7. Verify sequence increments

**Expected Result:**
- ✅ Job ID follows format: `SCS-CAL-25XXX`
- ✅ Sequence increments after save (not on modal open)
- ✅ Settings persist

**Status:** [ ]

---

### Test 6: PDF Preview in Settings

**Steps:**
1. Open PDF Settings modal
2. Select a job with Thai content from dropdown
3. Change settings:
   - Toggle columns
   - Change margins
   - Modify font sizes
4. Watch preview update

**Expected Result:**
- ✅ Preview loads within 3-5 seconds (first time)
- ✅ Preview updates on setting changes
- ✅ Thai characters visible in preview
- ✅ Preview matches exported PDF

**Status:** [ ]

---

### Test 7: Multiple Jobs Export

**Steps:**
1. Export PDF for 5 different jobs
2. Check each PDF

**Expected Result:**
- ✅ All PDFs generate successfully
- ✅ Each PDF has correct job data
- ✅ Thai characters render in all PDFs
- ✅ Performance acceptable (1-2 seconds each)

**Status:** [ ]

---

### Test 8: Error Handling

**Steps:**
1. Stop PDF server (close terminal)
2. Try to export PDF from frontend
3. Check error message
4. Restart PDF server
5. Try export again

**Expected Result:**
- ✅ Clear error message when server down
- ✅ No app crash
- ✅ Works again after server restart

**Status:** [ ]

---

### Test 9: All Features Still Working

**Jobs Management:**
- [ ] Create new job
- [ ] Edit existing job
- [ ] Delete job
- [ ] Search jobs
- [ ] Filter by status
- [ ] Switch view modes (List/Card/Grid)

**Customers Management:**
- [ ] Create new customer
- [ ] Edit customer
- [ ] Search customers
- [ ] View customer details

**PDF Features:**
- [ ] Export single job PDF
- [ ] PDF preview in settings
- [ ] PDF settings persistence
- [ ] Job ID configuration

**Authentication:**
- [ ] Login
- [ ] Logout
- [ ] Admin-only settings visible
- [ ] Role-based access control

---

### Test 10: Browser Compatibility

**Test in:**
- [ ] Chrome
- [ ] Edge
- [ ] Firefox

**Expected Result:**
- ✅ All features work in all browsers
- ✅ Thai characters render correctly
- ✅ No console errors

---

## Performance Benchmarks

| Operation | Expected Time | Actual Time | Pass/Fail |
|-----------|---------------|-------------|-----------|
| First PDF generation | 3-5 seconds | | |
| Subsequent PDFs | 1-2 seconds | | |
| PDF preview load | 2-3 seconds | | |
| Settings save | <1 second | | |
| Job create/edit | <1 second | | |

## Known Issues

### Non-Issues (Expected Behavior)
- First PDF generation takes 3-5 seconds (Puppeteer startup)
- Google Drive sync warnings during npm install (can be ignored)

### Critical Issues (Must Fix)
- [ ] None identified

### Minor Issues (Can Fix Later)
- [ ] None identified

## Server Logs to Check

### PDF Server Console
Look for:
- ✅ "PDF Server running on port 3001"
- ✅ No error messages
- ✅ Successful PDF generation logs

### Frontend Console (Browser)
Look for:
- ✅ No errors
- ✅ Successful API calls to localhost:3001
- ✅ No Thai character encoding warnings

### Network Tab
Check `/api/generate-pdf` requests:
- ✅ Status: 200 OK
- ✅ Content-Type: application/pdf
- ✅ Response size reasonable (50-500KB)

## Final Verification

### All Tests Pass
- [ ] All 10 test cases completed
- [ ] No critical errors
- [ ] Thai characters render correctly in ALL scenarios
- [ ] Performance acceptable
- [ ] No regression in existing features

### Documentation
- [ ] README.md updated with server instructions
- [ ] server/README.md created
- [ ] docs/SERVER_SIDE_PDF.md created
- [ ] This verification checklist completed

### Ready for User
- [ ] Both servers can be started easily
- [ ] Clear instructions provided
- [ ] No known critical issues
- [ ] Thai character support verified

## Sign-Off

**Verified by:** _____________
**Date:** _____________
**Status:** [ ] PASS / [ ] FAIL
**Notes:** _____________

