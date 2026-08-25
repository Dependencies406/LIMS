/**
 * VoidRecordModal.tsx
 *
 * ADR-016 Task 3 — voiding is admin-only and requires a reason; this modal
 * is that gate. States plainly what will happen before the admin can
 * confirm: for a committed-or-later record, that its record number was
 * already allocated and will not be reused (ADR-008); for an approved
 * record specifically, that it backs an issued certificate and that
 * `createRevision` is the usual alternative (ADR-016 D2) — warned, not
 * blocked, since the metrologist decides.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalibrationRecord } from '../../../types';

export interface VoidRecordModalProps {
  record: CalibrationRecord;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
}

export const VoidRecordModal: React.FC<VoidRecordModalProps> = ({ record, onCancel, onConfirm, isSubmitting = false }) => {
  const [reason, setReason] = useState('');
  const hasRecordNumber = Boolean(record.recordNumber);
  const isApproved = record.status === 'approved';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Void Record</h2>
        <p className="text-sm text-gray-600">
          This is a soft delete — the record is never removed, only hidden from normal listings and marked voided
          with your reason. It can be restored later from the recycle bin.
        </p>
        {hasRecordNumber && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            This record already has an allocated record number (<strong>{record.recordNumber}</strong>, ADR-008) —
            voiding it does NOT free that number for reuse. It stays permanently assigned to this record.
          </div>
        )}
        {isApproved && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <strong>This record is Approved and backs an issued certificate.</strong> Voiding it is an accreditation
            event, not a routine cleanup — the usual way to correct an issued certificate is{' '}
            <strong>Create Revision</strong>, which supersedes it without erasing the original. Only void this if
            the record should never have existed at all.
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for voiding <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Test record created while building the system, not a real calibration"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim() || isSubmitting}
            onClick={() => onConfirm(reason.trim())}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Voiding…' : 'Void Record'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default VoidRecordModal;
