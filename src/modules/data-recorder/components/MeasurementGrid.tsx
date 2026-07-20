/**
 * MeasurementGrid.tsx
 *
 * The raw-data measurement grid: Cal. Point | Standard | 4 series ×
 * [UUC, STD-Signal (mV/V), STD-Force (computed)].
 *
 * Styling note: every cell sets its own border/background classes on purpose —
 * the app's global table styles (e.g. last-row border removal on list cards)
 * must not bleed into this bordered grid.
 */

import React from 'react';
import type { CalibrationRawDataSheet, CalibrationRawDataSheetInput, ForceUnit, SeriesKey } from '../../../types';
import {
  SERIES,
  computeForce,
  fmtForce,
  snapshotForRow,
  type EditableRow,
  type StandardOption,
} from '../sheetLogic';

const cellBorder = 'border border-gray-300';
const headCell = `${cellBorder} bg-emerald-50 text-emerald-900 px-2 py-1.5 text-xs font-semibold text-center whitespace-nowrap`;
const inputCls = 'w-20 rounded border border-gray-300 px-1.5 py-1 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none';

function GridHead({ unit, editable }: { unit: ForceUnit; editable: boolean }) {
  return (
    <thead>
      <tr>
        <th rowSpan={2} className={headCell}>Cal. Point<br /><span className="font-normal text-gray-500">{unit}</span></th>
        <th rowSpan={2} className={headCell}>Standard</th>
        {SERIES.map((s) => (
          <th key={s.key} colSpan={3}
              className={`${headCell} ${s.group === 'inc' ? 'border-b-2 border-b-emerald-500' : 'border-b-2 border-b-violet-500'}`}>
            {s.label}
          </th>
        ))}
        {editable && <th rowSpan={2} className={headCell} aria-label="row actions" />}
      </tr>
      <tr>
        {SERIES.map((s) => (
          <React.Fragment key={s.key}>
            <th className={headCell}>UUC<br /><span className="font-normal text-gray-500">{unit}</span></th>
            <th className={headCell}>STD-Signal<br /><span className="font-normal text-gray-500">mV/V</span></th>
            <th className={headCell}>STD-Force<br /><span className="font-normal text-gray-500">{unit}</span></th>
          </React.Fragment>
        ))}
      </tr>
    </thead>
  );
}

// ─── Editable grid ───────────────────────────────────────────────────────────

interface EditableGridProps {
  rows: EditableRow[];
  options: StandardOption[];
  readingUnit: ForceUnit;
  decimalPlaces: number;
  onChange: (rows: EditableRow[]) => void;
}

export const MeasurementGrid: React.FC<EditableGridProps> = ({
  rows, options, readingUnit, decimalPlaces, onChange,
}) => {
  const optionByKey = new Map(options.map((o) => [o.key, o]));

  const setRow = (index: number, next: EditableRow) => {
    onChange(rows.map((row, i) => (i === index ? next : row)));
  };
  const setCell = (index: number, series: SeriesKey, field: 'uuc' | 'sig', value: string) => {
    const row = rows[index];
    setRow(index, {
      ...row,
      cells: { ...row.cells, [series]: { ...row.cells[series], [field]: value } },
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm" style={{ minWidth: '1100px' }}>
        <GridHead unit={readingUnit} editable />
        <tbody>
          {rows.map((row, i) => {
            const option = optionByKey.get(row.standardKey);
            return (
              <tr key={i}>
                <td className={`${cellBorder} bg-white px-1 py-1 text-center`}>
                  <input
                    className={`${inputCls} w-[4.5rem] font-semibold`}
                    inputMode="decimal"
                    aria-label={`Cal. Point row ${i + 1}`}
                    value={row.calPoint}
                    onChange={(e) => setRow(i, { ...row, calPoint: e.target.value })}
                  />
                </td>
                <td className={`${cellBorder} bg-white px-1 py-1`}>
                  <select
                    className="max-w-[180px] rounded border border-gray-300 px-1 py-1 text-xs focus:border-emerald-500 focus:outline-none"
                    aria-label={`Reference standard row ${i + 1}`}
                    value={row.standardKey}
                    onChange={(e) => setRow(i, { ...row, standardKey: e.target.value })}
                  >
                    <option value="">— Select standard —</option>
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>{o.code}</option>
                    ))}
                  </select>
                </td>
                {SERIES.map((s) => {
                  const cell = row.cells[s.key];
                  const sig = cell.sig.trim() === '' ? null : Number(cell.sig);
                  const force = option
                    ? computeForce(option.equation, Number.isNaN(sig as number) ? null : sig, readingUnit)
                    : null;
                  return (
                    <React.Fragment key={s.key}>
                      <td className={`${cellBorder} bg-white px-1 py-1 text-center`}>
                        <input className={inputCls} inputMode="decimal" value={cell.uuc}
                               aria-label={`UUC ${s.label} row ${i + 1}`}
                               onChange={(e) => setCell(i, s.key, 'uuc', e.target.value)} />
                      </td>
                      <td className={`${cellBorder} bg-white px-1 py-1 text-center`}>
                        <input className={inputCls} inputMode="decimal" value={cell.sig}
                               aria-label={`STD-Signal ${s.label} row ${i + 1}`}
                               onChange={(e) => setCell(i, s.key, 'sig', e.target.value)} />
                      </td>
                      <td className={`${cellBorder} bg-emerald-50/50 px-2 py-1 text-right tabular-nums`}>
                        {fmtForce(force, decimalPlaces)}
                      </td>
                    </React.Fragment>
                  );
                })}
                <td className={`${cellBorder} bg-white px-1 py-1 text-center`}>
                  <button type="button"
                          className="px-1.5 text-sm text-rose-500 hover:text-rose-700"
                          title="Delete this row"
                          onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Read-only grid (saved sheets) ───────────────────────────────────────────

interface ReadOnlyGridProps {
  sheet: CalibrationRawDataSheet | CalibrationRawDataSheetInput;
}

export const ReadOnlyMeasurementGrid: React.FC<ReadOnlyGridProps> = ({ sheet }) => {
  const unit = sheet.uuc.readingUnit;
  const dp = sheet.decimalPlaces;
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm" style={{ minWidth: '1100px' }}>
        <GridHead unit={unit} editable={false} />
        <tbody>
          {sheet.rows.map((row, i) => {
            const snap = snapshotForRow(sheet, row);
            return (
              <tr key={i}>
                <td className={`${cellBorder} bg-white px-2 py-1 text-right font-semibold tabular-nums`}>
                  {row.calPoint.toLocaleString('en-US')}
                </td>
                <td className={`${cellBorder} bg-white px-2 py-1 text-xs whitespace-nowrap`} title={snap?.code}>
                  {snap ? snap.code : '—'}
                </td>
                {SERIES.map((s) => {
                  const cell = row.cells[s.key];
                  return (
                    <React.Fragment key={s.key}>
                      <td className={`${cellBorder} bg-white px-2 py-1 text-right tabular-nums`}>
                        {cell.uuc === null ? '-' : fmtForce(cell.uuc, dp)}
                      </td>
                      <td className={`${cellBorder} bg-white px-2 py-1 text-right tabular-nums`}>
                        {cell.sig === null ? '-' : String(cell.sig)}
                      </td>
                      <td className={`${cellBorder} bg-emerald-50/50 px-2 py-1 text-right tabular-nums`}>
                        {fmtForce(cell.force, dp)}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
