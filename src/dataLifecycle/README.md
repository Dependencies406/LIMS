# Data Lifecycle Management

This directory contains the centralized data lifecycle management system for the LIMS application.

## ⚠️ CRITICAL RULES

### ❌ FORBIDDEN
- **NEVER** call `deleteDoc()` directly from UI components or services
- **NEVER** delete Storage files directly from UI components
- **NEVER** bypass the deletion service

### ✅ REQUIRED
- **ALWAYS** use `firestoreDeletionService` for all deletions
- **ALWAYS** update `firestoreOwnership.ts` when adding new entity types
- **ALWAYS** test deletion with orphan detection after changes

## Architecture

### 1. Ownership Rules (`firestoreOwnership.ts`)
Single source of truth for parent-child relationships. Defines:
- Which Firestore collections belong to each entity
- Which Storage paths belong to each entity
- Sub-entity relationships

### 2. Deletion Service (`services/firestoreDeletionService.ts`)
Centralized service that handles:
- Recursive deletion of child collections
- Storage file cleanup
- Soft delete support
- Audit logging

### 3. Cloud Function (`cloudFunctions/cleanupOrphanedData.ts`)
Scheduled function that:
- Performs hard deletion of soft-deleted documents after retention period
- Runs daily at 2 AM UTC
- Retention period: 30 days

### 4. Orphan Detection (`services/orphanDetectionService.ts`)
Safety net that:
- Detects orphaned Firestore documents
- Detects orphaned Storage files
- Can auto-delete or generate reports

## Usage

### Deleting a Job
```typescript
import { deleteJob } from '@/services/firestoreDeletionService';

await deleteJob(jobId, {
  userId: currentUser.uid,
  softDelete: true, // Soft delete for audit trail
});
```

### Deleting Equipment
```typescript
import { deleteEquipment } from '@/services/firestoreDeletionService';

await deleteEquipment(jobId, equipmentId, {
  userId: currentUser.uid,
  softDelete: false, // Hard delete
});
```

### Detecting Orphans
```typescript
import { detectOrphans, generateOrphanReport } from '@/services/orphanDetectionService';

// Generate report
const report = await generateOrphanReport();
console.log(report);

// Auto-delete orphans (use with caution!)
const result = await detectOrphans(true);
console.log(`Deleted ${result.documentsDeleted} documents and ${result.filesDeleted} files`);
```

## Adding New Entity Types

1. **Update Ownership Rules**
   ```typescript
   // In firestoreOwnership.ts
   newEntity: {
     collections: [
       'newEntities/{entityId}',
       'newEntities/{entityId}/subcollections',
     ],
     storagePaths: [
       'newEntities/{entityId}/**',
     ],
   }
   ```

2. **Add Deletion Function**
   ```typescript
   // In firestoreDeletionService.ts
   export async function deleteNewEntity(
     entityId: string,
     options: DeletionOptions
   ): Promise<DeletionResult> {
     // Implementation
   }
   ```

3. **Update Cloud Function**
   Add cleanup logic in `cleanupOrphanedData.ts`

4. **Update Services**
   Replace direct `deleteDoc()` calls with deletion service

## Testing

After any deletion operation, run orphan detection:
```typescript
const result = await detectOrphans(false);
if (result.orphanedDocuments.length > 0 || result.orphanedFiles.length > 0) {
  console.error('Orphans detected!', result);
}
```

## Deployment

1. Deploy Cloud Function:
   ```bash
   firebase deploy --only functions:cleanupHardDelete
   ```

2. Verify Cloud Scheduler:
   ```bash
   gcloud scheduler jobs list
   ```

3. Monitor logs:
   ```bash
   firebase functions:log --only cleanupHardDelete
   ```

## Retention Policy

- **Soft Delete**: Immediate (sets `isDeleted: true`)
- **Hard Delete**: 30 days after soft delete
- **Orphan Detection**: Run manually or via scheduled job

## Compliance

This system ensures:
- ✅ No orphaned Firestore documents
- ✅ No orphaned Storage files
- ✅ Complete audit trail
- ✅ ISO 17025 compliance
- ✅ Data lifecycle enforcement
