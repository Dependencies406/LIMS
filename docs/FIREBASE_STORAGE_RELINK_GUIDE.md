# Firebase Storage Bucket Re-linking Guide

## Step-by-Step Instructions

### Step 1: Navigate to Firebase Console Storage
1. Open your web browser
2. Go to: **https://console.firebase.google.com/project/scs-lims/storage**
3. Sign in with your Google account that has access to the `scs-lims` project

### Step 2: Check for Re-linking Prompts
Look for any of the following on the Storage page:

#### Option A: Banner/Warning at the Top
- **Yellow or red banner** at the top of the page
- Text like: "Storage bucket needs to be re-linked" or "Service account permissions required"
- **Action**: Click the button in the banner (usually "Re-link" or "Fix Now")

#### Option B: Empty Storage State
- If Storage appears **empty** or shows "No files" with a setup message
- Look for a **"Get Started"** or **"Create Bucket"** button
- **Action**: Click the button and follow the setup wizard

#### Option C: Settings/Configuration Panel
- Click the **⚙️ Settings icon** (gear icon) in the Storage page
- Look for **"Bucket Settings"** or **"Permissions"** section
- Check for warnings about service account permissions
- **Action**: Follow any prompts to fix permissions

### Step 3: What to Look For
If you see any of these, you need to fix permissions:
- ⚠️ Warning icon
- 🔴 Error message about permissions
- Message mentioning "service account" or "IAM permissions"
- Message about bucket not being linked properly

### Step 4: Alternative - Check Rules Tab
1. In the Storage page, click the **"Rules"** tab
2. If you see errors or warnings about rules not being applied
3. This might indicate a bucket/permission issue

## If You Don't See Any Prompts

If there are **no re-linking prompts** visible, try the manual IAM fix:

### Manual IAM Permissions Fix

1. **Go to Google Cloud Console:**
   - Navigate to: **https://console.cloud.google.com/iam-admin/iam?project=scs-lims**

2. **Check Service Account:**
   - Look for: `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - Project number: `511921681509`
   
3. **If Service Account is Missing:**
   - Click **"+ ADD"** button at the top
   - In "New principals" field, enter: `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - In "Select a role" dropdown, search for: **"Cloud Storage for Firebase Service Agent"**
   - Select the role
   - Click **"SAVE"**

4. **If Service Account Exists but Missing Role:**
   - Find the service account in the list
   - Click the **pencil icon** (edit) next to it
   - Click **"+ ADD ANOTHER ROLE"**
   - Search for and select: **"Cloud Storage for Firebase Service Agent"**
   - Click **"SAVE"**

## After Fixing Permissions

1. **Wait 1-2 minutes** for permissions to propagate
2. **Refresh the Firebase Console** Storage page
3. **Try uploading the logo again** in your application
4. The upload should now work!

## Verification Checklist

✅ Storage bucket exists in Firebase Console  
✅ No error banners or warnings visible  
✅ Service account has "Cloud Storage for Firebase Service Agent" role  
✅ Storage rules are deployed (check Rules tab)  
✅ Logo upload works without 412 error  

## Still Having Issues?

If you still see a 412 error after fixing permissions:
1. Check that the Storage bucket name matches: `scs-lims.firebasestorage.app`
2. Verify you're logged into the correct Firebase project
3. Check browser console for any additional error details
4. Try clearing browser cache and refreshing
