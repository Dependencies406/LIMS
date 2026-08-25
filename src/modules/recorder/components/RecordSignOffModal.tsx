/**
 * RecordSignOffModal.tsx
 *
 * Task 7: Review and Approve both need a signature — reuses the app-wide
 * `DigitalSignature` pattern and `SignatureCanvas` component (the same
 * pieces `technicalReviewerSignature` already uses elsewhere) rather than
 * building a second signature capture UI.
 *
 * Phase 23 Task 2: `signerName` is NOT editable here. The Firestore rule
 * requires `reviewedBy`/`approvedBy == request.auth.uid` — the enforced
 * identity is the caller's auth uid, and the name printed on a certificate
 * must always match the account that actually performed the action. A free
 * text field (or a dropdown letting someone pick a different person) would
 * let the printed name disagree with the recorded uid — an accreditation
 * defect, not a convenience. `signerName` is therefore a caller-supplied,
 * read-only prop: the signed-in user's own resolved display name, shown but
 * never mutable from inside this modal.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SignatureCanvas } from '../../../components/SignatureCanvas';
import type { DigitalSignature } from '../../../types';

export interface RecordSignOffModalProps {
  title: string;
  /** The signed-in user's resolved display name — fixed, not editable (see file header). */
  signerName: string;
  onCancel: () => void;
  onConfirm: (signature: DigitalSignature) => void;
  isSubmitting?: boolean;
}

export const RecordSignOffModal: React.FC<RecordSignOffModalProps> = ({
  title,
  signerName,
  onCancel,
  onConfirm,
  isSubmitting = false,
}) => {
  const [signature, setSignature] = useState<DigitalSignature | undefined>(undefined);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Signer</label>
          <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            {signerName}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Always the account you're signed in as — this cannot be changed to another person here.
          </p>
        </div>
        <SignatureCanvas
          value={signature}
          onChange={setSignature}
          signerName={signerName}
          showSignerNameInput={false}
          required
        />
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
            disabled={!signature || !signerName.trim() || isSubmitting}
            onClick={() => signature && onConfirm({ ...signature, signerName: signerName.trim() })}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RecordSignOffModal;
