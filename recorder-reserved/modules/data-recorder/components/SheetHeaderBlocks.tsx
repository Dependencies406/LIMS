/**
 * SheetHeaderBlocks.tsx
 *
 * The three header info blocks of a raw-data sheet (mirroring the Excel
 * workbook): Job Info, Unit Under Calibration, and the DERIVED Reference
 * Standards summary (built from what the measurement rows actually use),
 * plus the conversion-formula coefficient table.
 */

import React from 'react';
import type { CalDirection, ForceUnit, Job, StandardSnapshot } from '../../../types';
import { FORCE_UNITS } from '../forceUnits';
import { fmtDate } from '../sheetLogic';

const blockCls = 'rounded-lg border border-gray-200 bg-white p-4';
const titleCls = 'mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700';
const rowCls = 'grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 text-sm';
const labelCls = 'text-gray-500';
const inputCls = 'w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none';

// ─── Job Info ────────────────────────────────────────────────────────────────

interface JobBlockProps {
  editable: boolean;
  jobs?: Job[];
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
  requestNo: string;
  receivedDate?: string;
  calibrationDate: string;
  onCalibrationDate?: (iso: string) => void;
  recordedByName: string;
}

export const JobInfoBlock: React.FC<JobBlockProps> = (p) => (
  <div className={blockCls}>
    <h3 className={titleCls}>Job Info.</h3>
    <div className={rowCls}>
      <span className={labelCls}>Request No.:</span>
      {p.editable && p.jobs && p.onSelectJob ? (
        <select className={inputCls} value={p.selectedJobId ?? ''}
                aria-label="Select job"
                onChange={(e) => p.onSelectJob!(e.target.value)}>
          <option value="">— Select job —</option>
          {p.jobs.map((job) => (
            <option key={job.id} value={job.id}>{job.jobId} — {job.title}</option>
          ))}
        </select>
      ) : (
        <span>{p.requestNo || '—'}</span>
      )}
      <span className={labelCls}>Received:</span>
      <span>{fmtDate(p.receivedDate)}</span>
      <span className={labelCls}>Cal. Date:</span>
      {p.editable && p.onCalibrationDate ? (
        <input type="date" className={inputCls} value={p.calibrationDate}
               aria-label="Calibration date"
               onChange={(e) => p.onCalibrationDate!(e.target.value)} />
      ) : (
        <span>{fmtDate(p.calibrationDate)}</span>
      )}
      <span className={labelCls}>Recorded by:</span>
      <span>{p.recordedByName}</span>
    </div>
  </div>
);

// ─── Unit Under Calibration ──────────────────────────────────────────────────

interface UucBlockProps {
  editable: boolean;
  uuc: { equipmentName: string; manufacturer?: string; model?: string; serial?: string;
         readingUnit: ForceUnit; resolution?: number };
  calibrationRange: string;
  direction: CalDirection;
  onReadingUnit?: (u: ForceUnit) => void;
  onRange?: (v: string) => void;
  onDirection?: (d: CalDirection) => void;
}

