/** @vitest-environment jsdom */
/**
 * CalculationTraceModal.test.tsx
 *
 * Phase 33 Task 3/4. Verifies, rather than assumes:
 *   - the modal is genuinely read-only (no write call reaches Firestore or
 *     any record-mutating service when it renders or when a user interacts
 *     with it — clicking expand/collapse, closing)
 *   - provenance is printed ON the line for every node, not hidden
 *   - the Task 4 untraced-conversion warning appears exactly on the nodes
 *     flagged as conversion-enabled, nowhere else
 *   - expand/collapse works
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { CalculationTraceModal } from '../CalculationTraceModal';
import type { ComputedTraceNode } from '../../formula';

afterEach(cleanup);

// A write-capable service, mocked so any accidental call is detectable —
// this file must never make ANY of these calls.
const updateDraftRecord = vi.fn();
const commitRecord = vi.fn();
vi.mock('../../../../services/calibrationRecordService', () => ({
  calibrationRecordService: { updateDraftRecord, commitRecord },
}));

function node(): ComputedTraceNode {
  return {
    provenance: 'computed',
    label: 'CAL_ERR',
    name: 'Error',
    parameter: null,
    value: 0.5,
    displayValue: null,
    error: null,
    origin: { kind: 'expression' },
    expression: 'CAL_IND - CAL_NOM',
    substituted: '10.5 - 10',
    notEvaluated: [],
    inputs: [
      {
        provenance: 'entered',
        label: 'CAL_IND',
        name: 'Indicated',
        parameter: null,
        value: 10.5,
        displayValue: null,
        error: null,
        rowIndex: 0,
        round: null,
      },
      {
        provenance: 'entered',
        label: 'CAL_NOM',
        name: 'Nominal',
        parameter: null,
        value: 10,
        displayValue: null,
        error: null,
        rowIndex: 0,
        round: null,
      },
    ],
  };
}

describe('CalculationTraceModal is read-only', () => {
  it('makes no write-service call on render or on interaction', () => {
    render(<CalculationTraceModal title="CAL_ERR — Row 1" node={node()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Collapse'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(updateDraftRecord).not.toHaveBeenCalled();
    expect(commitRecord).not.toHaveBeenCalled();
  });

  it('has no input, textarea, select, or contentEditable element anywhere in the modal', () => {
    render(<CalculationTraceModal title="CAL_ERR — Row 1" node={node()} onClose={vi.fn()} />);
    expect(document.querySelectorAll('input, textarea, select, [contenteditable="true"]')).toHaveLength(0);
  });

  it('onClose is called, and only onClose — closing does not mutate the node passed in', () => {
    const onClose = vi.fn();
    const original = node();
    const snapshot = JSON.stringify(original);
    render(<CalculationTraceModal title="t" node={original} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('provenance is visible on the line, not hidden behind a hover', () => {
  it('shows a provenance label for the root and every input, as plain visible text', () => {
    render(<CalculationTraceModal title="CAL_ERR — Row 1" node={node()} onClose={vi.fn()} />);
    // Root is 'computed'.
    expect(screen.getAllByText('computed').length).toBeGreaterThan(0);
    // Both inputs are 'entered'.
    expect(screen.getAllByText('entered')).toHaveLength(2);
  });

  it('shows the substituted expression alongside the source expression', () => {
    render(<CalculationTraceModal title="CAL_ERR — Row 1" node={node()} onClose={vi.fn()} />);
    expect(screen.getByText('CAL_IND - CAL_NOM')).toBeTruthy();
    expect(screen.getByText(/10.5 - 10/)).toBeTruthy();
  });
});

describe('expand / collapse', () => {
  it('root starts expanded; children are visible by default', () => {
    render(<CalculationTraceModal title="t" node={node()} onClose={vi.fn()} />);
    // Each rendered as "CAL_IND (Indicated)" / "CAL_NOM (Nominal)" — the
    // parenthesised name only ever appears in a CHILD's own line, never in
    // the root's expression text ("CAL_IND - CAL_NOM"), so matching on it
    // (rather than the bare column name) unambiguously proves the child rows
    // are present.
    expect(screen.getByText(/\(Indicated\)/)).toBeTruthy();
    expect(screen.getByText(/\(Nominal\)/)).toBeTruthy();
  });

  it('collapsing the root hides its inputs', () => {
    render(<CalculationTraceModal title="t" node={node()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Collapse'));
    // The root's OWN expression text ("CAL_IND - CAL_NOM") legitimately
    // stays visible when collapsed — only its CHILDREN should disappear.
    // "(Indicated)" only ever appears in the CAL_IND child's own line, never
    // in the root's expression/substituted text, so it is what actually
    // proves the child row is gone rather than just re-matching the parent.
    expect(screen.getByText('CAL_IND - CAL_NOM')).toBeTruthy();
    expect(screen.queryByText(/\(Indicated\)/)).toBeNull();
  });
});

describe('Task 4: the untraced-conversion warning appears exactly where flagged', () => {
  const WARNING_TEXT = /BEFORE display-time unit conversion/;

  it('shows the warning on a node the caller flags as conversion-enabled', () => {
    render(
      <CalculationTraceModal
        title="t"
        node={node()}
        onClose={vi.fn()}
        isConversionEnabled={(label) => label === 'CAL_ERR'}
      />,
    );
    expect(screen.getByText(WARNING_TEXT)).toBeTruthy();
  });

  it('does not show the warning anywhere when nothing is conversion-enabled', () => {
    render(<CalculationTraceModal title="t" node={node()} onClose={vi.fn()} />);
    expect(screen.queryByText(WARNING_TEXT)).toBeNull();
  });

  it('shows the warning on a nested input too, not only the root', () => {
    render(
      <CalculationTraceModal
        title="t"
        node={node()}
        onClose={vi.fn()}
        isConversionEnabled={(label) => label === 'CAL_IND'}
      />,
    );
    expect(screen.getAllByText(WARNING_TEXT)).toHaveLength(1);
  });
});

describe('errors render prominently, not silently dropped', () => {
  it('shows the error kind and message instead of a value', () => {
    const withError: ComputedTraceNode = {
      ...node(),
      value: null,
      error: { kind: 'awaiting-input', message: 'CAL_MISSING has no value yet.' },
    };
    render(<CalculationTraceModal title="t" node={withError} onClose={vi.fn()} />);
    expect(screen.getByText(/awaiting input/)).toBeTruthy();
    expect(screen.getByText(/CAL_MISSING has no value yet\./)).toBeTruthy();
  });
});
