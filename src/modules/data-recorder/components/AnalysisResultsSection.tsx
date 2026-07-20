/**
 * AnalysisResultsSection.tsx
 *
 * "ผลการวิเคราะห์" — read-only Relative Error + Uncertainty Budget tables for
 * a saved calibration raw-data sheet (design §8c). Computed on demand from
 * the sheet being viewed; nothing here is ever written back to the sheet.
 *
 * Styling note: self-contained, like MeasurementGrid — every cell sets its
 * own border/background classes rather than relying on global table styles.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { CalibrationRawDataSheet, ConversionEquation } from '../../../types';
import { conversionEquationService } from '../../../services/conversionEquationService';
import { cmcService } from '../../../services/cmcService';
import {
  computeRelativeError,
  ISO7500_1_CLASS_LIMITS,
  readingUnitFromSheet,
  relativeErrorInputFromSheet,
  type ClassValue,
  type RelativeErrorPoint,
} from '../analysis';
import {
  buildUncertaintyBudgetPoints,
  equipmentIdsNeedingCurrentEquation,
  resolveCmcSteps,
  CMC_UNAVAILABLE_NOTICE,
  PARAMS_FALLBACK_NOTICE,
  PARAMS_UNAVAILABLE_NOTICE,
  type SourcedUncertaintyBudgetPoint,
} from '../analysisSourcing';
import { snapshotForRow } from '../sheetLogic';

const cellBorder = 'border border-gray-300';
const headCell = `${cellBorder} bg-emerald-50 text-emerald-900 px-2 py-1.5 text-xs font-semibold text-center whitespace-nowrap`;
const dataCell = `${cellBorder} bg-white px-2 py-1 text-right text-xs tabular-nums whitespace-nowrap`;
const classCell = `${cellBorder} bg-gray-50 px-2 py-1 text-center text-xs font-semibold tabular-nums whitespace-nowrap`;

// ─── Number formatting ────────────────────────────────────────────────────────

function fmtPct(v: number | '-' | null | undefined, dp = 4): string {
  if (v === '-' || v === null || v === undefined || !Number.isFinite(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtForceVal(v: number | null | undefined, dp: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtClass(v: ClassValue): string {
  if (v === '-' || v === 'N/A') return v;
  return String(v);
}

function fmtVeff(v: number): string {
  return Number.isFinite(v) ? v.toFixed(4) : '∞';
}

// ─── Component ─────────────────────────────────────────────────────────────

interface AnalysisResultsSectionProps {
  sheet: CalibrationRawDataSheet;
}

export const AnalysisResultsSection: React.FC<AnalysisResultsSectionProps> = ({ sheet }) => {
  const [loading, setLoading] = useState(true);
  const [currentEquations, setCurrentEquations] = useState<Map<string, ConversionEquation>>(new Map());
  const [cmc, setCmc] = useState<{ steps: ReturnType<typeof resolveCmcSteps>['steps']; available: boolean }>(
    { steps: [], available: false },
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      let settings = null as Awaited<ReturnType<typeof cmcService.get>> | null;
      try {
        settings = await cmcService.get();
      } catch (err) {
        console.error('โหลดค่า CMC ไม่สำเร็จ:', err);
      }

      const equipmentIds = equipmentIdsNeedingCurrentEquation(sheet);
      const map = new Map<string, ConversionEquation>();
      await Promise.all(
        equipmentIds.map(async (equipmentId) => {
          try {
            const equations = await conversionEquationService.getAll(equipmentId);
            equations.forEach((eq) => map.set(`${equipmentId}::${eq.id}`, eq));
          } catch (err) {
            console.error(`โหลดสมการปัจจุบันของ ${equipmentId} ไม่สำเร็จ:`, err);
          }
        }),
      );

      if (cancelled) return;
      setCmc(resolveCmcSteps(settings, sheet.direction));
      setCurrentEquations(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sheet]);

  const relativeError = useMemo(
    () => computeRelativeError(relativeErrorInputFromSheet(sheet)),
    [sheet],
  );
  const readingUnit = useMemo(() => readingUnitFromSheet(sheet), [sheet]);

  const budget: SourcedUncertaintyBudgetPoint[] = useMemo(
    () => buildUncertaintyBudgetPoints(sheet, relativeError, cmc.steps, readingUnit, currentEquations),
    [sheet, relativeError, cmc.steps, readingUnit, currentEquations],
  );

  const hasFallback = budget.some((b) => b.paramsSource === 'current-equation');
  const hasUnavailable = budget.some((b) => b.paramsSource === 'unavailable');

  if (loading) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">กำลังคำนวณผลการวิเคราะห์…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">ผลการวิเคราะห์ (Relative Error &amp; Uncertainty Budget)</h3>
        <p className="mt-1 text-xs text-gray-500">
          คำนวณจากข้อมูลของชีตนี้แบบทันที (on demand) — ไม่มีการบันทึกค่าที่คำนวณได้ลงในชีต
        </p>
      </div>

      {hasFallback && (
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{PARAMS_FALLBACK_NOTICE}</div>
      )}
      {hasUnavailable && (
        <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{PARAMS_UNAVAILABLE_NOTICE}</div>
      )}
      {!cmc.available && (
        <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{CMC_UNAVAILABLE_NOTICE}</div>
      )}

      <RelativeErrorTable sheet={sheet} points={relativeError.points} readingUnit={readingUnit} />
      <ClassLimitTable />
      <UncertaintyBudgetTable sheet={sheet} rows={budget} cmcAvailable={cmc.available} readingUnit={readingUnit} />
    </div>
  );
};

// ─── Relative Error table ─────────────────────────────────────────────────────

const RelativeErrorTable: React.FC<{
  sheet: CalibrationRawDataSheet;
  points: RelativeErrorPoint[];
  readingUnit: string;
}> = ({ sheet, points, readingUnit }) => (
  <div className="rounded-lg border border-gray-200 bg-white">
    <div className="border-b border-gray-200 px-4 py-2.5">
      <h4 className="text-sm font-semibold">Relative Error</h4>
    </div>
    <div className="overflow-x-auto p-2">
      <table className="border-collapse text-xs" style={{ minWidth: '1400px' }}>
        <thead>
          <tr>
            <th rowSpan={2} className={headCell}>Cal. Point<br /><span className="font-normal text-gray-500">{readingUnit}</span></th>
            <th colSpan={4} className={headCell}>STD-Force ({readingUnit})</th>
            <th rowSpan={2} className={headCell}>F_avg<br /><span className="font-normal text-gray-500">{readingUnit}</span></th>
            <th colSpan={4} className={headCell}>q (%)</th>
            <th rowSpan={2} className={headCell}>b (%)</th>
            <th rowSpan={2} className={headCell}>f0 (%)</th>
            <th rowSpan={2} className={headCell}>v (%)</th>
            <th rowSpan={2} className={headCell}>a (%)</th>
            <th colSpan={5} className={headCell}>Class</th>
          </tr>
          <tr>
            <th className={headCell}>Fi1</th>
            <th className={headCell}>Fi2</th>
            <th className={headCell}>Fi3</th>
            <th className={headCell}>F&apos;i3</th>
            <th className={headCell}>q1</th>
            <th className={headCell}>q2</th>
            <th className={headCell}>q3</th>
            <th className={headCell}>q_avg</th>
            <th className={headCell}>q</th>
            <th className={headCell}>b</th>
            <th className={headCell}>v</th>
            <th className={headCell}>f0</th>
            <th className={headCell}>Overall</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const row = sheet.rows[i];
            const dp = sheet.decimalPlaces;
            return (
              <tr key={i} className={p.isZeroRow ? 'italic text-gray-500' : undefined}>
                <td className={`${cellBorder} bg-white px-2 py-1 text-center text-xs font-semibold tabular-nums whitespace-nowrap`}>
                  {p.isZeroRow ? `0 (${row?.calPoint ?? 0})` : p.calPoint.toLocaleString('en-US')}
                </td>
                <td className={dataCell}>{fmtForceVal(p.fi1, dp)}</td>
                <td className={dataCell}>{fmtForceVal(p.fi2, dp)}</td>
                <td className={dataCell}>{fmtForceVal(p.fi3, dp)}</td>
                <td className={dataCell}>{fmtForceVal(p.fd3, dp)}</td>
                <td className={dataCell}>{fmtForceVal(p.fAvg, dp)}</td>
                <td className={dataCell}>{fmtPct(p.q1)}</td>
                <td className={dataCell}>{fmtPct(p.q2)}</td>
                <td className={dataCell}>{fmtPct(p.q3)}</td>
                <td className={dataCell}>{fmtPct(p.qAvg)}</td>
                <td className={dataCell}>{fmtPct(p.b)}</td>
                <td className={dataCell}>{fmtPct(p.f0)}</td>
                <td className={dataCell}>{fmtPct(p.v)}</td>
                <td className={dataCell}>{fmtPct(p.a)}</td>
                <td className={classCell}>{fmtClass(p.classes.q)}</td>
                <td className={classCell}>{fmtClass(p.classes.b)}</td>
                <td className={classCell}>{fmtClass(p.classes.v)}</td>
                <td className={classCell}>{fmtClass(p.classes.f0)}</td>
                <td className={`${classCell} bg-emerald-50`}>{fmtClass(p.overallClass)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <p className="border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">
      แถวตัวเอียง = จุดศูนย์ (zero row) — แสดงเพื่ออ้างอิง ไม่ใช่จุดวัดจริง
    </p>
  </div>
);

// ─── Class limit reference table ──────────────────────────────────────────────

const ClassLimitTable: React.FC = () => (
  <div className="rounded-lg border border-gray-200 bg-white">
    <div className="border-b border-gray-200 px-4 py-2.5">
      <h4 className="text-sm font-semibold">ตารางเกณฑ์ Class of Machine (ISO 7500-1:2018)</h4>
    </div>
    <div className="overflow-x-auto p-2">
      <table className="border-collapse text-xs" style={{ minWidth: '400px' }}>
        <thead>
          <tr>
            <th className={headCell}>Class</th>
            <th className={headCell}>q (%)</th>
            <th className={headCell}>b (%)</th>
            <th className={headCell}>v (%)</th>
            <th className={headCell}>f0 (%)</th>
            <th className={headCell}>a (%)</th>
          </tr>
        </thead>
        <tbody>
          {ISO7500_1_CLASS_LIMITS.map((row) => (
            <tr key={row.cls}>
              <td className={`${classCell} bg-emerald-50`}>{row.cls}</td>
              <td className={dataCell}>{row.q}</td>
              <td className={dataCell}>{row.b}</td>
              <td className={dataCell}>{row.v}</td>
              <td className={dataCell}>{row.f0}</td>
              <td className={dataCell}>{row.a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Uncertainty Budget table ─────────────────────────────────────────────────

const UncertaintyBudgetTable: React.FC<{
  sheet: CalibrationRawDataSheet;
  rows: SourcedUncertaintyBudgetPoint[];
  cmcAvailable: boolean;
  readingUnit: string;
}> = ({ sheet, rows, cmcAvailable, readingUnit }) => (
  <div className="rounded-lg border border-gray-200 bg-white">
    <div className="border-b border-gray-200 px-4 py-2.5">
      <h4 className="text-sm font-semibold">Uncertainty Budget</h4>
    </div>
    <div className="overflow-x-auto p-2">
      <table className="border-collapse text-xs" style={{ minWidth: '1400px' }}>
        <thead>
          <tr>
            <th className={headCell}>Cal. Point<br /><span className="font-normal text-gray-500">{readingUnit}</span></th>
            <th className={headCell}>S.D. (%)</th>
            <th className={headCell}>u_rep (%)</th>
            <th className={headCell}>u_res (%)</th>
            <th className={headCell}>u_cal (%)</th>
            <th className={headCell}>A (%)</th>
            <th className={headCell}>B (%)</th>
            <th className={headCell}>C (%)</th>
            <th className={headCell}>u_std (%)</th>
            <th className={headCell}>u_c (%)</th>
            <th className={headCell}>V_eff</th>
            <th className={headCell}>k</th>
            <th className={headCell}>U (%)</th>
            <th className={headCell}>CMC (%)</th>
            <th className={headCell}>Report U</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ point, paramsSource }, i) => (
            <tr key={i}>
              <td className={`${cellBorder} bg-white px-2 py-1 text-center text-xs font-semibold tabular-nums whitespace-nowrap`}>
                {point.calPoint.toLocaleString('en-US')}
                {paramsSource !== 'snapshot' && (
                  <sup
                    className={paramsSource === 'unavailable' ? 'text-rose-600' : 'text-amber-600'}
                    title={
                      paramsSource === 'unavailable'
                        ? 'ไม่พบค่าพารามิเตอร์ความไม่แน่นอน'
                        : 'ใช้ค่าพารามิเตอร์ปัจจุบันของสมการแทนค่าที่บันทึกไว้'
                    }
                  >
                    {' '}†
                  </sup>
                )}
              </td>
              <td className={dataCell}>{fmtPct(point.sd)}</td>
              <td className={dataCell}>{fmtPct(point.uRep)}</td>
              <td className={dataCell}>{fmtPct(point.uRes)}</td>
              <td className={dataCell}>{fmtPct(point.uCal)}</td>
              <td className={dataCell}>{fmtPct(point.uA)}</td>
              <td className={dataCell}>{fmtPct(point.uB)}</td>
              <td className={dataCell}>{fmtPct(point.uC_param)}</td>
              <td className={dataCell}>{fmtPct(point.uStd)}</td>
              <td className={dataCell}>{fmtPct(point.uC)}</td>
              <td className={dataCell}>{fmtVeff(point.vEff)}</td>
              <td className={dataCell}>{point.k.toFixed(4)}</td>
              <td className={dataCell}>{fmtPct(point.U)}</td>
              <td className={dataCell}>{point.cmc === null ? '-' : fmtPct(point.cmc, 2)}</td>
              <td className={`${dataCell} bg-emerald-50/50 font-semibold`}>
                {cmcAvailable ? point.reportU : '— (ไม่มี CMC)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {sheet.rows.length > 0 && (
      <p className="border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">
        † = จุดวัดนี้ไม่ได้ใช้ค่าพารามิเตอร์ความไม่แน่นอนที่บันทึกไว้ ณ เวลาบันทึกชีต — ดูหมายเหตุด้านบน
      </p>
    )}
  </div>
);
