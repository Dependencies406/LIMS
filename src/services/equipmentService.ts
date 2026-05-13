import type {
  EquipmentRecord,
  EquipmentStatus,
  UsageLog,
  CalibrationEvent,
  EquipmentDocument,
} from '../types';
import {
  db,
  storage,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from './firebase';

// ─── Helper ─────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as string);
}

function mapEquipment(id: string, data: Record<string, unknown>): EquipmentRecord {
  return {
    id,
    name: data.name as string,
    category: data.category as string,
    manufacturer: data.manufacturer as string,
    model: data.model as string,
    serialNumber: data.serialNumber as string,
    location: data.location as string,
    status: (data.status as EquipmentStatus) || 'pending',
    custodian: data.custodian as string,
    custodianName: data.custodianName as string | undefined,
    authorizedUsers: (data.authorizedUsers as string[]) || [],
    requiresCalibration: Boolean(data.requiresCalibration),
    calibrationInterval: data.calibrationInterval as number | undefined,
    calibrationProcedure: data.calibrationProcedure as string | undefined,
    externalProvider: Boolean(data.externalProvider),
    usagePeriodStart: data.usagePeriodStart as string | undefined,
    usagePeriodEnd: data.usagePeriodEnd as string | undefined,
    registrationDate: (data.registrationDate as string) || '',
    lastCalibrationDate: data.lastCalibrationDate as string | undefined,
    nextCalibrationDate: data.nextCalibrationDate as string | undefined,
    notes: data.notes as string | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: (data.createdBy as string) || '',
  };
}

function mapUsageLog(id: string, data: Record<string, unknown>): UsageLog {
  return {
    id,
    equipmentId: (data.equipmentId as string) || '',
    date: (data.date as string) || '',
    operator: (data.operator as string) || '',
    operatorName: (data.operatorName as string) || '',
    visualInspection: (data.visualInspection as 'pass' | 'fail') || 'pass',
    functionalCheck: (data.functionalCheck as 'pass' | 'fail') || 'pass',
    documentCheck: (data.documentCheck as 'valid' | 'expired' | 'na') || 'valid',
    refValuesVerified: data.refValuesVerified as boolean | undefined,
    correctionValue: data.correctionValue as string | undefined,
    equipmentCondition: (data.equipmentCondition as 'normal' | 'abnormal') || 'normal',
    abnormalDetails: data.abnormalDetails as string | undefined,
    actionTaken: data.actionTaken as string | undefined,
    notes: data.notes as string | undefined,
    overallResult: (data.overallResult as 'pass' | 'fail') || 'pass',
    createdAt: toDate(data.createdAt),
  };
}

// ─── Category prefixes ───────────────────────────────────────────────────────

export const EQUIPMENT_CATEGORIES: { code: string; label: string }[] = [
  { code: 'FRC', label: 'Force' },
  { code: 'TMP', label: 'Temperature' },
  { code: 'PRS', label: 'Pressure' },
  { code: 'DMN', label: 'Dimensional' },
  { code: 'EXP', label: 'External/Rental' },
  { code: 'ELC', label: 'Electrical' },
  { code: 'MSS', label: 'Mass' },
  { code: 'VBR', label: 'Vibration' },
];

// ─── Equipment Service ───────────────────────────────────────────────────────

export interface EquipmentInput {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  custodian: string;
  custodianName?: string;
  authorizedUsers: string[];
  requiresCalibration: boolean;
  calibrationInterval?: number;
  calibrationProcedure?: string;
  externalProvider: boolean;
  usagePeriodStart?: string;
  usagePeriodEnd?: string;
  registrationDate: string;
  notes?: string;
  createdBy: string;
}

