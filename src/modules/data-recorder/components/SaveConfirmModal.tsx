/**
 * SaveConfirmModal.tsx
 *
 * Confirmation shown after validation and before the append-only save:
 * warns the user the sheet becomes immutable, and that later corrections
 * require an amendment sheet with a stated reason.
 */

import React from 'react';

interface Props {
  open: boolean;
  isAmendment: boolean;
  summary: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SaveConfirmModal: React.FC<Props> = ({
  open, isAmendment, summary, saving, onCancel, onConfirm,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh]"
         role="dialog" aria-modal="true" aria-labelledby="save-confirm-title"
         onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 id="save-confirm-title" className="text-lg font-semibold text-gray-900">
          ยืนยันการบันทึกชีต
        </h2>
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">โปรดตรวจสอบข้อมูลให้ครบถ้วนก่อนยืนยัน</p>
          <p className="mt-1">
            เมื่อบันทึกแล้ว ชีตนี้จะ<b>ไม่สามารถแก้ไขหรือลบได้อีก</b> (append-only)
            หากต้องการแก้ไขภายหลัง ต้องสร้าง “ชีตแก้ไข” (amendment)
            และ<b>ระบุเหตุผลการแก้ไขทุกครั้ง</b> โดยชีตเดิมจะยังคงอยู่ในระบบถาวร
          </p>
        </div>
        <p className="mt-3 text-sm text-gray-600">{summary}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={saving}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  onClick={onCancel}>
            กลับไปตรวจสอบ
          </button>
          <button type="button" disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  onClick={onConfirm}>
            {saving ? 'กำลังบันทึก…' : isAmendment ? 'ยืนยันการบันทึกชีตแก้ไข' : 'ยืนยันการบันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
};
