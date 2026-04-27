# Firebase Storage 412 Error - Service Account Permissions Fix

## Problem
Even with `allow read, write: if true;` in storage rules, you're getting a 412 Precondition Failed error. This indicates a **Google Cloud IAM permissions issue**, not a security rules issue.

## Root Cause
The Firebase service account associated with your project lacks the necessary permissions to access Cloud Storage. This is a Google Cloud infrastructure-level issue.

## Solution

### Option 1: Re-link Storage Bucket (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`scs-lims`)
3. Navigate to **Storage** section
4. If you see a prompt about re-linking the bucket, follow the on-screen instructions
5. This will automatically set up the required permissions

### Option 2: Manually Assign Permissions
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `scs-lims`
3. Navigate to **IAM & Admin** > **IAM**
4. Find the service account with email: `{project-number}@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - Project number: `511921681509`
   - Full email: `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
5. If missing, click **+ ADD** and create it with:
   - Principal: `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - Role: **Cloud Storage for Firebase Service Agent**
6. Save changes

### Option 3: Enable Required APIs
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `scs-lims`
3. Navigate to **APIs & Services** > **Library**
4. Enable these APIs (if not already enabled):
   - Cloud Storage API
   - Cloud Storage for Firebase API
   - Firebase Storage API

## Verification
After applying the fix:
1. Wait 1-2 minutes for permissions to propagate
2. Try uploading the company logo again
3. The upload should now succeed

## References
- [Firebase FAQ on Storage Accounts](https://firebase.google.com/support/faq#storage-accounts)
- [Firebase Storage Error Handling](https://firebase.google.com/docs/storage/web/handle-errors)
