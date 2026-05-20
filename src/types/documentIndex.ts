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
}

export type DocumentIndexItemInput = Omit<
  DocumentIndexItem,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
>;

