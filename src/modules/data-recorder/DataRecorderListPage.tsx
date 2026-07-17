/**
 * DataRecorderListPage.tsx
 *
 * Route /data-records — paginated list of calibration raw-data sheets with
 * filters, JSON export/import (lossless round-trip, design R4), and entry
 * points to create/view sheets. Append-only: there is no edit or delete here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CalibrationRawDataSheet, SheetVoidRecord } from '../../types';
import { rawDataSheetService, type SheetPageFilter } from '../../services/rawDataSheetService';
import { serializeExport, parseExport } from './export/rawDataSheetExport';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../../components/Toast';
import { fmtDate, fmtDateTime, shortId } from './sheetLogic';

type Cursor = NonNullable<Awaited<ReturnType<typeof rawDataSheetService.getPage>>['nextCursor']>;

export const DataRecorderListPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toasts, removeToast, success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [sheets, setSheets] = useState<CalibrationRawDataSheet[]>([]);
  const [cursor, setCursor] = useState<Cursor | undefined>();
  const [loading, setLoading] = useState(false);
  const [requestNoFilter, setRequestNoFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | 'original' | 'amendment'>('');
  const [busy, setBusy] = useState<'' | 'export' | 'import'>('');
  const [voids, setVoids] = useState<Map<string, SheetVoidRecord>>(new Map());
  const [showVoided, setShowVoided] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const mergeVoidsFor = useCallback(async (list: CalibrationRawDataSheet[]) => {
    if (list.length === 0) return;
    const found = await rawDataSheetService.getVoidsForSheets(list.map((s) => s.id));
    if (found.size > 0) {
      setVoids((prev) => new Map([...prev, ...found]));
    }
  }, []);

  const loadFirstPage = useCallback(async (filter: SheetPageFilter) => {
    setLoading(true);
    try {
      const page = await rawDataSheetService.getPage(filter);
      setSheets(page.sheets);
      setCursor(page.nextCursor);
      await mergeVoidsFor(page.sheets);
    } catch (err) {
      toastError(`โหลดรายการไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [toastError, mergeVoidsFor]);

  const activeFilter = useMemo<SheetPageFilter>(() => ({
    requestNo: requestNoFilter.trim() || undefined,
    kind: kindFilter || undefined,
  }), [requestNoFilter, kindFilter]);

  useEffect(() => {
    const t = setTimeout(() => { void loadFirstPage(activeFilter); }, 300);
    return () => clearTimeout(t);
  }, [activeFilter, loadFirstPage]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await rawDataSheetService.getPage(activeFilter, cursor);
      setSheets((prev) => [...prev, ...page.sheets]);
      setCursor(page.nextCursor);
      await mergeVoidsFor(page.sheets);
    } catch (err) {
      toastError(`โหลดเพิ่มเติมไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // originals that have an amendment within the loaded set
  const amendedIds = useMemo(
    () => new Set(sheets.filter((s) => s.amends).map((s) => s.amends as string)),
    [sheets],
  );

  const doExport = async () => {
    setBusy('export');
    try {
      toastInfo('กำลังรวบรวมข้อมูลเพื่อส่งออก…');
      const [all, allVoids] = await Promise.all([
        rawDataSheetService.exportAll(),
        rawDataSheetService.exportAllVoids(),
      ]);
      const blob = new Blob([serializeExport(all, allVoids, currentUser?.uid ?? '')], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `raw-data-sheets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toastSuccess(`ส่งออก ${all.length} ชีต + ${allVoids.length} รายการยกเลิก เป็นไฟล์ JSON แล้ว`);
    } catch (err) {
      toastError(`ส่งออกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  };

  const doImport = async (file: File) => {
    setBusy('import');
    try {
      const parsed = parseExport(await file.text());
      const result = await rawDataSheetService.importSheets(parsed.sheets);
      const voidResult = await rawDataSheetService.importVoids(parsed.voids);
      toastSuccess(
        `นำเข้าเสร็จ: เพิ่มใหม่ ${result.imported} ชีต (ข้าม ${result.skipped})`
        + (parsed.voids.length > 0 ? ` · รายการยกเลิกใหม่ ${voidResult.imported} (ข้าม ${voidResult.skipped})` : ''),
      );
      await loadFirstPage(activeFilter);
    } catch (err) {
      toastError(`นำเข้าไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  };

  const badge = (sheet: CalibrationRawDataSheet) => {
    if (voids.has(sheet.id)) {
      return <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700" title={voids.get(sheet.id)?.reason}>ยกเลิก</span>;
    }
    if (sheet.kind === 'amendment') {
      return <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">แก้ไขของ {shortId(sheet.amends ?? '')}</span>;
    }
    if (amendedIds.has(sheet.id)) {
      return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">ถูกแก้ไข</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">ปกติ</span>;
  };

  return (
    <div className="mx-auto max-w-[1240px] p-4 pb-16">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900">บันทึกข้อมูลดิบการสอบเทียบ (Raw Data)</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  onClick={() => navigate('/data-records/new')}>
            + สร้างชีตบันทึกใหม่
          </button>
          <button className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  disabled={busy !== ''}
                  onClick={() => fileInput.current?.click()}>
            {busy === 'import' ? 'กำลังนำเข้า…' : 'นำเข้า'}
          </button>
          <button className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  disabled={busy !== ''}
                  onClick={doExport}>
            {busy === 'export' ? 'กำลังส่งออก…' : 'ส่งออก JSON'}
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden
                 onChange={(e) => {
                   const file = e.target.files?.[0];
                   e.target.value = '';
                   if (file) void doImport(file);
                 }} />
        </div>
        <p className="w-full text-sm text-gray-500">
          ชีตบันทึกเป็นแบบเพิ่มได้อย่างเดียว (append-only) — บันทึกแล้วแก้ไขหรือลบไม่ได้
          การแก้ไขทำได้โดยสร้าง “ชีตแก้ไข” อ้างอิงชีตเดิมพร้อมระบุเหตุผล
        </p>
      </div>

      {/* filters */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div>
          <label className="block text-xs text-gray-500" htmlFor="filter-request">Request No.</label>
          <input id="filter-request"
                 className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                 placeholder="เช่น SCS-CAL-26024"
                 value={requestNoFilter}
                 onChange={(e) => setRequestNoFilter(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500" htmlFor="filter-kind">ประเภท</label>
          <select id="filter-kind"
                  className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}>
            <option value="">ทั้งหมด</option>
            <option value="original">ชีตบันทึก</option>
            <option value="amendment">ชีตแก้ไข</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-gray-600">
          <input type="checkbox" className="rounded border-gray-300"
                 checked={showVoided}
                 onChange={(e) => setShowVoided(e.target.checked)} />
          แสดงชีตที่ถูกยกเลิก
        </label>
        {(requestNoFilter || kindFilter) && (
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                  onClick={() => { setRequestNoFilter(''); setKindFilter(''); }}>
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-2.5">Request No.</th>
                <th className="px-4 py-2.5">เครื่องมือ (UUC)</th>
                <th className="px-4 py-2.5">Direction</th>
                <th className="px-4 py-2.5">Range</th>
                <th className="px-4 py-2.5">Cal. Date</th>
                <th className="px-4 py-2.5">ผู้บันทึก</th>
                <th className="px-4 py-2.5">บันทึกเมื่อ</th>
                <th className="px-4 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(showVoided ? sheets : sheets.filter((s) => !voids.has(s.id))).map((sheet) => (
                <tr key={sheet.id}
                    className="cursor-pointer border-t border-gray-100 hover:bg-emerald-50"
                    onClick={() => navigate(`/data-records/${sheet.id}`)}>
                  <td className="whitespace-nowrap px-4 py-2.5">{sheet.requestNo}</td>
                  <td className="px-4 py-2.5">{sheet.uuc.equipmentName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{sheet.direction}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{sheet.calibrationRange}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{fmtDate(sheet.calibrationDate)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{sheet.recordedByName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{fmtDateTime(sheet.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">{badge(sheet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sheets.length === 0 && !loading && (
            <p className="p-8 text-center text-gray-400">ยังไม่มีชีตบันทึก</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-sm text-gray-500">
          <span>แสดง {sheets.length} รายการ{cursor ? ' (มีรายการเพิ่มเติม)' : ''}</span>
          {cursor && (
            <button className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                    disabled={loading}
                    onClick={loadMore}>
              {loading ? 'กำลังโหลด…' : 'โหลดเพิ่มเติม'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
