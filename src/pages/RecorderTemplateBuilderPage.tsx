/**
 * Recorder Template Builder — two-pane authoring UI.
 * LEFT: sections & columns. RIGHT: custom function editor + Verify.
 * Below: summary fields panel (separate from the column editor, ADR-010) and
 * the sample-data mockup/test harness (draft requirement 3).
 *
 * Admin-only (route-gated). Reuses the Phase 3 interpreter's public API via
 * recorderTemplateService.verifyTemplate / recorderTemplateMockup — no
 * formula parsing/evaluation logic lives in this file.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  recorderTemplateService,
  TemplateVersionResetBlockedError,
  TemplateVersionDeleteBlockedError,
} from '../services/recorderTemplateService';
import { calibrationRecordService } from '../services/calibrationRecordService';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { evaluateMockup, type MockupResult } from '../services/recorderTemplateMockup';
import {
  loadStandardOptions,
  optionsToStandardsById,
  checkOptionWarnings,
  type StandardOption,
} from '../services/referenceStandardOptions';
import {
  findStandardDependentFormulaColumns,
  findSelectableUnitColumns,
  resolveColumnUnitMap,
  joinLabelAndUnit,
  parseCommaSeparatedList,
  formatColumnValueForDisplay,
  DEFAULT_FORMULA_MAX_DECIMALS,
} from '../services/recordingGridDocument';
import { FORCE_UNITS, forceUnitToNewtons } from '../services/forceUnits';
import { STANDARD_VARIABLE_NAMES, type StandardWarning } from '../services/referenceStandardVariables';
import { buildRowFormulaVariables, buildSummaryFormulaVariables } from '../services/formulaVariableList';
import { FormulaHelpModal, type HelpLanguage, type HelpTab } from '../components/FormulaHelpModal';
import { FormulaVariableDisclosure } from '../components/FormulaVariableDisclosure';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import type {
  CalibrationRecord,
  CertificateNumberConfig,
  CustomFunction,
  RecordColumn,
  RecordSection,
  RecorderTemplate,
  RecorderTemplateVersion,
  ReportBlock,
  ReportBlockColumn,
  SummaryField,
} from '../types';
import type { ValidationIssue } from '../modules/recorder/formula';
import type { ConversionFactorWarning } from '../services/recorderTemplateValidation';
import { buildIssueBadgeMap, type IssueBadgeMap } from '../services/recorderTemplateIssueMatching';
import { insertAtCursor } from '../utils/formulaCaretInsert';
import { FormulaSuggestPopup } from '../components/FormulaSuggestPopup';
import type { FormulaAuthoringContext } from '../services/formulaSuggestions';

type EditableTemplate = Pick<
  RecorderTemplate,
  | 'name' | 'description' | 'equipmentTypeId' | 'roundCount' | 'defaultRowCount'
  | 'allowRowAdd' | 'recordNumberFormat' | 'sections' | 'summaryFields' | 'customFunctions'
  | 'reportBlocks'
>;

function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => (typeof item === 'object' && item !== null && 'order' in (item as any)
    ? { ...(item as any), order: i }
    : item));
}

const COLUMN_TYPES: RecordColumn['type'][] = ['text', 'number', 'selection', 'formula', 'standard'];

/** ADR-017 D1: block columns match section columns MINUS 'standard'. */
const BLOCK_COLUMN_TYPES: ReportBlockColumn['type'][] = ['text', 'number', 'selection', 'formula'];

/**
 * A comma-separated list input (Choices, Allowed units) that lets you
 * actually type a comma.
 *
 * The naive version — `value={list.join(', ')}`, `onChange` re-parses and
 * re-joins on every keystroke — traps the cursor: typing "N," parses to
 * ['N'] (the trailing empty entry is filtered out), which immediately
 * re-renders the input back to "N", erasing the comma before you can type
 * the next unit. Typing a list character-by-character becomes impossible.
 *
 * Fixed by keeping the RAW TEXT as local state, separate from the parsed
 * array: the input always displays exactly what was typed, and the parsed
 * array is pushed up to the parent on every change without ever being
 * reflected back down into the input's own value. `key`d by the parent on
 * column identity so switching to a different column's field starts with
 * a fresh draft seeded from that column's actual list.
 */
// Exported so it can be rendered directly in tests, the same reason
// MockupHarness is exported below.
export const CommaListInput: React.FC<{
  value: string[];
  onChange: (parsed: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}> = ({ value, onChange, placeholder, disabled, title, className }) => {
  const [text, setText] = useState(() => value.join(', '));
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      title={title}
      className={className}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseCommaSeparatedList(e.target.value));
      }}
    />
  );
};

/**
 * Renders a comma-separated, font-mono list of variable names — used for the
 * standard column's info panel (STANDARD_VARIABLE_NAMES) and the Task 7
 * disclosure below. Never hand-list the names themselves; only this
 * rendering helper is shared, so the SOURCE array is always what a caller
 * passes in (Phase 10 Task 7: "Generate that list from STANDARD_VARIABLE_NAMES
 * so it cannot go stale, and drop the 'and the rest'").
 */
