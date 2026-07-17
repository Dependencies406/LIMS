/**
 * SheetEditorPage.tsx
 *
 * One page, three modes (set by the route):
 *   /data-records/new        → mode "new"    — blank editable sheet
 *   /data-records/:id        → mode "view"   — read-only saved sheet (+ amendment chain)
 *   /data-records/:id/amend  → mode "amend"  — editable clone referencing the original
 *
 * Sheets are append-only: saving requires passing validation and an explicit
 * confirmation that the sheet becomes immutable. Amendments recompute forces
 * from the stored raw signals using the CURRENT conversion equations.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  CalDirection,
  CalibrationRawDataSheet,
  CalibrationRawDataSheetInput,
  ConversionEquation,
  EquipmentRecord,
  ForceUnit,
  Job,
  SheetVoidRecord,
} from '../../types';
import { rawDataSheetService } from '../../services/rawDataSheetService';
import { equipmentControlService } from '../../services/equipmentControlService';
import { conversionEquationService } from '../../services/conversionEquationService';
import { jobService } from '../../services/jobService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../../components/Toast';
import { isForceUnit } from './forceUnits';
import {
  ENV_CATEGORIES,
  STANDARD_CATEGORIES,
  buildStandardOptions,
  defaultRows,
  editableToRows,
  fmtDateTime,
  rowsToEditable,
  shortId,
  snapshotFromOption,
  usedStandardKeys,
  validateDraft,
  blankRow,
  type EditableRow,
  type StandardOption,
} from './sheetLogic';
import { buildRawDataSheetPdfBlobUrl, rawDataSheetPdfFileName } from './pdf/rawDataSheetPdf';
import { JobInfoBlock, StandardsBlock, UucBlock } from './components/SheetHeaderBlocks';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { VoidSheetModal } from './components/VoidSheetModal';
import { EnvironmentBlock, ReadOnlyEnvironmentBlock } from './components/EnvironmentBlock';
import { MeasurementGrid, ReadOnlyMeasurementGrid } from './components/MeasurementGrid';
import { SaveConfirmModal } from './components/SaveConfirmModal';

export type SheetEditorMode = 'new' | 'view' | 'amend';

interface Draft {
  jobId: string | null;
  requestNo: string;
  receivedDate?: string;
  calibrationDate: string;
  uucIndex: number;                       // which equipment on the job (when several)
  uuc: CalibrationRawDataSheetInput['uuc'];
  calibrationRange: string;
  direction: CalDirection;
  envStandardId: string;
  env: { t: string; h: string }[];
  machineCondition: string;
  decimalPlaces: number;
  rows: EditableRow[];
  amendmentReason: string;
}

function emptyDraft(): Draft {
  return {
    jobId: null,
    requestNo: '',
    calibrationDate: new Date().toISOString().slice(0, 10),
    uucIndex: 0,
    uuc: { equipmentName: '', readingUnit: 'N' },
    calibrationRange: '',
    direction: 'Tension',
    envStandardId: '',
    env: [{ t: '', h: '' }, { t: '', h: '' }, { t: '', h: '' }],
    machineCondition: 'Normal',
    decimalPlaces: 2,
    rows: defaultRows(),
    amendmentReason: '',
  };
}

function uucFromJobEquipment(job: Job, index: number): { uuc: Draft['uuc']; range: string } {
  const eq = job.equipment[index];
  if (!eq) return { uuc: { equipmentName: '', readingUnit: 'N' }, range: '' };
  const unit = eq.unit && isForceUnit(eq.unit) ? (eq.unit as ForceUnit) : 'N';
  const resolution = eq.resolution ? Number(eq.resolution) : undefined;
  return {
    uuc: {
      equipmentName: eq.name,
      manufacturer: eq.manufacturer || undefined,
      model: eq.model || undefined,
      serial: eq.serialNumber || eq.assetTag || undefined,
      readingUnit: unit,
      resolution: resolution !== undefined && !Number.isNaN(resolution) ? resolution : undefined,
    },
    range: eq.calibrationPoint || '',
  };
}

export const SheetEditorPage: React.FC<{ mode: SheetEditorMode }> = ({ mode }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { toasts, removeToast, error: toastError, success: toastSuccess } = useToast();

  const editable = mode !== 'view';
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // reference data (editable modes)
  const [jobs, setJobs] = useState<Job[]>([]);
  const [thermos, setThermos] = useState<EquipmentRecord[]>([]);
  const [options, setOptions] = useState<StandardOption[]>([]);

  // saved sheet (view + amend source)
  const [sheet, setSheet] = useState<CalibrationRawDataSheet | null>(null);
  const [amendments, setAmendments] = useState<CalibrationRawDataSheet[]>([]);

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [voidRecord, setVoidRecord] = useState<SheetVoidRecord | null>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);

  const optionByKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  // ─── Loading ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);

        let loadedSheet: CalibrationRawDataSheet | null = null;
        if (mode !== 'new') {
          if (!id) throw new Error('missing sheet id');
          loadedSheet = await rawDataSheetService.getById(id);
          if (!loadedSheet) throw new Error('ไม่พบชีตที่ต้องการ');
        }

        if (editable) {
          const [allJobs, allEquipment] = await Promise.all([
            jobService.getAllJobs(),
            equipmentControlService.getAllEquipment(),
          ]);
          const forceStandards = allEquipment.filter((e) => STANDARD_CATEGORIES.includes(e.category));
          const thermoList = allEquipment.filter((e) => ENV_CATEGORIES.includes(e.category));
          const equationLists = await Promise.all(
            forceStandards.map((e) => conversionEquationService.getAll(e.id)),
          );
          const equationsByEquipment: Record<string, ConversionEquation[]> = {};
          forceStandards.forEach((e, i) => { equationsByEquipment[e.id] = equationLists[i]; });
          if (cancelled) return;
          setJobs(allJobs);
          setThermos(thermoList);
          setOptions(buildStandardOptions(forceStandards, equationsByEquipment));
        }

        if (cancelled) return;
        if (loadedSheet) {
          setSheet(loadedSheet);
          if (mode === 'view') {
            const [amendmentList, voids] = await Promise.all([
              rawDataSheetService.getAmendmentsOf(loadedSheet.id),
              rawDataSheetService.getVoidsForSheets([loadedSheet.id]),
            ]);
            setAmendments(amendmentList);
            setVoidRecord(voids.get(loadedSheet.id) ?? null);
          }
          if (mode === 'amend') {
            setDraft({
              jobId: loadedSheet.jobId,
              requestNo: loadedSheet.requestNo,
              receivedDate: loadedSheet.receivedDate,
              calibrationDate: loadedSheet.calibrationDate,
              uucIndex: 0,
              uuc: { ...loadedSheet.uuc },
              calibrationRange: loadedSheet.calibrationRange,
              direction: loadedSheet.direction,
              envStandardId: loadedSheet.envStandard.equipmentId,
              env: loadedSheet.env.map((r) => ({ t: String(r.t), h: String(r.h) })),
              machineCondition: loadedSheet.machineCondition,
              decimalPlaces: loadedSheet.decimalPlaces,
              rows: rowsToEditable(loadedSheet.rows),
              amendmentReason: '',
            });
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id]);

  // ─── Derived header data ───────────────────────────────────────────────────

  const recordedByName = mode === 'view' && sheet
    ? sheet.recordedByName
    : currentUser?.displayName
      || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
      || currentUser?.email
      || '';

  const derivedStandards = useMemo(() => {
    if (mode === 'view' && sheet) return sheet.standards;
    return usedStandardKeys(draft.rows)
      .map((key) => optionByKey.get(key))
      .filter((o): o is StandardOption => !!o)
      .map(snapshotFromOption);
  }, [mode, sheet, draft.rows, optionByKey]);

  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (mode === 'view' && sheet) {
      sheet.rows.forEach((row) => {
        const key = `${row.standardEquipmentId}::${row.equationId}`;
        counts[key] = (counts[key] ?? 0) + 1;
      });
    } else {
      draft.rows.forEach((row) => {
        if (row.standardKey) counts[row.standardKey] = (counts[row.standardKey] ?? 0) + 1;
      });
    }
    return counts;
  }, [mode, sheet, draft.rows]);

  const selectedThermo = thermos.find((t) => t.id === draft.envStandardId);
  const envLine = mode === 'view' && sheet
    ? { code: sheet.envStandard.code, serial: sheet.envStandard.serial, dueDate: sheet.envStandard.dueDate }
    : selectedThermo
      ? { code: selectedThermo.id, serial: selectedThermo.serialNumber, dueDate: selectedThermo.nextCalibrationDate }
      : undefined;

  const selectedJob = jobs.find((j) => j.id === draft.jobId);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const selectJob = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const { uuc, range } = uucFromJobEquipment(job, 0);
    setDraft((d) => ({
      ...d,
      jobId: job.id,
      requestNo: job.jobId,
      receivedDate: job.receivedDate,
      uucIndex: 0,
      uuc,
      calibrationRange: range || d.calibrationRange,
    }));
  };

  const selectJobEquipment = (index: number) => {
    if (!selectedJob) return;
    const { uuc, range } = uucFromJobEquipment(selectedJob, index);
    setDraft((d) => ({ ...d, uucIndex: index, uuc, calibrationRange: range || d.calibrationRange }));
  };

  const buildInput = (): CalibrationRawDataSheetInput => {
    const thermo = thermos.find((t) => t.id === draft.envStandardId);
    return {
      kind: mode === 'amend' ? 'amendment' : 'original',
      amends: mode === 'amend' && sheet ? sheet.id : null,
      amendmentReason: mode === 'amend' ? draft.amendmentReason.trim() : undefined,
      jobId: draft.jobId,
      requestNo: draft.requestNo,
      receivedDate: draft.receivedDate,
      calibrationDate: draft.calibrationDate,
      uuc: draft.uuc,
      calibrationRange: draft.calibrationRange,
      direction: draft.direction,
      standards: derivedStandards,
      envStandard: thermo
        ? {
            equipmentId: thermo.id, code: thermo.id, name: thermo.name,
            serial: thermo.serialNumber || undefined,
            range: thermo.usageRange || thermo.capacity || undefined,
            dueDate: thermo.nextCalibrationDate || undefined,
          }
        : sheet?.envStandard ?? { equipmentId: '', code: '', name: '' },
      env: draft.env.map((r) => ({ t: Number(r.t), h: Number(r.h) })),
      machineCondition: draft.machineCondition,
      decimalPlaces: draft.decimalPlaces,
      rows: editableToRows(draft.rows, optionByKey, draft.uuc.readingUnit),
      recordedByUid: currentUser?.uid ?? '',
      recordedByName,
      schemaVersion: 1,
    };
  };

  const requestSave = () => {
    const message = validateDraft({
      envStandardId: draft.envStandardId,
      env: draft.env,
      rows: draft.rows,
      amendmentReason: draft.amendmentReason,
      isAmendment: mode === 'amend',
    });
    if (message) { toastError(message); return; }
    if (!draft.requestNo.trim()) { toastError('กรุณาเลือกงาน (Request No.)'); return; }
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    setSaving(true);
    try {
      const input = buildInput();
      const newId = mode === 'amend' && sheet
        ? await rawDataSheetService.amend(sheet.id, input)
        : await rawDataSheetService.add(input);
      toastSuccess(mode === 'amend'
        ? `บันทึกชีตแก้ไข ${shortId(newId)} อ้างอิง ${shortId(sheet!.id)} แล้ว`
        : `บันทึกชีต ${shortId(newId)} แล้ว`);
      navigate('/data-records');
    } catch (err) {
      setSaving(false);
      setConfirmOpen(false);
      toastError(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const measuredPoints = draft.rows.filter((row) =>
    Object.values(row.cells).some((c) => c.sig.trim() !== ''),
  ).length;

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล…</div>;
  }
  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-rose-600">{loadError}</p>
        <button className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => navigate('/data-records')}>
          ← กลับไปหน้ารายการ
        </button>
      </div>
    );
  }

  const viewSheet = mode === 'view' ? sheet : null;

  return (
    <div className="mx-auto max-w-[1280px] p-4 pb-16">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* header row */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                onClick={() => navigate('/data-records')}>
          ← กลับ
        </button>
        <h1 className="text-xl font-semibold text-gray-900">
          {mode === 'new' && 'สร้างชีตบันทึกใหม่'}
          {mode === 'amend' && 'สร้างชีตแก้ไข'}
          {mode === 'view' && viewSheet && `ชีต ${shortId(viewSheet.id)}`}
        </h1>
        {viewSheet?.kind === 'amendment' && (
          <span className="rounded-full bg-violet-100 px-3 py-0.5 text-xs font-semibold text-violet-700">
            แก้ไขของ {shortId(viewSheet.amends ?? '')}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {mode === 'view' && viewSheet && (
            <button className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    disabled={pdfBusy}
                    onClick={async () => {
                      setPdfBusy(true);
                      try {
                        const url = await buildRawDataSheetPdfBlobUrl(viewSheet,
                          voidRecord ? { voidInfo: voidRecord } : {});
                        setPdfUrl(url);
                      } catch (err) {
                        toastError(`สร้าง PDF ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
                      } finally {
                        setPdfBusy(false);
                      }
                    }}>
              {pdfBusy ? 'กำลังสร้าง PDF…' : 'ดูตัวอย่าง PDF'}
            </button>
          )}
          {mode === 'view' && viewSheet && !voidRecord && (
            <button className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium hover:bg-gray-50"
                    onClick={() => navigate(`/data-records/${viewSheet.id}/amend`)}>
              สร้างชีตแก้ไข
            </button>
          )}
          {mode === 'view' && viewSheet && !voidRecord && (
            <button className="rounded-lg border border-rose-300 px-4 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    onClick={() => setVoidModalOpen(true)}>
              ยกเลิกชีต
            </button>
          )}
          {editable && (
            <button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                    onClick={requestSave}>
              บันทึกชีต
            </button>
          )}
        </div>
        <p className="w-full text-sm text-gray-500">
          {mode === 'view' && viewSheet && (
            <>บันทึกเมื่อ {fmtDateTime(viewSheet.createdAt)} โดย {viewSheet.recordedByName}
              {viewSheet.kind === 'amendment' && ` · เหตุผลการแก้ไข: ${viewSheet.amendmentReason}`}</>
          )}
          {editable && 'ระบบจะประทับเวลาและชื่อผู้บันทึกอัตโนมัติเมื่อยืนยันการบันทึก'}
        </p>
      </div>

      {mode === 'view' && voidRecord && (
        <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          <b>ชีตนี้ถูกยกเลิกแล้ว</b> — เหตุผล: {voidRecord.reason}
          <span className="block text-xs">
            โดย {voidRecord.recordedByName} · {fmtDateTime(voidRecord.createdAt)} ·
            ชีตยังคงอยู่ในระบบตามข้อกำหนด audit trail แต่ถูกซ่อนจากรายการปกติ
          </span>
        </div>
      )}

      {mode === 'amend' && sheet && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          กำลังแก้ไขชีต <b>{shortId(sheet.id)}</b> ({sheet.requestNo}, {sheet.direction},
          บันทึกเมื่อ {fmtDateTime(sheet.createdAt)}) — ชีตเดิมจะไม่ถูกเปลี่ยนแปลง
          ค่า STD-Force จะคำนวณใหม่จากสัญญาณดิบด้วยสมการปัจจุบัน
        </div>
      )}

      {/* header blocks */}
      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <JobInfoBlock
          editable={mode === 'new'}
          jobs={jobs}
          selectedJobId={draft.jobId}
          onSelectJob={selectJob}
          requestNo={mode === 'view' && viewSheet ? viewSheet.requestNo : draft.requestNo}
          receivedDate={mode === 'view' && viewSheet ? viewSheet.receivedDate : draft.receivedDate}
          calibrationDate={mode === 'view' && viewSheet ? viewSheet.calibrationDate : draft.calibrationDate}
          onCalibrationDate={editable ? (iso) => setDraft((d) => ({ ...d, calibrationDate: iso })) : undefined}
          recordedByName={recordedByName}
        />
        <UucBlock
          editable={editable}
          uuc={mode === 'view' && viewSheet ? viewSheet.uuc : draft.uuc}
          calibrationRange={mode === 'view' && viewSheet ? viewSheet.calibrationRange : draft.calibrationRange}
          direction={mode === 'view' && viewSheet ? viewSheet.direction : draft.direction}
          onReadingUnit={(u) => setDraft((d) => ({ ...d, uuc: { ...d.uuc, readingUnit: u } }))}
          onRange={(v) => setDraft((d) => ({ ...d, calibrationRange: v }))}
          onDirection={(dir) => setDraft((d) => ({ ...d, direction: dir }))}
        />
        <StandardsBlock
          standards={derivedStandards}
          usageCounts={usageCounts}
          readingUnit={mode === 'view' && viewSheet ? viewSheet.uuc.readingUnit : draft.uuc.readingUnit}
          envLine={envLine}
        />
      </div>

      {mode === 'new' && selectedJob && selectedJob.equipment.length > 1 && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <label className="mr-2 text-gray-500" htmlFor="uuc-select">เครื่องมือในงานนี้:</label>
          <select id="uuc-select"
                  className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
                  value={draft.uucIndex}
                  onChange={(e) => selectJobEquipment(Number(e.target.value))}>
            {selectedJob.equipment.map((eq, i) => (
              <option key={i} value={i}>{eq.name} — {eq.serialNumber || eq.assetTag || `#${i + 1}`}</option>
            ))}
          </select>
        </div>
      )}

      {/* environment + machine condition + amendment reason */}
      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        {editable ? (
          <EnvironmentBlock
            thermoHygrometers={thermos}
            value={{ envStandardId: draft.envStandardId, env: draft.env }}
            onChange={(next) => setDraft((d) => ({ ...d, envStandardId: next.envStandardId, env: next.env }))}
          />
        ) : (
          viewSheet && <ReadOnlyEnvironmentBlock envStandard={viewSheet.envStandard} env={viewSheet.env} />
        )}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Machine Condition
          </h3>
          {editable ? (
            <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                   aria-label="สภาพเครื่อง"
                   value={draft.machineCondition}
                   onChange={(e) => setDraft((d) => ({ ...d, machineCondition: e.target.value }))} />
          ) : (
            <p className="text-sm">{viewSheet?.machineCondition}</p>
          )}
          {mode === 'amend' && (
            <div className="mt-3">
              <label className="block text-xs text-gray-500" htmlFor="amend-reason">
                เหตุผลการแก้ไข <span className="text-rose-600">*</span>
              </label>
              <textarea id="amend-reason"
                        className="mt-1 min-h-[60px] w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                        placeholder="จำเป็นต้องระบุ เช่น เลือกมาตรฐานอ้างอิงผิดที่จุด 8000 N"
                        value={draft.amendmentReason}
                        onChange={(e) => setDraft((d) => ({ ...d, amendmentReason: e.target.value }))} />
            </div>
          )}
        </div>
        {/* amendment chain (view mode) */}
        {mode === 'view' && viewSheet && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              สายการแก้ไข (Amendment chain)
            </h3>
            {viewSheet.amends && (
              <p className="text-sm">
                ↩ แก้ไขรายการ{' '}
                <button className="font-semibold text-emerald-700 underline"
                        onClick={() => navigate(`/data-records/${viewSheet.amends}`)}>
                  {shortId(viewSheet.amends)}
                </button>
              </p>
            )}
            {amendments.length === 0 && !viewSheet.amends && (
              <p className="text-sm italic text-gray-400">ไม่มีการแก้ไข</p>
            )}
            {amendments.map((a) => (
              <p key={a.id} className="mt-1 text-sm">
                ↪ ถูกแก้ไขโดย{' '}
                <button className="font-semibold text-violet-700 underline"
                        onClick={() => navigate(`/data-records/${a.id}`)}>
                  {shortId(a.id)}
                </button>
                {' '}— {fmtDateTime(a.createdAt)} โดย {a.recordedByName}
                <span className="block text-xs text-gray-500">เหตุผล: {a.amendmentReason}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* measurement grid */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2.5">
          <h3 className="text-sm font-semibold">Measurement Results</h3>
          <span className="text-xs text-gray-500">
            เลือก Standard ต่อแถว — STD-Force คำนวณอัตโนมัติด้วยสมการของมาตรฐานแถวนั้น
          </span>
          {editable && (
            <button className="ml-auto rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={() => setDraft((d) => ({
                      ...d,
                      rows: [...d.rows, blankRow(d.rows[d.rows.length - 1]?.standardKey ?? '')],
                    }))}>
              + เพิ่ม Cal. Point
            </button>
          )}
        </div>
        <div className="p-2">
          {editable ? (
            <MeasurementGrid
              rows={draft.rows}
              options={options}
              readingUnit={draft.uuc.readingUnit}
              decimalPlaces={draft.decimalPlaces}
              onChange={(rows) => setDraft((d) => ({ ...d, rows }))}
            />
          ) : (
            viewSheet && <ReadOnlyMeasurementGrid sheet={viewSheet} />
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-6 border-t border-gray-200 px-6 py-4 text-sm text-gray-500">
          <div className="text-center">
            <div className="mb-1 h-7 w-48 border-b border-dotted border-gray-400" />
            Recorded by: {recordedByName}
          </div>
          <div className="text-center">
            <div className="mb-1 h-7 w-48 border-b border-dotted border-gray-400" />
            Reviewed by
          </div>
          <div className="text-center">
            <div className="mb-1 h-7 w-48 border-b border-dotted border-gray-400" />
            Date
          </div>
        </div>
      </div>

      {editable && (
        <p className="mt-3 border-l-4 border-emerald-600 pl-3 text-xs text-gray-500">
          ชีตนี้จะถูกบันทึกเป็นรายการถาวร แก้ไขย้อนหลังไม่ได้ — ตรวจสอบข้อมูลให้ครบก่อนกด “บันทึกชีต”
        </p>
      )}

      <SaveConfirmModal
        open={confirmOpen}
        isAmendment={mode === 'amend'}
        saving={saving}
        summary={
          (mode === 'amend' && sheet
            ? `ชีตแก้ไขอ้างอิง ${shortId(sheet.id)} · เหตุผล: ${draft.amendmentReason.trim()}`
            : `ชีตใหม่ ${draft.requestNo} · ${draft.direction}`)
          + ` · ${measuredPoints} จุดวัด · ผู้บันทึก ${recordedByName}`
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmSave}
      />

      <PdfPreviewModal
        open={pdfUrl !== null}
        url={pdfUrl}
        fileName={viewSheet ? rawDataSheetPdfFileName(viewSheet) : 'raw-data.pdf'}
        onClose={() => {
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);
          setPdfUrl(null);
        }}
      />

      <VoidSheetModal
        open={voidModalOpen}
        sheetLabel={viewSheet ? `${shortId(viewSheet.id)} (${viewSheet.requestNo}, ${viewSheet.direction})` : ''}
        busy={voidBusy}
        onCancel={() => setVoidModalOpen(false)}
        onConfirm={async (reason) => {
          if (!viewSheet) return;
          setVoidBusy(true);
          try {
            await rawDataSheetService.voidSheet(
              viewSheet.id, reason, currentUser?.uid ?? '', recordedByName,
            );
            const voids = await rawDataSheetService.getVoidsForSheets([viewSheet.id]);
            setVoidRecord(voids.get(viewSheet.id) ?? null);
            setVoidModalOpen(false);
            toastSuccess(`ยกเลิกชีต ${shortId(viewSheet.id)} แล้ว (ชีตยังอยู่ในระบบ)`);
          } catch (err) {
            toastError(`ยกเลิกไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setVoidBusy(false);
          }
        }}
      />
    </div>
  );
};
