/**
 * CalculationTraceModal.tsx
 *
 * Phase 33 Task 3 — shows the Calculation Trace (ADR-018 D2/D3) for one
 * computed cell: its value at full precision, its formula, the formula with
 * every variable substituted by its actual value, and the provenance of
 * every input — expandable in place when an input was itself computed.
 *
 * READ-ONLY BY CONSTRUCTION: this file has no `onChange`, no form input, no
 * write call to any service, and no import of anything Firestore-facing —
 * it takes a `ComputedTraceNode` (already built by `recordCalculationTrace.ts`)
 * and renders it. There is nothing here CAPABLE of altering a cell or a
 * record; opening this modal cannot enter edit mode because there is no
 * edit mode to enter. Verified in
 * `CalculationTraceModal.test.tsx` by asserting no service module is
 * imported and that rendering it makes zero calls into calibrationRecordService.
 *
 * Follows this module's neighbours (`RecordSignOffModal.tsx`,
 * `VoidRecordModal.tsx`) for both the modal shell (fixed inset-0 backdrop,
 * white rounded-xl panel, `createPortal`) and the language — English, plain
 * sentences. There is no established Thai-labelling convention anywhere
 * near this module to match: the only bilingual component in the codebase
 * is `FormulaHelpModal.tsx`, a separate authoring-time help reference with
 * its own explicit language toggle (defaulting to English), not a
 * record-viewing modal. See docs/PHASE_33_RESULT.md Task 3 for the full
 * verification of this before choosing English.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComputedTraceNode, TraceNode, TraceProvenance } from '../formula';

export interface CalculationTraceModalProps {
  /** e.g. "CAL_ERR — Row 3" or "SUMMARY_MAXDEV" — identifies which cell this is. */
  title: string;
  node: ComputedTraceNode;
  onClose: () => void;
}

const PROVENANCE_LABEL: Record<TraceProvenance, string> = {
  computed: 'computed',
  entered: 'entered',
  'reference-standard': 'reference standard',
  'template-constant': 'template constant',
  environment: 'environment',
  'record-scalar': 'record',
};

const PROVENANCE_STYLE: Record<TraceProvenance, string> = {
  computed: 'bg-blue-50 text-blue-700 border-blue-200',
  entered: 'bg-gray-100 text-gray-700 border-gray-300',
  'reference-standard': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'template-constant': 'bg-purple-50 text-purple-700 border-purple-200',
  environment: 'bg-teal-50 text-teal-700 border-teal-200',
  'record-scalar': 'bg-slate-100 text-slate-700 border-slate-300',
};

function formatValue(value: string | number | boolean | null): string {
  if (value === null) return '?';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

/**
 * Phase 33 Task 4 — non-negotiable: a visible, on-the-spot marker wherever an
 * untraced transform sits between the value this trace shows and what a
 * reader actually sees on screen or on the certificate.
 *
 * Display-time unit conversion (ADR-015) is not traced (PHASE_32_RESULT
 * blind spot 1) and is explicitly NOT wired in this phase (ADR-015 D1 keeps
 * that on the services side) — so a column with `conversionEnabled` shows
 * this warning on every occurrence in the tree, not only at the root: a
 * reviewer who expands into a nested reference to that same column would
 * otherwise have no way to know the number in front of them is pre-conversion.
 */
function ConversionWarning() {
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
      <span aria-hidden="true">⚠</span>
      <span>
        This trace shows the value BEFORE display-time unit conversion (ADR-015). The figure actually shown on the
        grid or certificate for this cell may differ — conversion is not covered by this trace.
      </span>
    </div>
  );
}

interface TraceLineProps {
  node: TraceNode;
  depth: number;
  isConversionEnabled: (label: string) => boolean;
}

function TraceLine({ node, depth, isConversionEnabled }: TraceLineProps) {
  const isComputed = node.provenance === 'computed';
  const hasChildren = isComputed && (node as ComputedTraceNode).inputs.length > 0;
  const [expanded, setExpanded] = useState(depth === 0);

  const head = node.parameter ? `${node.parameter} ← ${node.label}` : node.label;
  const named = node.name ? `${head} (${node.name})` : head;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1 border-b border-gray-100">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-4 text-gray-400 hover:text-gray-700 select-none"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="font-mono text-sm text-gray-900">{named}</span>
        <span className="text-gray-400">=</span>

        {node.error ? (
          <span className="text-sm font-medium text-red-700">
            [{node.error.kind === 'awaiting-input' ? 'awaiting input' : 'invalid'}] {node.error.message}
          </span>
        ) : (
          <>
            <span className="font-mono text-sm font-semibold text-gray-900">{formatValue(node.value)}</span>
            {node.displayValue !== null && node.displayValue !== formatValue(node.value) && (
              <span className="text-xs text-gray-500">(shows {node.displayValue})</span>
            )}
          </>
        )}

        {/* Provenance is on the line itself, not a tooltip — Task 3 requirement 4. */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded border ${PROVENANCE_STYLE[node.provenance]}`}
        >
          {PROVENANCE_LABEL[node.provenance]}
        </span>

        {isComputed && (node as ComputedTraceNode).notEvaluated.length > 0 && (
          <span className="text-xs text-gray-400">
            not evaluated: {(node as ComputedTraceNode).notEvaluated.join(', ')}
          </span>
        )}
      </div>

      {isComputed && (node as ComputedTraceNode).expression !== null && (
        <div className="ml-4 mb-1 font-mono text-xs text-gray-500 break-all">
          <div>{(node as ComputedTraceNode).expression}</div>
          <div className="text-gray-600">&rarr; {(node as ComputedTraceNode).substituted}</div>
        </div>
      )}

      {isConversionEnabled(node.label) && <div className="ml-4 mb-1">{<ConversionWarning />}</div>}

      {hasChildren && expanded && (
        <div>
          {(node as ComputedTraceNode).inputs.map((child, i) => (
            <TraceLine key={`${child.label}-${i}`} node={child} depth={depth + 1} isConversionEnabled={isConversionEnabled} />
          ))}
        </div>
      )}
    </div>
  );
}

export const CalculationTraceModal: React.FC<CalculationTraceModalProps & { isConversionEnabled?: (label: string) => boolean }> = ({
  title,
  node,
  onClose,
  isConversionEnabled = () => false,
}) => {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-xl shadow-xl p-6 flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Calculation trace</h2>
            <p className="text-sm text-gray-500 font-mono">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Read-only. Shows where this value came from — its formula, the formula with each variable replaced by its
          value, and the origin of every input. Click − / + to expand an input that was itself computed.
        </p>
        <div className="overflow-y-auto flex-1 border-t border-gray-200 pt-1">
          <TraceLine node={node} depth={0} isConversionEnabled={isConversionEnabled} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CalculationTraceModal;
