/**
 * DeleteSheetModal.tsx
 *
 * ADMIN-ONLY permanent deletion (owner decision — relaxes the append-only
 * rule for admins). Requires an explicit acknowledgement checkbox; firestore
 * rules enforce the admin role server-side. Deletion is refused by the
 * service while amendments still reference the sheet.
 */

import React, { useState } from 'react';

interface Props {
  open: boolean;
  sheetLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteSheetModal: React.FC<Props> = ({ open, sheetLabel, busy, onCancel, onConfirm }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
         role="dialog" aria-modal="true" aria-labelledby="delete-title"
         onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 id="delete-title" className="text-lg font-semibold text-rose-700">
          Permanently delete sheet {sheetLabel} (admin only)
        </h2>
        <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-semibold">Warning: permanent deletion cannot be undone</p>
          <ul className="mt-1 list-disc pl-5">
            <li>The sheet's data and its void record (if any) will be removed from the system immediately</li>
            <li>The audit trail history for this record will be lost permanently</li>
            <li>If amendment sheets reference this sheet, deletion will not be allowed (delete those first)</li>
            <li>Normally you should use "Void sheet" instead, which preserves data per the audit trail requirement</li>
          </ul>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5 rounded border-gray-300"
                 checked={acknowledged}
                 onChange={(e) => setAcknowledged(e.target.checked)} />
          I understand that permanent deletion cannot be undone, and this record's audit trail history will be lost
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={onCancel}>
            Back
          </button>
          <button type="button" disabled={busy || !acknowledged}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
                  onClick={onConfirm}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
};
