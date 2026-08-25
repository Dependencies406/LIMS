/**
 * CreateRevisionDialog.tsx
 *
 * Task 6/7: the explicit "create revision" action required whenever a
 * committed-or-later record is opened read-only. Requires a reason
 * (`calibrationRecordService.createRevision` rejects an empty one).
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export interface CreateRevisionDialogProps {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
}

export const CreateRevisionDialog: React.FC<CreateRevisionDialogProps> = ({ onCancel, onConfirm, isSubmitting = false }) => {
  const [reason, setReason] = useState('');

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Create Revision</h2>
        <p className="text-sm text-gray-600">
          This record is committed and cannot be edited directly. Creating a revision starts a new Draft, pre-filled
          with this record's data, that supersedes it once committed.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for revision <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong serial number recorded for this item"
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
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating…' : 'Create Revision'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreateRevisionDialog;
