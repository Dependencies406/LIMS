/**
 * staffDocumentService.ts
 * Upload, list, and delete files attached to a staff member's personnel record.
 *
 * Storage path : staff/{staffUid}/documents/{timestamp}_{sanitisedName}
 * Firestore    : staffDocuments/{docId}
 */
import type { StaffDocument, StaffDocumentCategory } from '../types';
import {
  db,
  storage,
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from './firebase';

const FS_COLLECTION = 'staffDocuments';

function buildStoragePath(staffUid: string, safeName: string): string {
  return `staff/${staffUid}/documents/${safeName}`;
}

function rowToDoc(id: string, data: Record<string, any>): StaffDocument {
  const toDate = (v: any): Date => {
    if (!v) return new Date();
    if (v instanceof Date) return v;
    if (v && typeof v.toDate === 'function') return v.toDate();
    return new Date(v);
  };

  return {
    id,
    staffUid: data.staffUid ?? '',
    name: data.name ?? '',
    category: (data.category ?? 'Other') as StaffDocumentCategory,
    size: data.size ?? 0,
    mimeType: data.mimeType ?? '',
    url: data.url ?? '',
    storagePath: data.storagePath ?? '',
    uploadedAt: toDate(data.uploadedAt),
    uploadedBy: data.uploadedBy ?? '',
    uploadedByName: data.uploadedByName ?? '',
  };
}

export type UploadProgressCallback = (percent: number) => void;

export const staffDocumentService = {
  /** Fetch all documents for a staff member, newest-first (sorted in JS). */
  async getDocumentsForStaff(staffUid: string): Promise<StaffDocument[]> {
    const q = query(
      collection(db, FS_COLLECTION),
      where('staffUid', '==', staffUid),
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) =>
      rowToDoc(d.id, d.data() as Record<string, any>),
    );
    return rows.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  },

  /**
   * Upload a file to Firebase Storage then save metadata to Firestore.
   * `onProgress` is called with 0–100 as the upload proceeds.
   */
  uploadDocument(
    staffUid: string,
    file: File,
    category: StaffDocumentCategory,
    uploadedBy: string,
    uploadedByName: string,
    onProgress?: UploadProgressCallback,
  ): Promise<StaffDocument> {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')}`;
    const path = buildStoragePath(staffUid, safeName);
    const ref = storageRef(storage, path);

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref, file, { contentType: file.type });

      task.on(
        'state_changed',
        (snapshot) => {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );
          onProgress?.(pct);
        },
        (err) => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            const payload = {
              staffUid,
              name: file.name,
              category,
              size: file.size,
              mimeType: file.type,
              url,
              storagePath: path,
              uploadedAt: serverTimestamp(),
              uploadedBy,
              uploadedByName,
            };
            const fsRef = await addDoc(collection(db, FS_COLLECTION), payload);
            resolve(rowToDoc(fsRef.id, { ...payload, uploadedAt: new Date() }));
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  },

  /** Remove a document from both Firebase Storage and Firestore. */
  async deleteDocument(document: StaffDocument): Promise<void> {
    // Remove file from Storage (tolerate already-deleted)
    try {
      await deleteObject(storageRef(storage, document.storagePath));
    } catch (e: any) {
      if (e?.code !== 'storage/object-not-found') throw e;
    }
    // Remove Firestore metadata record
    await deleteDoc(doc(db, FS_COLLECTION, document.id));
  },
};
