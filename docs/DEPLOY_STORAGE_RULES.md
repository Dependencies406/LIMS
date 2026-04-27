# Deploy Firebase Storage Rules

## Problem
If you're getting a `403 Unauthorized` error when uploading or accessing equipment attachment files, the Firebase Storage security rules need to be deployed.

## Solution

### Option 1: Deploy via Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Deploy Storage Rules**:
   ```bash
   firebase deploy --only storage
   ```

### Option 2: Deploy via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`scs-lims`)
3. Navigate to **Storage** in the left sidebar
4. Click on the **Rules** tab
5. Copy the contents of `storage.rules` file
6. Paste into the rules editor
7. Click **Publish**

## Verify Rules

After deploying, the rules should allow:
- ✅ Authenticated users to read/write equipment attachments at `jobs/{jobId}/equipment/{equipmentIndex}/attachments/{fileName}`
- ✅ Authenticated users to read/write job attachments
- ✅ Authenticated users to read/write company logos
- ✅ Authenticated users to read/write customer files
- ✅ Users to read/write their own avatars

## Current Rules Location

The rules file is located at: `storage.rules` (root of project)

## Troubleshooting

If you still get 403 errors after deploying:

1. **Check authentication**: Make sure the user is logged in
2. **Check rule syntax**: Verify the rules match the file path pattern
3. **Check Firebase Console**: Go to Storage > Rules and verify rules are published
4. **Clear browser cache**: Sometimes cached rules can cause issues

## Rule Pattern for Equipment Attachments

```
jobs/{jobId}/equipment/{equipmentIndex}/attachments/{fileName}
```

Example path:
```
jobs/C2dJDOHK6Hs49Xeu8Gq3/equipment/0/attachments/1765029160161_ASTM_E2658-15.pdf
```

This should match the rule:
```
match /jobs/{jobId}/equipment/{equipmentIndex}/attachments/{fileName}
```

