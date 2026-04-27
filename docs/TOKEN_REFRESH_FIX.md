# Token Refresh Fix for 412 Precondition Failed

## Problem Identified

The logs showed a **critical contradiction**:
- ✅ Client-side: "Authentication checks passed" (auth.currentUser exists)
- ❌ Server-side: 412 Precondition Failed with "Authentication token not sent" or "expired"

This indicates that while the client thinks it's authenticated, the **server is not receiving a valid token** in the HTTP request.

## Root Cause

Firebase ID tokens expire after ~1 hour. Even if `auth.currentUser` exists, the token may be:
1. **Expired** - Token expired between client check and server validation
2. **Not refreshed** - SDK didn't automatically refresh the token
3. **Not attached** - Token exists but Storage SDK didn't attach it to the request

## Solution Implemented

### 1. Force Token Refresh Before Upload

Added explicit token refresh **immediately before** the upload call:

```typescript
// Force token refresh right before upload
const refreshedToken = await currentUser.getIdToken(true); // true = force refresh

// Verify token is fresh
const tokenResult = await currentUser.getIdTokenResult(false);
const timeUntilExpiry = tokenResult.expirationTime - Date.now();
```

### 2. Enhanced Diagnostics

The code now logs:
- ✅ Token refresh success/failure
- ✅ Token expiration time and remaining validity
- ✅ Whether token was actually refreshed (vs. cached)
- ✅ Instructions for checking network headers

### 3. Network Header Verification Instructions

The console now explicitly instructs you to:
1. Open DevTools → Network tab
2. Find the request to `firebasestorage.googleapis.com`
3. Check Request Headers for `Authorization: Bearer <token>`
4. Verify the token is present and valid

## What Changed in Code

### Before:
```typescript
// Only checked token during diagnostics
authToken = await currentUser.getIdToken(); // No force refresh

// Upload without explicit refresh
const snapshot = await uploadString(storageRef, base64String, 'data_url', metadata);
```

### After:
```typescript
// Force refresh RIGHT BEFORE upload
console.log('Forcing token refresh with getIdToken(true)...');
refreshedToken = await currentUser.getIdToken(true); // true = force refresh

// Verify token is fresh
const tokenResult = await currentUser.getIdTokenResult(false);
// Check expiration...

// Then upload (SDK should use refreshed token)
const snapshot = await uploadString(storageRef, base64String, 'data_url', metadata);
```

## Why `getIdToken(true)` is Critical

- **`getIdToken(false)`**: Returns cached token if available (may be expired)
- **`getIdToken(true)`**: Forces a fresh token from Firebase Auth servers

By calling `getIdToken(true)` right before upload, we ensure:
1. ✅ Token is fresh (not expired)
2. ✅ Token is valid (not revoked)
3. ✅ Storage SDK has the latest token to attach

## Testing Steps

1. **Run the upload** and check console logs
2. **Look for "🔄 Token Refresh Before Upload"** section
3. **Verify token was refreshed** (should show `matchesPrevious: false` if it was actually refreshed)
4. **Check Network tab**:
   - Open DevTools → Network
   - Find `firebasestorage.googleapis.com` request
   - Check Request Headers → Authorization header
   - Should see: `Authorization: Bearer eyJhbGciOiJSUzI1NiI...`

## Expected Console Output

```
🔄 Token Refresh Before Upload
  Forcing token refresh with getIdToken(true)...
  ✅ Token refreshed successfully: { exists: true, length: 1234, ... }
  Token expiration check: { expiresIn: "3600s", isExpired: false, isFresh: true }
```

## If 412 Error Persists

If you still get 412 after token refresh:

### Check 1: Authorization Header
- Open Network tab → Find failed request
- Check if `Authorization` header exists
- If **missing** → Storage SDK is not attaching token (SDK bug or initialization issue)
- If **present** → Token may still be invalid (check expiration in logs)

### Check 2: Token Expiration
- Look at "Token expiration check" in console
- If `isExpired: true` → Token expired between refresh and upload (very unlikely)
- If `expiresIn` is very small (< 5 seconds) → Race condition possible

### Check 3: Storage SDK Initialization
- Verify `storage` instance is initialized with the same Firebase app as `auth`
- Both should come from the same `firebaseApp` instance

### Check 4: Temporary Insecure Rule Test
- Use `storage.rules.test-insecure.ts` to test if it's definitely auth-related
- If upload succeeds with `allow write: if true` → Confirms it's authentication
- If upload still fails → Issue is something else (network, CORS, file format)

## Next Steps

1. **Test the upload** with the new token refresh code
2. **Check the console** for token refresh confirmation
3. **Inspect Network tab** for Authorization header
4. **Report back**:
   - Did token refresh succeed?
   - Is Authorization header present in network request?
   - Does upload succeed or still fail with 412?

## References

- [Firebase Auth Token Management](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [getIdToken() Documentation](https://firebase.google.com/docs/reference/js/auth.user#getidtoken)
- [Storage SDK Auth Integration](https://firebase.google.com/docs/storage/web/start#use_a_custom_firebase_app)
