# ✅ Firebase Storage CORS Setup Checklist

Use this checklist to set up CORS for PDF logo rendering.

## Prerequisites

- [/] You have a Google account with access to the Firebase project
- [/] You can see the Firebase project in Firebase Console
- [/] You have admin/owner permissions on the project

## Step 1: Install Google Cloud SDK

Choose your operating system:

### Windows
- [/] Download from: https://cloud.google.com/sdk/docs/install
- [ ] Run the installer
- [ ] Restart PowerShell/Command Prompt after installation
- [ ] Verify: Run `gcloud --version` (should show version info)

### Mac
- [ ] Open Terminal
- [ ] Run: `brew install google-cloud-sdk`
- [ ] Verify: Run `gcloud --version`

### Linux
- [ ] Run: `curl https://sdk.cloud.google.com | bash`
- [ ] Run: `exec -l $SHELL`
- [ ] Verify: Run `gcloud --version`

## Step 2: Authenticate

- [ ] Run: `gcloud auth login`
- [ ] Browser window opens
- [ ] Sign in with your Google account (the one with Firebase access)
- [ ] See "You are now authenticated" message
- [ ] Verify: Run `gcloud auth list` (should show your email)

## Step 3: Set Project

- [ ] Get your Firebase project ID:
  - Option A: Check `.env` file for `VITE_FIREBASE_PROJECT_ID`
  - Option B: Firebase Console → Project Settings → Project ID
- [ ] Run: `gcloud config set project YOUR_PROJECT_ID`
  - Replace `YOUR_PROJECT_ID` with actual project ID
- [ ] See confirmation message
- [ ] Verify: Run `gcloud config get-value project`

## Step 4: Apply CORS Configuration

- [x] Make sure you're in the project root directory (where `cors.json` is)
- [x] Run: `gsutil cors set cors.json gs://scs-lims.firebasestorage.app`
- [x] See success message: "Setting CORS on gs://..."
- [x] No errors displayed

**Alternative bucket name:**
If the above fails, try:
- [x] `gsutil cors set cors.json gs://scs-lims.firebasestorage.app` ✅ **WORKED!**

## Step 5: Verify CORS

- [x] Run: `gsutil cors get gs://scs-lims.firebasestorage.app`
- [x] See JSON output showing CORS configuration ✅
- [x] Verify it matches the content of `cors.json`:
  ```json
  [
    {
      "origin": ["*"],
      "method": ["GET", "HEAD"],
      "maxAgeSeconds": 3600,
      "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
    }
  ]
  ```

## Step 6: Test in Application

- [ ] Close and reopen your browser (or clear cache completely)
- [ ] Open the LIMS application
- [ ] Go to: Settings → Company Info
- [ ] Verify company logo is uploaded (or upload one)
- [ ] Go to: Settings → PDF Settings
- [ ] Add `{company_logo}` to header (left, center, or right)
- [ ] Save settings
- [ ] Go to: Jobs page
- [ ] Click any job → "Generate PDF" or "Preview PDF"
- [ ] **Check Console** (F12):
  - [ ] No "Failed to fetch" errors
  - [ ] No "Failed to load image" errors
  - [ ] No CORS errors
- [ ] **Check PDF**:
  - [ ] Logo appears in header
  - [ ] Logo is clear and properly sized
  - [ ] No warning message about CORS

## Troubleshooting

If any step fails, check these:

### "gcloud: command not found"
- [ ] Restart your terminal/command prompt
- [ ] Check if SDK is in PATH: `echo $PATH` (Mac/Linux) or `$env:Path` (Windows)
- [ ] Reinstall Google Cloud SDK

### "Permission Denied" or "Forbidden"
- [ ] Verify you're logged in: `gcloud auth list`
- [ ] Check you have Owner/Editor role in Firebase Console
- [ ] Try logging out and in again: `gcloud auth revoke` then `gcloud auth login`

### "Bucket not found"
- [ ] Verify project ID is correct
- [ ] Check Firebase Console → Storage for exact bucket name
- [ ] Try both bucket name formats:
  - `YOUR_PROJECT_ID.appspot.com`
  - `YOUR_PROJECT_ID.firebasestorage.app`

### "Still getting CORS errors"
- [ ] Wait 2-3 minutes for changes to propagate
- [ ] Clear browser cache completely (Ctrl+Shift+Delete)
- [ ] Close and reopen browser
- [ ] Try in incognito/private window
- [ ] Verify CORS was applied: `gsutil cors get gs://...`

### "Logo still not showing"
- [ ] Check browser console for specific error
- [ ] Verify logo URL is from Firebase Storage (not external)
- [ ] Check Firebase Storage rules allow read access
- [ ] Try uploading the logo again

## Success Indicators

You've successfully completed setup when:

✅ `gcloud --version` shows version info  
✅ `gcloud auth list` shows your email with asterisk  
✅ `gcloud config get-value project` shows correct project  
✅ `gsutil cors get gs://...` shows CORS configuration  
✅ PDF generation works without console errors  
✅ Company logo appears in generated PDFs  

## Quick Command Reference

```bash
# Install (Mac)
brew install google-cloud-sdk

# Authenticate
gcloud auth login
gcloud auth list

# Set Project
gcloud config set project YOUR_PROJECT_ID
gcloud config get-value project

# Apply CORS
gsutil cors set cors.json gs://YOUR_PROJECT_ID.appspot.com

# Verify CORS
gsutil cors get gs://YOUR_PROJECT_ID.appspot.com

# Check bucket name
gsutil ls

# View all buckets
gcloud storage buckets list
```

## Time Estimate

- [ ] Install SDK: 2-5 minutes
- [ ] Authenticate: 1 minute
- [ ] Configure CORS: 1 minute
- [ ] Test: 2 minutes

**Total: ~5-10 minutes**

## After Completion

Once setup is complete:
- ✅ You never need to do this again (unless you create a new Firebase project)
- ✅ All users of your app will see logos in PDFs
- ✅ No changes needed when deploying to production
- ✅ CORS configuration persists permanently

## Need More Help?

- **Quick Guide:** `SETUP_FIREBASE_STORAGE_CORS.md`
- **Detailed Guide:** `docs/FIREBASE_STORAGE_CORS_SETUP.md`
- **Summary:** `CORS_FIX_SUMMARY.md`

---

**Ready to start?** Begin with Step 1! 🚀

