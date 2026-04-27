# Firebase Storage 412 Precondition Failed - Analysis & Solutions

## Problem Summary
Encountering `FirebaseError: Firebase Storage: An unknown error occurred (storage/unknown)` with HTTP status `412 Precondition Failed` when uploading to `company/logo/{fileName}`.

---

## 1. Storage Security Rules Analysis

### Current Rule for `company/logo/{fileName}`:
```javascript
match /company/logo/{fileName} {
  allow read, write: if request.auth != null;
}
```

### Analysis:
✅ **Rule is correct** - It requires `request.auth != null`, meaning:
- User must be authenticated
- Auth token must be present in the request
- Token must be valid (not expired)

### Why This Rule Can Cause 412 Errors:

1. **Missing Auth Token**: If Firebase Storage SDK doesn't attach the auth token to the request, `request.auth` will be `null`, causing the rule to fail.

2. **Expired Token**: If the token expired between when you checked `auth.currentUser` and when the upload request is sent, the rule will reject it.

3. **Token Not Refreshed**: Firebase tokens expire after 1 hour. If the user has been logged in for >1 hour, the token needs to be refreshed.

4. **Race Condition**: If auth state changes (user signs out) between your check and the upload, the request will fail.

---

## 2. How Unauthenticated State Leads to 412 Error

### The 412 Precondition Failed Error:

When Firebase Storage receives a request:
1. It checks the Security Rules **before** processing the upload
2. If `request.auth == null` (no token attached), the rule `if request.auth != null` evaluates to `false`
3. Firebase Storage rejects the request with a **412 Precondition Failed** status
4. The SDK wraps this as `storage/unknown` with the 412 status in the server response

### Why 412 Instead of 403?

- **412 Precondition Failed**: The request failed because a precondition (the security rule) was not met
- **403 Forbidden**: Would indicate the user is authenticated but lacks permission
- Since the rule check happens before authentication validation, Firebase returns 412

---

## 3. Diagnostic Code Added

The enhanced `uploadCompanyLogo` function now includes:

### Authentication Checks:
1. ✅ **Current User State**: Logs `auth.currentUser` details (uid, email, verification status)
2. ✅ **Auth Token Retrieval**: Explicitly gets the ID token using `getIdToken()`
3. ✅ **Token Validation**: Checks token expiration time and validity
4. ✅ **Auth State Ready**: Waits for auth state to be fully initialized

### Error Logging:
- Enhanced 412 error detection
- Logs current auth state when 412 occurs
- Provides diagnostic information about likely causes

### Console Output:
When you upload, you'll see:
```
🔐 Authentication Diagnostics
  1. auth.currentUser: { exists: true, uid: "...", email: "..." }
  2. Auth Token: { exists: true, length: 1234, preview: "eyJhbGciOiJSUzI1NiI..." }
  3. Token Details: { issuedAt: "...", expirationTime: "...", expiresIn: "3600s", isExpired: false }
  4. Auth State Ready: { userExists: true, uid: "...", matchesCurrentUser: true }
✅ Authentication checks passed
```

---

## 4. Temporary Insecure Rule for Testing

### File: `storage.rules.test-insecure.ts`

This file contains a temporary rule that allows **anyone** to upload to `company/logo/{fileName}`:

```javascript
match /company/logo/{fileName} {
  allow read, write: if true;  // ⚠️ INSECURE - Allows anyone
}
```

### How to Use (Testing Only):

1. **Backup your current rules:**
   ```bash
   cp storage.rules storage.rules.backup
   ```

2. **Apply the test rules:**
   ```bash
   cp storage.rules.test-insecure.ts storage.rules
   ```

3. **Deploy the test rules:**
   ```bash
   firebase deploy --only storage
   ```

4. **Test your upload:**
   - Try uploading the logo
   - Check the console for diagnostic output
   - If upload succeeds → **The issue is authentication/security rules**
   - If upload still fails → **The issue is something else** (network, file format, etc.)

5. **Restore your secure rules immediately:**
   ```bash
   cp storage.rules.backup storage.rules
   firebase deploy --only storage
   ```

### Why This Rule is Insecure:

- ❌ **No Authentication Required**: Anyone can upload/delete company logos
- ❌ **No Authorization**: No user verification
- ❌ **Public Access**: Files are accessible to anyone with the URL
- ✅ **Only for Testing**: Use this **ONLY** to isolate the authentication issue

---

## 5. Common Causes & Solutions

### Cause 1: Auth Token Not Attached
**Symptom**: `auth.currentUser` exists but upload fails with 412

**Solution**: The enhanced code now explicitly gets the token with `getIdToken()`, which forces Firebase to attach it to the request.

### Cause 2: Token Expired
**Symptom**: User logged in >1 hour ago, token expired

**Solution**: The code now checks token expiration. If expired, it will automatically refresh.

### Cause 3: Auth State Not Ready
**Symptom**: Race condition where auth isn't initialized when upload starts

**Solution**: The code now waits for `onAuthStateChanged` to fire, ensuring auth is ready.

### Cause 4: Storage SDK Not Using Auth
**Symptom**: Token exists but Storage SDK doesn't use it

**Solution**: Ensure you're using the same `storage` instance that was initialized with your Firebase app (which includes auth).

---

## 6. Next Steps

1. **Run the enhanced upload function** and check the console diagnostics
2. **If diagnostics show auth is OK but upload still fails** → Try the insecure rule test
3. **If insecure rule allows upload** → The issue is definitely authentication
4. **If insecure rule still fails** → The issue is something else (network, CORS, file format)

---

## 7. Production Fix

Once you've identified the issue:

### If it's authentication:
- Ensure `auth.currentUser` is checked before upload
- Explicitly call `getIdToken()` to force token attachment
- Handle token refresh if expired

### If it's rules:
- Verify your rules are deployed correctly
- Check Firebase Console → Storage → Rules tab
- Ensure no syntax errors in rules

---

## References

- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Firebase Auth Token Management](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [HTTP 412 Status Code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/412)
