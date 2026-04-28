# Google Drive Backup — Setup Guide

This guide covers the one-time setup required to enable the **Google Drive Backup** feature in LIMS.  
The feature exports all job data and file attachments to a specified Google Drive folder on demand.

---

## Architecture Overview

```
LIMS App (React)
    └── DriveBackupModal  →  driveBackupService.ts
                                  └── Firebase Cloud Function (exportJobsToGoogleDrive)
                                            ├── Reads jobs from Firestore
                                            ├── Downloads attachments from Firebase Storage
                                            └── Uploads everything to Google Drive via Service Account
```

---

## Prerequisites

- Firebase project set up and `firebase` CLI installed and logged in
- Access to Google Cloud Console for the same project (`scs-lims`)
- A Google Drive folder to use as the backup destination

---

## Step 1 — Enable Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Make sure the correct project (`scs-lims`) is selected in the top dropdown
3. Navigate to **APIs & Services → Library**
4. Search for **"Google Drive API"**
5. Click it → click **Enable**

---

## Step 2 — Create a Service Account

1. In Google Cloud Console → **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Fill in:
   - **Name:** `lims-drive-backup` (or any name you prefer)
   - **Description:** `Service account for LIMS Google Drive backup`
4. Click **Done** (no need to assign project roles for Drive access)

---

## Step 3 — Generate a JSON Key

1. In **APIs & Services → Credentials**, find the service account you just created
2. Click on it → go to the **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. The key file downloads automatically — save it somewhere safe (e.g. `Downloads`)

> **Security:** Never commit this file to git. Never paste its contents into chat or email.  
> If the key is ever exposed, go to the Keys tab and **delete it immediately**, then generate a new one.

---

## Step 4 — Share Your Drive Folder with the Service Account

1. Open [Google Drive](https://drive.google.com/)
2. Navigate to the folder you want to use as the backup destination (or create a new one called `LIMS Backups`)
3. Right-click the folder → **Share**
4. Paste the service account email:  
   `lims-drive-backup@scs-lims.iam.gserviceaccount.com`
5. Set the role to **Editor**
6. Click **Send** (uncheck "Notify people" if you prefer)

> **Tip:** Copy the folder ID from the URL — you'll need it when running backups.  
> URL format: `https://drive.google.com/drive/folders/FOLDER_ID_IS_HERE`

---

## Step 5 — Store the Key in Firebase Secret Manager

Run the following command, pointing at your downloaded JSON key file:

```bash
firebase functions:secrets:set DRIVE_SERVICE_ACCOUNT --data-file "C:\Users\<you>\Downloads\scs-lims-lims-drive-backup-xxxx.json"
```

Replace the path with the actual path to your downloaded key file.

**Expected output:**
```
✔  Created a new secret version projects/scs-lims/secrets/DRIVE_SERVICE_ACCOUNT/versions/1
```

**Verify the secret was stored:**
```bash
firebase functions:secrets:get DRIVE_SERVICE_ACCOUNT
```

> **Important:** The secret name must be exactly `DRIVE_SERVICE_ACCOUNT` — this is what the Cloud Function looks for.

---

## Step 6 — Install Cloud Function Dependencies

```bash
cd functions
npm install
cd ..
```

This installs `googleapis`, `firebase-admin`, and `firebase-functions` into the `functions/` directory.

---

## Step 7 — Deploy the Cloud Function

```bash
firebase deploy --only functions
```

**Expected output:**
```
✔  functions[asia-southeast1-exportJobsToGoogleDrive]: Successful create operation.
✔  Deploy complete!
```

> If you only want to redeploy the function (not hosting/firestore/storage rules):
> ```bash
> firebase deploy --only functions
> ```

---

## Step 8 — Use the Backup Feature in LIMS

1. Open LIMS → go to **Settings**
2. Click **Google Drive Backup**
3. Paste your Drive folder ID (from Step 4) into the Folder ID field
4. Configure options:
   - **Include file attachments** — uploads all equipment files (recommended)
   - **Include deleted jobs** — includes soft-deleted records
5. Optionally set sharing permissions for the backup folder
6. Click **Run Backup**

The function will create a timestamped folder inside your target folder:  
`LIMS_Backup_2026-04-28_14-30-00/`

Inside, each job gets its own subfolder with `job_data.json` and any attachments.

---

## Redeployment (After Code Changes)

If the Cloud Function code is updated, redeploy with:

```bash
cd functions
npm install   # only needed if dependencies changed
cd ..
firebase deploy --only functions
```

---

## Rotating the Service Account Key

If the key is ever exposed or needs to be rotated:

1. Go to [Cloud Console → IAM → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click the service account → **Keys** tab → delete the old key
3. **Add Key → Create new key → JSON** → download the new file
4. Re-run Step 5 with the new file:
   ```bash
   firebase functions:secrets:set DRIVE_SERVICE_ACCOUNT --data-file "path\to\new-key.json"
   ```
5. Redeploy the function:
   ```bash
   firebase deploy --only functions
   ```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Secret Payload cannot be empty` | Ran `secrets:set` without providing a value | Use `--data-file` flag (Step 5) |
| `DRIVE_SERVICE_ACCOUNT secret not found` | Secret was not set or wrong name | Re-run Step 5 with exact name `DRIVE_SERVICE_ACCOUNT` |
| `Google Drive folder not found` | Folder ID wrong, or service account not shared | Check folder ID; re-share folder with service account email (Step 4) |
| `Invalid service account credentials` | JSON key file is corrupted or has markdown formatting | Re-download a fresh key, use raw file not copied text |
| `unauthenticated` error in app | User is not logged in to LIMS | Log in and try again |
| Function timeout | Too many jobs/attachments | Function has a 9-minute limit; large datasets may need batching |

---

## File Reference

| File | Purpose |
|---|---|
| `functions/src/exportToDrive.ts` | Cloud Function — core backup logic |
| `functions/src/index.ts` | Cloud Functions entry point |
| `functions/package.json` | Cloud Function dependencies |
| `functions/tsconfig.json` | TypeScript config for functions |
| `src/services/driveBackupService.ts` | Frontend service — calls the Cloud Function |
| `src/components/DriveBackupModal.tsx` | Settings UI modal for running backups |
| `firebase.json` | Firebase config — includes `functions` section |

---

## Quick Command Reference

```bash
# Set secret (one-time or when rotating key)
firebase functions:secrets:set DRIVE_SERVICE_ACCOUNT --data-file "path\to\key.json"

# Verify secret exists
firebase functions:secrets:get DRIVE_SERVICE_ACCOUNT

# Install function dependencies
cd functions && npm install && cd ..

# Deploy functions only
firebase deploy --only functions

# Deploy everything (hosting + functions + rules)
firebase deploy
```
