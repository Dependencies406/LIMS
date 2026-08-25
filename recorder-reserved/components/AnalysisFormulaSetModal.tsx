import React, { useEffect, useMemo, useState } from 'react';
import type { FormulaSet, FormulaStep, FormulaValidationIssue } from '../modules/data-recorder/analysis/formulaEngine';
import {
  FORCE_ISO7500_1_SHEET_TYPE,
  validateFormulaSet,
  computeForceIso75001ViaFormulaSet,
  PREVIEW_RELATIVE_ERROR_INPUT,
  PREVIEW_UNCERTAINTY_PARAMS,
  PREVIEW_CMC_STEPS,
  PREVIEW_READING_UNIT,
  PREVIEW_SOURCE_LABEL,
} from '../modules/data-recorder/analysis/formulaEngine';
import { ShieldIcon, AlertTriangleIcon, CheckIcon, InfoIcon } from './common';

interface AnalysisFormulaSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFormulaSet: FormulaSet;
  onSave: (formulaSet: FormulaSet) => Promise<void>;
}

const PREVIEW_OPTS = {
  uParams: PREVIEW_UNCERTAINTY_PARAMS,
  cmcSteps: PREVIEW_CMC_STEPS,
  readingUnit: PREVIEW_READING_UNIT,
};

const UNGROUPED_TITLE = 'Formulas';

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtCell(v: number | string | null | undefined, dp = 4): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '-∞' : '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function cellsDiffer(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a === b) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a !== b;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return Math.abs(a - b) / scale > 1e-9;
  }
  return true;
}

// ─── Preview fixtures ───────────────────────────────────────────────────────
//
// A sheet type's live preview is optional: only a sheetType with a registered
// fixture gets one. 'force-iso7500-1' is the only entry today, reusing the
// existing golden-data-derived adapter unchanged. A sheet type with no
// fixture simply renders its formula editor without a preview panel — this
// is graceful degradation, not a requirement every new sheet type must meet.

interface PreviewRow {
  label: string | number;
  italic?: boolean;
  values: Record<string, number | string | null | undefined>;
}

type PreviewOutcome =
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: PreviewRow[] };

interface PreviewFixture {
  sourceLabel: string;
  compute: (formulaSet: FormulaSet) => { rows: PreviewRow[] } | { error: string };
}

