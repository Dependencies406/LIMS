# Grant Storage Admin Role to All Service Accounts

## Step-by-Step Instructions

### Step 1: Navigate to IAM Page

1. **Go to Google Cloud Console IAM:**
   - https://console.cloud.google.com/iam-admin/iam?project=scs-lims

2. **Make sure you're in the correct project:** `scs-lims`

### Step 2: Identify All Service Accounts

Look through the IAM list for all entries that have email addresses ending in `.gserviceaccount.com`. These are service accounts.

**Common service accounts you might find:**
- `scs-lims@appspot.gserviceaccount.com` (App Engine default service account)
- `511921681509-compute@developer.gserviceaccount.com` (Compute Engine default service account)
- `firebase-adminsdk-[random]@scs-lims.iam.gserviceaccount.com` (Firebase Admin SDK)
- `511921681509@gcp-sa-firebasestorage.iam.gserviceaccount.com` (Firebase Storage - might not exist yet)
- Any other accounts with `@gserviceaccount.com` emails

### Step 3: Grant Storage Admin to Each Service Account

For **EACH** service account you find:

1. **Find the service account** in the IAM list

2. **Click the pencil icon (✏️ Edit)** on the far right of that row

3. **In the "Edit permissions" panel that opens:**
   - Click **"+ ADD ANOTHER ROLE"** button

4. **In the role dropdown:**
   - Start typing: **"Storage Admin"**
   - Select **"Storage Admin"** from the dropdown
   - (This role provides full control over Google Cloud Storage buckets and objects)

5. **Click "SAVE"** at the bottom

6. **Repeat for the next service account**

### Step 4: Verify Roles Were Added

After granting roles to all service accounts:

1. **Check each service account** to confirm it now has "Storage Admin" role listed

2. **You should see multiple roles** for each service account (they might have other roles too)

### Step 5: Wait for Propagation

1. **Wait 2-3 minutes** for permissions to propagate across Google Cloud infrastructure

2. **Don't test immediately** - permissions can take a moment to sync

### Step 6: Test the Upload

1. **Go back to your application**

2. **Navigate to Settings → Company Information**

3. **Try uploading a logo again**

4. **The 412 error should be resolved!**

## Quick Checklist

- [ ] Found all service accounts in IAM (`.gserviceaccount.com` emails)
- [ ] Added "Storage Admin" role to `scs-lims@appspot.gserviceaccount.com`
- [ ] Added "Storage Admin" role to `511921681509-compute@developer.gserviceaccount.com`
- [ ] Added "Storage Admin" role to any Firebase Admin SDK service accounts
- [ ] Added "Storage Admin" role to any other service accounts found
- [ ] Verified all roles were saved successfully
- [ ] Waited 2-3 minutes for propagation
- [ ] Tested logo upload in the application

## Alternative: Bulk Edit (If Many Service Accounts)

If you have many service accounts, you can:

1. **Select multiple service accounts** using checkboxes

2. **Click "SHOW INFO PANEL"** (or the info icon)

3. **Click "ADD PRINCIPAL"** in the info panel

4. **Add role "Storage Admin"** - this will apply to all selected accounts

However, the individual edit method (Step 3) is more reliable.

## Why This Should Fix the 412 Error

Firebase Storage uses service accounts to perform operations, not your personal user account. Even though you have Owner + Storage Admin roles, Firebase Storage operations run under service account credentials. By granting Storage Admin to all service accounts, we ensure that whichever service account Firebase uses for Storage operations has the necessary permissions.

## After It Works

Once the upload succeeds:

1. **Remove the temporary debug rule** (`if true`) from `storage.rules`
2. **Deploy secure rules** with `if request.auth != null`
3. **Test again** to ensure it still works with secure rules
