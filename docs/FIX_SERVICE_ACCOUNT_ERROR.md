# Fix "Service Account Not Found" Error

## Problem
When trying to add `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`, you get an error:
> "Email addresses and domains must be associated with an active Google Account, Google Workspace account, or Cloud Identity account."

This means the service account **doesn't exist yet** - it needs to be auto-created by Firebase.

## Solution: Enable Firebase Storage API (Auto-creates Service Account)

The Firebase Storage service account is automatically created when you properly enable Firebase Storage. Let's do this:

### Option 1: Enable Storage API in Google Cloud Console

1. **Go to Google Cloud Console APIs:**
   - https://console.cloud.google.com/apis/library?project=scs-lims

2. **Search for and enable these APIs (use these exact names):**
   - Search: **"Cloud Storage API"** → Click it → Click **"ENABLE"**
   - Search: **"Firebase"** → Look for **"Firebase Management API"** → Enable it
   - Or search directly by service name: **"firebasestorage.googleapis.com"** (if visible)
   
   **Note:** "Firebase Storage API" doesn't exist as a separate API. Firebase Storage uses:
   - Cloud Storage API (the underlying storage service)
   - Firebase services are typically enabled automatically when you use Firebase Console

3. **Wait 2-3 minutes** for the service account to be auto-created

4. **Go back to IAM page:**
   - https://console.cloud.google.com/iam-admin/iam?project=scs-lims
   - Look for the service account again - it should now exist!

5. **If it appears, check if it has the role:**
   - Look for `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - Check if it has **"Cloud Storage for Firebase Service Agent"** role
   - If missing, click edit (pencil icon) and add the role

### Option 2: Re-initialize Firebase Storage

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/project/scs-lims/storage

2. **Check if Storage shows any initialization prompts:**
   - Look for "Get Started" or setup buttons
   - Even though you see files, there might be a setup wizard

3. **Try creating a test file:**
   - In Storage, try uploading a test file manually
   - This might trigger service account creation

### Option 3: Grant Role to Default Compute Service Account

Sometimes the permissions need to be on the default compute service account instead:

1. **Go to IAM page:**
   - https://console.cloud.google.com/iam-admin/iam?project=scs-lims

2. **Look for:**
   - `scs-lims@appspot.gserviceaccount.com` (default App Engine service account)
   - OR `[PROJECT-NUMBER]-compute@developer.gserviceaccount.com`

3. **Add role to this account:**
   - Click edit (pencil icon)
   - Add role: **"Storage Admin"** or **"Storage Object Admin"**
   - Save

### Option 4: Use gcloud CLI (If you have it installed)

```bash
# Enable the Storage API
gcloud services enable storage-api.googleapis.com --project=scs-lims
gcloud services enable firebasestorage.googleapis.com --project=scs-lims

# Wait for service account creation, then grant role
gcloud projects add-iam-policy-binding scs-lims \
  --member="serviceAccount:511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role="roles/firebasestorage.serviceAgent"
```

## Verification Steps

After trying the solutions above:

1. **Wait 2-3 minutes** for service accounts and permissions to propagate

2. **Check IAM page again:**
   - https://console.cloud.google.com/iam-admin/iam?project=scs-lims
   - Look for the Firebase Storage service account

3. **Try uploading the logo again in your app**

## Alternative: Grant Permissions to Storage Bucket Directly

If the service account approach doesn't work, try granting permissions directly to the bucket:

1. **Go to Storage Bucket:**
   - https://console.cloud.google.com/storage/browser/scs-lims.firebasestorage.app?project=scs-lims

2. **Click on the bucket name**

3. **Go to "Permissions" tab**

4. **Click "GRANT ACCESS"**

5. **Add principal:** Your user email (the one you're logged in with)
   - Or try: `serviceAccount:scs-lims@appspot.gserviceaccount.com`

6. **Role:** Select **"Storage Admin"** or **"Storage Object Admin"**

7. **Save**

## Most Likely Solution

**Start with Option 1** (Enable APIs) - this usually auto-creates the service account. The Storage API might not be fully enabled, which prevents the service account from being created automatically.
