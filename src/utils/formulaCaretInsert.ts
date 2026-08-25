/**
 * formulaCaretInsert.ts
 *
 * The one caret-insertion path for every formula input — the Phase 10
 * variable disclosure and the Phase 11 autocomplete popup both call this,
 * rather than each keeping its own copy (the autocomplete phase's explicit
 * constraint: "Reuse the existing insertAtCursor rather than writing a
 * second caret path"). Originally a private closure inside
 * RecorderTemplateBuilderPage.tsx; moved here unchanged so a module outside
 * that page (formulaSuggestPopup.tsx) can call the SAME function instead of
 * reimplementing it.
 */

/**
 * Splices `text` into `currentValue` and repositions the caret after it.
 *
 * Default behaviour (no `range`): inserts at the input's CURRENT selection —
 * this is the Phase 10 disclosure's path, click a variable, it lands
 * wherever the cursor already was.
 *
 * With `range`: replaces that exact [start, end) span instead of the live
 * selection — this is the autocomplete path, where the span is the
 * identifier token being typed (e.g. typing "ROU" and accepting "ROUND"
 * must replace "ROU", not insert a second copy after it).
 */
export function insertAtCursor(
  input: HTMLInputElement | null | undefined,
  currentValue: string,
  setValue: (next: string) => void,
  text: string,
  range?: { start: number; end: number },
): void {
  if (!input) {
    setValue(currentValue + text);
    return;
  }
  const start = range?.start ?? input.selectionStart ?? currentValue.length;
  const end = range?.end ?? input.selectionEnd ?? currentValue.length;
  const next = currentValue.slice(0, start) + text + currentValue.slice(end);
  setValue(next);
  const cursor = start + text.length;
  // The input's value updates on the next render; restore focus/cursor after.
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });
}
