import React, { useEffect, useMemo, useState } from 'react';
import type { FormulaSet, FormulaStep, FormulaValidationIssue } from '../modules/data-recorder/analysis/formulaEngine';
import {
  RELATIVE_ERROR_STEP_NAMES,
  UNCERTAINTY_BUDGET_STEP_NAMES,
  validateFormulaSet,
  computeForceIso75001ViaFormulaSet,
  PREVIEW_RELATIVE_ERROR_INPUT,
  PREVIEW_UNCERTAINTY_PARAMS,
  PREVIEW_CMC_STEPS,
  PREVIEW_READING_UNIT,
  PREVIEW_SOURCE_LABEL,
  type EngineForceIso75001Point,
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

// ─── Preview computation (isolated so one bad formula can't crash the modal) ──

interface PreviewOutcome {
  points: EngineForceIso75001Point[] | null;
  error: string | null;
}

function computePreview(formulaSet: FormulaSet): PreviewOutcome {
  try {
    const points = computeForceIso75001ViaFormulaSet(formulaSet, PREVIEW_RELATIVE_ERROR_INPUT, PREVIEW_OPTS);
    return { points, error: null };
  } catch (err) {
    return { points: null, error: err instanceof Error ? err.message : String(err) };
  }
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

  const validationIssues: FormulaValidationIssue[] = useMemo(
    () => validateFormulaSet(draftFormulaSet),
    [draftFormulaSet],
  );

  const baselinePreview = useMemo(() => computePreview(currentFormulaSet), [currentFormulaSet]);
  const draftPreview = useMemo(
    () => (validationIssues.length === 0 ? computePreview(draftFormulaSet) : { points: null, error: null }),
    [draftFormulaSet, validationIssues.length],
  );

  const hasChanges = draftSteps.some((step, i) => step.expression !== currentFormulaSet.steps[i]?.expression);
  const canSave = hasChanges && validationIssues.length === 0 && draftPreview.error === null && !saving;

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

  const renderStepGroup = (title: string, names: readonly string[]) => (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{title}</p>
      <div className="space-y-2">
        {names.map((name) => {
          const step = draftSteps.find((s) => s.name === name);
          if (!step) return null;
          const stepIssues = validationIssues.filter((i) => i.step === name);
          return (
            <div key={name} className="flex items-start gap-2">
              <div className="w-20 flex-shrink-0 pt-1.5">
                <span className="font-mono text-xs font-semibold text-gray-700">{name}</span>
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={step.expression}
                  onChange={(e) => handleExpressionChange(name, e.target.value)}
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

  const renderPreviewTable = (
    title: string,
    columns: { key: string; label: string; get: (p: EngineForceIso75001Point) => number | string | null | undefined }[],
  ) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-[11px] border-collapse w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-1 text-left font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">Cal. Pt</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-right font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(draftPreview.points ?? []).map((point, rowIndex) => {
              const baselinePoint = baselinePreview.points?.[rowIndex];
              return (
                <tr key={point.calPoint} className={point.isZeroRow ? 'italic text-gray-400' : undefined}>
                  <td className="px-2 py-1 text-left font-mono border-b border-gray-100 whitespace-nowrap">
                    {point.calPoint}
                  </td>
                  {columns.map((c) => {
                    const draftVal = c.get(point);
                    const baselineVal = baselinePoint ? c.get(baselinePoint) : undefined;
                    const changed = baselinePreview.points !== null && cellsDiffer(draftVal, baselineVal);
                    return (
                      <td
                        key={c.key}
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

          {validationIssues.length === 0 && draftPreview.error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700">
                  This formula set fails to evaluate on the preview data — cannot save until fixed:
                </p>
                <p className="text-xs text-red-700 mt-1 font-mono">{draftPreview.error}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {renderStepGroup('Relative Error', RELATIVE_ERROR_STEP_NAMES)}
            {renderStepGroup('Uncertainty Budget', UNCERTAINTY_BUDGET_STEP_NAMES)}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg p-3">
              <InfoIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Live preview against <span className="font-mono">{PREVIEW_SOURCE_LABEL}</span>.
                Amber cells changed from the currently-saved formulas — review before saving; a numeric
                change is not itself an error, but it changes what every future sheet's analysis reports.
              </p>
            </div>

            {draftPreview.points && (
              <>
                {renderPreviewTable('Relative Error', [
                  { key: 'fAvg', label: 'F_avg', get: (p) => p.relativeError.fAvg },
                  { key: 'q1', label: 'q1', get: (p) => p.relativeError.q1 },
                  { key: 'q2', label: 'q2', get: (p) => p.relativeError.q2 },
                  { key: 'q3', label: 'q3', get: (p) => p.relativeError.q3 },
                  { key: 'qAvg', label: 'q_avg', get: (p) => p.relativeError.qAvg },
                  { key: 'b', label: 'b', get: (p) => p.relativeError.b },
                  { key: 'f0', label: 'f0', get: (p) => p.relativeError.f0 },
                  { key: 'v', label: 'v', get: (p) => p.relativeError.v },
                  { key: 'a', label: 'a', get: (p) => p.relativeError.a },
                ])}
                {renderPreviewTable('Uncertainty Budget', [
                  { key: 'sd', label: 'S.D.', get: (p) => p.uncertaintyBudget?.sd },
                  { key: 'uRep', label: 'u_rep', get: (p) => p.uncertaintyBudget?.uRep },
                  { key: 'uRes', label: 'u_res', get: (p) => p.uncertaintyBudget?.uRes },
                  { key: 'uStd', label: 'u_std', get: (p) => p.uncertaintyBudget?.uStd },
                  { key: 'uC', label: 'u_c', get: (p) => p.uncertaintyBudget?.uC },
                  { key: 'vEff', label: 'V_eff', get: (p) => p.uncertaintyBudget?.vEff },
                  { key: 'k', label: 'k', get: (p) => p.uncertaintyBudget?.k },
                  { key: 'U', label: 'U', get: (p) => p.uncertaintyBudget?.U },
                  { key: 'uReport', label: 'uReport', get: (p) => p.uncertaintyBudget?.uReport },
                  { key: 'reportU', label: 'Report U', get: (p) => p.uncertaintyBudget?.reportU },
                ])}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
