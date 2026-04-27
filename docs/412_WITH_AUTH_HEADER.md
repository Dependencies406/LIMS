# 412 Error with Authorization Header Present - Analysis

## Critical Finding

**The Authorization header IS being sent in the network request**, but the server still returns `412 Precondition Failed`.

### Network Request Analysis

From your network request:
- ✅ **Authorization header present**: `authorization: Firebase eyJhbGciOiJSUzI1NiIs...`
- ✅ **Token format correct**: Uses `Firebase` scheme (not `Bearer`) - this is correct for Firebase Storage
- ❌ **Status**: `412 Precondition Failed`
- ✅ **Request method**: `POST` to correct endpoint

## What This Means

Since the token **IS being sent** but the server **still rejects it**, the issue is one of:

1. **Token Validation Failure**: The token is expired, invalid, or for the wrong project
2. **Storage Rules Evaluation**: The Security Rules are evaluating `request.auth` as `null` despite the token being present
3. **Project/Bucket Mismatch**: The token is for a different Firebase project than the storage bucket
4. **Token Format Issue**: The token format is incorrect (though it looks correct)

## Token Analysis

From the JWT token in your request, we can decode:
- **Issuer (iss)**: Should be `https://securetoken.google.com/{projectId}`
- **Audience (aud)**: Should match your Firebase project ID
- **User ID (sub/user_id)**: The authenticated user's UID
- **Expiration (exp)**: Token expiration timestamp
- **Issued At (iat)**: When the token was issued

## Most Likely Causes

### 1. Storage Security Rules Not Deployed

**Symptom**: Rules exist locally but aren't deployed to Firebase

**Check**:
```bash
# Verify rules are deployed
firebase deploy --only storage

# Check in Firebase Console
# Storage → Rules tab → Verify your rules are there
```

### 2. Token Project Mismatch

**Symptom**: Token is for project A, but storage bucket is for project B

**Check**:
- Token issuer should match your Firebase project ID
- Storage bucket should be `{projectId}.firebasestorage.app`
- Both should match in your `firebaseConfig`

### 3. Storage Rules Syntax Error

**Symptom**: Rules have a syntax error causing them to always fail

**Check**:
```bash
# Test rules locally
firebase emulators:start --only storage

# Or check in Firebase Console for syntax errors
```

### 4. Token Expired Between Refresh and Upload

**Symptom**: Token was refreshed but expired before reaching server

**Check**: Look at "Token expiration check" in console logs
- `expiresIn` should be > 0 seconds
- `isExpired` should be `false`

## Diagnostic Code Added

The enhanced code now:
1. ✅ Forces token refresh with `getIdToken(true)`
2. ✅ Decodes and logs token payload (issuer, expiration, user ID)
3. ✅ Verifies token is for correct Firebase project
4. ✅ Adds 100ms delay to ensure token propagation
5. ✅ Enhanced error logging with specific diagnostic steps

## Next Steps

### Step 1: Verify Token Details
Check the console logs for:
- "Token payload (decoded)" section
- Verify `iss` matches your Firebase project
- Verify `exp` is in the future

### Step 2: Check Storage Rules Deployment
1. Go to Firebase Console → Storage → Rules
2. Verify your rules are deployed (should match `storage.rules`)
3. Check for any syntax errors (red indicators)

### Step 3: Test with Insecure Rules
Temporarily deploy insecure rules to confirm it's auth-related:

```bash
# Backup current rules
cp storage.rules storage.rules.backup

# Use test rules
cp storage.rules.test-insecure.ts storage.rules

# Deploy
firebase deploy --only storage

# Test upload
# If it works → Confirms it's authentication/rules
# If it still fails → Issue is something else

# Restore immediately
cp storage.rules.backup storage.rules
firebase deploy --only storage
```

### Step 4: Verify Firebase Project Configuration
Check that all these match:
- `firebaseConfig.projectId` in your code
- Firebase project ID in Firebase Console
- Storage bucket name (`{projectId}.firebasestorage.app`)
- Token issuer in decoded JWT

## Expected Console Output

After the fix, you should see:

```
🔄 Token Refresh Before Upload
  Forcing token refresh with getIdToken(true)...
  ✅ Token refreshed successfully: { exists: true, length: 1234, ... }
  Token expiration check: { expiresIn: "3600s", isExpired: false, isFresh: true }
  Token payload (decoded): {
    iss: "https://securetoken.google.com/scs-lims",
    aud: "scs-lims",
    sub: "AK6UpVpTdUUmvwTfgIWqQhZx00k1",
    exp: "2026-01-08T16:28:56.000Z",
    email: "sila.s@scslims.com"
  }
  ✅ Token refresh complete, proceeding with upload...
```

## If Error Persists

If you still get 412 after all checks:

1. **Check Firebase Console → Storage → Rules**:
   - Are rules deployed?
   - Any syntax errors?
   - Does the rule path match exactly: `company/logo/{fileName}`?

2. **Verify Token in Network Request**:
   - Open Network tab → Find failed request
   - Check Authorization header value
   - Copy the token and decode at https://jwt.io
   - Verify `exp` (expiration) is in the future
   - Verify `iss` matches your project

3. **Check Storage Bucket**:
   - Firebase Console → Storage → Files
   - Verify bucket name matches your project
   - Check if you can manually upload via Console

4. **Try Different Upload Method**:
   - Test with `uploadBytes` instead of `uploadString`
   - Test with a different file
   - Test from a different browser/incognito

## References

- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [JWT Token Decoder](https://jwt.io)
- [Firebase Storage Troubleshooting](https://firebase.google.com/docs/storage/web/download-files#handle_errors)
