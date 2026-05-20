# Data Lifecycle Management - Deployment Guide

## Prerequisites

1. Firebase Admin SDK configured
2. Cloud Functions enabled
3. Cloud Scheduler enabled
4. Storage Admin access

## Step 1: Deploy Cloud Function

```bash
# Install dependencies
npm install firebase-functions firebase-admin

# Deploy the cleanup function
firebase deploy --only functions:cleanupHardDelete
```

## Step 2: Verify Cloud Scheduler

The function should automatically create a Cloud Scheduler job. Verify:

```bash
gcloud scheduler jobs list --location=us-central1
```

Expected output should include:
- `cleanup-hard-delete` job
- Schedule: `0 2 * * *` (daily at 2 AM UTC)

## Step 3: Test the Function

### Manual Trigger (for testing)

```bash
# Trigger the function manually
gcloud functions call cleanupHardDelete --region=us-central1
```

### View Logs

```bash
# View function logs
firebase functions:log --only cleanupHardDelete

# Or via gcloud
gcloud functions logs read cleanupHardDelete --region=us-central1 --limit=50
```

## Step 4: Run Orphan Detection

### Initial Scan

```typescript
import { generateOrphanReport } from '@/services/orphanDetectionService';

const report = await generateOrphanReport();
console.log(report);
```

### Auto-Cleanup (Use with Caution!)

```typescript
import { detectOrphans } from '@/services/orphanDetectionService';

// First, generate report
const report = await generateOrphanReport();
console.log('Before cleanup:', report);

// Then auto-delete (only after review!)
const result = await detectOrphans(true);
console.log('Cleanup result:', result);
```

## Step 5: Update Existing Code

### Before (❌ FORBIDDEN)

```typescript
import { deleteDoc } from 'firebase/firestore';
await deleteDoc(doc(db, 'jobs', jobId));
```

### After (✅ REQUIRED)

```typescript
import { deleteJob } from '@/services/firestoreDeletionService';
await deleteJob(jobId, {
  userId: currentUser.uid,
  softDelete: true,
});
```

## Step 6: Monitor and Verify

### Check Deletion Service Usage

```bash
# Search for remaining direct deleteDoc calls
grep -r "deleteDoc" src/ --exclude-dir=node_modules
```

Should only find:
- References in `firestoreDeletionService.ts` (allowed)
- References in `cloudFunctions/cleanupOrphanedData.ts` (allowed)
- Comments/documentation

### Monitor Storage Usage

```bash
# Check Storage bucket size
gsutil du -sh gs://your-bucket-name
```

### Monitor Firestore Usage

Check Firebase Console:
- Firestore → Usage tab
- Look for document count trends

## Step 7: Set Up Alerts

### Cloud Function Errors

```bash
# Create alert for function failures
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="Cleanup Function Errors" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=300s \
  --condition-aggregations=count \
  --condition-filter='resource.type="cloud_function" AND resource.labels.function_name="cleanupHardDelete" AND severity="ERROR"'
```

### Orphan Detection Alerts

Set up periodic orphan detection scans and alert if orphans are found.

## Troubleshooting

### Function Not Running

1. Check Cloud Scheduler:
   ```bash
   gcloud scheduler jobs describe cleanup-hard-delete --location=us-central1
   ```

2. Check function logs for errors

3. Verify IAM permissions:
   ```bash
   gcloud projects get-iam-policy YOUR_PROJECT_ID
   ```

### Storage Files Not Deleting

1. Check Storage Admin permissions
2. Verify Storage paths in ownership rules
3. Check function logs for specific errors

### Orphan Detection Not Working

1. Verify Firestore permissions
2. Check collection paths match ownership rules
3. Review orphan detection logs

## Rollback Plan

If issues occur:

1. **Disable Cloud Function**:
   ```bash
   gcloud scheduler jobs pause cleanup-hard-delete --location=us-central1
   ```

2. **Revert Service Changes**:
   ```bash
   git revert HEAD
   ```

3. **Monitor for Issues**:
   - Check deletion service logs
   - Verify no data loss
   - Review orphan detection reports

## Maintenance

### Weekly Tasks

- Review orphan detection reports
- Check Cloud Function execution logs
- Monitor Storage usage trends

### Monthly Tasks

- Review retention policy (currently 30 days)
- Audit deletion service usage
- Verify no direct deleteDoc calls

### Quarterly Tasks

- Review ownership rules for completeness
- Update documentation
- Performance optimization

## Support

For issues or questions:
1. Check `src/dataLifecycle/README.md`
2. Review function logs
3. Run orphan detection
4. Contact development team
