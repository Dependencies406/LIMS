/**
 * PdfPreviewModal.tsx
 *
 * In-app preview of the generated raw-data-sheet PDF (real jsPDF output in an
 * iframe via a blob URL) with a download button. The URL is revoked on close.
 */

import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  /** Blob URL of the generated PDF (from jsPDF output('bloburl')). */
  url: string | null;
  fileName: string;
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<Props> = ({ open, url, fileName, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[4vh]"
         role="dialog" aria-modal="true" aria-label="ตัวอย่างรายงาน PDF"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[88vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-900">ตัวอย่างรายงาน PDF — Raw Data Sheet</h2>
          <div className="ml-auto flex gap-2">
            <a href={url} download={fileName}
               className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              ดาวน์โหลด PDF
            </a>
            <button type="button"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                    onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>
        <iframe src={url} title="ตัวอย่างรายงาน PDF" className="w-full flex-1 rounded-b-xl" />
      </div>
    </div>
  );
};
