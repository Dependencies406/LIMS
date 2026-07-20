/**
 * VoidSheetModal.tsx
 *
 * Cancels (voids) a sheet the append-only way: a new void marker record with
 * a mandatory reason. The sheet itself is never modified or deleted; it is
 * hidden from the default list view but stays in the audit trail and exports.
 */

import React, { useState } from 'react';

interface Props {
  open: boolean;
  sheetLabel: string;              // e.g. "#a1b2c3 (SCS-CAL-26024, Tension)"
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export const VoidSheetModal: React.FC<Props> = ({ open, sheetLabel, busy, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('');
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
         role="dialog" aria-modal="true" aria-labelledby="void-title"
         onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 id="void-title" className="text-lg font-semibold text-gray-900">Void sheet {sheetLabel}</h2>
        <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-semibold">Voiding is not deleting</p>
          <p className="mt-1">
            The sheet will be marked "voided" and hidden from the default list,
            but <b>remains in the system permanently</b> per the audit trail requirement —
            this void action is itself a permanent record and cannot be undone.
          </p>
        </div>
        <label className="mt-3 block text-xs text-gray-500" htmlFor="void-reason">
          Reason for voiding <span className="text-rose-600">*</span>
        </label>
        <textarea id="void-reason"
                  className="mt-1 min-h-[64px] w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-rose-500 focus:outline-none"
                  placeholder="Required, e.g. duplicate of sheet #xxxxxx / job cancelled by customer"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={onCancel}>
            Back
          </button>
          <button type="button" disabled={busy || !reason.trim()}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  onClick={() => onConfirm(reason.trim())}>
            {busy ? 'Voiding…' : 'Confirm void sheet'}
          </button>
        </div>
      </div>
    </div>
  );
};