export const equipmentService = {
  // ── Subscriptions ─────────────────────────────────────────────────────────

  subscribeToEquipment(
    callback: (items: EquipmentRecord[], error?: Error) => void
  ): () => void {
    const q = query(collection(db, 'equipment'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) =>
          mapEquipment(d.id, d.data() as Record<string, unknown>)
        );
        callback(items);
      },
      (err) => {
        console.error('Error subscribing to equipment:', err);
        callback([], err as Error);
      }
    );
  },

  subscribeToUsageLogs(
    equipmentId: string,
    callback: (logs: UsageLog[], error?: Error) => void
  ): () => void {
    const q = query(
      collection(db, 'equipment', equipmentId, 'usageLogs'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => {
        const logs = snap.docs.map((d) =>
          mapUsageLog(d.id, d.data() as Record<string, unknown>)
        );
        callback(logs);
      },
      (err) => {
        console.error('Error subscribing to usage logs:', err);
        callback([], err as Error);
      }
    );
  },

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getEquipmentById(id: string): Promise<EquipmentRecord | null> {
    const snap = await getDoc(doc(db, 'equipment', id));
    if (!snap.exists()) return null;
    return mapEquipment(snap.id, snap.data() as Record<string, unknown>);
  },

  async getAllEquipment(): Promise<EquipmentRecord[]> {
    const q = query(collection(db, 'equipment'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapEquipment(d.id, d.data() as Record<string, unknown>));
  },

  async createEquipment(input: EquipmentInput): Promise<string> {
    // Check ID uniqueness
    const existing = await getDoc(doc(db, 'equipment', input.id));
    if (existing.exists()) throw new Error(`Equipment ID ${input.id} already exists`);

    // Check serial uniqueness
    const serialQ = query(
      collection(db, 'equipment'),
      where('serialNumber', '==', input.serialNumber)
    );
    const serialSnap = await getDocs(serialQ);
    if (!serialSnap.empty) {
      throw new Error(`Serial number ${input.serialNumber} is already registered`);
    }

    const data: Record<string, unknown> = {
      name: input.name,
      category: input.category,
      manufacturer: input.manufacturer,
      model: input.model,
      serialNumber: input.serialNumber,
      location: input.location,
      status: 'pending',
      custodian: input.custodian,
      custodianName: input.custodianName || '',
      authorizedUsers: input.authorizedUsers,
      requiresCalibration: input.requiresCalibration,
      calibrationInterval: input.calibrationInterval || null,
      calibrationProcedure: input.calibrationProcedure || '',
      externalProvider: input.externalProvider,
      usagePeriodStart: input.usagePeriodStart || null,
      usagePeriodEnd: input.usagePeriodEnd || null,
      registrationDate: input.registrationDate,
      notes: input.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.createdBy,
    };

    await setDoc(doc(db, 'equipment', input.id), data);
    return input.id;
  },

  async updateEquipment(
    id: string,
    data: Partial<Omit<EquipmentInput, 'id' | 'createdBy'>>
  ): Promise<void> {
    await updateDoc(doc(db, 'equipment', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async updateStatus(id: string, status: EquipmentStatus): Promise<void> {
    await updateDoc(doc(db, 'equipment', id), {
      status,
      updatedAt: serverTimestamp(),
    });
  },

  async approveRegistration(id: string): Promise<void> {
    const eq = await this.getEquipmentById(id);
    if (!eq) throw new Error('Equipment not found');

    // Compute initial status
    let status: EquipmentStatus = 'active';
    if (eq.requiresCalibration && eq.nextCalibrationDate) {
      const due = new Date(eq.nextCalibrationDate);
      const today = new Date();
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (diffDays < 0) status = 'overdue';
      else if (diffDays <= 30) status = 'due_soon';
    }

    await this.updateStatus(id, status);
  },

  async rejectRegistration(id: string): Promise<void> {
    await deleteDoc(doc(db, 'equipment', id));
  },

  // ── ID generation ─────────────────────────────────────────────────────────

  async suggestEquipmentId(category: string): Promise<string> {
    const prefix = `CAL-${category}-`;
    const q = query(
      collection(db, 'equipment'),
      where('category', '==', category)
    );
    const snap = await getDocs(q);

    let maxSeq = 0;
    snap.docs.forEach((d) => {
      const id: string = d.id;
      if (id.startsWith(prefix)) {
        const seq = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });

    const next = (maxSeq + 1).toString().padStart(3, '0');
    return `${prefix}${next}`;
  },

  validateEquipmentId(id: string): boolean {
    return /^CAL-[A-Z]{3}-\d{3}$/.test(id);
  },

  // ── Usage Logs ────────────────────────────────────────────────────────────

  async addUsageLog(
    equipmentId: string,
    log: Omit<UsageLog, 'id' | 'createdAt'>
  ): Promise<string> {
    const ref = await addDoc(
      collection(db, 'equipment', equipmentId, 'usageLogs'),
      {
        ...log,
        createdAt: serverTimestamp(),
      }
    );

    // Auto-update equipment status based on log result
    if (log.overallResult === 'fail' || log.equipmentCondition === 'abnormal') {
      await this.updateStatus(equipmentId, 'out_of_service');
    } else if (log.documentCheck === 'expired') {
      const eq = await this.getEquipmentById(equipmentId);
      if (eq?.status === 'active') {
        await this.updateStatus(equipmentId, 'overdue');
      }
    }

    return ref.id;
  },

  async getUsageLogs(equipmentId: string): Promise<UsageLog[]> {
    const q = query(
      collection(db, 'equipment', equipmentId, 'usageLogs'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapUsageLog(d.id, d.data() as Record<string, unknown>));
  },

  // ── Calibration Events ────────────────────────────────────────────────────

  async addCalibrationEvent(
    equipmentId: string,
    event: Omit<CalibrationEvent, 'id' | 'createdAt'>
  ): Promise<string> {
    const ref = await addDoc(
      collection(db, 'equipment', equipmentId, 'calibrationEvents'),
      {
        ...event,
        createdAt: serverTimestamp(),
      }
    );

    // If received date provided, recalculate nextCalibrationDate
    if (event.receivedDate) {
      const eq = await this.getEquipmentById(equipmentId);
      if (eq?.calibrationInterval) {
        const received = new Date(event.receivedDate);
        received.setMonth(received.getMonth() + eq.calibrationInterval);
        const nextDate = received.toISOString().split('T')[0];

        await updateDoc(doc(db, 'equipment', equipmentId), {
          lastCalibrationDate: event.receivedDate,
          nextCalibrationDate: nextDate,
          status: 'active',
          updatedAt: serverTimestamp(),
        });
      }
    }

    return ref.id;
  },

  async getCalibrationEvents(equipmentId: string): Promise<CalibrationEvent[]> {
    const q = query(
      collection(db, 'equipment', equipmentId, 'calibrationEvents'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        equipmentId: (data.equipmentId as string) || equipmentId,
        sentDate: (data.sentDate as string) || '',
        receivedDate: data.receivedDate as string | undefined,
        calibrationLab: (data.calibrationLab as string) || '',
        certificateNumber: data.certificateNumber as string | undefined,
        result: data.result as 'pass' | 'fail' | undefined,
        conditionBeforeSend: data.conditionBeforeSend as string | undefined,
        conditionAfterReceive: data.conditionAfterReceive as string | undefined,
        notes: data.notes as string | undefined,
        createdAt: toDate(data.createdAt),
        createdBy: (data.createdBy as string) || '',
      } as CalibrationEvent;
    });
  },

  // ── Documents / File Attachments ──────────────────────────────────────────

  async uploadDocument(
    equipmentId: string,
    docType: EquipmentDocument['docType'],
    file: File,
    uploadedBy: string
  ): Promise<EquipmentDocument> {
    const date = new Date().toISOString().split('T')[0];
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `equipment/${equipmentId}/${docType}/${date}_${sanitized}`;

    const fileRef = storageRef(storage, path);
    const uploadTask = uploadBytesResumable(fileRef, file);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', null, reject, resolve);
    });

    const url = await getDownloadURL(fileRef);

    const docData = {
      equipmentId,
      docType,
      name: file.name,
      size: file.size,
      type: file.type,
      url,
      uploadedAt: serverTimestamp(),
      uploadedBy,
    };

    const ref = await addDoc(
      collection(db, 'equipment', equipmentId, 'documents'),
      docData
    );

    return {
      id: ref.id,
      equipmentId,
      docType,
      name: file.name,
      size: file.size,
      type: file.type,
      url,
      uploadedAt: new Date(),
      uploadedBy,
    };
  },

  async getDocuments(equipmentId: string): Promise<EquipmentDocument[]> {
    const q = query(
      collection(db, 'equipment', equipmentId, 'documents'),
      orderBy('uploadedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        equipmentId,
        docType: data.docType as EquipmentDocument['docType'],
        name: data.name as string,
        size: data.size as number,
        type: data.type as string,
        url: data.url as string,
        uploadedAt: toDate(data.uploadedAt),
        uploadedBy: (data.uploadedBy as string) || '',
      };
    });
  },

  // ── Status helpers ────────────────────────────────────────────────────────

  computeStatus(equipment: EquipmentRecord): EquipmentStatus {
    if (equipment.status === 'retired' || equipment.status === 'out_of_service') {
      return equipment.status;
    }
    if (equipment.status === 'pending') return 'pending';
    if (equipment.status === 'calibration') return 'calibration';

    if (!equipment.requiresCalibration) return 'active';

    if (!equipment.nextCalibrationDate) return 'active';

    const due = new Date(equipment.nextCalibrationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) return 'overdue';
    if (diffDays <= 30) return 'due_soon';
    return 'active';
  },

  getStatusLabel(status: EquipmentStatus): string {
    const map: Record<EquipmentStatus, string> = {
      active: 'Active',
      due_soon: 'Due Soon',
      overdue: 'Overdue',
      calibration: 'In Calibration',
      out_of_service: 'Out of Service',
      pending: 'Pending Approval',
      retired: 'Retired',
    };
    return map[status] || status;
  },

  getStatusColor(status: EquipmentStatus): string {
    const map: Record<EquipmentStatus, string> = {
      active: 'bg-green-100 text-green-800',
      due_soon: 'bg-amber-100 text-amber-800',
      overdue: 'bg-red-100 text-red-800',
      calibration: 'bg-blue-100 text-blue-800',
      out_of_service: 'bg-red-100 text-red-800',
      pending: 'bg-gray-100 text-gray-600',
      retired: 'bg-gray-200 text-gray-700',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  },

  // ── Filters / Search ──────────────────────────────────────────────────────

  filterEquipment(
    items: EquipmentRecord[],
    opts: {
      search?: string;
      status?: string;
      category?: string;
      custodian?: string;
    }
  ): EquipmentRecord[] {
    let result = items;

    if (opts.search) {
      const s = opts.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.id.toLowerCase().includes(s) ||
          e.name.toLowerCase().includes(s) ||
          e.serialNumber.toLowerCase().includes(s) ||
          e.manufacturer.toLowerCase().includes(s)
      );
    }

    if (opts.status && opts.status !== 'all') {
      result = result.filter((e) => e.status === opts.status);
    }

    if (opts.category && opts.category !== 'all') {
      result = result.filter((e) => e.category === opts.category);
    }

    if (opts.custodian) {
      const c = opts.custodian.toLowerCase();
      result = result.filter((e) => e.custodian.toLowerCase().includes(c));
    }

    return result;
  },
};
