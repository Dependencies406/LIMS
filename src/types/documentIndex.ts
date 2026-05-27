export type DocumentIndexType =
  | 'Quality Manual'
  | 'Quality Procedure'
  | 'Work Instruction'
  | 'Calibration Procedure'
  | 'Testing Procedure'
  | 'Form'
  | 'Support Document';

export type DocumentSource =
  | { kind: 'pdf'; storagePath: string; url: string; fileName: string }
  | { kind: 'link'; url: string };

export interface DocumentIndexItem {
  id: string;
  documentCode: string;
  type: DocumentIndexType;
  /** Always 2 digits (e.g., "01", "02") */
  revisionNumber: string;
  documentName: string;
  tags: string[];
  /** Stored as Firestore Timestamp, normalized on read */
  effectiveDate: Date;
  darNumber?: string;
  source: DocumentSource;
  /** Required if darNumber is set */
  darSource?: DocumentSource;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  // ─── Extended / legacy fields used by documentPdfService and notificationService ───
  /** Legacy alias for documentName */
  title?: string;
  /** Legacy alias for documentCode */
  documentId?: string;
  /** Legacy alias for revisionNumber */
  revision?: string;
  /** Document category (additional metadata) */
  category?: string;
  /** Short description for the document */
  description?: string;
  /** HTML body content stored on the document record */
  content?: string;
  /** Display name of the creator */
  createdByName?: string;
  /** Review signature metadata */
  reviewSignature?: { userName: string; signedAt: Date };
  /** Approval signature metadata */
  approvalSignature?: { userName: string; signedAt: Date };
}

export type DocumentIndexItemInput = Omit<
  DocumentIndexItem,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