export const UucBlock: React.FC<UucBlockProps> = (p) => (
  <div className={blockCls}>
    <h3 className={titleCls}>Unit Under Calibration</h3>
    <div className={rowCls}>
      <span className={labelCls}>Name:</span><span>{p.uuc.equipmentName || '—'}</span>
      <span className={labelCls}>Manufacturer:</span><span>{p.uuc.manufacturer || '—'}</span>
      <span className={labelCls}>Model:</span><span>{p.uuc.model || '—'}</span>
      <span className={labelCls}>Serial No.:</span><span>{p.uuc.serial || '—'}</span>
      <span className={labelCls}>Reading Unit:</span>
      {p.editable && p.onReadingUnit ? (
        <select className={inputCls} value={p.uuc.readingUnit}
                aria-label="Equipment reading unit"
                onChange={(e) => p.onReadingUnit!(e.target.value as ForceUnit)}>
          {FORCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      ) : (
        <span>{p.uuc.readingUnit}</span>
      )}
      <span className={labelCls}>Resolution:</span>
      <span>{p.uuc.resolution ?? '—'}</span>
      <span className={labelCls}>Cal. Range:</span>
      {p.editable && p.onRange ? (
        <input className={inputCls} value={p.calibrationRange}
               aria-label="Calibration range"
               onChange={(e) => p.onRange!(e.target.value)} />
      ) : (
        <span>{p.calibrationRange || '—'}</span>
      )}
      <span className={labelCls}>Direction:</span>
      {p.editable && p.onDirection ? (
        <select className={inputCls} value={p.direction}
                aria-label="Calibration direction"
                onChange={(e) => p.onDirection!(e.target.value as CalDirection)}>
          <option value="Tension">Tension</option>
          <option value="Compression">Compression</option>
        </select>
      ) : (
        <span>{p.direction}</span>
      )}
    </div>
  </div>
);

// ─── Derived Reference Standards + formula ───────────────────────────────────

interface StandardsBlockProps {
  standards: StandardSnapshot[];
  /** Rows-per-standard usage counts keyed by `${equipmentId}::${equationId}`. */
  usageCounts: Record<string, number>;
  readingUnit: ForceUnit;
  envLine?: { code: string; serial?: string; dueDate?: string };
}

export const StandardsBlock: React.FC<StandardsBlockProps> = ({
  standards, usageCounts, readingUnit, envLine,
}) => (
  <div className={blockCls}>
    <h3 className={titleCls}>Reference Standards (as actually used in the table)</h3>
    {standards.length === 0 && !envLine ? (
      <p className="text-sm italic text-gray-400">No rows have a reference standard selected yet</p>
    ) : (
      <ul className="space-y-1.5 text-sm">
        {standards.map((s) => (
          <li key={`${s.equipmentId}::${s.equationId}`} className="border-b border-dashed border-gray-200 pb-1.5 last:border-0">
            <div className="font-semibold">{s.code}</div>
            <div className="text-xs text-gray-500">
              {s.name} · S/N {s.serial || '—'} · Due {fmtDate(s.dueDate)}
              · used by {usageCounts[`${s.equipmentId}::${s.equationId}`] ?? 0} row(s)
            </div>
          </li>
        ))}
        {envLine && (
          <li>
            <div className="font-semibold">{envLine.code}</div>
            <div className="text-xs text-gray-500">
              Thermo-Hygrometer · S/N {envLine.serial || '—'} · Due {fmtDate(envLine.dueDate)} · environment
            </div>
          </li>
        )}
      </ul>
    )}
    {standards.length > 0 && (
      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="text-sm font-semibold">
          F = A·R + B·R² + … <span className="font-normal text-gray-500">(standard's unit)</span> → {readingUnit}
        </div>
        <div className="mt-1 overflow-x-auto">
          <table className="text-xs tabular-nums">
            <thead>
              <tr className="text-gray-500">
                <th className="pr-3 text-left font-medium">Standard</th>
                <th className="pr-3 text-right font-medium">Coefficients (high→low)</th>
                <th className="pr-3 text-right font-medium">÷</th>
                <th className="text-left font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {standards.map((s) => (
                <tr key={`c-${s.equipmentId}::${s.equationId}`}>
                  <td className="pr-3">{s.code}</td>
                  <td className="pr-3 text-right">{s.coefficients.map((c) => c.toPrecision(6)).join(', ')}</td>
                  <td className="pr-3 text-right">{s.divisor}</td>
                  <td>{s.outputUnit}{s.outputUnit !== readingUnit ? ` → ${readingUnit}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          R = signal value from the standard (mV/V) · the result is converted to the UUC unit automatically (N, kN, kgf, gf)
        </p>
      </div>
    )}
  </div>
);
