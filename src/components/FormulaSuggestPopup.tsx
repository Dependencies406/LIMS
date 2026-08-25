/**
 * FormulaSuggestPopup.tsx
 *
 * Autocomplete for a plain formula `<input>`, attached imperatively rather
 * than owning the input's own JSX — the page keeps full control of the
 * input (value/onChange/ref/title all stay exactly as they were), and this
 * component just listens to it and drops a suggestion list next to it.
 *
 * RENDERED THROUGH A PORTAL TO document.body — not optional. The column
 * formula input lives inside `flex items-start gap-2 overflow-x-auto` (the
 * Phase 16 landscape row): per CSS, an explicit overflow-x forces the
 * computed overflow-y to `auto` too, so anything absolutely-positioned
 * INSIDE that row can be clipped once the row's height is ever constrained.
 * A portal sidesteps the question entirely — the popup is a sibling of the
 * row, not a descendant, positioned with `position: fixed` against the
 * input's own `getBoundingClientRect()`, which is always viewport-relative
 * regardless of what scrolls or clips its ancestors.
 *
 * Reads text/caret straight off the DOM node (`getInput().value` /
 * `.selectionStart`), never off a `value` prop — a controlled input's
 * fresh-this-keystroke DOM state is available synchronously inside the same
 * native event that will eventually produce the next React render, so
 * reading the DOM directly avoids any stale-closure timing question.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getFormulaSuggestions,
  insertionTextFor,
  type FormulaAuthoringContext,
  type FormulaSuggestion,
  type SuggestionsTemplate,
} from '../services/formulaSuggestions';
import { insertAtCursor } from '../utils/formulaCaretInsert';

export interface FormulaSuggestPopupProps {
  /** Resolves the live input DOM node — matches the existing `xInputRefs.current.get(key)` pattern already used for the Phase 10 disclosure. */
  getInput: () => HTMLInputElement | null;
  onChange: (next: string) => void;
  context: FormulaAuthoringContext;
  template: SuggestionsTemplate;
  hasStandardColumn: boolean;
}

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 240;
const GAP = 4;

interface Position {
  left: number;
  top: number;
  placement: 'below' | 'above';
}

function computePosition(inputRect: DOMRect): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = inputRect.left;
  if (left + POPUP_WIDTH > viewportWidth - GAP) {
    // Flip: align the popup's RIGHT edge to the input's right edge instead
    // — the case a column near the right side of a horizontally-scrolled
    // section needs, so the popup never runs off-screen.
    left = Math.max(GAP, inputRect.right - POPUP_WIDTH);
  }
  left = Math.max(GAP, Math.min(left, viewportWidth - POPUP_WIDTH - GAP));

  let top = inputRect.bottom + GAP;
  let placement: Position['placement'] = 'below';
  if (top + POPUP_MAX_HEIGHT > viewportHeight - GAP) {
    const aboveTop = inputRect.top - GAP - POPUP_MAX_HEIGHT;
    if (aboveTop >= GAP) {
      top = aboveTop;
      placement = 'above';
    } else {
      // Neither direction has full room — clamp to stay fully on-screen
      // rather than let either edge run off it.
      top = Math.max(GAP, viewportHeight - POPUP_MAX_HEIGHT - GAP);
    }
  }

  return { left, top, placement };
}

let idCounter = 0;

