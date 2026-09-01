/**
 * RecordEntryPage.tsx
 *
 * Tasks 6 + 7: the calibration recording surface. Reached from a Job's
 * Items tab. On load, resolves what the technician should see next
 * (`calibrationRecordService.resolveRecordForItem`, domain model §4):
 *   - no record for this item  -> create a Draft and open it for editing
 *   - a Draft exists           -> reopen it for editing
 *   - committed-or-later       -> open READ-ONLY, with an explicit
 *     "Create Revision" action (never silently editable)
 *
 * Lifecycle actions (Commit / Review / Approve / Create Revision) are
 * gated on the records.commit / records.review / records.approve /
 * records.revise permissions (see roleService.ts) and always show which
 * state the record is currently in.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { jobService } from '../services/jobService';
import {
  calibrationRecordService,
  RecordNotCommittableError,
  trimDraftRows,
  reviewBlockedReason,
  approveBlockedReason,
} from '../services/calibrationRecordService';
import { recorderTemplateService } from '../services/recorderTemplateService';
import { isEnvironmentComplete } from '../services/recordEnvironment';
import { findRecoverableDraft } from '../modules/recorder/hooks/useDraftAutosave';
import { useDraftAutosave, mergeSaveState } from '../modules/recorder/hooks/useDraftAutosave';
import { useLiveRecalculation } from '../modules/recorder/hooks/useLiveRecalculation';
import { RecordingGrid, type RecordingGridHandle, type SelectedTraceableCell } from '../modules/recorder/components/RecordingGrid';
import { CalculationTraceModal } from '../modules/recorder/components/CalculationTraceModal';
import {
  traceRecord,
  standardIdentityFromEquipment,
  standardIdentityFromSnapshot,
} from '../services/recordCalculationTrace';
import type { ComputedTraceNode, TraceStandardIdentity } from '../modules/recorder/formula';
import { EnvironmentBlock } from '../modules/recorder/components/EnvironmentBlock';
import { DraftRecoveryBanner } from '../modules/recorder/components/DraftRecoveryBanner';
import { RecordSignOffModal } from '../modules/recorder/components/RecordSignOffModal';
import { CreateRevisionDialog } from '../modules/recorder/components/CreateRevisionDialog';
import { VoidRecordModal } from '../modules/recorder/components/VoidRecordModal';
import { TemplateBasedRecordPdfGenerator } from '../components/TemplateBasedRecordPdfGenerator';
import { loadStandardOptions, optionsToStandardsById, type StandardOption } from '../services/referenceStandardOptions';
import {
  templateReferencesReportUnit,
  findColumnUnitReportUnitMismatches,
  findConversionFailures,
  findSelectableUnitColumns,
  isValidColumnUnitChoice,
  type StandardLabelMap,
} from '../services/recordingGridDocument';
import { FORCE_UNITS } from '../services/forceUnits';
import { unitConversionRuleService } from '../services/unitConversionRuleService';
import { formatColumnValueForDisplay } from '../services/recordingGridDocument';
import { environmentToEnvMap } from '../services/recordEnvironment';
import type { StandardWarning } from '../services/referenceStandardVariables';
import type { CalibrationRecord, ConversionRule, DigitalSignature, Equipment, ForceUnit, RecorderTemplate, RoundEnvironment } from '../types';

/** Does this template have a `standard` column at all? Most don't — skip the Firestore reads when it doesn't. */
function templateUsesStandards(template: RecorderTemplate): boolean {
  return template.sections.some((s) => s.columns.some((c) => c.type === 'standard'));
}

/**
 * Phase 23 Task 3: a `permission-denied` here is never a generic failure —
 * `firestore.rules`' review/approve clauses only refuse for one of three
 * specific reasons (missing role permission, separation of duties, or the
 * deployed ruleset not matching what this app expects). The UI is supposed
 * to have already screened out the first two (see reviewBlockedReason /
 * approveBlockedReason below) before offering the button at all, so seeing
 * this means either that screening missed something or the THIRD
 * possibility — undeployed/mismatched rules — is real. Name all three
 * rather than printing the raw FirebaseError, which says none of this.
 */
function explainRecordActionError(error: unknown, action: 'review' | 'approve'): string[] {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return [
      `Firestore refused to ${action} this record. This UI should have already prevented that — since it didn't, the cause is one of:`,
      '- Your account role no longer has the matching permission.',
      `- Separation of duties: you may be the person who performed the previous step on this record.`,
      '- The deployed Firestore security rules do not match this app’s (unconfirmed for this project — check with whoever last ran `firebase deploy --only firestore:rules`).',
    ];
  }
  return [error instanceof Error ? error.message : `Failed to ${action} record.`];
}

const STATUS_LABEL: Record<CalibrationRecord['status'], string> = {
  draft: 'Draft',
  committed: 'Committed',
  reviewed: 'Reviewed',
  approved: 'Approved',
  superseded: 'Superseded',
  voided: 'Voided',
};

const STATUS_BADGE_CLASS: Record<CalibrationRecord['status'], string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  committed: 'bg-blue-100 text-blue-700 border-blue-300',
  reviewed: 'bg-purple-100 text-purple-700 border-purple-300',
  approved: 'bg-green-100 text-green-700 border-green-300',
  superseded: 'bg-amber-100 text-amber-700 border-amber-300',
  voided: 'bg-red-100 text-red-700 border-red-300',
};

