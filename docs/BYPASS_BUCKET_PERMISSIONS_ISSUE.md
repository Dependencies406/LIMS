# Bypass Bucket Permissions Access Issue

## Problem
Even with Owner + Storage Admin roles, you can't access bucket permissions page. This suggests:
- Organization policies blocking access
- Bucket-level restrictions
- Permissions not fully propagated
- Browser/cache issues

## Solution 1: Use Firebase Console to Upload (Test)

Let's test if the issue is with your app or with Storage itself:

1. **Go to Firebase Console Storage:**
   - https://console.firebase.google.com/project/scs-lims/storage

2. **Navigate to `company/logo/` folder**

3. **Try uploading a test file manually** using Firebase Console's upload button

4. **Results:**
   - ✅ **If upload works in Firebase Console** → The issue is with your app's authentication/configuration
   - ❌ **If upload also fails** → Confirms it's a Storage/IAM permissions issue

## Solution 2: Check Organization Policies

Organization policies can override project-level permissions:

1. **Go to Organization Policies:**
   - https://console.cloud.google.com/iam-admin/orgpolicy?project=scs-lims

2. **Look for policies related to:**
   - Storage bucket access
   - Service account permissions
   - IAM restrictions

3. **If you find restrictive policies, you may need an organization admin to modify them**

## Solution 3: Use gcloud CLI (If Available)

If you have gcloud CLI installed, you can grant permissions directly:

```bash
# Grant Storage Admin to all service accounts
gcloud projects add-iam-policy-binding scs-lims \
  --member="serviceAccount:scs-lims@appspot.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant to compute service account
gcloud projects add-iam-policy-binding scs-lims \
  --member="serviceAccount:511921681509-compute@developer.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant public access temporarily (for testing)
gsutil iam ch allUsers:objectCreator gs://scs-lims.firebasestorage.app

# Test upload, then remove public access
gsutil iam ch -d allUsers:objectCreator gs://scs-lims.firebasestorage.app
```

## Solution 4: Check Bucket via Firebase Console Settings

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/project/scs-lims/settings/general

2. **Look for "Storage" section**

3. **Check if there are any settings or configuration options**

4. **Look for "Re-link bucket" or similar options**

## Solution 5: Clear Browser Cache and Try Again

Sometimes permissions don't refresh properly:

1. **Clear browser cache and cookies** for console.cloud.google.com
2. **Try incognito/private mode**
3. **Try a different browser**
4. **Log out and log back in to Google Cloud Console**

## Solution 6: Check if Bucket is in Different Project

Verify the bucket is actually in the correct project:

1. **Go to Storage Browser:**
   - https://console.cloud.google.com/storage/browser?project=scs-lims

2. **Check the project selector** at the top - make sure it says "scs-lims"

3. **Look for the bucket** `scs-lims.firebasestorage.app`

4. **If it's not there, the bucket might be in a different project**

## Solution 7: Contact Google Cloud Support

If none of the above work, this might be:
- A Google Cloud Console bug
- Organization policy restrictions you can't see
- A billing/quota issue
- A project configuration issue

**Contact Google Cloud Support** with:
- Project ID: `scs-lims`
- Issue: Can't access bucket permissions despite Owner role
- Error: "Additional permissions required to view this bucket's metadata"

## Most Likely Next Steps

**Start with Solution 1** - Try uploading via Firebase Console. This will tell us if:
- The issue is with your app code
- Or it's a Storage/IAM issue

If Firebase Console upload works, the problem is in your app's Firebase configuration or how it's authenticating.

If Firebase Console upload also fails, then it's definitely a Storage/IAM issue that needs Google Cloud Support or organization admin help.
