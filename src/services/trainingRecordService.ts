/**
 * trainingRecordService.ts
 * CRUD for staff training records stored in Firestore.
 * Collection: `trainingRecords`
 * Form reference: LAB-FM-QP-03-005 Rev.00
 */
import type { TrainingRecord } from '../types';
import {
  db,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from './firebase';

const COLLECTION = 'trainingRecords';

function docToRecord(id: string, data: Record<string, any>): TrainingRecord {
  const toDate = (v: any): Date => {
    if (!v) return new Date();
    if (v instanceof Date) return v;
    if (v && typeof v.toDate === 'function') return v.toDate();
    return new Date(v);
  };

  return {
    id,
    staffUid: data.staffUid ?? '',
    staffName: data.staffName ?? '',
    courseName: data.courseName ?? '',
    trainingFormat: data.trainingFormat ?? 'External Training',
    duration: data.duration ?? '',
    organizer: data.organizer ?? '',
    status: data.status ?? 'Planned',
    completionDate: data.completionDate ?? undefined,
    certificateUrl: data.certificateUrl ?? undefined,
    remarks: data.remarks ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const trainingRecordService = {
  /** Get all training records for a specific staff member, sorted by createdAt desc. */
  async getRecordsForStaff(staffUid: string): Promise<TrainingRecord[]> {
    // Use only the equality filter to avoid requiring a composite index.
    // Sorting is done client-side — training records per staff member are small enough.
    const q = query(
      collection(db, COLLECTION),
      where('staffUid', '==', staffUid),
    );
    const snap = await getDocs(q);
    const records = snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, any>));
    return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  /** Get all training records across all staff (for admin overview). */
  async getAllRecords(): Promise<TrainingRecord[]> {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, any>));
  },

  /** Add a new training record. Returns the new document ID. */
  async addRecord(
    data: Omit<TrainingRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  /** Update an existing training record. */
  async updateRecord(
    id: string,
    data: Partial<Omit<TrainingRecord, 'id' | 'createdAt' | 'staffUid'>>,
  ): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  /** Delete a training record. */
  async deleteRecord(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },
};
