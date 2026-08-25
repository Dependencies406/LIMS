/** @vitest-environment jsdom */
/**
 * FormulaSuggestPopup.test.tsx
 *
 * Component-level tests (required tests 11 and 12): typing filters the
 * list, Up/Down moves the selection, Escape dismisses, a click accepts, the
 * closed popup never intercepts Enter, and the popup renders through a
 * portal rather than as a descendant of the input's own container.
 *
 * No Firebase mock needed — FormulaSuggestPopup only imports
 * formulaSuggestions.ts and formulaCaretInsert.ts, neither of which touches
 * Firestore.
 */

import React, { useRef, useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormulaSuggestPopup } from '../FormulaSuggestPopup';
import type { FormulaAuthoringContext, SuggestionsTemplate } from '../../services/formulaSuggestions';

afterEach(cleanup);

function fixtureTemplate(): SuggestionsTemplate {
  return {
    roundCount: 1,
    sections: [
      {
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: '' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
  };
}

/**
 * Mirrors exactly how RecorderTemplateBuilderPage.tsx wires this up: a
 * plain controlled <input> the popup doesn't own, reached through a ref
 * getter, INSIDE a container marked as the "scrolling column card" so test
 * 12 (portal, not a descendant) has something real to assert against.
 */
function Harness({ context = { kind: 'row', sectionId: 'CAL', columnId: 'ERR' } as FormulaAuthoringContext }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div data-testid="scrolling-column-card" style={{ overflow: 'auto' }}>
      <input aria-label="formula input" ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} />
      <FormulaSuggestPopup
        getInput={() => inputRef.current}
        onChange={setValue}
        context={context}
        template={fixtureTemplate()}
        hasStandardColumn={false}
      />
    </div>
  );
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText('formula input') as HTMLInputElement;
}

/** Types text by setting the DOM value directly (matches a real keystroke's end state) then firing the events the component listens for. */
function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  fireEvent.input(input);
}

describe('FormulaSuggestPopup — typing filters the list', () => {
  it('shows matching suggestions once a token is typed', () => {
    render(<Harness />);
    type(getInput(), 'ROU');
    expect(screen.getByRole('option', { name: /ROUND/ })).toBeTruthy();
  });

  it('narrows further as more is typed', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'CAL_N');
    expect(screen.getByRole('listbox').textContent).toContain('CAL_NOM');
    expect(screen.getByRole('listbox').textContent).not.toContain('CAL_IND');
  });

  it('shows nothing (no listbox) when the caret is not touching an identifier', () => {
    render(<Harness />);
    type(getInput(), '1 + ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('FormulaSuggestPopup — keyboard navigation', () => {
  it('ArrowDown moves the selection to the next option', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'CAL_'); // matches CAL_NOM, CAL_IND, CAL_ERR (self, disabled) — at least two enabled options
    const before = screen.getByRole('listbox').querySelector('[aria-selected="true"]')?.textContent;
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const after = screen.getByRole('listbox').querySelector('[aria-selected="true"]')?.textContent;
    expect(after).not.toBe(before);
  });

  it('ArrowDown does not scroll the page or otherwise leak (preventDefault called)', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'CAL_');
    const event = fireEvent.keyDown(input, { key: 'ArrowDown', cancelable: true });
    expect(event).toBe(false); // fireEvent returns false when preventDefault() was called
  });

  it('Enter accepts the currently selected suggestion and inserts it', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'ROU');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('ROUND(');
  });

  it('Escape dismisses the popup without changing the input value', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'ROU');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('ROU');
  });
});

describe('FormulaSuggestPopup — a click accepts', () => {
  it('clicking an option inserts it and replaces the typed prefix', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'ROU');
    fireEvent.click(screen.getByRole('option', { name: /ROUND/ }));
    expect(input.value).toBe('ROUND(');
  });

  it('a disabled option (the formula\'s own column) is not clickable', () => {
    render(<Harness />);
    const input = getInput();
    type(input, 'CAL_ERR');
    const option = screen.queryByRole('option', { name: /CAL_ERR/ });
    expect(option).toBeTruthy();
    expect((option as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(option!);
    expect(input.value).toBe('CAL_ERR'); // unchanged — click on a disabled option is a no-op
  });
});

describe('FormulaSuggestPopup — closed popup never intercepts Enter (test 10)', () => {
  it('Enter with no popup open does not call preventDefault, and does not alter the value', () => {
    render(<Harness />);
    const input = getInput();
    type(input, '1 + '); // no token under caret — popup stays closed
    expect(screen.queryByRole('listbox')).toBeNull();
    const event = fireEvent.keyDown(input, { key: 'Enter', cancelable: true });
    expect(event).toBe(true); // NOT prevented — normal Enter behaviour (e.g. form submit) is untouched
    expect(input.value).toBe('1 + ');
  });

  it('Enter on a fresh, never-typed-into input is not intercepted either', () => {
    render(<Harness />);
    const input = getInput();
    input.focus();
    const event = fireEvent.keyDown(input, { key: 'Enter', cancelable: true });
    expect(event).toBe(true);
  });
});

describe('FormulaSuggestPopup — renders through a portal (test 12)', () => {
  it('the listbox is NOT a descendant of the scrolling column card', () => {
    render(<Harness />);
    type(getInput(), 'ROU');
    const listbox = screen.getByRole('listbox');
    const card = screen.getByTestId('scrolling-column-card');
    expect(card.contains(listbox)).toBe(false);
  });

  it('the listbox IS a descendant of document.body directly', () => {
    render(<Harness />);
    type(getInput(), 'ROU');
    const listbox = screen.getByRole('listbox');
    expect(document.body.contains(listbox)).toBe(true);
    // Its own parent chain should reach body without passing back through the app root.
    expect(listbox.closest('[data-testid="scrolling-column-card"]')).toBeNull();
  });
});

describe('FormulaSuggestPopup — context correctness through the real component', () => {
  it('summary context offers column aggregates', () => {
    render(<Harness context={{ kind: 'summary', fieldId: 'X' }} />);
    type(getInput(), 'col_m');
    expect(screen.getByRole('listbox').textContent).toContain('col_mean');
  });

  it('function-body context offers only params + builtins, never a column', () => {
    render(<Harness context={{ kind: 'function', params: ['a', 'b'] }} />);
    type(getInput(), 'a');
    expect(screen.getByRole('listbox').textContent).toContain('a');
    expect(screen.getByRole('listbox').textContent).not.toContain('CAL_');
  });
});

describe('FormulaSuggestPopup — signature hint', () => {
  it('shows a signature hint while the caret is inside a call\'s parens', () => {
    render(<Harness />);
    type(getInput(), 'ROUND(1.5, ');
    expect(screen.getByText('ROUND(value, decimals)')).toBeTruthy();
  });
});
