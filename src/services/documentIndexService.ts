import {
  db,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from './firebase';
import type { DocumentIndexItem, DocumentIndexItemInput, DocumentIndexType, DocumentSource } from '../types';
import { removeUndefinedForFirestore } from './jobService';

const COLLECTION = 'document_index';

const DOC_INDEX_TYPES: DocumentIndexType[] = [
  'Quality Manual', 'Quality Procedure', 'Work Instruction',
  'Calibration Procedure', 'Testing Procedure', 'Form', 'Support Document',
];

type DocumentIndexDoc = {
  documentCode: string;
  type: DocumentIndexItem['type'];
  revisionNumber: string;
  documentName: string;
  tags: string[];
  effectiveDate: Timestamp | Date | string;
  darNumber?: string;
  source: DocumentSource;
  darSource?: DocumentSource;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy: string;
  updatedBy: string;
};

const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  const anyV = v as any;
  if (anyV?.toDate && typeof anyV.toDate === 'function') return anyV.toDate();
  return new Date();
};

/** True if v is a Firestore FieldValue or other non-serializable object (must not be rendered as React child). */
const isFirestoreSentinel = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && '_methodName' in v;

const safeString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

const docToItem = (id: string, data: DocumentIndexDoc): DocumentIndexItem => {
  const source = data.source && typeof data.source === 'object' && !isFirestoreSentinel(data.source) && 'kind' in data.source
    ? (data.source as DocumentSource)
    : ({ kind: 'link' as const, url: '' });
  const darSource = data.darSource && typeof data.darSource === 'object' && !isFirestoreSentinel(data.darSource) && 'kind' in data.darSource
    ? (data.darSource as DocumentSource)
    : undefined;
  const type: DocumentIndexType = typeof data.type === 'string' && (DOC_INDEX_TYPES as string[]).includes(data.type)
    ? (data.type as DocumentIndexType)
    : 'Support Document';
  return {
    id,
    documentCode: safeString(data.documentCode) ?? '',
    type,
    revisionNumber: safeString(data.revisionNumber) ?? '01',
    documentName: safeString(data.documentName) ?? '',
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
    effectiveDate: toDate(data.effectiveDate),
    darNumber: safeString(data.darNumber),
    source,
    darSource,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: safeString(data.createdBy) ?? '',
    updatedBy: safeString(data.updatedBy) ?? '',
  };
};

export const documentIndexService = {
  async list(): Promise<DocumentIndexItem[]> {
    const q = query(collection(db, COLLECTION), orderBy('documentCode', 'asc'), orderBy('revisionNumber', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToItem(d.id, d.data() as DocumentIndexDoc));
  },

  subscribe(callback: (items: DocumentIndexItem[]) => void, onError?: (err: Error) => void): () => void {
    const q = query(collection(db, COLLECTION), orderBy('documentCode', 'asc'), orderBy('revisionNumber', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => docToItem(d.id, d.data() as DocumentIndexDoc));
        callback(items);
      },
      (err) => {
        if (onError) onError(err as any);
      }
    );
  },

  async getById(id: string): Promise<DocumentIndexItem | null> {
    const ref = doc(db, COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return docToItem(snap.id, snap.data() as DocumentIndexDoc);
  },

  async create(input: DocumentIndexItemInput, userId: string): Promise<string> {
    const now = serverTimestamp();
    const docData: any = {
      documentCode: input.documentCode,
      type: input.type,
      revisionNumber: input.revisionNumber,
      documentName: input.documentName,
      tags: input.tags || [],
      effectiveDate: input.effectiveDate instanceof Date ? Timestamp.fromDate(input.effectiveDate) : input.effectiveDate,
      ...(input.darNumber ? { darNumber: input.darNumber } : {}),
      source: input.source,
      ...(input.darNumber && input.darSource ? { darSource: input.darSource } : {}),
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const cleaned = removeUndefinedForFirestore(docData) as Record<string, unknown>;
    const ref = await addDoc(collection(db, COLLECTION), cleaned as any);
    return ref.id;
  },

  async update(id: string, updates: Partial<DocumentIndexItemInput>, userId: string): Promise<void> {
    const ref = doc(db, COLLECTION, id);

    // Strip Firestore special objects from the plain-data copy before JSON serialization,
    // then re-attach them afterward so JSON.stringify doesn't destroy them.
    const { effectiveDate, darNumber, darSource, ...plainUpdates } = updates as any;
    const base = { ...plainUpdates, updatedBy: userId };
    const cleaned = removeUndefinedForFirestore(base) as Record<string, unknown>;

    // Attach Firestore special objects after serialization
    cleaned.updatedAt = serverTimestamp();
    if (effectiveDate instanceof Date) {
      cleaned.effectiveDate = Timestamp.fromDate(effectiveDate);
    } else if (effectiveDate !== undefined) {
      cleaned.effectiveDate = effectiveDate;
    }
    if (darNumber === '') {
      cleaned.darNumber = deleteField();
    } else if (darNumber !== undefined) {
      cleaned.darNumber = darNumber;
    }
    if (darSource === null) {
      cleaned.darSource = deleteField();
    } else if (darSource !== undefined) {
      cleaned.darSource = darSource;
    }

    await updateDoc(ref, cleaned as any);
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },

  /** Upsert is useful for migrations/tests */
  async set(id: string, input: DocumentIndexItemInput, userId: string): Promise<void> {
    const ref = doc(db, COLLECTION, id);
    const now = serverTimestamp();
    const docData: any = {
      ...input,
      effectiveDate: input.effectiveDate instanceof Date ? Timestamp.fromDate(input.effectiveDate) : input.effectiveDate,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    const cleaned = removeUndefinedForFirestore(docData) as Record<string, unknown>;
    await setDoc(ref, cleaned as any, { merge: true });
  },
};

