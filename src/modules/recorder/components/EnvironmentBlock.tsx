/**
 * EnvironmentBlock.tsx
 *
 * Built-in, non-deletable environment section (Task 2): exactly
 * `roundCount` rounds of temperature/RH, always all present — there is no
 * add/remove control, unlike the recording grid's data rows. Required
 * before commit: `commitRecord` already rejects a record whose
 * `environment.length !== roundCount` (ADR-006), and a round only appears
 * in that array once both its fields are filled (see `recordEnvironment.ts`),
 * so the two requirements are the same check by construction.
 *
 * Layout (Phase 9): transposed to match the lab's existing paper/Excel
 * worksheet — rounds run ACROSS as columns, not down as rows, with a label
 * block to the left of the table (outside it) rather than a header row
 * above it. Rounds run down was a builder default, not a deliberate choice;
 * this transpose is presentation-only — `drafts`/`handleFieldChange` and the
 * data model are unchanged.
 *
 * Yellow input cells (Task 2) are the lab's convention for "a human must
 * type here" — a third, calmer state alongside ADR-010's awaiting-input
 * (quiet) / invalid-computation (prominent-red) pair on the recording grid.
 */

import React, { useMemo, useState } from 'react';
import {
  buildEnvironmentDrafts,
  buildEnvironmentFromDrafts,
  isEnvironmentComplete,
  type EnvironmentRoundDraft,
} from '../../../services/recordEnvironment';
import type { RoundEnvironment } from '../../../types';

export interface EnvironmentBlockProps {
  roundCount: number;
  value: RoundEnvironment[];
  onChange?: (environment: RoundEnvironment[]) => void;
  isReadOnly?: boolean;
}

const INPUT_BASE_CLASS =
  'w-20 text-center border-0 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-primary-400 ' +
  'disabled:text-gray-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const EnvironmentBlock: React.FC<EnvironmentBlockProps> = ({ roundCount, value, onChange, isReadOnly = false }) => {
  const [drafts, setDrafts] = useState<EnvironmentRoundDraft[]>(() => buildEnvironmentDrafts(roundCount, value));
  const complete = useMemo(() => isEnvironmentComplete(value, roundCount), [value, roundCount]);

  const handleFieldChange = (roundIndex: number, field: 'temperatureC' | 'relativeHumidity', text: string) => {
    const next = drafts.map((d) => (d.roundIndex === roundIndex ? { ...d, [field]: text } : d));
    setDrafts(next);
    onChange?.(buildEnvironmentFromDrafts(next));
  };

  if (roundCount === 0) return null;

  const inputClassName = `${INPUT_BASE_CLASS} ${isReadOnly ? 'bg-gray-100' : 'bg-yellow-100'}`;

  return (
    <div className="flex items-start gap-4">
      {/* Label block — outside the table, matches the worksheet. */}
      <div className="flex-shrink-0 min-w-[150px] pt-1">
        <p className="text-sm font-bold text-gray-900">Environment Condition:</p>
        <p className="text-xs font-medium text-red-600 mt-0.5">(Must filled before record the data)</p>
        {!complete && (
          <p className="text-xs text-amber-700 mt-1">
            {value.length} of {roundCount} round(s) recorded
          </p>
        )}
      </div>

      {/* Transposed table: rounds across as columns. Scrolls horizontally at high round counts. */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-auto">
          <tbody>
            <tr>
              <th scope="row" className="border border-gray-300 bg-gray-100 font-bold px-3 py-1.5 text-center whitespace-nowrap">
                Round
              </th>
              {drafts.map((draft) => (
                <th
                  key={draft.roundIndex}
                  scope="col"
                  className="border border-gray-300 bg-gray-100 font-bold px-3 py-1.5 text-center whitespace-nowrap"
                >
                  {draft.roundIndex}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="row" className="border border-gray-300 bg-gray-100 font-bold px-3 py-1.5 text-center whitespace-nowrap">
                Temperature (°C)
              </th>
              {drafts.map((draft) => (
                <td key={draft.roundIndex} className="border border-gray-300 p-1">
                  <input
                    type="number"
                    step="any"
                    className={inputClassName}
                    value={draft.temperatureC}
                    disabled={isReadOnly}
                    onChange={(e) => handleFieldChange(draft.roundIndex, 'temperatureC', e.target.value)}
                    aria-label={`Round ${draft.roundIndex} temperature`}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="border border-gray-300 bg-gray-100 font-bold px-3 py-1.5 text-center whitespace-nowrap">
                %RH
              </th>
              {drafts.map((draft) => (
                <td key={draft.roundIndex} className="border border-gray-300 p-1">
                  <input
                    type="number"
                    step="any"
                    className={inputClassName}
                    value={draft.relativeHumidity}
                    disabled={isReadOnly}
                    onChange={(e) => handleFieldChange(draft.roundIndex, 'relativeHumidity', e.target.value)}
                    aria-label={`Round ${draft.roundIndex} relative humidity`}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EnvironmentBlock;
