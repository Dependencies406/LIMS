import { useState, useEffect } from 'react';
import type { EquipmentRecord, UsageLog, CalibrationEvent, EquipmentDocument } from '../types';
import { equipmentControlService, type EquipmentInput } from '../services/equipmentControlService';

// Single source of truth: all equipment data lives in the 'equipmentControl' Firestore collection.
const equipmentService = equipmentControlService;

export function useEquipment() {
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = equipmentService.subscribeToEquipment((items, err) => {
      if (err) {
        setError(err.message);
      } else {
        setEquipment(items);
        setError(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function createEquipment(input: EquipmentInput): Promise<string> {
    return equipmentService.createEquipment(input);
  }

  async function updateEquipment(
    id: string,
    data: Partial<Omit<EquipmentInput, 'id' | 'createdBy'>>
  ): Promise<void> {
    return equipmentService.updateEquipment(id, data);
  }

  async function approveRegistration(id: string): Promise<void> {
    return equipmentService.approveRegistration(id);
  }

  async function rejectRegistration(id: string): Promise<void> {
    return equipmentService.rejectRegistration(id);
  }

  return {
    equipment,
    loading,
    error,
    createEquipment,
    updateEquipment,
    approveRegistration,
    rejectRegistration,
  };
}

export function useEquipmentDetail(id: string | undefined) {
  const [equipment, setEquipment] = useState<EquipmentRecord | null>(null);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [calibrationEvents, setCalibrationEvents] = useState<CalibrationEvent[]>([]);
  const [documents, setDocuments] = useState<EquipmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    // Load equipment record
    equipmentService.getEquipmentById(id).then((eq) => {
      setEquipment(eq);
      setLoading(false);
    }).catch((err) => {
      setError(err.message);
      setLoading(false);
    });

    // Load calibration events and documents once
    equipmentService.getCalibrationEvents(id).then(setCalibrationEvents).catch(console.error);
    equipmentService.getDocuments(id).then(setDocuments).catch(console.error);

    // Subscribe to usage logs real-time
    const unsub = equipmentService.subscribeToUsageLogs(id, (logs, err) => {
      if (!err) setUsageLogs(logs);
    });

    return unsub;
  }, [id]);

  async function addUsageLog(log: Omit<UsageLog, 'id' | 'createdAt'>): Promise<string> {
    if (!id) throw new Error('No equipment ID');
    const logId = await equipmentService.addUsageLog(id, log);
    // Refresh equipment record for status update
    const eq = await equipmentService.getEquipmentById(id);
    setEquipment(eq);
    return logId;
  }

  async function addCalibrationEvent(
    event: Omit<CalibrationEvent, 'id' | 'createdAt'>
  ): Promise<string> {
    if (!id) throw new Error('No equipment ID');
    const eventId = await equipmentService.addCalibrationEvent(id, event);
    const [eq, events] = await Promise.all([
      equipmentService.getEquipmentById(id),
      equipmentService.getCalibrationEvents(id),
    ]);
    setEquipment(eq);
    setCalibrationEvents(events);
    return eventId;
  }

  async function uploadDocument(
    docType: EquipmentDocument['docType'],
    file: File,
    uploadedBy: string
  ): Promise<EquipmentDocument> {
    if (!id) throw new Error('No equipment ID');
    const doc = await equipmentService.uploadDocument(id, docType, file, uploadedBy);
    setDocuments((prev) => [doc, ...prev]);
    return doc;
  }

  async function refreshDocuments(): Promise<void> {
    if (!id) return;
    const docs = await equipmentService.getDocuments(id);
    setDocuments(docs);
  }

  async function deleteDocument(
    documentId: string,
    storagePath?: string
  ): Promise<void> {
    if (!id) throw new Error('No equipment ID');
    await equipmentControlService.deleteDocument(id, documentId, storagePath);
    setDocuments((prev) => prev.filter((d) => d.id !== documentId));
  }

  async function updateUsageLog(
    logId: string,
    data: Partial<Omit<UsageLog, 'id' | 'createdAt'>>
  ): Promise<void> {
    if (!id) throw new Error('No equipment ID');
    await equipmentControlService.updateUsageLog(id, logId, data);
  }

  async function deleteUsageLog(logId: string): Promise<void> {
    if (!id) throw new Error('No equipment ID');
    await equipmentControlService.deleteUsageLog(id, logId);
    setUsageLogs((prev) => prev.filter((l) => l.id !== logId));
  }

  return {
    equipment,
    usageLogs,
    calibrationEvents,
    documents,
    loading,
    error,
    addUsageLog,
    addCalibrationEvent,
    uploadDocument,
    refreshDocuments,
    deleteDocument,
    updateUsageLog,
    deleteUsageLog,
    setEquipment,
  };
}