const PREVIEW_FIXTURES: Record<string, PreviewFixture> = {
  [FORCE_ISO7500_1_SHEET_TYPE]: {
    sourceLabel: PREVIEW_SOURCE_LABEL,
    compute: (formulaSet) => {
      try {
        const points = computeForceIso75001ViaFormulaSet(formulaSet, PREVIEW_RELATIVE_ERROR_INPUT, PREVIEW_OPTS);
        return {
          rows: points.map((p) => ({
            label: p.calPoint,
            italic: p.isZeroRow,
            values: {
              fAvg: p.relativeError.fAvg,
              q1: p.relativeError.q1,
              q2: p.relativeError.q2,
              q3: p.relativeError.q3,
              qAvg: p.relativeError.qAvg,
              b: p.relativeError.b,
              f0: p.relativeError.f0,
              v: p.relativeError.v,
              a: p.relativeError.a,
              sd: p.uncertaintyBudget?.sd,
              uRep: p.uncertaintyBudget?.uRep,
              uRes: p.uncertaintyBudget?.uRes,
              uStd: p.uncertaintyBudget?.uStd,
              uC: p.uncertaintyBudget?.uC,
              vEff: p.uncertaintyBudget?.vEff,
              k: p.uncertaintyBudget?.k,
              U: p.uncertaintyBudget?.U,
              uReport: p.uncertaintyBudget?.uReport,
              reportU: p.uncertaintyBudget?.reportU,
            },
          })),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
};

function computePreview(formulaSet: FormulaSet): PreviewOutcome {
  const fixture = PREVIEW_FIXTURES[formulaSet.sheetType];
  if (!fixture) return { status: 'none' };
  const result = fixture.compute(formulaSet);
  if ('error' in result) return { status: 'error', message: result.error };
  return { status: 'ok', rows: result.rows };
}

/** Groups steps by their optional `group` label, preserving first-seen order. */
function groupSteps(steps: FormulaStep[]): { title: string; steps: FormulaStep[] }[] {
  const order: string[] = [];
  const byTitle = new Map<string, FormulaStep[]>();
  for (const step of steps) {
    const title = step.group ?? UNGROUPED_TITLE;
    if (!byTitle.has(title)) {
      byTitle.set(title, []);
      order.push(title);
    }
    byTitle.get(title)!.push(step);
  }
  return order.map((title) => ({ title, steps: byTitle.get(title)! }));
}

// ─── Component ─────────────────────────────────────────────────────────────

export const AnalysisFormulaSetModal: React.FC<AnalysisFormulaSetModalProps> = ({
  isOpen,
  onClose,
  currentFormulaSet,
  onSave,
}) => {
  const [draftSteps, setDraftSteps] = useState<FormulaStep[]>(currentFormulaSet.steps);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftSteps(currentFormulaSet.steps.map((s) => ({ ...s })));
    }
  }, [isOpen, currentFormulaSet]);

  const draftFormulaSet: FormulaSet = useMemo(
    () => ({ sheetType: currentFormulaSet.sheetType, steps: draftSteps }),
    [currentFormulaSet.sheetType, draftSteps],
  );

  const stepGroups = useMemo(() => groupSteps(draftSteps), [draftSteps]);

  const validationIssues: FormulaValidationIssue[] = useMemo(
    () => validateFormulaSet(draftFormulaSet),
    [draftFormulaSet],
  );

  const baselinePreview = useMemo(() => computePreview(currentFormulaSet), [currentFormulaSet]);
  const draftPreview = useMemo(
    () => (validationIssues.length === 0 ? computePreview(draftFormulaSet) : { status: 'none' as const }),
    [draftFormulaSet, validationIssues.length],
  );

  const hasChanges = draftSteps.some((step, i) => step.expression !== currentFormulaSet.steps[i]?.expression);
  const previewBlocksSave = draftPreview.status === 'error';
  const canSave = hasChanges && validationIssues.length === 0 && !previewBlocksSave && !saving;

  if (!isOpen) return null;

  const handleExpressionChange = (name: string, expression: string) => {
    setDraftSteps((prev) => prev.map((s) => (s.name === name ? { ...s, expression } : s)));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(draftFormulaSet);
      onClose();
    } catch (err) {
      console.error('Failed to save analysis FormulaSet:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftSteps(currentFormulaSet.steps.map((s) => ({ ...s })));
    onClose();
  };

  const renderStepGroup = (title: string, steps: FormulaStep[]) => (
    <div key={title}>
      <p className="text-sm font-medium text-gray-700 mb-2">{title}</p>
      <div className="space-y-2">
        {steps.map((step) => {
          const stepIssues = validationIssues.filter((i) => i.step === step.name);
          return (
            <div key={step.name} className="flex items-start gap-2">
              <div className="w-20 flex-shrink-0 pt-1.5">
                <span className="font-mono text-xs font-semibold text-gray-700">{step.name}</span>
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={step.expression}
                  onChange={(e) => handleExpressionChange(step.name, e.target.value)}
                  className={`input w-full font-mono text-xs ${stepIssues.length > 0 ? 'border-red-300 bg-red-50' : ''}`}
                  spellCheck={false}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {step.inputs.map((input) => (
                    <span key={input} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-mono">
                      {input}
                    </span>
                  ))}
                </div>
                {stepIssues.map((issue, i) => (
                  <p key={i} className="text-[11px] text-red-600 mt-0.5">{issue.message}</p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderPreviewTable = (title: string, steps: FormulaStep[]) => {
    if (draftPreview.status !== 'ok') return null;
    const baselineRows = baselinePreview.status === 'ok' ? baselinePreview.rows : null;
    return (
      <div key={title}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="text-[11px] border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Cal. Pt</th>
                {steps.map((s) => (
                  <th key={s.name} className="px-2 py-1 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap font-mono">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftPreview.rows.map((row, rowIndex) => {
                const baselineRow = baselineRows?.[rowIndex];
                return (
                  <tr key={row.label} className={row.italic ? 'italic text-gray-400' : undefined}>
                    <td className="px-2 py-1 text-left font-mono border-b border-gray-100 whitespace-nowrap">
                      {row.label}
                    </td>
                    {steps.map((s) => {
                      const draftVal = row.values[s.name];
                      const baselineVal = baselineRow?.values[s.name];
                      const changed = baselineRows !== null && cellsDiffer(draftVal, baselineVal);
                      return (
                        <td
                          key={s.name}
                          className={`px-2 py-1 text-right font-mono tabular-nums border-b border-gray-100 whitespace-nowrap ${changed ? 'bg-amber-50 text-amber-800 font-semibold' : ''}`}
                          title={changed ? `was ${fmtCell(baselineVal)}` : undefined}
                        >
                          {fmtCell(draftVal)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const fixture = PREVIEW_FIXTURES[currentFormulaSet.sheetType];

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldIcon className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Analysis Formulas</h2>
              <p className="text-xs text-gray-400 mt-0.5">Relative Error &amp; Uncertainty Budget · {currentFormulaSet.sheetType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {validationIssues.length > 0 && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700">Fix these before saving:</p>
                <ul className="space-y-0.5 mt-1">
                  {validationIssues.map((issue, i) => (
                    <li key={i} className="text-xs text-red-700">
                      <span className="font-mono">[{issue.step}]</span> {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {validationIssues.length === 0 && draftPreview.status === 'error' && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700">
                  This formula set fails to evaluate on the preview data — cannot save until fixed:
                </p>
                <p className="text-xs text-red-700 mt-1 font-mono">{draftPreview.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {stepGroups.map(({ title, steps }) => renderStepGroup(title, steps))}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            {fixture ? (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <InfoIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Live preview against <span className="font-mono">{fixture.sourceLabel}</span>.
                  Amber cells changed from the currently-saved formulas — review before saving; a numeric
                  change is not itself an error, but it changes what every future sheet's analysis reports.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <InfoIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  No live preview is available for sheet type <span className="font-mono">{currentFormulaSet.sheetType}</span>.
                  Formulas are still validated (parsed, checked against declared inputs) before saving.
                </p>
              </div>
            )}

            {draftPreview.status === 'ok' && stepGroups.map(({ title, steps }) => renderPreviewTable(title, steps))}
          </div>
        </div>
      </div>
    </div>
  );
};
