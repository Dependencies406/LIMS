# Critical Test: Is It Your App or Storage?

## Quick Diagnostic Test

We need to determine if the issue is:
- **Your app's code/configuration** ❓
- **OR Firebase Storage/IAM permissions** ❓

### Test 1: Upload via Firebase Console

1. **Go to Firebase Console Storage:**
   - https://console.firebase.google.com/project/scs-lims/storage

2. **Navigate to the `company/logo/` folder:**
   - Click on `company/` folder
   - Then click on `logo/` folder (or create it if it doesn't exist)

3. **Click "Upload file" button** (usually at the top)

4. **Select a test image file** and upload it

5. **Results:**
   - ✅ **If upload succeeds in Firebase Console** → Your app has a configuration/authentication issue
   - ❌ **If upload also fails in Firebase Console** → Confirms it's a Storage/IAM permissions issue

### Test 2: Check Storage Bucket URL

The 412 error might be because the storage bucket URL is incorrect. Let's verify:

1. **Check your `.env` file** (or environment variables)
2. **Verify `VITE_FIREBASE_STORAGE_BUCKET` matches:**
   - Should be: `scs-lims.firebasestorage.app`
   - Or: `scs-lims.appspot.com` (if using default bucket)

3. **If it's different, update it and restart your app**

### Test 3: Try Different Storage Path

Maybe the issue is with the specific path. Let's test a different location:

1. **In your app, temporarily change the upload path** from:
   - `company/logo/logo_xxx.png`
   - To: `test-upload/test.png`

2. **Update storage rules** to allow this path:
   ```javascript
   match /test-upload/{fileName} {
     allow read, write: if true;
   }
   ```

3. **Deploy rules and test upload**

4. **If this works, the issue might be with the `company/logo/` path specifically**

## Most Important: Firebase Console Test

**Please do Test 1 first** - this will immediately tell us if:
- The problem is in your app code (if Firebase Console works)
- OR it's a Storage permissions issue (if Firebase Console also fails)

If Firebase Console upload works, then we know:
- Storage is configured correctly
- IAM permissions are fine
- The issue is in your app's Firebase SDK configuration or authentication

If Firebase Console upload also fails, then:
- It's definitely a Storage/IAM issue
- We'll need to contact Google Cloud Support or check organization policies

**Please try the Firebase Console upload test and let me know the result!**
