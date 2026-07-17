/**
 * EnvironmentBlock.tsx
 *
 * Environment Condition block: a REQUIRED thermo-hygrometer selection plus
 * 3 rounds of temperature/%RH readings (all required before save).
 */

import React from 'react';
import type { EnvStandardSnapshot, EquipmentRecord } from '../../../types';
import { fmtDate } from '../sheetLogic';

export interface EnvDraft {
  envStandardId: string;
  env: { t: string; h: string }[];
}

interface EditableProps {
  thermoHygrometers: EquipmentRecord[];
  value: EnvDraft;
  onChange: (next: EnvDraft) => void;
}

const inputCls = 'w-16 rounded border border-gray-300 px-1.5 py-1 text-center text-sm focus:border-emerald-500 focus:outline-none';

export const EnvironmentBlock: React.FC<EditableProps> = ({ thermoHygrometers, value, onChange }) => {
  const setRound = (index: number, field: 't' | 'h', v: string) => {
    onChange({
      ...value,
      env: value.env.map((round, i) => (i === index ? { ...round, [field]: v } : round)),
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Environment Condition
      </h3>
      <label className="block text-xs text-gray-500" htmlFor="env-thm">
        Thermo-Hygrometer <span className="text-rose-600">*</span>
      </label>
      <select
        id="env-thm"
        className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        value={value.envStandardId}
        onChange={(e) => onChange({ ...value, envStandardId: e.target.value })}
      >
        <option value="">— เลือกเครื่องมือวัดสภาพแวดล้อม —</option>
        {thermoHygrometers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id} · S/N {t.serialNumber || '—'} · Due {fmtDate(t.nextCalibrationDate)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-amber-600">(ต้องเลือกเครื่องมือและกรอกครบ 3 รอบก่อนบันทึก)</p>
      <table className="mt-2 text-sm">
        <thead>
          <tr>
            <th className="pr-3 text-left text-xs font-medium text-gray-500">Round</th>
            {[1, 2, 3].map((n) => (
              <th key={n} className="px-2 text-center text-xs font-medium text-gray-500">{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="pr-3 text-gray-600">Temperature (°C)</td>
            {value.env.map((round, i) => (
              <td key={i} className="px-1 py-1">
                <input className={inputCls} inputMode="decimal" value={round.t}
                       aria-label={`อุณหภูมิ รอบที่ ${i + 1}`}
                       onChange={(e) => setRound(i, 't', e.target.value)} />
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-3 text-gray-600">%RH</td>
            {value.env.map((round, i) => (
              <td key={i} className="px-1 py-1">
                <input className={inputCls} inputMode="decimal" value={round.h}
                       aria-label={`ความชื้นสัมพัทธ์ รอบที่ ${i + 1}`}
                       onChange={(e) => setRound(i, 'h', e.target.value)} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

interface ReadOnlyProps {
  envStandard: EnvStandardSnapshot;
  env: { t: number; h: number }[];
}

export const ReadOnlyEnvironmentBlock: React.FC<ReadOnlyProps> = ({ envStandard, env }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
      Environment Condition
    </h3>
    <div className="text-sm">
      <span className="font-semibold">{envStandard.code}</span> — {envStandard.name}
      <div className="text-xs text-gray-500">
        S/N {envStandard.serial || '—'} · {envStandard.range || '—'} · Due {fmtDate(envStandard.dueDate)}
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
      {env.map((round, i) => (
        <span key={i}>รอบ {i + 1}: {round.t}°C / {round.h}%RH</span>
      ))}
    </div>
  </div>
);
