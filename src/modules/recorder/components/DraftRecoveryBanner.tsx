/**
 * DraftRecoveryBanner.tsx
 *
 * Task 5: shown when `findRecoverableDraft` (useDraftAutosave.ts) finds a
 * local backup that diverges from the server — the signature of an
 * unintentional close. Purely presentational; the caller (Task 6's record
 * page) owns the restore/discard decision and what happens to the local
 * backup afterwards.
 */

import React from 'react';

export interface DraftRecoveryBannerProps {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}

export const DraftRecoveryBanner: React.FC<DraftRecoveryBannerProps> = ({ savedAt, onRestore, onDiscard }) => {
  const formatted = new Date(savedAt).toLocaleString();
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg">
      <div className="text-sm text-amber-900">
        <span className="font-semibold">Unsaved changes found</span> from a session that closed unexpectedly ({formatted}). Restore them?
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 text-sm font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-100"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700"
        >
          Restore
        </button>
      </div>
    </div>
  );
};

export default DraftRecoveryBanner;