interface LoadedState {
  record: CalibrationRecord;
  template: RecorderTemplate;
  item: Equipment;
  jobTitle: string;
}

export default function RecordEntryPage() {
  const { jobId, itemId } = useParams<{ jobId: string; itemId: string }>();
  const { currentUser, isAdmin } = useAuth();

  const canCommit = usePermission('records.commit').hasPermission;
  const canReview = usePermission('records.review').hasPermission;
  const canApprove = usePermission('records.approve').hasPermission;
  const canRevise = usePermission('records.revise').hasPermission;

  const [state, setState] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  // ADR-016 Task 3: admin-only void, gated the same way `isAdmin` already
  // gates other admin actions in this codebase (route-level AdminRoute for
  // whole pages, `isAdmin` directly for an in-page action like this one).
  const [showVoid, setShowVoid] = useState(false);
  const [voidNotice, setVoidNotice] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<ReturnType<typeof findRecoverableDraft>>(null);
  // Phase 22 Task 3: set when opening this draft trimmed trailing blank
  // rows — never for a committed-or-later record (ADR-005). `undone`
  // tracks whether the technician already put the rows back, so the
  // notice can say so instead of just disappearing.
  const [trimNotice, setTrimNotice] = useState<{ removedCount: number; originalRowCount: number } | null>(null);
  const [trimUndone, setTrimUndone] = useState(false);

  const gridRef = useRef<RecordingGridHandle>(null);
  const [rows, setRows] = useState<CalibrationRecord['rows']>([]);
  const [environment, setEnvironment] = useState<RoundEnvironment[]>([]);

  // ADR-014 Phase 13 Task 3: the SAME `StandardOption[]` feeds the grid's
  // native picker, the evaluator's STD_* map, and the selection-time
  // warnings — loaded once per record session, never per keystroke.
  // DRAFT ONLY. A committed record's `standard` cells are labelled from its
  // own frozen `standardSnapshots` instead (built below), never from this.
  const [standardOptions, setStandardOptions] = useState<StandardOption[]>([]);
  // RecordingGrid seeds its picker/labels only at mount (file header
  // contract). Options load asynchronously, so the grid must not mount
  // before they've resolved — otherwise it would mount with an empty
  // picker and never pick up options that arrive afterward.
  const [standardOptionsLoaded, setStandardOptionsLoaded] = useState(false);

  // ADR-015 D2: the shared conversion-rule library, loaded once per record
  // session — same "load once, never per keystroke" contract as
  // standardOptions above. Needed for BOTH draft (live editing) and
  // read-only (viewing) grids, unlike standardOptions: a committed record's
  // display-time conversion still reads the LIVE rule library here (Task 5's
  // commit-time snapshot, which would freeze this for a committed record, is
  // separate work not yet wired in).
  const [conversionRules, setConversionRules] = useState<ConversionRule[]>([]);
  const [conversionRulesLoaded, setConversionRulesLoaded] = useState(false);

  const loadRecord = useCallback(async () => {
    if (!jobId || !itemId || !currentUser) return;
    try {
      const job = await jobService.getJobById(jobId);
      const item = job.equipment.find((e) => e.id === itemId);
      if (!item) throw new Error('This item could not be found on the job.');

      const resolution = await calibrationRecordService.resolveRecordForItem(jobId, itemId);
      let record: CalibrationRecord;
      if (resolution.action === 'create') {
        const newId = await calibrationRecordService.createDraftRecord(jobId, itemId, currentUser.uid);
        const created = await calibrationRecordService.getRecordById(newId);
        if (!created) throw new Error('Draft was created but could not be reloaded.');
        record = created;
      } else {
        record = resolution.record;
      }

      const version = await recorderTemplateService.getVersion(record.templateId, record.templateVersion);
      if (!version) throw new Error('The recorder template version pinned to this record no longer exists.');

      // Phase 22 Task 3: trim trailing wholly-empty rows on opening a DRAFT.
      // `trimDraftRows` itself enforces ADR-005 (a no-op for anything other
      // than 'draft') — this call site does not re-check status, so the
      // rule lives in exactly one place. Reassigns the local `record`
      // BEFORE anything downstream reads `record.rows` (state, `rows`,
      // `findRecoverableDraft`), so the rest of this load sees one
      // consistent version of the truth rather than comparing a trimmed
      // and an untrimmed copy against each other.
      setTrimNotice(null);
      setTrimUndone(false);
      const originalRowCount = record.rows.length;
      const { rows: trimmedRows, removedCount } = trimDraftRows(record.status, version.snapshot, record.rows);
      if (removedCount > 0) {
        await calibrationRecordService.updateDraftRecord(record.id, { rows: trimmedRows });
        record = { ...record, rows: trimmedRows };
        setTrimNotice({ removedCount, originalRowCount });
      }

      setState({ record, template: version.snapshot, item, jobTitle: job.title });
      setRows(record.rows);
      setEnvironment(record.environment);
      setRecoverable(record.status === 'draft' ? findRecoverableDraft(record.id, record.rows, record.environment) : null);

      // Only a DRAFT needs live options — a committed record shows its
      // snapshot labels instead (never re-fetched), and only when the
      // template actually has a `standard` column (most don't).
      if (record.status === 'draft' && templateUsesStandards(version.snapshot)) {
        setStandardOptions(await loadStandardOptions());
      } else {
        setStandardOptions([]);
      }
      setStandardOptionsLoaded(true);

      setConversionRules(await unitConversionRuleService.getAll());
      setConversionRulesLoaded(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load this record.');
    }
  }, [jobId, itemId, currentUser]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const isReadOnly = state ? state.record.status !== 'draft' : true;

  // Rebuilt only when the loaded options actually change (record load /
  // reload), not on every render — recalculation and its grid write-backs
  // run on every keystroke, so a fresh object here every render would defeat
  // useLiveRecalculation's own memoization for no reason.
  const standardsById = React.useMemo(() => optionsToStandardsById(standardOptions), [standardOptions]);

  // Phase 15 Task 2: warn only, never convert — see findColumnUnitReportUnitMismatches.
  const columnUnitMismatches = React.useMemo(
    () => (state ? findColumnUnitReportUnitMismatches(state.template, state.record.reportUnit, state.record.columnUnits ?? {}) : []),
    [state?.template, state?.record.reportUnit, state?.record.columnUnits],
  );

  // Phase 15 Task 1 (superseded): which columns need a unit picker at all.
  const selectableUnitColumns = React.useMemo(
    () => (state ? findSelectableUnitColumns(state.template) : []),
    [state?.template],
  );

  const liveRecalc = useLiveRecalculation(
    state?.template ?? ({} as RecorderTemplate),
    rows,
    environment,
    gridRef,
    standardsById,
    state?.record.reportUnit,
    standardOptions,
  );

  // ADR-015 D6: cells where conversion was needed but could not be applied,
  // recomputed from this SAME recalculation's `rowResults` on every render —
  // display-side, like RecordingGrid's own conversion rendering, never fed
  // back into recalculation (useLiveRecalculation itself stays free of
  // conversion — see that file's header comment and
  // `columnConversionIsolation.test.ts`).
  const conversionFailures = React.useMemo(
    () => (state ? findConversionFailures(state.template, liveRecalc.rowResults, state.record.columnUnits ?? {}, conversionRules) : []),
    [state?.template, liveRecalc.rowResults, state?.record.columnUnits, conversionRules],
  );

  // Read-only display source (ADR-014 D6): a committed record's `standard`
  // cells are labelled from its OWN frozen snapshot, never from live options.
  const standardSnapshotLabels: StandardLabelMap = React.useMemo(() => {
    const snapshots = state?.record.standardSnapshots;
    if (!snapshots) return {};
    const labels: StandardLabelMap = {};
    for (const [key, snapshot] of Object.entries(snapshots)) labels[key] = snapshot.displayName;
    return labels;
  }, [state?.record.standardSnapshots]);

  // ── Phase 33: Calculation Trace ("view the working" for a computed cell) ──
  //
  // Reachable from any computed cell in ANY status (Phase 33 Task 3
  // requirement 1): RecordingGrid's `onCellSelect` fires on TREB's own
  // `selection` event, which is navigation, not editing — it now fires
  // whether isReadOnly or not (RecordingGrid.tsx's own change). Nothing here
  // writes anything; `traceRecord` (services/recordCalculationTrace.ts) is a
  // pure function over data already loaded on this page.
  const [selectedCell, setSelectedCell] = useState<SelectedTraceableCell | null>(null);
  const [traceView, setTraceView] = useState<{ title: string; node: ComputedTraceNode } | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Identity for `reference-standard` trace nodes (Task 2's TraceStandardIdentity):
  // a DRAFT reads it from the live `standardOptions` (equipment + equation in
  // hand); a committed-or-later record reads it from its OWN frozen
  // `standardSnapshots` (ADR-013 D6 / ADR-014 D6) — never from live options,
  // the same split `standardSnapshotLabels` above already makes.
  const standardIdentityById: Record<string, TraceStandardIdentity> = React.useMemo(() => {
    const identities: Record<string, TraceStandardIdentity> = {};
    if (isReadOnly) {
      const snapshots = state?.record.standardSnapshots ?? {};
      for (const [key, snapshot] of Object.entries(snapshots)) identities[key] = standardIdentityFromSnapshot(snapshot);
    } else {
      for (const option of standardOptions) identities[option.key] = standardIdentityFromEquipment(option.equipment, option.equation);
    }
    return identities;
  }, [isReadOnly, state?.record.standardSnapshots, standardOptions]);

  // Human column/summary-field names, and which formula columns have
  // display-time conversion enabled (Task 4's warning below) — both read
  // straight off the template, recomputed only when the template changes.
  const { traceNames, conversionEnabledColumns } = React.useMemo(() => {
    const names: Record<string, string> = {};
    const enabled = new Set<string>();
    if (state) {
      for (const section of state.template.sections) {
        for (const column of section.columns) {
          const key = `${section.id}_${column.id}`;
          names[key] = column.label || column.id;
          if (column.type === 'formula' && column.conversionEnabled) enabled.add(key);
        }
      }
      for (const field of state.template.summaryFields) {
        names[`SUMMARY_${field.id}`] = field.label || field.id;
      }
    }
    return { traceNames: names, conversionEnabledColumns: enabled };
  }, [state?.template]);

  /**
   * Builds the trace for whichever cell is currently selected and opens the
   * modal. Lazy — computed on click, not on every render/keystroke, since
   * nothing needs a live-updating trace while the technician is still
   * typing (Task 2's own perf measurement: ~1.7ms for a realistic record,
   * cheap enough to run on demand but no reason to run on every render).
   */
  const handleViewCalculation = () => {
    if (!state || !selectedCell) return;
    try {
      const trace = traceRecord({
        template: state.template,
        rows: liveRecalc.getLatestRows(),
        env: environmentToEnvMap(environment, state.record.reportUnit),
        standardsById,
        standardIdentityById,
        names: traceNames,
        formatDisplay: (label, value) => {
          if (typeof value !== 'number') return null;
          const column = state.template.sections
            .flatMap((s) => s.columns.map((c) => ({ key: `${s.id}_${c.id}`, column: c })))
            .find((c) => c.key === label)?.column;
          if (!column) return null;
          return formatColumnValueForDisplay(value, column) || null;
        },
      });

      if (selectedCell.kind === 'row') {
        const node = trace.rows[selectedCell.rowIndex]?.[selectedCell.columnKey];
        if (!node) {
          setTraceError('No trace is available for this cell — it may not have a value yet.');
          return;
        }
        setTraceView({ title: `${selectedCell.columnKey} — Row ${selectedCell.rowIndex + 1}`, node });
      } else {
        const node = trace.summary[selectedCell.fieldId];
        if (!node) {
          setTraceError('No trace is available for this summary field yet.');
          return;
        }
        setTraceView({ title: `SUMMARY_${selectedCell.fieldId}`, node });
      }
      setTraceError(null);
    } catch (error) {
      setTraceError(error instanceof Error ? error.message : 'Could not build a calculation trace for this cell.');
    }
  };

  // Phase 23 Task 4: captured (previously discarded) so an explicit Save
  // Draft control can show real saved state — the owner otherwise has no
  // way to tell whether autosave's debounce has actually landed.
  const autosave = useDraftAutosave({
    recordId: state?.record.id ?? '',
    rows,
    environment,
    enabled: Boolean(state) && !isReadOnly,
  });
  // A separate, immediate save the technician can trigger by hand — same
  // updateDraftRecord call autosave itself uses (no second write path), just
  // not waiting for the debounce. Tracked separately from `autosave`'s own
  // isSaving/lastSavedAt (that hook owns its own state internally and
  // exposes no way to feed an external save into it), then merged for
  // display below so "Saved" reflects whichever save — automatic or
  // explicit — happened most recently.
  const [manualSave, setManualSave] = useState<{ saving: boolean; savedAt: Date | null; error: string | null }>({
    saving: false,
    savedAt: null,
    error: null,
  });

  // ADR-014 Phase 14 Task 2: changing the reporting unit rebuilds
  // `liveRecalc` with the new REPORT_TO_N (it is a plain input to the hook,
  // re-read on every render) — but a re-render alone does not RE-RUN the
  // recalculation. Force one immediately so a formula that was reading
  // awaiting-input updates the instant a unit is chosen, not on the next
  // unrelated edit.
  useEffect(() => {
    if (!state) return;
    liveRecalc.handleRowsChange(liveRecalc.getLatestRows());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.record.reportUnit]);

  /**
   * Phase 23 Task 4: an explicit Save Draft the technician can click —
   * autosave already exists (`useDraftAutosave`), but there was previously
   * no way for the owner to tell whether it had actually run. Persists
   * through the SAME `updateDraftRecord` autosave uses (no second write
   * path) — `liveRecalc.getLatestRows()` is the same "what to persist"
   * source `handleCommit` already uses, not the raw `rows` state (which can
   * lag the grid's own latest edit by one render). Draft only — the button
   * itself is additionally gated on `record.status === 'draft'` in the JSX,
   * this is a second guard belonging to the write itself.
   */
  const handleSaveDraft = async () => {
    if (!state || state.record.status !== 'draft') return;
    setManualSave((s) => ({ ...s, saving: true, error: null }));
    try {
      await calibrationRecordService.updateDraftRecord(state.record.id, {
        rows: liveRecalc.getLatestRows(),
        environment,
      });
      setManualSave({ saving: false, savedAt: new Date(), error: null });
    } catch (error) {
      setManualSave((s) => ({
        ...s,
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to save draft.',
      }));
    }
  };

  /**
   * Persists the reporting unit via the SAME `updateDraftRecord` path
   * environment/rows already use (no second write path) — FORCE_UNITS only,
   * never defaulted. Optimistic local update first so the picker and any
   * dependent display feel immediate; `updateDraftRecord` is already
   * status-gated (draft only) server-side, so this can't reach a committed
   * record even if called incorrectly.
   *
   * KNOWN GAP, not fixed here: `updateDraftRecord` only writes a field when
   * the caller's value is `!== undefined` — passing `undefined` to clear a
   * PREVIOUSLY SET unit back to "unset" is silently a no-op server-side, so
   * a reload would show the old value again. Picking a real unit always
   * persists correctly; only "un-picking" one already saved does not.
   */
  const handleReportUnitChange = async (raw: string) => {
    if (!state) return;
    const unit = (raw || undefined) as ForceUnit | undefined;
    setState({ ...state, record: { ...state.record, reportUnit: unit } });
    try {
      await calibrationRecordService.updateDraftRecord(state.record.id, { reportUnit: unit });
    } catch (error) {
      setActionError([error instanceof Error ? error.message : 'Failed to update the reporting unit.']);
    }
  };

  /**
   * Phase 15 Task 1 (superseded): a 'selectable' column's per-record chosen
   * unit. Same write path as `handleReportUnitChange` above — no second
   * write path — and the same optimistic-update-then-persist shape. Only
   * ever writes a value that is actually in the column's `unitChoices`
   * (`isValidColumnUnitChoice`), the same "no free text" rule the `standard`
   * column enforces — the <select> this feeds can't emit anything else
   * either, so this check is belt-and-suspenders, not the only guard.
   */
  const handleColumnUnitChange = async (columnKey: string, unitChoices: string[] | undefined, raw: string) => {
    if (!state) return;
    if (raw && !isValidColumnUnitChoice({ unitMode: 'selectable', unitChoices }, raw)) return;
    const nextColumnUnits = { ...(state.record.columnUnits ?? {}) };
    if (raw) nextColumnUnits[columnKey] = raw;
    else delete nextColumnUnits[columnKey];
    setState({ ...state, record: { ...state.record, columnUnits: nextColumnUnits } });
    // Phase 23 Task 1: update the mounted grid in place — no remount, no
    // touched input cell (ADR-015 D1). `columnUnits` is deliberately no
    // longer in RecordingGrid's `key` below; this imperative call is now
    // the only way the grid learns about a unit change. `liveRecalc.rowResults`
    // is the SAME raw-value source `updateComputedValues` already uses, so
    // conversion is recomputed from real raw values, never re-read from the
    // (already-converted) grid.
    gridRef.current?.updateHeaders(nextColumnUnits, liveRecalc.rowResults);
    try {
      await calibrationRecordService.updateDraftRecord(state.record.id, { columnUnits: nextColumnUnits });
    } catch (error) {
      setActionError([error instanceof Error ? error.message : 'Failed to update the column unit.']);
    }
  };

  if (loadError) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{loadError}</div>
        <Link to={jobId ? `/jobs/${jobId}` : '/jobs'} className="inline-block mt-4 text-primary-600 hover:underline">
          Back to job
        </Link>
      </div>
    );
  }

  if (!state || !standardOptionsLoaded || !conversionRulesLoaded) {
    return <div className="p-6 text-sm text-gray-500">Loading record…</div>;
  }

  const { record, template, item, jobTitle } = state;
  const environmentReady = isEnvironmentComplete(environment, template.roundCount);
  // Phase 23 Task 2: the ONLY signer name RecordSignOffModal will ever show
  // — the signed-in user's own resolved display name, never a free-text
  // value or a pick from a directory of other users. `userService` already
  // guarantees `displayName` is populated (falls back to email at user-doc
  // creation), so this fallback chain is defensive, not load-bearing.
  const signerDisplayName = currentUser?.displayName || currentUser?.email || '';

  // Phase 23 Task 3: stop offering an action `firestore.rules` will refuse
  // — see reviewBlockedReason/approveBlockedReason's own doc comments,
  // which mirror the rule's conditions exactly.
  const reviewGateReason = reviewBlockedReason(canReview, currentUser?.uid, record.createdBy);
  const approveGateReason = approveBlockedReason(canApprove);

  const handleRowsChange = (nextRows: CalibrationRecord['rows']) => {
    setRows(nextRows);
    liveRecalc.handleRowsChange(nextRows);
  };

  const handleEnvironmentChange = (nextEnvironment: RoundEnvironment[]) => {
    setEnvironment(nextEnvironment);
    liveRecalc.handleEnvironmentChange(nextEnvironment);
  };

  /**
   * Phase 22 Task 3 undo: re-adds the trimmed count via the grid's own
   * existing `addRow` (Phase 21 Task 2/3 machinery — same guard, same
   * document-change flow), rather than a second write path. Each `addRow`
   * updates `rowCountRef` synchronously inside RecordingGrid; the resulting
   * row values reach this page asynchronously via the existing
   * `onRowsChange` -> `handleRowsChange` -> `useDraftAutosave` chain, the
   * SAME path every other edit already persists through.
   */
  const handleUndoTrim = () => {
    if (!trimNotice) return;
    for (let i = 0; i < trimNotice.removedCount; i++) {
      gridRef.current?.addRow();
    }
    setTrimUndone(true);
  };

  const handleRestoreBackup = () => {
    if (!recoverable) return;
    setRows(recoverable.rows);
    setEnvironment(recoverable.environment);
    liveRecalc.handleRowsChange(recoverable.rows);
    liveRecalc.handleEnvironmentChange(recoverable.environment);
    setRecoverable(null);
  };

  const handleCommit = async () => {
    if (!currentUser) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await calibrationRecordService.updateDraftRecord(record.id, { rows: liveRecalc.getLatestRows(), environment });
      await calibrationRecordService.commitRecord(record.id, currentUser.uid);
      const refreshed = await calibrationRecordService.getRecordById(record.id);
      if (refreshed) {
        setState({ ...state, record: refreshed });
        setRows(refreshed.rows);
      }
      setActionError(null);
    } catch (error) {
      if (error instanceof RecordNotCommittableError) {
        setActionError(error.issues);
      } else {
        setActionError([error instanceof Error ? error.message : 'Failed to commit record.']);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReview = async (signature: DigitalSignature) => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      await calibrationRecordService.reviewRecord(record.id, signature, currentUser.uid);
      const refreshed = await calibrationRecordService.getRecordById(record.id);
      if (refreshed) setState({ ...state, record: refreshed });
      setShowReview(false);
    } catch (error) {
      setActionError(explainRecordActionError(error, 'review'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (signature: DigitalSignature) => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      await calibrationRecordService.approveRecord(record.id, signature, currentUser.uid);
      const refreshed = await calibrationRecordService.getRecordById(record.id);
      if (refreshed) setState({ ...state, record: refreshed });
      setShowApprove(false);
    } catch (error) {
      setActionError(explainRecordActionError(error, 'approve'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRevision = async (reason: string) => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      await calibrationRecordService.createRevision(record.id, reason, currentUser.uid);
      setShowRevise(false);
      // Re-resolve for this item: resolveRecordForItem now finds the new
      // Draft revision that just superseded the record we had open.
      await loadRecord();
    } catch (error) {
      setActionError([error instanceof Error ? error.message : 'Failed to create revision.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * ADR-016 Task 3/5 — voids the record, then (Task 5's second half) checks
   * whether that just made this the LAST live record blocking a version
   * reset for its template, and says so if it did — the same message must
   * not be a surprise the admin only discovers later on the template page.
   */
  const handleVoid = async (reason: string) => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      const { remainingLiveCount } = await calibrationRecordService.voidRecord(record.id, currentUser.uid, reason);
      setShowVoid(false);
      if (remainingLiveCount === 0) {
        setVoidNotice(
          `This was the last live record referencing "${template.name}" — its version reset is now available (see the template's admin page).`,
        );
      } else {
        setVoidNotice(null);
      }
      const refreshed = await calibrationRecordService.getRecordById(record.id);
      if (refreshed) setState({ ...state, record: refreshed });
    } catch (error) {
      setActionError([error instanceof Error ? error.message : 'Failed to void record.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/jobs/${jobId}`} className="text-sm text-primary-600 hover:underline">
            &larr; {jobTitle}
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-1">
            {item.name} <span className="text-gray-400 font-normal">— {template.name}</span>
          </h1>
          <p className="text-sm text-gray-500">
            {item.serialNumber ? `S/N ${item.serialNumber}` : null}
            {record.recordNumber ? ` · Record #${record.recordNumber}` : ''}
          </p>
        </div>
        <span className={`text-sm font-medium px-3 py-1 rounded-full border ${STATUS_BADGE_CLASS[record.status]}`}>
          {STATUS_LABEL[record.status]}
        </span>
      </div>

      {recoverable && (
        <DraftRecoveryBanner savedAt={recoverable.savedAt} onRestore={handleRestoreBackup} onDiscard={() => setRecoverable(null)} />
      )}

      {/*
        Phase 22 Task 3: this record had trailing blank rows (left over
        from before DRAFT_STARTING_ROW_CAP existed) removed when it opened.
        Never silent — names the count and offers to put them straight
        back, until dismissed.
      */}
      {/* ADR-016 Task 5: the last-live-record half of the D3 warning pair — see TemplateVersionResetBlockedError for the other half. */}
      {voidNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-sm">
          <p className="text-amber-800">{voidNotice}</p>
          <button
            type="button"
            onClick={() => setVoidNotice(null)}
            className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {trimNotice && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3 text-sm">
          <p className="text-blue-800">
            {trimUndone
              ? `Restored ${trimNotice.removedCount} row(s).`
              : `Removed ${trimNotice.removedCount} trailing blank row(s) (was ${trimNotice.originalRowCount}, now ${trimNotice.originalRowCount - trimNotice.removedCount}) — they held no data.`}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {!trimUndone && (
              <button
                type="button"
                onClick={handleUndoTrim}
                className="px-2 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-100"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={() => setTrimNotice(null)}
              className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {actionError && actionError.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-semibold text-red-800 mb-1">This record is not ready:</p>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">
            {actionError.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <EnvironmentBlock
        roundCount={template.roundCount}
        value={environment}
        onChange={handleEnvironmentChange}
        isReadOnly={isReadOnly}
      />

      {/*
        Partition between the environment record above and the measurement
        table's own header-unit controls below — the two are unrelated
        settings (round-level env data vs. what the table's column headers
        display), so they read as separate groups instead of one long list.
      */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        {/*
          ADR-014 D5: the other half of polynomial(R) * STD_TO_N / REPORT_TO_N.
          Editable only while drafting — once committed it is pinned like the
          rest of the record (ADR-005), since changing it would move every
          computed force retroactively.
        */}
        <div className="flex items-center gap-2 text-sm">
          <label className="font-medium text-gray-700">Reporting unit</label>
          {isReadOnly ? (
            <span className="text-gray-600">{record.reportUnit ?? 'Not set'}</span>
          ) : (
            <select
              value={record.reportUnit ?? ''}
              onChange={(e) => void handleReportUnitChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            >
              <option value="">— Select —</option>
              {FORCE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
        </div>

        {/*
          Phase 15 Task 1 (superseded): one compact <select> per 'selectable'
          column, above the grid (option (a) of the two the spec offered —
          see the phase report for why (b), a native TREB SetValidation on the
          header cell, was not used: the header row is styled/merged as a
          label band and this component's own contract mounts once per
          record, so a plain React control here is simpler and needs no new
          TREB-header-cell editability semantics).
        */}
        {selectableUnitColumns.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {selectableUnitColumns.map(({ key, column }) => (
              <div key={key} className="flex items-center gap-1.5">
                <label className="text-gray-600">{column.label || column.id}:</label>
                {isReadOnly ? (
                  <span className="text-gray-700">{record.columnUnits?.[key] ?? 'Not set'}</span>
                ) : (
                  <select
                    value={record.columnUnits?.[key] ?? ''}
                    onChange={(e) => void handleColumnUnitChange(key, column.unitChoices, e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  >
                    <option value="">— Select unit —</option>
                    {(column.unitChoices ?? []).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}

        {!isReadOnly && !record.reportUnit && templateReferencesReportUnit(template) && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            This template's formulas use REPORT_TO_N, but no reporting unit is set yet — those columns will show
            "awaiting input" until one is chosen above.
          </div>
        )}

        {columnUnitMismatches.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
            {columnUnitMismatches.map((m, i) => (
              <p key={i} className="text-sm text-amber-800">{m.message}</p>
            ))}
          </div>
        )}
      </div>

      {/*
        Phase 22 Task 2: one button per section, scrolling the grid to that
        section's first column — the cheaper alternative to splitting
        sections into separate sheets (owner decision: sections share one
        row axis, so a per-sheet split risks misaligning a calibration
        point from its own results). Hidden for a single-section template,
        where there is nothing to jump between.
      */}
      {template.sections.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-gray-500">Jump to:</span>
          {template.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => gridRef.current?.scrollToSection(section.id)}
              className="px-2 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {section.label || section.id}
            </button>
          ))}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <RecordingGrid
          // Status is part of the key, not just record/template identity: a
          // status change (e.g. draft -> committed) must force TREB to
          // remount with the new isReadOnly value — RecordingGrid only
          // applies in_cell_editor at mount time (see its file header).
          // standardOptions.length is included too: this component's own
          // "mount once, seed once" contract means a later options load
          // wouldn't otherwise reach an already-mounted grid — remounting on
          // the 0 -> N transition (which happens at most once per session,
          // right after the gate above resolves) picks it up correctly.
          // conversionRules.length is joined for the identical reason
          // (RecordingGrid's own conversionRules prop doc): the 0 -> N
          // transition after this component's async load resolves must
          // force a remount, or the grid would have mounted with no rule
          // library and never pick one up.
          //
          // Phase 23 Task 1: columnUnits is DELIBERATELY NOT in this key
          // anymore — handleColumnUnitChange calls the grid's imperative
          // updateHeaders() instead (ADR-015 D1: a unit change is a
          // display-only concern, so it no longer needs to destroy and
          // rebuild the whole TREB instance, which was wiping whatever the
          // technician had just typed). Re-adding columnUnits here would
          // silently revert to remounting on every unit change again.
          key={`${record.id}_${template.version}_${record.status}_${standardOptions.length}_${conversionRules.length}`}
          ref={gridRef}
          template={template}
          rows={record.rows}
          isReadOnly={isReadOnly}
          onRowsChange={handleRowsChange}
          standardOptions={isReadOnly ? [] : standardOptions}
          standardLabels={isReadOnly ? standardSnapshotLabels : undefined}
          columnUnits={record.columnUnits}
          conversionRules={conversionRules}
          // ADR-015 D7: a committed-or-later record's conversion snapshot is
          // fixed forever the moment it's captured — no re-key needed beyond
          // record.status already above (a draft has none; once committed it
          // never changes again for this record.id).
          conversionSnapshots={record.conversionSnapshots}
          onCellSelect={setSelectedCell}
          className="min-h-[400px] h-[500px] w-full"
        />
      </div>

      {/*
        Phase 33 Task 3: reachable from any computed cell, in any record
        status — enabled only once a formula/summary cell is actually
        selected (RecordingGrid's onCellSelect, above). Read-only: this
        button only ever opens CalculationTraceModal, which itself performs
        no write of any kind (see that component's own file header).
      */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleViewCalculation}
          disabled={!selectedCell}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          View calculation
        </button>
        {!selectedCell && (
          <span className="text-xs text-gray-400">Select a computed (formula or summary) cell first.</span>
        )}
      </div>
      {traceError && <p className="text-xs text-red-700">{traceError}</p>}
      {traceView && (
        <CalculationTraceModal
          title={traceView.title}
          node={traceView.node}
          onClose={() => setTraceView(null)}
          isConversionEnabled={(label) => conversionEnabledColumns.has(label)}
        />
      )}

      {/*
        ADR-014 Phase 13: out-of-range / past-due warnings for whatever
        standard is currently selected on each row — shown here, at the
        moment of selection, rather than buried on a settings page. Warn,
        never block (ADR-013 D3/D6): the metrologist's choice always stands.
      */}
      {liveRecalc.standardWarnings.some((w) => w.length > 0) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
          {liveRecalc.standardWarnings.flatMap((warnings, rowIndex) =>
            warnings.map((w, wIndex) => (
              <p key={`${rowIndex}-${wIndex}`} className="text-xs text-amber-800">
                <span className="font-semibold">Row {rowIndex + 1}:</span> {w.message}
              </p>
            )),
          )}
        </div>
      )}

      {/*
        ADR-015 D6: cells where display-time unit conversion was needed but
        could not be applied — the grid already marks each such cell (amber
        fill), this names them explicitly so the reason (no rule, broken
        expression, divide-by-zero, non-finite) is legible without hunting
        for the marked cell. The RAW value is still shown in the grid; this
        is purely informational, same non-blocking treatment as the warnings
        above.
      */}
      {conversionFailures.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
          {conversionFailures.map((f, i) => (
            <p key={`${f.rowIndex}-${f.columnKey}-${i}`} className="text-xs text-amber-800">
              <span className="font-semibold">Row {f.rowIndex + 1}, {f.columnLabel}:</span> {f.failure.message}
            </p>
          ))}
        </div>
      )}

      {!isReadOnly && (
        <div className="flex items-center gap-2">
          {template.allowRowAdd && (
            <button
              type="button"
              onClick={() => gridRef.current?.addRow()}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              + Add Row
            </button>
          )}
          {/*
            Phase 21 Task 3: select a data row in the grid first, then click
            this — RecordingGrid itself confirms (naming the row number and
            whether it holds data), refuses on a header row or the last
            remaining row, and re-emits rows so this page's record state
            stays in step. Not gated on allowRowAdd — a technician should be
            able to remove a row they added even on a template that doesn't
            allow adding more, and removing a stray blank row is always safe.
          */}
          <button
            type="button"
            onClick={() => gridRef.current?.deleteSelectedRow()}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            − Delete Selected Row
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        {record.status === 'draft' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={autosave.isSaving || manualSave.saving}
              onClick={handleSaveDraft}
              title="Saves your current progress. This does not commit the record or change its status."
              className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autosave.isSaving || manualSave.saving ? 'Saving…' : 'Save Draft'}
            </button>
            {/*
              Phase 23 Task 4: whichever save — automatic or explicit —
              happened most recently wins the displayed timestamp, so the
              owner always sees the true "safe as of" state regardless of
              which path last wrote it.
            */}
            {(() => {
              const merged = mergeSaveState(manualSave, autosave);
              if (merged.error) return <span className="text-xs text-red-600">Save failed: {merged.error}</span>;
              if (merged.saving) return <span className="text-xs text-gray-400">Saving…</span>;
              if (merged.savedAt) return <span className="text-xs text-gray-400">Saved at {merged.savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>;
              return null;
            })()}
          </div>
        )}
        {record.status === 'draft' && (
          <button
            type="button"
            disabled={!canCommit || !environmentReady || isSubmitting}
            title={!canCommit ? "You don't have permission to commit records" : !environmentReady ? 'Environmental conditions are not complete yet' : undefined}
            onClick={handleCommit}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Commit
          </button>
        )}
        {record.status === 'committed' && (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              disabled={!!reviewGateReason}
              title={reviewGateReason ?? undefined}
              onClick={() => setShowReview(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review
            </button>
            {reviewGateReason && <p className="text-xs text-gray-500">{reviewGateReason}</p>}
          </div>
        )}
        {record.status === 'reviewed' && (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              disabled={!!approveGateReason}
              title={approveGateReason ?? undefined}
              onClick={() => setShowApprove(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Approve
            </button>
            {approveGateReason && <p className="text-xs text-gray-500">{approveGateReason}</p>}
          </div>
        )}
        {isReadOnly && record.status !== 'superseded' && (
          <button
            type="button"
            disabled={!canRevise}
            onClick={() => setShowRevise(true)}
            className="px-4 py-2 text-sm font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Revision
          </button>
        )}
        {/*
          ADR-016 Task 3: admin-only, at any status. Not shown once already
          voided — restore for that lives in the recycle bin, not here.
        */}
        {isAdmin && record.status !== 'voided' && (
          <button
            type="button"
            onClick={() => setShowVoid(true)}
            className="px-4 py-2 text-sm font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-50"
          >
            Void Record
          </button>
        )}
        {record.status !== 'draft' && (
          <TemplateBasedRecordPdfGenerator
            record={record}
            trigger={
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Print Certificate
              </button>
            }
          />
        )}
      </div>

      {showReview && (
        <RecordSignOffModal
          title="Review Record"
          signerName={signerDisplayName}
          isSubmitting={isSubmitting}
          onCancel={() => setShowReview(false)}
          onConfirm={handleReview}
        />
      )}
      {showApprove && (
        <RecordSignOffModal
          title="Approve Record"
          signerName={signerDisplayName}
          isSubmitting={isSubmitting}
          onCancel={() => setShowApprove(false)}
          onConfirm={handleApprove}
        />
      )}
      {showRevise && (
        <CreateRevisionDialog isSubmitting={isSubmitting} onCancel={() => setShowRevise(false)} onConfirm={handleCreateRevision} />
      )}
      {showVoid && (
        <VoidRecordModal record={record} isSubmitting={isSubmitting} onCancel={() => setShowVoid(false)} onConfirm={handleVoid} />
      )}
    </div>
  );
}
