/**
 * FormulaVariableDisclosure.tsx
 *
 * Phase 10 Task 7: a collapsed disclosure directly beneath a formula input,
 * closed by default — the owner's explicit constraint is near-zero default
 * visual weight, so this renders as exactly one line of small grey text
 * until clicked open.
 *
 * Purely a rendering + click-to-insert widget. WHICH variables to show comes
 * from formulaVariableList.ts's pure builders — this component never decides
 * that itself, so it stays trivial to test and reuse for both the row-context
 * (column formula) and summary-context (summary field) inputs.
 */

import React, { useState } from 'react';
import type { FormulaVariableGroup } from '../services/formulaVariableList';

export interface FormulaVariableDisclosureProps {
  groups: FormulaVariableGroup[];
  onInsert: (name: string) => void;
}

export const FormulaVariableDisclosure: React.FC<FormulaVariableDisclosureProps> = ({ groups, onInsert }) => {
  const [open, setOpen] = useState(false);
  const hasAny = groups.some((g) => g.entries.length > 0);
  if (!hasAny) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        {open ? '▾' : '▸'} Variables you can use
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2">
          {groups.filter((g) => g.entries.length > 0).map((group) => (
            <div key={group.label} className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.entries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    title={
                      entry.disabled
                        ? 'A formula cannot reference its own column — this would be a dependency loop.'
                        : entry.title
                    }
                    disabled={entry.disabled}
                    onClick={() => onInsert(entry.name)}
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      entry.disabled
                        ? 'text-gray-300 border-gray-100 bg-gray-50 cursor-not-allowed line-through'
                        : 'text-primary-700 border-primary-100 bg-white hover:bg-primary-50 hover:border-primary-300'
                    }`}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FormulaVariableDisclosure;
