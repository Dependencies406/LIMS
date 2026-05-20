/**
 * Firestore Ownership Rules - Single Source of Truth
 * 
 * Defines parent-child relationships for all Firestore documents.
 * When a parent is deleted, ALL child documents and Storage files MUST be deleted.
 * 
 * This file is the ONLY source of truth for data lifecycle management.
 * 
 * @module dataLifecycle/firestoreOwnership
 */

export interface OwnershipRule {
  /** Firestore collection paths owned by this entity */
  collections: string[];
  /** Firebase Storage path patterns owned by this entity */
  storagePaths: string[];
  /** Optional: Sub-entities that must be deleted first */
  subEntities?: string[];
}

/**
 * Ownership rules for all entities in the system.
 * 
 * Path variables:
 * - {jobId} - Job document ID
 * - {equipmentId} - Equipment document ID
 * - {documentId} - Document document ID
 * - {spreadsheetId} - Spreadsheet document ID
 * - {templateId} - Template document ID
 * - {userId} - User document ID
 * - {customerId} - Customer document ID
 * - {attachmentId} - Attachment file ID
 */
export const OWNERSHIP_RULES: Record<string, OwnershipRule> = {
  /**
   * Job ownership rules
   * When a job is deleted, ALL related data must be deleted.
   */
  job: {
    collections: [
      'jobs/{jobId}',
      'jobs/{jobId}/equipment',
      'jobs/{jobId}/documents',
      'jobs/{jobId}/spreadsheets',
      'jobs/{jobId}/attachments',
      'jobs/{jobId}/serviceRequests',
      'jobs/{jobId}/notifications',
    ],
    storagePaths: [
      'jobs/{jobId}/**', // All files under this job
    ],
    subEntities: ['equipment', 'document', 'spreadsheet'],
  },

  /**
   * Equipment ownership rules
   * Equipment belongs to a job, so it's a sub-entity.
   */
  equipment: {
    collections: [
      'jobs/{jobId}/equipment/{equipmentId}',
      'jobs/{jobId}/equipment/{equipmentId}/spreadsheets',
      'jobs/{jobId}/equipment/{equipmentId}/attachments',
      'jobs/{jobId}/equipment/{equipmentId}/calibrationRecords',
    ],
    storagePaths: [
      'jobs/{jobId}/equipment/{equipmentId}/**',
    ],
    subEntities: ['spreadsheet'],
  },

  /**
   * Document ownership rules
   * Documents belong to jobs.
   */
  document: {
    collections: [
      'jobs/{jobId}/documents/{documentId}',
      'jobs/{jobId}/documents/{documentId}/revisions',
      'jobs/{jobId}/documents/{documentId}/attachments',
    ],
    storagePaths: [
      'jobs/{jobId}/documents/{documentId}/**',
      'documents/{documentId}/**', // Legacy path support
    ],
  },

  /**
   * Spreadsheet ownership rules
   * Spreadsheets can belong to jobs or equipment.
   */
  spreadsheet: {
    collections: [
      'jobs/{jobId}/spreadsheets/{spreadsheetId}',
      'jobs/{jobId}/equipment/{equipmentId}/spreadsheets/{spreadsheetId}',
      'spreadsheets/{spreadsheetId}',
    ],
    storagePaths: [
      'jobs/{jobId}/spreadsheets/{spreadsheetId}/**',
      'jobs/{jobId}/equipment/{equipmentId}/spreadsheets/{spreadsheetId}/**',
    ],
  },

  /**
   * Template ownership rules
   * Templates are root-level but may have attachments.
   */
  template: {
    collections: [
      'templates/{templateId}',
      'templates/{templateId}/versions',
    ],
    storagePaths: [
      'templates/{templateId}/**',
    ],
  },

  /**
   * Customer ownership rules
   * Customers are root-level but may have attachments.
   */
  customer: {
    collections: [
      'customers/{customerId}',
      'customers/{customerId}/attachments',
      'customers/{customerId}/serviceRequests',
    ],
    storagePaths: [
      'customers/{customerId}/**',
    ],
  },

  /**
   * User ownership rules
   * Users are root-level but may have avatars and related data.
   */
  user: {
    collections: [
      'users/{userId}',
      'users/{userId}/notifications',
      'users/{userId}/preferences',
    ],
    storagePaths: [
      'users/{userId}/**',
      'avatars/{userId}/**',
    ],
  },

  /**
   * Service Request ownership rules
   * Service requests belong to customers or jobs.
   */
  serviceRequest: {
    collections: [
      'serviceRequests/{requestId}',
      'customers/{customerId}/serviceRequests/{requestId}',
      'jobs/{jobId}/serviceRequests/{requestId}',
    ],
    storagePaths: [
      'serviceRequests/{requestId}/**',
    ],
  },
};

/**
 * Get ownership rule for an entity type
 */
export function getOwnershipRule(entityType: string): OwnershipRule | undefined {
  return OWNERSHIP_RULES[entityType];
}

/**
 * Resolve collection paths with actual IDs
 */
export function resolveCollectionPaths(
  entityType: string,
  params: Record<string, string>
): string[] {
  const rule = getOwnershipRule(entityType);
  if (!rule) {
    return [];
  }

  return rule.collections.map((path) => {
    let resolved = path;
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`{${key}}`, value);
    }
    return resolved;
  });
}

/**
 * Resolve Storage paths with actual IDs
 */
export function resolveStoragePaths(
  entityType: string,
  params: Record<string, string>
): string[] {
  const rule = getOwnershipRule(entityType);
  if (!rule) {
    return [];
  }

  return rule.storagePaths.map((path) => {
    let resolved = path;
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`{${key}}`, value);
    }
    return resolved;
  });
}

/**
 * Get all sub-entity types for an entity
 */
export function getSubEntities(entityType: string): string[] {
  const rule = getOwnershipRule(entityType);
  return rule?.subEntities || [];
}