export const FormulaSuggestPopup: React.FC<FormulaSuggestPopupProps> = ({
  getInput,
  onChange,
  context,
  template,
  hasStandardColumn,
}) => {
  const listboxId = useMemo(() => `formula-suggest-${(idCounter += 1)}`, []);
  const [suggestions, setSuggestions] = useState<FormulaSuggestion[]>([]);
  const [signatureHint, setSignatureHint] = useState<ReturnType<typeof getFormulaSuggestions>['signatureHint']>(null);
  const [caretRange, setCaretRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [showList, setShowList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  // Escape closes the popup for THIS token; typing further or moving the
  // caret to a different token clears it again (tracked by comparing the
  // token's own [start, end) bounds, not just the caret offset, so
  // re-triggering after a keystroke inside the same word doesn't reopen
  // something the author just dismissed on purpose).
  const dismissedForToken = useRef<string | null>(null);

  const open = showList || signatureHint !== null;

  // Live-state refs for the native listeners below: the listener-attach
  // effect runs ONCE per mount (this component is one per formula input,
  // matching the existing ref-map pattern — its `getInput` target doesn't
  // change across the component's own lifetime), so the closures inside it
  // read these refs rather than capturing stale state from the render that
  // installed them.
  const openRef = useRef(open);
  const showListRef = useRef(showList);
  const suggestionsRef = useRef(suggestions);
  const selectedIndexRef = useRef(selectedIndex);
  openRef.current = open;
  showListRef.current = showList;
  suggestionsRef.current = suggestions;
  selectedIndexRef.current = selectedIndex;

  function tokenKey(start: number, end: number): string {
    return `${start}:${end}`;
  }

  function refresh() {
    const input = getInput();
    if (!input) return;
    const text = input.value;
    const caretOffset = input.selectionStart ?? text.length;
    const result = getFormulaSuggestions({ text, caretOffset, context, template, hasStandardColumn });

    const key = tokenKey(result.caret.tokenStart, result.caret.tokenEnd);
    if (dismissedForToken.current !== null && dismissedForToken.current !== key) {
      dismissedForToken.current = null;
    }
    const dismissed = dismissedForToken.current === key;

    setCaretRange({ start: result.caret.tokenStart, end: result.caret.tokenEnd });
    setSignatureHint(dismissed ? null : result.signatureHint);
    const listShouldShow = !dismissed
      && result.suggestions.length > 0
      && (result.caret.tokenPrefix.length > 0 || result.caret.isAggregateArgumentPosition);
    setShowList(listShouldShow);
    setSuggestions(result.suggestions);
    setSelectedIndex(0);
  }

  function dismiss() {
    dismissedForToken.current = tokenKey(caretRange.start, caretRange.end);
    setShowList(false);
    setSignatureHint(null);
  }

  function accept(suggestion: FormulaSuggestion) {
    if (suggestion.disabled) return;
    const input = getInput();
    if (!input) return;
    const text = insertionTextFor(suggestion);
    insertAtCursor(input, input.value, onChange, text, caretRange);
    setShowList(false);
    setSignatureHint(null);
    // The just-accepted token is fully replaced, not merely edited — start
    // clean rather than re-suppressing whatever comes next.
    dismissedForToken.current = null;
  }

  // "Latest ref" pattern: the listener-attach effect below runs ONCE per
  // mount (stable `getInput` target for this component's lifetime), but
  // refresh/dismiss/accept close over per-render state — storing the
  // current versions here lets the one-time listeners always call the
  // freshest implementation instead of the first render's stale closure.
  const refreshRef = useRef(refresh);
  const dismissRef = useRef(dismiss);
  const acceptRef = useRef(accept);
  refreshRef.current = refresh;
  dismissRef.current = dismiss;
  acceptRef.current = accept;

  // ── Attach to the input imperatively — this component doesn't own the
  // input's JSX, only enhances a node the page already renders. Runs once
  // per mount; every handler reads live state through the refs above. ────
  useEffect(() => {
    const input = getInput();
    if (!input) return undefined;

    const handleTextEvent = () => refreshRef.current();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!openRef.current) return; // closed popup must never intercept Enter/etc. — normal input behaviour applies
      const currentSuggestions = suggestionsRef.current;
      if (e.key === 'ArrowDown') {
        if (!showListRef.current) return;
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % currentSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        if (!showListRef.current) return;
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + currentSuggestions.length) % currentSuggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (!showListRef.current || currentSuggestions.length === 0) return; // only a hint is showing — let Enter/Tab behave normally
        e.preventDefault();
        acceptRef.current(currentSuggestions[selectedIndexRef.current]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dismissRef.current();
      }
    };
    const handleBlur = () => {
      setShowList(false);
      setSignatureHint(null);
    };

    input.addEventListener('input', handleTextEvent);
    input.addEventListener('click', handleTextEvent);
    input.addEventListener('keyup', handleTextEvent);
    input.addEventListener('focus', handleTextEvent);
    input.addEventListener('keydown', handleKeyDown);
    input.addEventListener('blur', handleBlur);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listboxId);

    return () => {
      input.removeEventListener('input', handleTextEvent);
      input.removeEventListener('click', handleTextEvent);
      input.removeEventListener('keyup', handleTextEvent);
      input.removeEventListener('focus', handleTextEvent);
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('blur', handleBlur);
      input.removeAttribute('role');
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-activedescendant');
    };
    // Deliberately mount-once: this component's `getInput` target is one
    // formula input for its whole lifetime (same contract as the existing
    // columnFormulaInputRefs/summaryFieldInputRefs maps), so there is
    // nothing to re-attach to. Every handler above reads live state through
    // the refs, not through this closure, so it stays correct without
    // needing to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // aria-expanded / aria-activedescendant reflect the current open/selected
  // state — updated separately from the listener-attach effect above so
  // toggling them doesn't require tearing down and reattaching listeners.
  useEffect(() => {
    const input = getInput();
    if (!input) return;
    input.setAttribute('aria-expanded', String(open));
    if (open && showList && suggestions[selectedIndex]) {
      input.setAttribute('aria-activedescendant', `${listboxId}-option-${selectedIndex}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  });

  // ── Position: recompute whenever opened, and on any scroll (capture:
  // true catches scroll on the horizontal column row too — 'scroll' does
  // not bubble to window, only capture-phase listeners see it) or resize. ─
  useEffect(() => {
    if (!open) { setPosition(null); return undefined; }
    const update = () => {
      const input = getInput();
      if (input) setPosition(computePosition(input.getBoundingClientRect()));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !position) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', left: position.left, top: position.top, width: POPUP_WIDTH, maxHeight: POPUP_MAX_HEIGHT }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto text-xs"
    >
      {signatureHint && (
        <div className="px-2.5 py-1.5 border-b border-gray-100 bg-gray-50 font-mono text-[11px] text-gray-700">
          {signatureHint.signature}
          {signatureHint.description && (
            <p className="font-sans text-[10px] text-gray-400 mt-0.5 whitespace-normal">{signatureHint.description}</p>
          )}
        </div>
      )}
      {showList && (
        <ul role="listbox" id={listboxId} className="py-1">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}-${s.name}`} role="presentation">
              <button
                type="button"
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === selectedIndex}
                disabled={s.disabled}
                title={s.disabled ? s.disabledReason : s.description}
                onMouseDown={(e) => e.preventDefault()} // keep focus on the input — a real blur would close the popup before the click registers
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => accept(s)}
                className={`w-full flex items-center gap-2 px-2.5 py-1 text-left ${
                  s.disabled
                    ? 'text-gray-300 cursor-not-allowed line-through'
                    : i === selectedIndex ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`font-mono text-[11px] flex-shrink-0 ${s.disabled ? '' : 'text-primary-700'}`}>{s.name}</span>
                <span className="text-[9px] uppercase tracking-wide text-gray-300 flex-shrink-0">{s.kind}</span>
                <span className="text-gray-400 truncate">{s.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
};

export default FormulaSuggestPopup;