export function VariableNameList({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <React.Fragment key={name}>
          <span className="font-mono">{name}</span>
          {i < names.length - 1 ? ', ' : ''}
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * TemplateNavigator — the left rail.
 *
 * Renders from `sections` directly (the SAME `draft.sections` the editor
 * itself reads/writes) — there is no second copy of the template's
 * structure here, only a read of it plus click handlers that move the
 * page's OWN focus state. Every section and every column is always listed;
 * nothing is filtered by focus, so an issue in a section that is not
 * currently expanded is still visible as a badge here.
 *
 * Badges come from `badges` (built by `buildIssueBadgeMap` from whatever
 * `verifyTemplate`/`findMissingConversionFactorWarnings` last returned) —
 * red for a blocking issue, amber for a warn-only one (Phase 15 Task 3).
 * `undefined` (no entry for that key) means clean, not "not checked yet";
 * the caller passes `[]`/`null` through `buildIssueBadgeMap` before Verify
 * has ever run, which correctly produces no badges rather than false ones.
 */
export const TemplateNavigator: React.FC<{
  sections: RecordSection[];
  focusedSectionIdx: number;
  focusedColumnIdx: number | null;
  badges: IssueBadgeMap;
  onFocusSection: (sectionIdx: number) => void;
  onFocusColumn: (sectionIdx: number, columnIdx: number) => void;
}> = ({ sections, focusedSectionIdx, focusedColumnIdx, badges, onFocusSection, onFocusColumn }) => {
  const dot = (badge: IssueBadgeMap['sections'][number] | undefined, extraClass = '') =>
    badge && (
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.hasError ? 'bg-red-500' : 'bg-amber-500'} ${extraClass}`}
        title={badge.hasError ? 'Has a validation issue — see Verify' : 'Has a warning — see Verify'}
      />
    );

  return (
    <nav
      aria-label="Section and column navigator"
      className="w-full lg:w-56 flex-shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto space-y-1 text-xs"
    >
      {sections.length === 0 && (
        <p className="text-gray-400 px-2 py-1">No sections yet</p>
      )}
      {sections.map((section, sIdx) => {
        const sectionLabel = section.label || section.id || `Section ${sIdx + 1}`;
        const isFocusedSection = sIdx === focusedSectionIdx;
        return (
          <div key={sIdx}>
            <button
              type="button"
              onClick={() => onFocusSection(sIdx)}
              aria-label={`Focus section ${section.id || sectionLabel}`}
              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left font-medium transition-colors ${
                isFocusedSection && focusedColumnIdx === null
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {dot(badges.sections[sIdx])}
              <span className="truncate">{sectionLabel}</span>
            </button>
            {section.columns.length > 0 && (
              <div className="pl-3 mt-0.5 space-y-0.5">
                {section.columns.map((column, cIdx) => {
                  const key = `${section.id}_${column.id}`;
                  const isFocusedColumn = isFocusedSection && focusedColumnIdx === cIdx;
                  return (
                    <button
                      key={cIdx}
                      type="button"
                      onClick={() => onFocusColumn(sIdx, cIdx)}
                      aria-label={`Focus column ${key}`}
                      className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded-md text-left transition-colors ${
                        isFocusedColumn ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {dot(badges.columns[key])}
                      <span className="font-mono truncate">{key}</span>
                      <span className="text-gray-400 truncate flex-shrink-0">{column.type}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

/**
 * Phase 26 Task 6 — the five top-level tabs.
 *
 * Order is the authoring order an owner actually works in: define the
 * measurement table, then the report content derived from it, then the
 * functions those two share, then test it, and only then the settings you
 * set once. `settings` is last for that reason, not because it matters least.
 */
export type BuilderTab = 'sections' | 'blocks' | 'functions' | 'testdata' | 'settings';

export const BUILDER_TABS: Array<{ id: BuilderTab; label: string }> = [
  { id: 'sections', label: 'Sections' },
  { id: 'blocks', label: 'Report Blocks' },
  { id: 'functions', label: 'Custom Functions' },
  { id: 'testdata', label: 'Test Data' },
  { id: 'settings', label: 'Settings' },
];

/**
 * Session-scoped, not persistent: "remember the active tab for the session"
 * (Task 6). sessionStorage clears with the tab, so returning to the builder
 * tomorrow starts on Sections rather than wherever a half-finished edit left
 * off. Keyed per template so moving between two templates does not carry one
 * template's tab onto the other.
 */
const TAB_STORAGE_PREFIX = 'recorderTemplateBuilder.activeTab.';

function readStoredTab(templateId: string | undefined): BuilderTab {
  if (!templateId || typeof window === 'undefined' || !window.sessionStorage) return 'sections';
  try {
    const stored = window.sessionStorage.getItem(TAB_STORAGE_PREFIX + templateId);
    return BUILDER_TABS.some((t) => t.id === stored) ? (stored as BuilderTab) : 'sections';
  } catch {
    return 'sections';
  }
}

/**
 * Which report blocks / block columns / summary fields are carrying a
 * validation issue, derived from the flat `verifyTemplate` issue list.
 *
 * Attribution is by the message PREFIXES `verifyReportBlocks` and
 * `verifyTemplate` themselves emit, which is why those prefixes are stable
 * strings rather than free prose:
 *
 *   Report block 'BUD': ...              -> the block
 *   Report block 'BUD', column 'VAL': ...-> that column
 *   BUD_VAL: ...                         -> that column (formula issues)
 *   Report block 'STMT', placeholder {X}:-> the block
 *   SUMMARY_MAXDEV: ...                  -> that summary field
 *
 * Custom FUNCTION issues are deliberately NOT attributed: the validator does
 * not prefix them with the function name, and matching them by body text
 * would be guesswork that goes silently wrong. They still appear in full in
 * the always-visible Verify panel, so nothing is hidden — the rail simply
 * does not claim to know which function they belong to.
 */
export interface ReportIssueBadges {
  blocks: Record<string, boolean>;
  blockColumns: Record<string, boolean>;
  summaryFields: Record<string, boolean>;
}

export function buildReportIssueBadges(
  blocks: ReportBlock[],
  summaryFields: SummaryField[],
  issues: ValidationIssue[] | null,
): ReportIssueBadges {
  const badges: ReportIssueBadges = { blocks: {}, blockColumns: {}, summaryFields: {} };
  if (!issues || issues.length === 0) return badges;

  for (const block of blocks) {
    if (!block.id) continue;
    const blockPrefix = `Report block '${block.id}'`;
    if (issues.some((i) => i.message.startsWith(blockPrefix) || i.message.startsWith(`${block.id}_`))) {
      badges.blocks[block.id] = true;
    }
    for (const column of block.columns) {
      if (!column.id) continue;
      const key = `${block.id}_${column.id}`;
      if (issues.some((i) => i.message.startsWith(`${key}:`) || i.message.includes(`${blockPrefix}, column '${column.id}'`))) {
        badges.blockColumns[key] = true;
      }
    }
  }

  for (const field of summaryFields) {
    if (!field.id) continue;
    if (issues.some((i) => i.message.startsWith(`SUMMARY_${field.id}:`))) {
      badges.summaryFields[field.id] = true;
    }
  }

  return badges;
}

/** The shared issue dot, so all three rails mark a problem identically. */
const railDot = (hasIssue: boolean | undefined) =>
  hasIssue ? (
    <span
      className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500"
      title="Has a validation issue — see Verify"
    />
  ) : null;

/**
 * ReportBlockNavigator — the Report Blocks tab's left rail.
 *
 * Same shape, same sticky behaviour and same aria-label convention as
 * `TemplateNavigator`, because it is the same job: jump to one part of a long
 * tab without scrolling for it. A table block lists its columns beneath it; a
 * text block has no row axis and so has no children to list.
 */
export const ReportBlockNavigator: React.FC<{
  blocks: ReportBlock[];
  focusedKey: string | null;
  badges: ReportIssueBadges;
  onFocusBlock: (blockIdx: number) => void;
  onFocusBlockColumn: (blockIdx: number, columnIdx: number) => void;
}> = ({ blocks, focusedKey, badges, onFocusBlock, onFocusBlockColumn }) => (
  <nav
    aria-label="Report block navigator"
    className="w-full lg:w-56 flex-shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto space-y-1 text-xs"
  >
    {blocks.length === 0 && <p className="text-gray-400 px-2 py-1">No report blocks yet</p>}
    {blocks.map((block, bIdx) => {
      const blockLabel = block.label || block.id || `Block ${bIdx + 1}`;
      return (
        <div key={bIdx}>
          <button
            type="button"
            onClick={() => onFocusBlock(bIdx)}
            aria-label={`Focus block ${block.id || blockLabel}`}
            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left font-medium transition-colors ${
              focusedKey === `b${bIdx}` ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {railDot(badges.blocks[block.id])}
            <span className="truncate">{blockLabel}</span>
            <span className="text-gray-400 flex-shrink-0">{block.kind}</span>
          </button>
          {block.kind === 'table' && block.columns.length > 0 && (
            <div className="pl-3 mt-0.5 space-y-0.5">
              {block.columns.map((column, cIdx) => {
                const key = `${block.id}_${column.id}`;
                return (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => onFocusBlockColumn(bIdx, cIdx)}
                    aria-label={`Focus block column ${key}`}
                    className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded-md text-left transition-colors ${
                      focusedKey === `b${bIdx}-c${cIdx}` ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {railDot(badges.blockColumns[key])}
                    <span className="font-mono truncate">{key}</span>
                    <span className="text-gray-400 truncate flex-shrink-0">{column.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
  </nav>
);

/**
 * FunctionNavigator — the Custom Functions tab's left rail.
 *
 * Two groups rather than one flat list, because custom functions and summary
 * fields are different things that happen to share a tab: a function is
 * reusable arithmetic with no output of its own, a summary field produces one
 * value per record (ADR-010). Flattening them would suggest they are
 * interchangeable.
 */
export const FunctionNavigator: React.FC<{
  functions: CustomFunction[];
  summaryFields: SummaryField[];
  focusedKey: string | null;
  badges: ReportIssueBadges;
  onFocusFunction: (index: number) => void;
  onFocusSummaryField: (index: number) => void;
}> = ({ functions, summaryFields, focusedKey, badges, onFocusFunction, onFocusSummaryField }) => (
  <nav
    aria-label="Function and summary field navigator"
    className="w-full lg:w-56 flex-shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto space-y-2 text-xs"
  >
    <div>
      <p className="px-2 py-1 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Custom Functions</p>
      {functions.length === 0 && <p className="text-gray-400 px-2 py-0.5">None yet</p>}
      <div className="space-y-0.5">
        {functions.map((fn, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onFocusFunction(idx)}
            aria-label={`Focus function ${fn.name || idx + 1}`}
            className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded-md text-left transition-colors ${
              focusedKey === `f${idx}` ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="font-mono truncate">{fn.name || <span className="italic text-gray-400">unnamed</span>}</span>
            <span className="text-gray-400 flex-shrink-0">({fn.params.length})</span>
          </button>
        ))}
      </div>
    </div>

    <div>
      <p className="px-2 py-1 font-semibold text-gray-400 uppercase tracking-wide text-[10px]">Summary Fields</p>
      {summaryFields.length === 0 && <p className="text-gray-400 px-2 py-0.5">None yet</p>}
      <div className="space-y-0.5">
        {summaryFields.map((field, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onFocusSummaryField(idx)}
            aria-label={`Focus summary field ${field.id || idx + 1}`}
            className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded-md text-left transition-colors ${
              focusedKey === `s${idx}` ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {railDot(badges.summaryFields[field.id])}
            <span className="font-mono truncate">
              {field.id ? `SUMMARY_${field.id}` : <span className="italic text-gray-400">unnamed</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  </nav>
);

export const RecorderTemplateBuilderPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { hasPermission: canEdit } = usePermission('recorderTemplates.edit');
  const { hasPermission: canPublish } = usePermission('recorderTemplates.publish');
  const { currentUser } = useAuth();

  const [original, setOriginal] = useState<RecorderTemplate | null>(null);
  const [draft, setDraft] = useState<EditableTemplate | null>(null);
  const [equipmentTypes, setEquipmentTypes] = useState<CertificateNumberConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [conversionWarnings, setConversionWarnings] = useState<ConversionFactorWarning[] | null>(null);
  const [showMockup, setShowMockup] = useState(false);

  // Phase 26 Task 6: which tab is showing. Seeded from sessionStorage so a
  // reload mid-edit returns to the same tab (see readStoredTab).
  const [activeTab, setActiveTab] = useState<BuilderTab>(() => readStoredTab(templateId));
  useEffect(() => {
    if (!templateId || typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(TAB_STORAGE_PREFIX + templateId, activeTab);
    } catch {
      // A storage quota/privacy-mode failure must never break the builder —
      // the tab simply stops being remembered.
    }
  }, [templateId, activeTab]);

  // Phase 10 Task 4/5: Help modal. Language lives HERE, on the page, not
  // inside the modal — the modal unmounts/remounts on every close/open
  // (isOpen && <Modal>), so state inside it would reset every time. Keeping
  // it on the page is what "remembered for the session" (owner requirement)
  // actually means: it survives across every Help button on this page.
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('basics');
  const [helpLanguage, setHelpLanguage] = useState<HelpLanguage>('en');
  const openHelp = (tab: HelpTab) => { setHelpTab(tab); setShowHelp(true); };

  // Phase 25 Task 2b/2c: every published version of this template, plus
  // which LIVE records pin each one — the in-app replacement for hand-
  // deleting `recorderTemplateVersions` documents in the Firebase Console.
  // Storing the PINNING RECORDS themselves (not just a count) is what lets
  // the panel below name them when a delete is refused (Task 2c: "say
  // which records are pinning it, not just disable a button"), not just
  // show a number.
  const [versions, setVersions] = useState<RecorderTemplateVersion[]>([]);
  const [versionPins, setVersionPins] = useState<Map<number, CalibrationRecord[]>>(new Map());
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState<number | null>(null);

  const loadVersions = async (id: string) => {
    setVersionsLoading(true);
    try {
      const list = await recorderTemplateService.getAllVersions(id);
      setVersions(list);
      const entries = await Promise.all(
        list.map(async (v): Promise<[number, CalibrationRecord[]]> => [
          v.version,
          await calibrationRecordService.getRecordsPinningTemplateVersion(id, v.version),
        ]),
      );
      setVersionPins(new Map(entries));
    } catch (e: any) {
      showError(e.message || 'Failed to load published versions');
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      setLoading(true);
      try {
        const [tpl, types] = await Promise.all([
          recorderTemplateService.getTemplateById(templateId),
          certificateNumberConfigService.getAllConfigs(),
        ]);
        if (!tpl) {
          showError('Template not found');
          navigate('/recorder-templates');
          return;
        }
        setOriginal(tpl);
        setDraft({
          name: tpl.name,
          description: tpl.description,
          equipmentTypeId: tpl.equipmentTypeId,
          roundCount: tpl.roundCount,
          defaultRowCount: tpl.defaultRowCount,
          allowRowAdd: tpl.allowRowAdd,
          recordNumberFormat: tpl.recordNumberFormat,
          sections: tpl.sections,
          summaryFields: tpl.summaryFields,
          customFunctions: tpl.customFunctions,
          // ADR-017: absent on every pre-ADR-017 template; normalised to [] here
          // so the editor never has to distinguish absent from empty.
          reportBlocks: tpl.reportBlocks ?? [],
        });
        setEquipmentTypes(types);
      } catch (e: any) {
        showError(e.message || 'Failed to load template');
      } finally {
        setLoading(false);
      }
    })();
    void loadVersions(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const fullDraftAsTemplate = useMemo((): RecorderTemplate | null => {
    if (!draft || !original) return null;
    return { ...original, ...draft };
  }, [draft, original]);

  // Phase 10 Task 7: whether ANY column in the draft is a `standard` picker —
  // the Reference standard variable group is shown only then, since otherwise
  // every STD_* resolves to awaiting-input regardless of what is typed.
  const hasStandardColumn = useMemo(
    () => draft?.sections.some((s) => s.columns.some((c) => c.type === 'standard')) ?? false,
    [draft],
  );

  // Refs to the actual <input> DOM nodes, keyed so "insert at cursor" can
  // read/restore the real cursor position — a plain controlled value/onChange
  // pair alone cannot do this. Column formula inputs keyed `${sIdx}-${cIdx}`,
  // summary field inputs keyed by their index.
  const columnFormulaInputRefs = React.useRef(new Map<string, HTMLInputElement | null>());
  const summaryFieldInputRefs = React.useRef(new Map<string, HTMLInputElement | null>());
  // Phase 10's disclosure had no ref for the custom function body input at
  // all — it was never wired to insertAtCursor. Added now so the
  // autocomplete popup (and the disclosure, for parity) can reach it too.
  const functionBodyInputRefs = React.useRef(new Map<string, HTMLInputElement | null>());

  const handleVerify = () => {
    if (!fullDraftAsTemplate) return;
    const found = recorderTemplateService.verifyTemplate(fullDraftAsTemplate);
    const warnings = recorderTemplateService.findMissingConversionFactorWarnings(fullDraftAsTemplate);
    setIssues(found);
    setConversionWarnings(warnings);
    if (found.length === 0 && warnings.length === 0) success('No issues found — this template is publishable.');
  };

  // ── Navigator focus (remembered for the session — not reset by ordinary
  // edits, since typing into a field never touches this state) ───────────
  const [focusedSectionIdx, setFocusedSectionIdx] = useState(0);
  const [focusedColumnIdx, setFocusedColumnIdx] = useState<number | null>(0);
  const sectionRefs = React.useRef(new Map<number, HTMLDivElement | null>());
  // HTMLElement, not HTMLDivElement: the compact (unfocused) card is a
  // <button>, the focused/full card is a <div> — scrollIntoView is all
  // either needs, and both are HTMLElement.
  const columnRefs = React.useRef(new Map<string, HTMLElement | null>());

  function focusSection(sectionIdx: number) {
    setFocusedSectionIdx(sectionIdx);
    setFocusedColumnIdx(null);
    requestAnimationFrame(() => {
      sectionRefs.current.get(sectionIdx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function focusColumn(sectionIdx: number, columnIdx: number) {
    setFocusedSectionIdx(sectionIdx);
    setFocusedColumnIdx(columnIdx);
    requestAnimationFrame(() => {
      columnRefs.current.get(`${sectionIdx}-${columnIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  // ── Report Blocks / Custom Functions rails ────────────────────────────
  // Same job as the Sections rail above, so the same mechanism: one ref map
  // per rail, and a single "which entry did I last jump to" key for the
  // highlight. Blocks and functions have no expand/collapse concept (every
  // card renders in full), so unlike `focusColumn` these only scroll and
  // highlight — there is no focused-vs-compact state to drive.
  const [focusedBlockKey, setFocusedBlockKey] = useState<string | null>(null);
  const [focusedFunctionKey, setFocusedFunctionKey] = useState<string | null>(null);
  const blockRefs = React.useRef(new Map<string, HTMLElement | null>());
  const functionRefs = React.useRef(new Map<string, HTMLElement | null>());

  function scrollTo(refs: React.MutableRefObject<Map<string, HTMLElement | null>>, key: string, inline: ScrollLogicalPosition = 'nearest') {
    requestAnimationFrame(() => {
      refs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline });
    });
  }

  function focusBlock(blockIdx: number) {
    const key = `b${blockIdx}`;
    setFocusedBlockKey(key);
    scrollTo(blockRefs, key);
  }
  function focusBlockColumn(blockIdx: number, columnIdx: number) {
    const key = `b${blockIdx}-c${columnIdx}`;
    setFocusedBlockKey(key);
    // 'center' horizontally: block columns sit in a horizontal scroller, the
    // same as section columns do.
    scrollTo(blockRefs, key, 'center');
  }
  function focusFunction(index: number) {
    const key = `f${index}`;
    setFocusedFunctionKey(key);
    scrollTo(functionRefs, key);
  }
  function focusSummaryField(index: number) {
    const key = `s${index}`;
    setFocusedFunctionKey(key);
    scrollTo(functionRefs, key);
  }

  // Custom Functions / Summary Fields moved out of the old two-column grid
  // (see Task 3's report) into their own collapsible region — defaulted
  // OPEN, unlike the mockup harness below, so nothing that was always
  // visible before this refactor becomes hidden-by-default now.
  const [showFunctionsPanel, setShowFunctionsPanel] = useState(true);

  // Section/column badges for the navigator (Task 2) — derived from the
  // SAME issues/warnings the Verify banner shows, via buildIssueBadgeMap
  // (recorderTemplateIssueMatching.ts), which parses their message text
  // rather than re-deriving validation rules itself. `draft.sections` is
  // used directly (not fullDraftAsTemplate) since badges only need section
  // structure, not the whole template.
  const badgeMap = useMemo(
    () => buildIssueBadgeMap({ sections: draft?.sections ?? [] }, issues, conversionWarnings),
    [draft, issues, conversionWarnings],
  );

  /**
   * Phase 26 Task 6: how many issues each tab is carrying, so an error stays
   * DISCOVERABLE from any other tab — the explicit requirement that tabs must
   * organise the problem, not hide it.
   *
   * Attribution is deliberately conservative. Section/column issues are
   * attributed from `badgeMap`, which already resolves them structurally.
   * Everything else — custom functions, summary fields, template-wide checks
   * — is counted onto the Custom Functions tab as the residual, because
   * matching those by message text would be guesswork that goes silently
   * wrong. The Verify panel below is always visible and always lists ALL of
   * them in full, so nothing depends on this attribution being perfect; it
   * only decides which tab gets a dot.
   */
  const reportIssueBadges = useMemo(
    () => buildReportIssueBadges(draft?.reportBlocks ?? [], draft?.summaryFields ?? [], issues),
    [draft, issues],
  );

  const tabIssueCounts = useMemo((): Partial<Record<BuilderTab, number>> => {
    const sectionIssues =
      Object.values(badgeMap.sections).filter((b) => b?.hasError).length +
      Object.values(badgeMap.columns).filter((b) => b?.hasError).length;
    const total = issues?.length ?? 0;
    // Never negative: badgeMap can attribute one issue to both a column and
    // its section, so the attributed count can exceed the raw issue count.
    const residual = Math.max(0, total - sectionIssues);
    return { sections: sectionIssues, functions: residual };
  }, [badgeMap, issues]);

  const handleSave = async () => {
    if (!templateId || !draft) return;
    setSaving(true);
    try {
      await recorderTemplateService.updateTemplate(templateId, {
        ...draft,
        updatedBy: currentUser?.uid || '',
      });
      success('Saved');
      const refreshed = await recorderTemplateService.getTemplateById(templateId);
      if (refreshed) setOriginal(refreshed);
    } catch (e: any) {
      showError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!templateId) return;
    await handleSave();
    setSaving(true);
    try {
      const result = await recorderTemplateService.publishTemplate(templateId, currentUser?.uid || '');
      success(`Published as version ${result.version}`);
      setIssues(null);
      const refreshed = await recorderTemplateService.getTemplateById(templateId);
      if (refreshed) setOriginal(refreshed);
      void loadVersions(templateId);
    } catch (e: any) {
      if (e?.issues) {
        setIssues(e.issues);
        showError('Cannot publish — see the issues listed under Verify.');
      } else {
        showError(e.message || 'Failed to publish');
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Phase 23 Task 5: resets this template's version counter to 0, so the
   * NEXT publish becomes v1 again — for a template still under development
   * whose earlier publishes were never real recordings. `recorderTemplateService.
   * resetTemplateVersion` refuses outright (does not warn-and-proceed) if
   * ANY record references ANY version of this template, in any status; the
   * count check itself lives there, injected with
   * `calibrationRecordService.getRecordCountByTemplateId` since the two
   * services would otherwise import each other circularly (see that
   * function's own doc comment for the full reasoning, including the
   * documented non-atomic race window).
   */
  const handleResetVersion = async () => {
    if (!templateId || !original) return;
    if (
      !window.confirm(
        `Reset "${original.name}"'s version counter back to 0? The next Publish will become v1 again. ` +
          `This is refused if any record references this template at any version — nothing is lost silently.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await recorderTemplateService.resetTemplateVersion(
        templateId,
        currentUser?.uid || '',
        (id) => calibrationRecordService.getRecordCountByTemplateId(id),
      );
      success('Version reset to 0.');
      const refreshed = await recorderTemplateService.getTemplateById(templateId);
      if (refreshed) setOriginal(refreshed);
      void loadVersions(templateId);
    } catch (e: any) {
      if (e instanceof TemplateVersionResetBlockedError) {
        showError(`Cannot reset — ${e.recordCount} record(s) reference this template.`);
      } else {
        showError(e.message || 'Failed to reset version');
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Phase 25 Task 2b/2c: deletes ONE published version snapshot from the
   * "Published Versions" panel below, without resetting the template's own
   * counter. The button that calls this is only ever rendered/enabled when
   * `versionPins.get(version)` is empty (see the panel's JSX) — this
   * `pinCount > 0` check is defense in depth, not the only guard; the real
   * guard is server-side inside `recorderTemplateService.deleteVersion`
   * itself (`countRecordsReferencingVersion`, injected the same way
   * `handleResetVersion` injects its own count function above).
   */
  const handleDeleteVersion = async (version: number) => {
    if (!templateId) return;
    const pinCount = versionPins.get(version)?.length ?? 0;
    if (pinCount > 0) return;
    if (
      !window.confirm(
        `Permanently delete version ${version}? This cannot be undone. No live record references it.`,
      )
    ) {
      return;
    }
    setDeletingVersion(version);
    try {
      await recorderTemplateService.deleteVersion(
        templateId,
        version,
        (id, v) => calibrationRecordService.getRecordsPinningTemplateVersion(id, v).then((records) => records.length),
      );
      success(`Version ${version} deleted.`);
      void loadVersions(templateId);
    } catch (e: any) {
      if (e instanceof TemplateVersionDeleteBlockedError) {
        showError(`Cannot delete — ${e.recordCount} live record(s) reference version ${version}.`);
      } else {
        showError(e.message || 'Failed to delete version');
      }
    } finally {
      setDeletingVersion(null);
    }
  };

  const handleArchive = async () => {
    if (!templateId || !original) return;
    if (!window.confirm(`Archive "${original.name}"? This frees its equipment type for a different active template.`)) return;
    setSaving(true);
    try {
      await recorderTemplateService.archiveTemplate(templateId, currentUser?.uid || '');
      success('Archived');
      const refreshed = await recorderTemplateService.getTemplateById(templateId);
      if (refreshed) setOriginal(refreshed);
    } catch (e: any) {
      showError(e.message || 'Failed to archive');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft || !original) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const readOnly = !canEdit;

  // ── Sections & columns ────────────────────────────────────────────────
  const updateSections = (sections: RecordSection[]) => setDraft({ ...draft, sections });

  const addSection = () => {
    updateSections([...draft.sections, { id: '', label: '', order: draft.sections.length, columns: [] }]);
  };
  const updateSection = (index: number, patch: Partial<RecordSection>) => {
    const next = [...draft.sections];
    next[index] = { ...next[index], ...patch };
    updateSections(next);
  };
  const removeSection = (index: number) => {
    updateSections(draft.sections.filter((_, i) => i !== index));
  };
  const moveSection = (index: number, dir: -1 | 1) => {
    updateSections(moveItem(draft.sections, index, dir));
  };

  // ── Report blocks (ADR-017) ───────────────────────────────────────────
  // Deliberately mirrors the section/column handlers above rather than
  // generalising them: a block column is a DIFFERENT type (no 'standard', no
  // unit modes — ADR-017 D1), so a shared handler would have to be generic
  // over both and would lose exactly the type safety that keeps
  // `type: 'standard'` unrepresentable on a block.
  const blocks = draft.reportBlocks ?? [];
  const updateBlocks = (reportBlocks: ReportBlock[]) => setDraft({ ...draft, reportBlocks });

  const addBlock = (kind: 'table' | 'text') => {
    updateBlocks([
      ...blocks,
      {
        id: '', label: '', order: blocks.length, kind,
        columns: [], defaultRowCount: kind === 'table' ? 3 : 0,
        ...(kind === 'text' ? { text: '' } : {}),
      },
    ]);
  };
  const updateBlock = (index: number, patch: Partial<ReportBlock>) => {
    const next = [...blocks];
    next[index] = { ...next[index], ...patch };
    updateBlocks(next);
  };
  const removeBlock = (index: number) => updateBlocks(blocks.filter((_, i) => i !== index));
  const moveBlock = (index: number, dir: -1 | 1) => updateBlocks(moveItem(blocks, index, dir));

  const addBlockColumn = (blockIndex: number) => {
    const block = blocks[blockIndex];
    updateBlock(blockIndex, {
      columns: [...block.columns, { id: '', label: '', order: block.columns.length, type: 'text' }],
    });
  };
  const updateBlockColumn = (blockIndex: number, columnIndex: number, patch: Partial<ReportBlockColumn>) => {
    const block = blocks[blockIndex];
    const columns = [...block.columns];
    columns[columnIndex] = { ...columns[columnIndex], ...patch };
    updateBlock(blockIndex, { columns });
  };
  const removeBlockColumn = (blockIndex: number, columnIndex: number) => {
    const block = blocks[blockIndex];
    updateBlock(blockIndex, { columns: block.columns.filter((_, i) => i !== columnIndex) });
  };
  const moveBlockColumn = (blockIndex: number, columnIndex: number, dir: -1 | 1) => {
    const block = blocks[blockIndex];
    updateBlock(blockIndex, { columns: moveItem(block.columns, columnIndex, dir) });
  };

  const addColumn = (sectionIndex: number) => {
    const section = draft.sections[sectionIndex];
    const columns: RecordColumn[] = [
      ...section.columns,
      { id: '', label: '', order: section.columns.length, type: 'text' },
    ];
    updateSection(sectionIndex, { columns });
  };
  const updateColumn = (sectionIndex: number, columnIndex: number, patch: Partial<RecordColumn>) => {
    const section = draft.sections[sectionIndex];
    const columns = [...section.columns];
    columns[columnIndex] = { ...columns[columnIndex], ...patch };
    updateSection(sectionIndex, { columns });
  };
  const removeColumn = (sectionIndex: number, columnIndex: number) => {
    const section = draft.sections[sectionIndex];
    updateSection(sectionIndex, { columns: section.columns.filter((_, i) => i !== columnIndex) });
  };
  const moveColumn = (sectionIndex: number, columnIndex: number, dir: -1 | 1) => {
    const section = draft.sections[sectionIndex];
    updateSection(sectionIndex, { columns: moveItem(section.columns, columnIndex, dir) });
  };

  // ── Custom functions ────────────────────────────────────────────────────
  const updateFunctions = (customFunctions: CustomFunction[]) => setDraft({ ...draft, customFunctions });
  const addFunction = () => updateFunctions([...draft.customFunctions, { name: '', params: [], expression: '' }]);
  const updateFunction = (index: number, patch: Partial<CustomFunction>) => {
    const next = [...draft.customFunctions];
    next[index] = { ...next[index], ...patch };
    updateFunctions(next);
  };
  const removeFunction = (index: number) => updateFunctions(draft.customFunctions.filter((_, i) => i !== index));

  // ── Summary fields ──────────────────────────────────────────────────────
  const updateSummaryFields = (summaryFields: SummaryField[]) => setDraft({ ...draft, summaryFields });
  const addSummaryField = () =>
    updateSummaryFields([...draft.summaryFields, { id: '', label: '', type: 'number', expression: '' }]);
  const updateSummaryField = (index: number, patch: Partial<SummaryField>) => {
    const next = [...draft.summaryFields];
    next[index] = { ...next[index], ...patch };
    updateSummaryFields(next);
  };
  const removeSummaryField = (index: number) => updateSummaryFields(draft.summaryFields.filter((_, i) => i !== index));

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <button type="button" onClick={() => navigate('/recorder-templates')} className="text-xs text-gray-400 hover:text-gray-600 mb-2">
              ← Back to templates
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{draft.name || 'Untitled template'}</h1>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                original.status === 'active' ? 'bg-emerald-50 text-emerald-700'
                  : original.status === 'archived' ? 'bg-amber-50 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {original.status}
              </span>
              {original.version > 0 && <span className="text-xs text-gray-400">v{original.version}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Phase 10 Task 5: primary Help entry point — visible whether or not the viewer can edit. */}
            <button type="button" onClick={() => openHelp('basics')} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Help
            </button>
            {canEdit && (
            <>
              <button type="button" onClick={handleVerify} disabled={saving} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Verify
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              {canPublish && original.status !== 'archived' && (
                <button type="button" onClick={handlePublish} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40">
                  Publish
                </button>
              )}
              {canPublish && original.status === 'active' && (
                <button type="button" onClick={handleArchive} disabled={saving} className="px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors disabled:opacity-50">
                  Archive
                </button>
              )}
              {/*
                Phase 23 Task 5 — admin-only (same canPublish gate as
                Publish/Approve). Always shown, even at version 0: resetting
                also clears any stale `_v1` snapshot left over from a prior
                publish cycle (found live 2026-08-19 — ADR-016 addendum),
                which can only happen by running reset again, so hiding this
                once version is already 0 would remove the one way to
                recover from that stuck state. The guard itself lives in
                recorderTemplateService.resetTemplateVersion; this button
                only offers the action, it does not decide safety.
              */}
              {canPublish && (
                <button type="button" onClick={handleResetVersion} disabled={saving} title="Refused if any record references this template at any version." className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                  Reset Version
                </button>
              )}
            </>
            )}
          </div>
        </div>

        {/*
          ── Tabbed workspace (Phase 26 Task 6) ────────────────────────
          Phase 16 gave this page a navigator rail and landscape columns,
          but every panel still rendered at once, so the page stayed long
          and scroll-heavy. Each tab now fills the viewport on its own and
          Phase 16's rail navigates WITHIN the active tab, unchanged.

          The Verify results panel is deliberately OUTSIDE this switch,
          rendered below, and every tab carries its own issue dot: an error
          in Sections has to stay discoverable while standing in Report
          Blocks, or the tabs would have hidden the problem rather than
          organised it.
        */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Template builder sections">
            {BUILDER_TABS.map((tab) => {
              const count = tabIssueCounts[tab.id] ?? 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`${tab.label} tab`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      title={`${count} validation issue(s) in ${tab.label} — see Verify below`}
                      className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold"
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Always OUTSIDE the tab switch — see the tab bar comment above. */}
        {/* ── Verify results ────────────────────────────────────────── */}
        {issues !== null && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${issues.length === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {issues.length === 0 ? (
              <p className="font-medium">No issues found — this template is publishable.</p>
            ) : (
              <>
                <p className="font-medium mb-1.5">{issues.length} issue{issues.length === 1 ? '' : 's'} found:</p>
                <ul className="space-y-1 list-disc list-inside">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      {issue.message}
                      {issue.line !== undefined && <span className="text-red-400"> (line {issue.line}, col {issue.column})</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Phase 15 Task 3: warn-only, kept separate from the blocking issues above. */}
        {conversionWarnings !== null && conversionWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1.5">
              {conversionWarnings.length} conversion-factor warning{conversionWarnings.length === 1 ? '' : 's'}:
            </p>
            <ul className="space-y-1 list-disc list-inside">
              {conversionWarnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'sections' && (
          <>
          {/*
            ── Navigator (left rail) + Sections & Columns (landscape) ──────
            Task 2/3 layout refactor: the navigator renders straight from
            `draft.sections` — no second copy of structure — and every
            section/column always renders below (nothing is filtered by
            focus), so an issue anywhere stays reachable whether or not its
            section is the one currently expanded.
          */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <TemplateNavigator
              sections={draft.sections}
              focusedSectionIdx={focusedSectionIdx}
              focusedColumnIdx={focusedColumnIdx}
              badges={badgeMap}
              onFocusSection={focusSection}
              onFocusColumn={focusColumn}
            />

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Sections & Columns</h2>
                {canEdit && (
                  <button type="button" onClick={addSection} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add section</button>
                )}
              </div>
              {draft.sections.length === 0 && (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 text-center">No sections yet</p>
              )}
              {draft.sections.map((section, sIdx) => (
                <div key={sIdx} ref={(el) => { sectionRefs.current.set(sIdx, el); }} className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-shrink-0">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        Section ID <span className="text-red-500">*</span>
                        <span className="ml-1 font-normal text-gray-400">(used in formulas)</span>
                      </label>
                      <input type="text" placeholder="e.g. CAL" value={section.id} disabled={readOnly}
                        onChange={(e) => updateSection(sIdx, { id: e.target.value.toUpperCase() })}
                        className="input font-mono text-xs w-28"
                        title="Short uppercase code. Formulas refer to this section's columns as SECTIONID_COLUMNID, e.g. CAL_IND." />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        Display label <span className="font-normal text-gray-400">(shown on screen &amp; PDF)</span>
                      </label>
                      <input type="text" placeholder="e.g. Measurements" value={section.label} disabled={readOnly}
                        onChange={(e) => updateSection(sIdx, { label: e.target.value })}
                        className="input text-sm w-full" />
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-0.5 flex-shrink-0 pb-1">
                        <button type="button" onClick={() => moveSection(sIdx, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Move section up">↑</button>
                        <button type="button" onClick={() => moveSection(sIdx, 1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Move section down">↓</button>
                        <button type="button" onClick={() => removeSection(sIdx)} className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600" title="Remove this section">✕</button>
                      </div>
                    )}
                  </div>

                  {/*
                    Task 3: columns laid out LEFT TO RIGHT in template order,
                    mirroring the table they produce. The focused column (from
                    the navigator, or clicked directly here) expands to its
                    full editor; every other column stays a compact card —
                    still visible, still badge-able, just not fully expanded.
                    Horizontal scroll when a section has more columns than fit.
                  */}
                  <div className="flex items-start gap-2 overflow-x-auto pb-1" data-testid={`section-columns-${section.id || sIdx}`}>
                    {section.columns.map((column, cIdx) => {
                      const columnKey = `${section.id}_${column.id}`;
                      const isFocused = focusedSectionIdx === sIdx && focusedColumnIdx === cIdx;
                      const badge = badgeMap.columns[columnKey];

                      if (!isFocused) {
                        const unitSummaryParts = [
                          column.unitMode === 'fixed' && column.unit ? column.unit
                            : column.unitMode === 'selectable' ? 'picks unit'
                            : column.unitMode === 'sameAs' ? 'same as…'
                            : '',
                          column.type === 'formula' && column.conversionEnabled ? 'converts' : '',
                        ].filter(Boolean);
                        const unitSummary = unitSummaryParts.join(' · ');
                        return (
                          <button
                            key={cIdx}
                            type="button"
                            ref={(el) => { columnRefs.current.set(`${sIdx}-${cIdx}`, el); }}
                            onClick={() => focusColumn(sIdx, cIdx)}
                            aria-label={`Expand column ${columnKey}`}
                            data-testid={`column-card-${columnKey}`}
                            className="flex-shrink-0 w-36 text-left bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-lg p-2 space-y-0.5 transition-colors"
                          >
                            <div className="flex items-center gap-1">
                              {badge && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.hasError ? 'bg-red-500' : 'bg-amber-500'}`}
                                  title={badge.hasError ? 'Has a validation issue — see Verify' : 'Has a warning — see Verify'}
                                />
                              )}
                              <span className="font-mono text-[10px] text-gray-400 truncate">{column.id || '—'}</span>
                            </div>
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {column.label || <span className="text-gray-400 italic">no label</span>}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {column.type}{unitSummary ? ` · ${unitSummary}` : ''}
                            </p>
                          </button>
                        );
                      }

                      return (
                      <div key={cIdx} ref={(el) => { columnRefs.current.set(`${sIdx}-${cIdx}`, el); }} data-testid={`column-card-${columnKey}`} className="flex-shrink-0 w-[440px] space-y-1.5 bg-gray-50 rounded-lg p-2">
                        <div className="flex items-end gap-1.5 flex-wrap">
                          <div className="flex-shrink-0">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Column ID <span className="text-red-500">*</span>
                            </label>
                            <input type="text" placeholder="e.g. IND" value={column.id} disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { id: e.target.value.toUpperCase() })}
                              className="input font-mono text-xs w-20"
                              title={`Short uppercase code. Referred to in formulas as ${section.id || 'SECTION'}_${column.id || 'ID'}.`} />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Display label <span className="font-normal text-gray-400">(column heading)</span>
                            </label>
                            <input type="text" placeholder="e.g. Indicated value" value={column.label} disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { label: e.target.value })}
                              className="input text-xs w-full" />
                          </div>
                          <div className="flex-shrink-0 w-28">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Unit <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <select
                              value={column.unitMode ?? ''}
                              disabled={readOnly}
                              onChange={(e) => {
                                const mode = (e.target.value || undefined) as RecordColumn['unitMode'];
                                updateColumn(sIdx, cIdx, {
                                  unitMode: mode,
                                  unit: mode === 'fixed' ? column.unit : undefined,
                                  unitChoices: mode === 'selectable' ? column.unitChoices : undefined,
                                  unitSourceColumn: mode === 'sameAs' ? column.unitSourceColumn : undefined,
                                });
                              }}
                              className="input text-xs w-full"
                              title="Display only — does not convert values. Use STD_TO_N / REPORT_TO_N in the formula for force conversion. Fixed = one unit set here. Selectable = the technician picks one per record while recording. Same as = reuse another column's unit.">
                              <option value="">None</option>
                              <option value="fixed">Fixed</option>
                              <option value="selectable">Selectable</option>
                              <option value="sameAs">Same as…</option>
                            </select>
                          </div>
                          <div className="flex-shrink-0">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
                            <select value={column.type} disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { type: e.target.value as RecordColumn['type'] })}
                              className="input text-xs w-24">
                              {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-0.5 pb-1">
                              <button type="button" onClick={() => moveColumn(sIdx, cIdx, -1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs" title="Move column left">↑</button>
                              <button type="button" onClick={() => moveColumn(sIdx, cIdx, 1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs" title="Move column right">↓</button>
                              <button type="button" onClick={() => removeColumn(sIdx, cIdx)} className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs" title="Remove this column">✕</button>
                            </div>
                          )}
                        </div>

                        {/*
                          Phase 26 Task 1: Notation/Decimals now serve FORMULA
                          columns as well as number columns — a computed column
                          previously had no display-precision control at all,
                          which is why raw float noise (-5.42e-15) and TREB's
                          ##### overflow reached the screen and the PDF.
                          'Preset value' stays number-only below: a formula
                          column is computed, so pre-filling it is meaningless.
                        */}
                        {(column.type === 'number' || column.type === 'formula') && (
                          <div className="flex items-end gap-1.5 flex-wrap">
                            <div className="flex-shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notation</label>
                              <select value={column.numberFormat?.notation || 'fixed'} disabled={readOnly}
                                onChange={(e) => updateColumn(sIdx, cIdx, { numberFormat: { notation: e.target.value as 'fixed' | 'scientific', decimals: column.numberFormat?.decimals ?? 2 } })}
                                className="input text-xs w-28"
                                title="How the number is displayed. Fixed = 12.345. Scientific = 1.234E+01. Display only — the stored value keeps full precision.">
                                <option value="fixed">fixed</option>
                                <option value="scientific">scientific</option>
                              </select>
                            </div>
                            <div className="flex-shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Decimals</label>
                              <input type="number" min={0}
                                value={column.numberFormat?.decimals ?? (column.type === 'formula' ? DEFAULT_FORMULA_MAX_DECIMALS : 2)}
                                disabled={readOnly}
                                onChange={(e) => updateColumn(sIdx, cIdx, { numberFormat: { notation: column.numberFormat?.notation || 'fixed', decimals: parseInt(e.target.value) || 0 } })}
                                className="input text-xs w-20"
                                title="Decimal places when displayed. In scientific notation this is the mantissa precision. Display only — never rounds the stored value." />
                            </div>
                            {column.type === 'number' && (
                              <div className="flex-1 min-w-[160px]">
                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                  Preset value <span className="font-normal text-gray-400">(optional)</span>
                                </label>
                                <input type="text" placeholder="pre-filled when recording starts" value={column.preInput ?? ''} disabled={readOnly}
                                  onChange={(e) => updateColumn(sIdx, cIdx, { preInput: e.target.value })}
                                  className="input text-xs w-full"
                                  title="Optional. If set, this value is pre-filled into the cell when a technician opens a new record. They can type over it. Leave blank to start empty." />
                              </div>
                            )}
                            {column.type === 'formula' && (
                              <p className="flex-1 min-w-[160px] text-[10px] text-gray-400 pb-1.5">
                                Display only — the stored value keeps full precision (ADR-011).
                                Unset rounds to at most {DEFAULT_FORMULA_MAX_DECIMALS} decimals, without trailing zeros.
                              </p>
                            )}
                          </div>
                        )}

                        {column.unitMode === 'fixed' && (
                          <div className="w-40">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Fixed unit</label>
                            <input type="text" placeholder="e.g. N, °C, mV/V" value={column.unit ?? ''} disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { unit: e.target.value || undefined })}
                              className="input text-xs w-full"
                              title="Display only — does not convert values. Shown as 'label (unit)' in the header. Use STD_TO_N / REPORT_TO_N in the formula for force conversion." />
                          </div>
                        )}

                        {column.unitMode === 'sameAs' && (
                          <div className="w-72">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Same unit as <span className="text-red-500">*</span>
                              <span className="ml-1 font-normal text-gray-400">follows that column</span>
                            </label>
                            <select
                              value={column.unitSourceColumn ?? ''}
                              disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { unitSourceColumn: e.target.value || undefined })}
                              className="input text-xs w-full"
                              title="This column shows whatever unit that column resolves to — including a unit the technician picks there. Display only; it converts nothing."
                            >
                              <option value="">— Select a column —</option>
                              {draft.sections.flatMap((os) => os.columns
                                // A column cannot inherit from itself.
                                .filter((oc) => !(os.id === section.id && oc.id === column.id))
                                .map((oc) => {
                                  const key = `${os.id}_${oc.id}`;
                                  return (
                                    <option key={key} value={key}>
                                      {`${os.label || os.id} — ${oc.label || oc.id} (${key})`}
                                    </option>
                                  );
                                }))}
                            </select>
                          </div>
                        )}

                        {column.unitMode === 'selectable' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Allowed units <span className="text-red-500">*</span>
                              <span className="ml-1 font-normal text-gray-400">separate with commas, at least 2</span>
                            </label>
                            <CommaListInput
                              key={`${section.id}-${column.id || cIdx}-unitChoices`}
                              placeholder="e.g. N, kN, kgF"
                              value={column.unitChoices || []}
                              disabled={readOnly}
                              onChange={(unitChoices) => updateColumn(sIdx, cIdx, { unitChoices })}
                              className="input text-xs w-full"
                              title="Display only — does not convert values. The technician picks one of these per record while recording. Use STD_TO_N / REPORT_TO_N in the formula for force conversion." />
                          </div>
                        )}

                        {column.type === 'text' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Preset value <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <input type="text" placeholder="pre-filled when recording starts" value={column.preInput ?? ''} disabled={readOnly}
                              onChange={(e) => updateColumn(sIdx, cIdx, { preInput: e.target.value })}
                              className="input text-xs w-full"
                              title="Optional. Pre-filled into the cell when a technician opens a new record. They can type over it." />
                          </div>
                        )}

                        {column.type === 'selection' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Choices <span className="text-red-500">*</span>
                              <span className="ml-1 font-normal text-gray-400">separate with commas</span>
                            </label>
                            <CommaListInput
                              key={`${section.id}-${column.id || cIdx}-choices`}
                              placeholder="e.g. Pass, Fail, N/A"
                              value={column.choices || []}
                              disabled={readOnly}
                              onChange={(choices) => updateColumn(sIdx, cIdx, { choices })}
                              className="input text-xs w-full"
                              title="The fixed list of options a technician may pick from in this column." />
                          </div>
                        )}

                        {column.type === 'standard' && (
                          <div className="text-[10px] text-gray-500 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                            <p className="font-medium text-blue-900">Reference standard picker</p>
                            <p className="mt-0.5">
                              The technician picks an active reference standard per row. Formulas on this row can then use{' '}
                              <VariableNameList names={STANDARD_VARIABLE_NAMES} /> — each row resolving them from its own
                              standard.
                            </p>
                            <p className="mt-0.5 text-gray-400">
                              A reference standard is an equipment record with its "Usable as Reference
                              Standard" toggle on, carrying one Conversion Equation per calibrated range. Manage
                              these on the standard's own page: Equipment → select the device → Conversion
                              Equations tab. Nothing to configure here.
                            </p>
                          </div>
                        )}

                        {column.type === 'formula' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Formula <span className="text-red-500">*</span>
                              <span className="ml-1 font-normal text-gray-400">read-only column, calculated per row</span>
                            </label>
                            <input type="text" placeholder="e.g. CAL_IND - CAL_NOM" value={column.expression ?? ''} disabled={readOnly}
                              ref={(el) => { columnFormulaInputRefs.current.set(`${sIdx}-${cIdx}`, el); }}
                              onChange={(e) => updateColumn(sIdx, cIdx, { expression: e.target.value })}
                              className="input font-mono text-xs w-full"
                              title="Refer to other columns as SECTIONID_COLUMNID. Calculated once per row. Use the Verify button to check it before publishing." />
                            {!readOnly && (
                              <>
                                <FormulaVariableDisclosure
                                  groups={buildRowFormulaVariables(draft, section.id, column.id, hasStandardColumn)}
                                  onInsert={(name) => insertAtCursor(
                                    columnFormulaInputRefs.current.get(`${sIdx}-${cIdx}`),
                                    column.expression ?? '',
                                    (next) => updateColumn(sIdx, cIdx, { expression: next }),
                                    name,
                                  )}
                                />
                                <FormulaSuggestPopup
                                  getInput={() => columnFormulaInputRefs.current.get(`${sIdx}-${cIdx}`) ?? null}
                                  onChange={(next) => updateColumn(sIdx, cIdx, { expression: next })}
                                  context={{ kind: 'row', sectionId: section.id, columnId: column.id }}
                                  template={draft}
                                  hasStandardColumn={hasStandardColumn}
                                />
                              </>
                            )}

                            {/*
                              ADR-015 D9: display-time unit conversion, opt-in, formula
                              columns only — this control lives ONLY inside the
                              `column.type === 'formula'` block, so no other column type
                              ever renders it (not even disabled), per D9's own reasoning:
                              a text/input column holds what the technician typed, and a
                              disabled control elsewhere would falsely imply the feature
                              exists there.
                            */}
                            <div className="pt-1.5 mt-1.5 border-t border-gray-200">
                              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={!!column.conversionEnabled}
                                  disabled={readOnly}
                                  onChange={(e) => updateColumn(sIdx, cIdx, {
                                    conversionEnabled: e.target.checked || undefined,
                                    conversionSourceUnit: e.target.checked ? column.conversionSourceUnit : undefined,
                                  })}
                                />
                                Convert for display
                                <span className="font-normal text-gray-400">— shows a different unit than the raw computed value; never changes what's stored</span>
                              </label>
                              {column.conversionEnabled && (
                                <div className="w-48 mt-1">
                                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                    Source unit <span className="text-red-500">*</span>
                                    <span className="ml-1 font-normal text-gray-400">what unit the raw value is actually in</span>
                                  </label>
                                  <input type="text" placeholder="e.g. mV/V" value={column.conversionSourceUnit ?? ''} disabled={readOnly}
                                    onChange={(e) => updateColumn(sIdx, cIdx, { conversionSourceUnit: e.target.value || undefined })}
                                    className="input text-xs w-full"
                                    title="The raw unit this column's formula actually computes in. At display time, a matching conversion rule (Settings → Unit Conversions) converts it into the column's header unit." />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {canEdit && (
                      <button type="button" onClick={() => addColumn(sIdx)} className="flex-shrink-0 self-start text-xs font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap px-2 py-2">+ Add column</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
        )}

        {activeTab === 'blocks' && (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/*
              Phase 26 follow-up: the same left rail the Sections tab has.
              Report Blocks grows the same way Sections does - several blocks,
              each with several columns - so it needs the same way of reaching
              one part of it without scrolling for it. Deliberately the same
              markup, sticky behaviour and aria-label convention as
              TemplateNavigator, not a second navigation idiom to learn.
            */}
            <ReportBlockNavigator
              blocks={blocks}
              focusedKey={focusedBlockKey}
              badges={reportIssueBadges}
              onFocusBlock={focusBlock}
              onFocusBlockColumn={focusBlockColumn}
            />

            <div className="flex-1 min-w-0 space-y-3">
            {/*
              -- Report Blocks (ADR-017 D1/D5) ---------------------------
              Tables and text with their OWN row axis: an uncertainty budget
              has a row per contributor, a conformity statement has no rows at
              all, and neither belongs on the calibration-point axis that a
              section column shares (Phase 21).
            */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-gray-900">Report Blocks</h2>
                <button type="button" onClick={() => openHelp('functions')} title="Help: what a report block can compute"
                  className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 hover:text-primary-600 hover:border-primary-400 transition-colors">
                  ?
                </button>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => addBlock('table')} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add table block</button>
                  <button type="button" onClick={() => addBlock('text')} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add text block</button>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              A block formula sees column aggregates over the measurement table, SUMMARY_ values,
              ENV_ values, REPORT_TO_N, and its own block&apos;s columns for its own row. It cannot use
              STD_ values &mdash; a block row is not a calibration point.
            </p>

            {blocks.length === 0 && (
              <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 text-center">No report blocks yet</p>
            )}

            {blocks.map((block, bIdx) => (
              <div
                key={bIdx}
                ref={(el) => { blockRefs.current.set(`b${bIdx}`, el); }}
                className={`rounded-xl border bg-white p-3 space-y-3 transition-colors ${
                  focusedBlockKey === `b${bIdx}` ? 'border-primary-300' : 'border-gray-200'
                }`}
              >
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex-shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Block ID <span className="text-red-500">*</span>
                      <span className="ml-1 font-normal text-gray-400">(used in formulas)</span>
                    </label>
                    <input type="text" placeholder="e.g. BUD" value={block.id} disabled={readOnly}
                      onChange={(e) => updateBlock(bIdx, { id: e.target.value.toUpperCase() })}
                      className="input font-mono text-xs w-28"
                      title="Short uppercase code. This block's columns are referred to as BLOCKID_COLUMNID, e.g. BUD_VAL." />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Display label <span className="font-normal text-gray-400">(shown on the report)</span>
                    </label>
                    <input type="text" placeholder="e.g. Uncertainty budget" value={block.label} disabled={readOnly}
                      onChange={(e) => updateBlock(bIdx, { label: e.target.value })}
                      className="input text-sm w-full" />
                  </div>
                  <div className="flex-shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Kind</label>
                    <span className="inline-flex items-center h-[30px] px-2 rounded bg-gray-100 text-xs text-gray-600 font-medium">{block.kind}</span>
                  </div>
                  {block.kind === 'table' && (
                    <div className="flex-shrink-0">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Rows</label>
                      <input type="number" min={1} value={block.defaultRowCount} disabled={readOnly}
                        onChange={(e) => updateBlock(bIdx, { defaultRowCount: parseInt(e.target.value) || 1 })}
                        className="input text-xs w-16"
                        title="How many rows this block starts with. A block's row axis is authored, not measured, so it is independent of the calibration-point count." />
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-0.5 flex-shrink-0 pb-1">
                      <button type="button" onClick={() => moveBlock(bIdx, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Move block up">&#8593;</button>
                      <button type="button" onClick={() => moveBlock(bIdx, 1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600" title="Move block down">&#8595;</button>
                      <button type="button" onClick={() => removeBlock(bIdx)} className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600" title="Remove this block">&#10005;</button>
                    </div>
                  )}
                </div>

                {block.kind === 'text' ? (
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                      Default text <span className="font-normal text-gray-400">&mdash; a technician may override it per record</span>
                    </label>
                    <textarea
                      placeholder="e.g. Conformity assessed against ISO 7500-1."
                      value={block.text ?? ''}
                      disabled={readOnly}
                      rows={3}
                      onChange={(e) => updateBlock(bIdx, { text: e.target.value })}
                      className="input text-xs w-full font-sans"
                      title="Wording authored on the template. Placeholders in braces are resolved through the same formula language, in block context. The effective text is snapshotted at commit, so a later template edit never moves text on a committed record." />
                    <p className="mt-1 text-[10px] text-gray-400">
                      Placeholders go in braces and use the same formula language, e.g.{' '}
                      <span className="font-mono">{'{SUMMARY_MAXDEV}'}</span>.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 overflow-x-auto pb-1">
                    {block.columns.map((column, cIdx) => (
                      <div
                        key={cIdx}
                        ref={(el) => { blockRefs.current.set(`b${bIdx}-c${cIdx}`, el); }}
                        data-testid={`block-column-${block.id}_${column.id}`}
                        className={`flex-shrink-0 w-[320px] space-y-1.5 rounded-lg p-2 transition-colors ${
                          focusedBlockKey === `b${bIdx}-c${cIdx}` ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-end gap-1.5 flex-wrap">
                          <div className="flex-shrink-0">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Column ID <span className="text-red-500">*</span>
                            </label>
                            <input type="text" placeholder="e.g. VAL" value={column.id} disabled={readOnly}
                              onChange={(e) => updateBlockColumn(bIdx, cIdx, { id: e.target.value.toUpperCase() })}
                              className="input font-mono text-xs w-20" />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Display label</label>
                            <input type="text" placeholder="e.g. Value" value={column.label} disabled={readOnly}
                              onChange={(e) => updateBlockColumn(bIdx, cIdx, { label: e.target.value })}
                              className="input text-xs w-full" />
                          </div>
                          <div className="flex-shrink-0">
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
                            <select value={column.type} disabled={readOnly}
                              onChange={(e) => updateBlockColumn(bIdx, cIdx, { type: e.target.value as ReportBlockColumn['type'] })}
                              className="input text-xs w-24"
                              title="Same types as a section column, minus 'standard' - a block row is not a calibration point (ADR-017 D1).">
                              {BLOCK_COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-0.5 pb-1">
                              <button type="button" onClick={() => moveBlockColumn(bIdx, cIdx, -1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs" title="Move block column left">&#8593;</button>
                              <button type="button" onClick={() => moveBlockColumn(bIdx, cIdx, 1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs" title="Move block column right">&#8595;</button>
                              <button type="button" onClick={() => removeBlockColumn(bIdx, cIdx)} className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs" title="Remove this block column">&#10005;</button>
                            </div>
                          )}
                        </div>

                        {(column.type === 'number' || column.type === 'formula') && (
                          <div className="flex items-end gap-1.5">
                            <div className="flex-shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notation</label>
                              <select value={column.numberFormat?.notation || 'fixed'} disabled={readOnly}
                                onChange={(e) => updateBlockColumn(bIdx, cIdx, { numberFormat: { notation: e.target.value as 'fixed' | 'scientific', decimals: column.numberFormat?.decimals ?? DEFAULT_FORMULA_MAX_DECIMALS } })}
                                className="input text-xs w-24">
                                <option value="fixed">fixed</option>
                                <option value="scientific">scientific</option>
                              </select>
                            </div>
                            <div className="flex-shrink-0">
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Decimals</label>
                              <input type="number" min={0} value={column.numberFormat?.decimals ?? DEFAULT_FORMULA_MAX_DECIMALS} disabled={readOnly}
                                onChange={(e) => updateBlockColumn(bIdx, cIdx, { numberFormat: { notation: column.numberFormat?.notation || 'fixed', decimals: parseInt(e.target.value) || 0 } })}
                                className="input text-xs w-16" />
                            </div>
                          </div>
                        )}

                        {column.type === 'selection' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Choices <span className="text-red-500">*</span>
                            </label>
                            <CommaListInput
                              key={`block-${bIdx}-${cIdx}-choices`}
                              placeholder="e.g. Type A, Type B"
                              value={column.choices || []}
                              disabled={readOnly}
                              onChange={(choices) => updateBlockColumn(bIdx, cIdx, { choices })}
                              className="input text-xs w-full" />
                          </div>
                        )}

                        {column.type === 'formula' && (
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                              Formula <span className="text-red-500">*</span>
                              <span className="ml-1 font-normal text-gray-400">calculated per block row</span>
                            </label>
                            <input type="text" placeholder="e.g. col_mean(CAL_ERR) / 2" value={column.expression ?? ''} disabled={readOnly}
                              onChange={(e) => updateBlockColumn(bIdx, cIdx, { expression: e.target.value })}
                              className="input font-mono text-xs w-full"
                              title="Block context: column aggregates, SUMMARY_ values, ENV_ values, REPORT_TO_N, and this block's own columns. STD_ values are not available here." />
                          </div>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <button type="button" onClick={() => addBlockColumn(bIdx)} className="flex-shrink-0 self-start text-xs font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap px-2 py-2">+ Add block column</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        )}

        {activeTab === 'functions' && (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/*
              The same rail again, for the same reason: a template with a
              dozen functions and summary fields is a long scroll otherwise.
              Two groups rather than one flat list - a custom function and a
              summary field are different things (ADR-010) that share a tab.
            */}
            <FunctionNavigator
              functions={draft.customFunctions}
              summaryFields={draft.summaryFields}
              focusedKey={focusedFunctionKey}
              badges={reportIssueBadges}
              onFocusFunction={focusFunction}
              onFocusSummaryField={focusSummaryField}
            />

            <div className="flex-1 min-w-0">
          {/*
            ── Custom Functions & Summary Fields ────────────────────────
            Task 3: moved out of the old two-column grid — with a left rail
            now occupying the third slot, [nav | sections | functions] no
            longer fits. Collapsible, matching the "Test with sample data"
            panel below (same pattern, not a new one), defaulted OPEN so
            nothing that used to be always-visible becomes hidden by default.
          */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <button type="button" onClick={() => setShowFunctionsPanel(!showFunctionsPanel)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900">
              Custom Functions & Summary Fields
              <span className="text-gray-400 text-xs">{showFunctionsPanel ? 'Hide' : 'Show'}</span>
            </button>
            {showFunctionsPanel && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-gray-900">Custom Functions</h2>
                  <button type="button" onClick={() => openHelp('basics')} title="Help: how custom functions work"
                    className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 hover:text-primary-600 hover:border-primary-400 transition-colors">
                    ?
                  </button>
                </div>
                {canEdit && (
                  <button type="button" onClick={addFunction} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add function</button>
                )}
              </div>
              {draft.customFunctions.length === 0 && (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 text-center">No custom functions yet</p>
              )}
              {draft.customFunctions.map((fn, fIdx) => (
                <div
                  key={fIdx}
                  ref={(el) => { functionRefs.current.set(`f${fIdx}`, el); }}
                  className={`rounded-xl border bg-white p-3 space-y-2 transition-colors ${
                    focusedFunctionKey === `f${fIdx}` ? 'border-primary-300' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-end gap-1.5 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 pb-1">def</span>
                    <div className="flex-shrink-0">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        Function name <span className="text-red-500">*</span>
                      </label>
                      <input type="text" placeholder="e.g. mean3" value={fn.name} disabled={readOnly}
                        onChange={(e) => updateFunction(fIdx, { name: e.target.value })}
                        className="input font-mono text-xs w-28"
                        title="Must not clash with a builtin (ROUND, MAX, …), a column aggregate (col_mean, …), an existing column reference, or another custom function. Cannot start with ENV_ or SUMMARY_." />
                    </div>
                    <span className="font-mono text-xs text-gray-400 pb-1">(</span>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        Parameters <span className="font-normal text-gray-400">(separate with commas)</span>
                      </label>
                      <CommaListInput
                        key={`fn-${fIdx}-params`}
                        placeholder="e.g. a, b, c"
                        value={fn.params}
                        disabled={readOnly}
                        onChange={(params) => updateFunction(fIdx, { params })}
                        className="input font-mono text-xs w-full"
                        title="The function's only inputs. A function body cannot read columns, ENV_ or SUMMARY_ values directly — pass them in as arguments." />
                    </div>
                    <span className="font-mono text-xs text-gray-400 pb-1">):</span>
                    {canEdit && (
                      <button type="button" onClick={() => removeFunction(fIdx)} className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs flex-shrink-0 pb-1">✕</button>
                    )}
                  </div>
                  <div className="flex items-end gap-1.5 pl-4">
                    <span className="font-mono text-xs text-gray-400 pb-1">return</span>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                        Returns <span className="font-normal text-gray-400">(one expression)</span>
                      </label>
                      <input type="text" placeholder="e.g. (a + b + c) / 3" value={fn.expression} disabled={readOnly}
                        ref={(el) => { functionBodyInputRefs.current.set(String(fIdx), el); }}
                        onChange={(e) => updateFunction(fIdx, { expression: e.target.value })}
                        className="input font-mono text-xs w-full"
                        title="A single expression. May call builtins and other custom functions. No loops, no variables, no if/else blocks (the a if cond else b form is allowed)." />
                      {!readOnly && (
                        <>
                          {/*
                            Phase 10's disclosure was never wired to this input
                            at all (no ref existed here before this phase) —
                            added now for parity with the other two formula
                            inputs. The group is built inline, not sourced from
                            formulaVariableList.ts, because a function body's
                            only legal values are its OWN params (validator
                            step 9) — there is nothing to import; `fn.params` is
                            already the one authoritative source.
                          */}
                          <FormulaVariableDisclosure
                            groups={[{
                              label: 'Parameters',
                              entries: fn.params.filter(Boolean).map((p) => ({ name: p, title: `Parameter of ${fn.name || 'this function'}` })),
                            }]}
                            onInsert={(name) => insertAtCursor(
                              functionBodyInputRefs.current.get(String(fIdx)),
                              fn.expression,
                              (next) => updateFunction(fIdx, { expression: next }),
                              name,
                            )}
                          />
                          <FormulaSuggestPopup
                            getInput={() => functionBodyInputRefs.current.get(String(fIdx)) ?? null}
                            onChange={(next) => updateFunction(fIdx, { expression: next })}
                            context={{ kind: 'function', params: fn.params.filter(Boolean) }}
                            template={draft}
                            hasStandardColumn={hasStandardColumn}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Summary fields — separate panel from the column editor (ADR-010) */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-gray-900">Summary Fields</h2>
                    <button type="button" onClick={() => openHelp('functions')} title="Help: column aggregates (col_mean, col_max, …) and other summary-only functions"
                      className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 hover:text-primary-600 hover:border-primary-400 transition-colors">
                      ?
                    </button>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={addSummaryField} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add summary field</button>
                  )}
                </div>
                {draft.summaryFields.length === 0 && (
                  <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-4 text-center">No summary fields yet</p>
                )}
                <div className="space-y-2">
                  {draft.summaryFields.map((field, idx) => (
                    <div
                      key={idx}
                      ref={(el) => { functionRefs.current.set(`s${idx}`, el); }}
                      data-testid={`summary-field-${field.id}`}
                      className={`rounded-xl border bg-white p-3 space-y-2 transition-colors ${
                        focusedFunctionKey === `s${idx}` ? 'border-primary-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-end gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-gray-400 pb-1">SUMMARY_</span>
                        <div className="flex-shrink-0">
                          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                            Field ID <span className="text-red-500">*</span>
                          </label>
                          <input type="text" placeholder="e.g. MAXDEV" value={field.id} disabled={readOnly}
                            onChange={(e) => updateSummaryField(idx, { id: e.target.value.toUpperCase() })}
                            className="input font-mono text-xs w-24"
                            title="Referenced elsewhere as SUMMARY_<id>, and bindable into the PDF." />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Display label</label>
                          <input type="text" placeholder="e.g. Max Deviation" value={field.label} disabled={readOnly}
                            onChange={(e) => updateSummaryField(idx, { label: e.target.value })}
                            className="input text-xs w-full" />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
                          <select value={field.type} disabled={readOnly}
                            onChange={(e) => updateSummaryField(idx, { type: e.target.value as 'number' | 'text' })}
                            className="input text-xs w-20">
                            <option value="number">number</option>
                            <option value="text">text</option>
                          </select>
                        </div>
                        {canEdit && (
                          <button type="button" onClick={() => removeSummaryField(idx)} className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs flex-shrink-0 pb-1">✕</button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                          Formula <span className="text-red-500">*</span>
                        </label>
                        <input type="text" placeholder="e.g. col_max(CAL_ERR)" value={field.expression} disabled={readOnly}
                          ref={(el) => { summaryFieldInputRefs.current.set(String(idx), el); }}
                          onChange={(e) => updateSummaryField(idx, { expression: e.target.value })}
                          className="input font-mono text-xs w-full"
                          title="Calculated once per record, after all rows. This is the only place column aggregates (col_mean, col_max, col_stdev, …) may be used, and their argument must be a bare column name." />
                        {!readOnly && (
                          <>
                            <FormulaVariableDisclosure
                              groups={buildSummaryFormulaVariables(draft, field.id)}
                              onInsert={(name) => insertAtCursor(
                                summaryFieldInputRefs.current.get(String(idx)),
                                field.expression,
                                (next) => updateSummaryField(idx, { expression: next }),
                                name,
                              )}
                            />
                            <FormulaSuggestPopup
                              getInput={() => summaryFieldInputRefs.current.get(String(idx)) ?? null}
                              onChange={(next) => updateSummaryField(idx, { expression: next })}
                              context={{ kind: 'summary', fieldId: field.id }}
                              template={draft}
                              hasStandardColumn={hasStandardColumn}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}
          </div>
            </div>
          </div>
        )}

        {activeTab === 'testdata' && (
          <>
          {/* ── Mockup / test harness ─────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <button type="button" onClick={() => setShowMockup(!showMockup)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900">
              Test with sample data
              <span className="text-gray-400 text-xs">{showMockup ? 'Hide' : 'Show'}</span>
            </button>
            {showMockup && fullDraftAsTemplate && (
              <div className="px-4 pb-4">
                <MockupHarness template={fullDraftAsTemplate} />
              </div>
            )}
          </div>
          </>
        )}

        {activeTab === 'settings' && (
          <>
          {/* ── Template settings ─────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Name</label>
              <input type="text" value={draft.name} disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input w-full text-sm" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Equipment type</label>
              <select value={draft.equipmentTypeId} disabled={readOnly || original.status === 'active'}
                onChange={(e) => setDraft({ ...draft, equipmentTypeId: e.target.value })} className="input w-full text-sm">
                <option value="" disabled>Select…</option>
                {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {original.status === 'active' && <p className="text-[10px] text-gray-400">Archive first to change equipment type.</p>}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Description</label>
              <input type="text" value={draft.description || ''} disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input w-full text-sm" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Round count</label>
              <input type="number" min={1} value={draft.roundCount} disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, roundCount: parseInt(e.target.value) || 1 })} className="input w-full text-sm" />
              <p className="text-[10px] text-gray-400">Drives the Environment Block only (ENV_TEMP_R1..R{draft.roundCount}).</p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Default row count</label>
              <input type="number" min={1} value={draft.defaultRowCount} disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, defaultRowCount: parseInt(e.target.value) || 1 })} className="input w-full text-sm" />
            </div>
            <div className="flex items-center justify-between pt-5">
              <span className="text-sm text-gray-700">Technician may add rows</span>
              <button type="button" role="switch" aria-checked={draft.allowRowAdd} disabled={readOnly}
                onClick={() => setDraft({ ...draft, allowRowAdd: !draft.allowRowAdd })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.allowRowAdd ? 'bg-primary-600' : 'bg-gray-200'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${draft.allowRowAdd ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/*
            ── Published Versions (Phase 25 Task 2b/2c) ──────────────────
            Admin-only (canPublish — same gate as Publish/Reset/Archive
            above), replacing hand-deleting `recorderTemplateVersions`
            documents in the Firebase Console. Every version this template
            has ever published, newest first, each with how many LIVE
            records currently pin it (ADR-016 D3: voided records excluded,
            consistent with the reset guard). Delete is only ever enabled at
            zero — a version any live record depends on is not deletable
            from this UI, full stop (ADR-005's whole guarantee). When it
            isn't zero, this NAMES which records are pinning it (record
            number where one was allocated, otherwise job/item — a draft
            pins a version too, before it has a record number), not just a
            disabled button with no explanation (Task 2c).
          */}
          {canPublish && (versionsLoading || versions.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Published Versions</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Delete a version once nothing live still references it — no need to use the Firebase Console.
                </p>
              </div>
              {versionsLoading ? (
                <div className="px-4 py-6 text-sm text-gray-500">Loading versions…</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {[...versions].sort((a, b) => b.version - a.version).map((v) => {
                    const pins = versionPins.get(v.version) ?? [];
                    const pinCount = pins.length;
                    const isDeleting = deletingVersion === v.version;
                    return (
                      <li key={v.id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">v{v.version}</span>
                            <span className="text-xs text-gray-400">
                              published {v.publishedAt.toLocaleString()} by {v.publishedBy}
                            </span>
                          </div>
                          {pinCount > 0 ? (
                            <p className="text-xs text-amber-700 mt-1">
                              {pinCount} live record{pinCount === 1 ? '' : 's'} pin this version:{' '}
                              {pins
                                .map((r) => r.recordNumber || `${r.contextSnapshot.job.title} / ${r.contextSnapshot.item.name}`)
                                .join(', ')}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">No live records reference this version.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteVersion(v.version)}
                          disabled={pinCount > 0 || isDeleting}
                          title={pinCount > 0 ? 'Refused: a live record still pins this version.' : 'Permanently delete this version snapshot.'}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          </>
        )}
      </div>

      <FormulaHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        language={helpLanguage}
        onLanguageChange={setHelpLanguage}
        initialTab={helpTab}
      />
    </div>
  );
};

// ── Mockup / test harness sub-component ───────────────────────────────────

// Exported so it can be rendered directly in tests (no router/auth context
// needed — it only uses services + local state) rather than through the full
// admin-gated page.
export const MockupHarness: React.FC<{ template: RecorderTemplate }> = ({ template }) => {
  /**
   * The unit chosen for each 'selectable' column, exactly as a real record's
   * `CalibrationRecord.columnUnits` holds it — keyed the same way
   * (`${sectionId}_${columnId}`). The harness is where an author checks what
   * the finished sheet will look like, so it has to be able to pick these:
   * a selectable column's header is `label (chosen)` in real use, and with
   * no picker here the author could only ever preview the unpicked state.
   * Local state only — the harness saves nothing (ADR: "nothing here is
   * saved"), so this never reaches Firestore.
   */
  const [columnUnits, setColumnUnits] = useState<Record<string, string>>({});

  /** Every 'selectable' column, i.e. the ones needing a picker above. */
  const selectableUnitColumns = useMemo(() => findSelectableUnitColumns(template), [template]);

  // Resolved for the whole template, so a 'sameAs' column previews its
  // source's unit here exactly as it will in the real grid/PDF.
  const unitByKey = useMemo(() => resolveColumnUnitMap(template, columnUnits), [template, columnUnits]);

  // Phase 26 Task 1: the real RecordColumn behind each key, so the formula
  // cells below can be formatted through the shared
  // `formatColumnValueForDisplay` rather than String()'d at raw precision.
  const columnByKey = useMemo(() => {
    const map = new Map<string, RecordColumn>();
    for (const s of template.sections) {
      for (const c of s.columns) map.set(`${s.id}_${c.id}`, c);
    }
    return map;
  }, [template]);

  const columnNames = template.sections.flatMap((s) => s.columns.map((c) => {
    // Phase 15 Task 1 (superseded): the harness header shows BOTH the formula
    // variable name (what an author types into an expression — the reason
    // this surface exists) and the human heading with its unit, exactly as
    // the grid/PDF render it — including a 'selectable' column's picked unit
    // and a 'sameAs' column's inherited one, so this previews the real thing.
    const key = `${s.id}_${c.id}`;
    return {
      name: key,
      displayLabel: joinLabelAndUnit(c, unitByKey[key]),
      sectionLabel: s.label || s.id,
      type: c.type,
    };
  }));
  const envNames = Array.from({ length: template.roundCount }, (_, i) => i + 1).flatMap((r) => [
    `ENV_TEMP_R${r}`,
    `ENV_RH_R${r}`,
  ]);
  const usesStandardColumn = columnNames.some((c) => c.type === 'standard');
  // The row's own force column(s), found structurally by which STD_* the
  // expression consumes — never by name — exactly as useLiveRecalculation.ts
  // does for the record grid. Feeds checkOptionWarnings below.
  const forceColumnKeys = useMemo(
    () => findStandardDependentFormulaColumns(template).map((c) => c.key),
    [template],
  );

  const [rowInputs, setRowInputs] = useState<Array<Record<string, string>>>([{}]);
  const [envInputs, setEnvInputs] = useState<Record<string, string>>({});
  const [reportUnit, setReportUnit] = useState('');
  const [result, setResult] = useState<MockupResult | null>(null);
  const [standardWarnings, setStandardWarnings] = useState<StandardWarning[][]>([]);

  // Loaded once when the harness mounts for a template that actually has a
  // `standard` column — never for templates without one, so most templates
  // incur zero extra Firestore reads just for opening this panel.
  const [standardOptions, setStandardOptions] = useState<StandardOption[]>([]);
  const [standardOptionsLoaded, setStandardOptionsLoaded] = useState(!usesStandardColumn);
  useEffect(() => {
    if (!usesStandardColumn) { setStandardOptionsLoaded(true); return; }
    let cancelled = false;
    setStandardOptionsLoaded(false);
    loadStandardOptions().then((options) => {
      if (!cancelled) { setStandardOptions(options); setStandardOptionsLoaded(true); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesStandardColumn]);
  const standardsById = useMemo(() => optionsToStandardsById(standardOptions), [standardOptions]);
  const optionByKey = useMemo(() => new Map(standardOptions.map((o) => [o.key, o])), [standardOptions]);

  const addRow = () => setRowInputs([...rowInputs, {}]);
  const removeRow = (index: number) => setRowInputs(rowInputs.filter((_, i) => i !== index));

  const run = () => {
    const rawRows = rowInputs.map((row) => {
      const parsed: Record<string, string | number | null> = {};
      for (const col of columnNames) {
        const raw = row[col.name];
        if (raw === undefined || raw === '') { parsed[col.name] = null; continue; }
        // 'standard' stores the composite key selected from the dropdown
        // below — a string, exactly like 'text', never parsed as a number.
        parsed[col.name] = col.type === 'number' ? Number(raw) : raw;
      }
      return parsed;
    });
    const env: Record<string, string | number | null> = {};
    for (const name of envNames) {
      const raw = envInputs[name];
      env[name] = raw === undefined || raw === '' ? null : Number(raw);
    }
    // REPORT_TO_N (ADR-014 D5): null — never defaulted to N — when no report
    // unit is chosen. A formula using it then correctly reads awaiting-input,
    // the same as any other unfilled input, rather than a silently wrong 1.
    env.REPORT_TO_N = forceUnitToNewtons(reportUnit || undefined);

    const mockupResult = evaluateMockup(template, rawRows, env, standardsById);
    setResult(mockupResult);

    // checkOptionWarnings needs forces in the SAME unit space it will
    // convert FROM (Phase 14 Task 3): the row's computed force column
    // values, which — for a template correctly following ADR-014 D5 — are
    // already in the REPORT unit, not the equation's own output unit. Pass
    // `reportUnit` through so checkOptionWarnings converts before comparing
    // against rangeMin/rangeMax; passing the raw numbers uncoverted would
    // reproduce exactly the false-warning bug Task 3 fixed.
    const standardCol = columnNames.find((c) => c.type === 'standard');
    if (standardCol && standardOptions.length > 0) {
      const warnings = rawRows.map((row, i) => {
        const key = row[standardCol.name];
        if (typeof key !== 'string' || !key) return [];
        const option = optionByKey.get(key);
        if (!option) return [];
        const forces = forceColumnKeys.map((fk) => {
          const cell = mockupResult.rows[i]?.[fk];
          return cell && !cell.error && typeof cell.value === 'number' ? cell.value : null;
        });
        return checkOptionWarnings(option, forces, reportUnit || undefined);
      });
      setStandardWarnings(warnings);
    } else {
      setStandardWarnings([]);
    }
  };

  const inputColumns = columnNames.filter((c) => c.type !== 'formula');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Enter sample values and see formula columns and summary fields evaluate live — nothing here is saved.</p>
        <button type="button" onClick={run} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors flex-shrink-0">
          Evaluate
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {envNames.map((name) => (
          <div key={name} className="flex items-center gap-1">
            <label className="font-mono text-[10px] text-gray-400">{name}</label>
            <input type="number" value={envInputs[name] ?? ''} onChange={(e) => setEnvInputs({ ...envInputs, [name]: e.target.value })}
              className="input text-xs w-20" />
          </div>
        ))}
        {/*
          ADR-014 D5: REPORT_TO_N is the other half of
          polynomial(R) * STD_TO_N / REPORT_TO_N. Always offered — a formula
          can reference it whether or not this template also has env rounds
          or a standard column. Left unset by default — never defaulted to N
          — since a real record's reporting unit is never assumed either
          (ADR-014 Phase 14 Task 2).
        */}
        <div className="flex items-center gap-1">
          <label className="font-mono text-[10px] text-gray-400">REPORT_TO_N (unit)</label>
          <select aria-label="Report unit" value={reportUnit} onChange={(e) => setReportUnit(e.target.value)} className="input text-xs w-20">
            <option value="">—</option>
            {FORCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/*
          Phase 15 Task 1 (superseded): the same per-column unit choice a
          technician makes on a real record, so the header above previews
          `label (chosen)` rather than only ever the unpicked state. Display
          only — picking one changes NO computed value (the non-negotiable
          invariant); it moves the header text and nothing else.
        */}
        {selectableUnitColumns.map(({ key, column }) => (
          <div key={key} className="flex items-center gap-1">
            <label className="text-[10px] text-gray-400">{column.label || column.id} (unit)</label>
            <select
              aria-label={`${key} unit`}
              value={columnUnits[key] ?? ''}
              onChange={(e) => setColumnUnits({ ...columnUnits, [key]: e.target.value })}
              className="input text-xs w-20"
            >
              <option value="">—</option>
              {(column.unitChoices ?? []).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        ))}
      </div>

      {usesStandardColumn && standardOptionsLoaded && standardOptions.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          No equipment is flagged as a reference standard yet. Go to Equipment → select a device → turn on
          "Usable as Reference Standard", then add a Conversion Equation, to test this column.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              {inputColumns.map((c, cIdx) => (
                // Keyed by index too: two columns can share one composite
                // `name` while the draft is mid-edit (a duplicate Column ID
                // not yet renamed — verifyTemplate flags it at Verify time,
                // but nothing stops the state existing transiently), which
                // would otherwise collide as a React key.
                <th key={`${c.name}-${cIdx}`} className="text-left px-2 py-1 border-b border-gray-200 align-bottom">
                  <div className="font-sans font-medium text-gray-700 whitespace-nowrap">{c.displayLabel}</div>
                  <div className="font-sans font-normal text-[10px] text-gray-400 whitespace-nowrap">{c.sectionLabel}</div>
                  <div className="font-mono font-medium text-gray-500">{c.name}</div>
                </th>
              ))}
              {columnNames.filter((c) => c.type === 'formula').map((c, cIdx) => (
                <th key={`${c.name}-${cIdx}`} className="text-left px-2 py-1 border-b border-gray-200 align-bottom">
                  <div className="font-sans font-medium text-indigo-700 whitespace-nowrap">{c.displayLabel}</div>
                  <div className="font-sans font-normal text-[10px] text-gray-400 whitespace-nowrap">{c.sectionLabel}</div>
                  <div className="font-mono font-medium text-indigo-500">{c.name}</div>
                </th>
              ))}
              <th className="px-2 py-1 border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {rowInputs.map((row, rIdx) => (
              <tr key={rIdx}>
                {inputColumns.map((c, cIdx) => (
                  <td key={`${c.name}-${cIdx}`} className="px-2 py-1 border-b border-gray-100">
                    {c.type === 'standard' ? (
                      // Stored value is the composite key, exactly as the
                      // real recording grid stores it (ADR-014 D3) — the
                      // dropdown DISPLAYS the label, never the raw key.
                      // "no standard selected" is a real, testable state
                      // (ADR-010: every STD_* then reads awaiting-input).
                      <select
                        aria-label={`${c.name} (row ${rIdx + 1})`}
                        value={row[c.name] ?? ''}
                        onChange={(e) => {
                          const next = [...rowInputs];
                          next[rIdx] = { ...next[rIdx], [c.name]: e.target.value };
                          setRowInputs(next);
                        }}
                        className="input text-xs w-32"
                      >
                        <option value="">— none —</option>
                        {standardOptions.map((o) => (
                          <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={`${c.name} (row ${rIdx + 1})`}
                        type={c.type === 'number' ? 'number' : 'text'} value={row[c.name] ?? ''}
                        onChange={(e) => {
                          const next = [...rowInputs];
                          next[rIdx] = { ...next[rIdx], [c.name]: e.target.value };
                          setRowInputs(next);
                        }}
                        className="input text-xs w-24" />
                    )}
                  </td>
                ))}
                {columnNames.filter((c) => c.type === 'formula').map((c, cIdx) => {
                  const cell = result?.rows[rIdx]?.[c.name];
                  return (
                    <td key={`${c.name}-${cIdx}`} data-testid={`${c.name}-row${rIdx}`} className="px-2 py-1 border-b border-gray-100 font-mono">
                      {!cell ? (
                        <span className="text-gray-300">—</span>
                      ) : cell.error ? (
                        <span className={cell.error.kind === 'awaiting-input' ? 'text-gray-400' : 'text-red-600 font-semibold'} title={cell.error.message}>
                          {cell.error.kind === 'awaiting-input' ? '…' : '⚠'}
                        </span>
                      ) : (
                        // Phase 26 Task 1: the harness is where an author checks
                        // what the finished sheet looks like, so it must apply the
                        // SAME display format the grid and PDF will — otherwise it
                        // previews a precision the real record never shows.
                        <span className="text-gray-900">{formatColumnValueForDisplay(cell.value as number | string | null, columnByKey.get(c.name) ?? { id: '', label: '', order: 0, type: 'formula' })}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 border-b border-gray-100">
                  {rowInputs.length > 1 && (
                    <button type="button" onClick={() => removeRow(rIdx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="text-xs font-medium text-primary-600 hover:text-primary-700">+ Add row</button>

      {standardWarnings.some((w) => w.length > 0) && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
          {standardWarnings.flatMap((warnings, rIdx) =>
            warnings.map((w, wIdx) => (
              <p key={`${rIdx}-${wIdx}`} className="text-xs text-amber-800">
                <span className="font-semibold">Row {rIdx + 1}:</span> {w.message}
              </p>
            )),
          )}
        </div>
      )}

      {template.summaryFields.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 mb-2">Summary</p>
          <div className="flex flex-wrap gap-3">
            {template.summaryFields.map((field) => {
              const cell = result?.summary[field.id];
              return (
                <div key={field.id} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-mono text-gray-400">SUMMARY_{field.id}</p>
                  {!cell ? (
                    <p className="text-xs text-gray-300">—</p>
                  ) : cell.error ? (
                    <p className={`text-xs ${cell.error.kind === 'awaiting-input' ? 'text-gray-400' : 'text-red-600 font-semibold'}`} title={cell.error.message}>
                      {cell.error.kind === 'awaiting-input' ? 'awaiting input' : `error: ${cell.error.message}`}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-gray-900">{String(cell.value)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
