# Test Storage Rules & Fix IAM Permissions

## Step 1: Test Rules in Rules Playground

You're currently on the Rules Playground. Let's test if the rules work correctly:

### Test Configuration:
1. **Simulation type:** Change from "get" to **"write"** (since you're uploading)
2. **Location:** Keep as `/b/scs-lims.firebasestorage.app/o`
3. **Path to resource:** Enter `company/logo/test-logo.png`
4. **Authenticated:** Set to **OFF** (since `if true` should work even without auth)
5. Click **"Run"**

### Expected Result:
- ✅ Should show **"Simulated read/write access allowed"** or green checkmark
- ❌ If it shows denied, there's a rules issue (unlikely since `if true` should always work)

If the simulation **allows** the operation, then your rules are correct and the issue is definitely IAM permissions.

## Step 2: Fix IAM Permissions (The Real Issue)

Since your rules have `allow read, write: if true;` but uploads still fail, this is **100% an IAM permissions issue**.

### Go to Google Cloud Console IAM:

**Direct Link:** https://console.cloud.google.com/iam-admin/iam?project=scs-lims

### Steps:

1. **Check if service account exists:**
   - Look for: `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com`
   - Project number: `511921681509`

2. **If service account is MISSING:**
   - Click **"+ ADD"** or **"GRANT ACCESS"** button at the top
   - In "New principals" field, enter:
     ```
     511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com
     ```
   - In "Select a role" dropdown, search for: **"Cloud Storage for Firebase Service Agent"**
   - Select the role
   - Click **"SAVE"**

3. **If service account EXISTS but missing role:**
   - Find the service account in the list
   - Click the **pencil icon (edit)** next to it
   - Click **"+ ADD ANOTHER ROLE"**
   - Search for and select: **"Cloud Storage for Firebase Service Agent"**
   - Click **"SAVE"**

4. **Wait 1-2 minutes** for permissions to propagate

## Step 3: Test Upload After IAM Fix

1. Go back to your application
2. Try uploading the company logo again
3. It should work now!

## Step 4: Restore Secure Rules (After Testing)

Once the upload works, we need to restore secure authentication-based rules:

Replace the temporary debug rule:
```javascript
allow read, write: if true;
```

With secure authenticated-only rule:
```javascript
allow read: if request.auth != null;
allow write: if request.auth != null;
```

Then deploy:
```bash
firebase deploy --only storage
```

## Why This Happens

Even though Firebase Storage Security Rules allow access (`if true`), Google Cloud IAM permissions must also allow the Firebase service account to perform operations. The 412 error occurs when:
- ✅ Security Rules allow the operation
- ❌ IAM permissions block the operation

This is a **two-layer security system**:
1. **Security Rules** (Firebase) - What your app logic allows
2. **IAM Permissions** (Google Cloud) - What the infrastructure allows

Both must be configured correctly for uploads to work.
