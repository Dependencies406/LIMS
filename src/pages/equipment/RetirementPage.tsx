import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEquipmentDetail } from '../../hooks/useEquipment';
import { equipmentControlService as equipmentService } from '../../services/equipmentControlService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';

export const RetirementPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { success, error: showError } = useToast();

  const { equipment, uploadDocument, loading } = useEquipmentDetail(id);

  const [reason, setReason] = useState('');
  const [retirementFile, setRetirementFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!id || !currentUser || !reason) return;
    setSubmitting(true);
    try {
      // Upload 008 form if provided
      if (retirementFile) {
        await uploadDocument('retirement', retirementFile, currentUser.email);
      }

      // Set status to retired (admin direct) or pending retirement
      await equipmentService.updateStatus(id, 'retired');
      await equipmentService.updateEquipment(id, { notes: `[RETIRED ${new Date().toLocaleDateString('en-GB')}] ${reason}` } as any);

      success(`Equipment ${id} has been retired`);
      setSubmitted(true);
    } catch (err: unknown) {
      showError((err as Error).message || 'Retirement failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Equipment not found.</p>
      </div>
    );
  }

  if (equipment.status === 'retired') {
    return (
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/equipment/${id}`)} className="text-gray-400 hover:text-gray-600 text-sm">
              ← {id}
            </button>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-900">Retirement</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-6 py-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏷️</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Equipment Already Retired</h2>
          <p className="text-sm text-gray-500 mb-6">{equipment.id} — {equipment.name}</p>
          <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-600 text-left">
            <p className="font-medium mb-1">NOT FOR CALIBRATED WORK</p>
            <p>{equipment.notes || '—'}</p>
          </div>
          <button onClick={() => navigate('/equipment')} className="mt-6 text-primary-600 hover:underline text-sm">
            Back to Equipment Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-lg mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Equipment Retired</h2>
          <p className="text-sm text-gray-500 mb-6">{id} has been removed from active service.</p>
          <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 mb-6">
            Print a "NOT FOR CALIBRATED WORK" label from the Overview tab and attach it to the instrument.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/equipment')} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              Equipment Dashboard
            </button>
            <button onClick={() => navigate(`/equipment/${id}`)} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
              View Equipment Record
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/equipment/${id}`)} className="text-gray-400 hover:text-gray-600 text-sm">
            ← {id}
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Retire Equipment</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          <strong>Warning:</strong> Retiring this equipment will remove it from active service. This action should only be taken when the instrument is no longer suitable for calibrated work (§3.6).
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Equipment ID</p>
              <p className="font-mono font-medium text-gray-900">{equipment.id}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Serial Number</p>
              <p className="font-mono text-gray-900">{equipment.serialNumber}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-xs text-gray-500 mb-0.5">Equipment Name</p>
              <p className="text-gray-900">{equipment.name}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Retirement <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Beyond repair, exceeded service life, replaced by newer model…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LAB-FM-QP-05-008 Retirement Request Form (.xlsx)
            </label>
            <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setRetirementFile(e.target.files?.[0] || null)}
              />
              {retirementFile ? (
                <span className="text-gray-800 font-medium">{retirementFile.name}</span>
              ) : (
                <span>Upload retirement request form (optional)</span>
              )}
            </label>
          </div>

          {isAdmin && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
              As a manager, submitting this form will immediately retire the equipment. The record will be retained in read-only state for audit purposes (§3.6).
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => navigate(`/equipment/${id}`)}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Processing…' : 'Confirm Retirement'}
          </button>
        </div>
      </div>
    </div>
  );
};
