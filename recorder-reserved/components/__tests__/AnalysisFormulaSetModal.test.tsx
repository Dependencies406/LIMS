/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { AnalysisFormulaSetModal } from '../AnalysisFormulaSetModal';
import { FORCE_ISO7500_1_FORMULA_SET } from '../../modules/data-recorder/analysis/formulaEngine';

// No @testing-library/jest-dom in this project's test setup (verified: no
// setupFiles configured) — every assertion below uses plain DOM properties
// / vitest's built-in matchers (toBeNull/toBeTruthy/toBe), not toBeDisabled()
// or toBeInTheDocument().

afterEach(cleanup);

function renderModal(onSave = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(
    <AnalysisFormulaSetModal
      isOpen
      onClose={onClose}
      currentFormulaSet={FORCE_ISO7500_1_FORMULA_SET}
      onSave={onSave}
    />,
  );
  return { onClose, onSave };
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
}

function getExpressionInput(stepName: string): HTMLInputElement {
  // .font-semibold uniquely identifies the step-name label span — plain
  // `getByText(stepName, { selector: 'span' })` is ambiguous because a step
  // referenced as another step's INPUT is also rendered as a <span> chip
  // (e.g. 'q1' is both a step label and an input chip on qAvg/b/sd).
  const label = screen.getByText(stepName, { selector: 'span.font-semibold' });
  const row = label.closest('.flex.items-start.gap-2') as HTMLElement;
  return within(row).getByRole('textbox') as HTMLInputElement;
}

describe('AnalysisFormulaSetModal', () => {
  it('renders nothing when closed', () => {
    render(
      <AnalysisFormulaSetModal
        isOpen={false}
        onClose={vi.fn()}
        currentFormulaSet={FORCE_ISO7500_1_FORMULA_SET}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText('Analysis Formulas')).toBeNull();
  });

  it('shows all 19 seeded steps with their current expressions', () => {
    renderModal();
    for (const step of FORCE_ISO7500_1_FORMULA_SET.steps) {
      expect(getExpressionInput(step.name).value).toBe(step.expression);
    }
  });

  it('Save is disabled with no changes made', () => {
    renderModal();
    expect(getSaveButton().disabled).toBe(true);
  });

  it('Save stays disabled and shows an error when a formula fails to parse', () => {
    renderModal();
    const input = getExpressionInput('b');
    fireEvent.change(input, { target: { value: 'MAX(q1, q2, q3' } }); // unclosed paren
    expect(getSaveButton().disabled).toBe(true);
    expect(screen.getByText(/Fix these before saving/i)).toBeTruthy();
  });

  it('Save stays disabled when a formula references an undeclared variable', () => {
    renderModal();
    const input = getExpressionInput('a');
    fireEvent.change(input, { target: { value: 'calPoint + bogusVar' } });
    expect(getSaveButton().disabled).toBe(true);
    expect(screen.getAllByText(/bogusVar/).length).toBeGreaterThan(0);
  });

  it('Save enables for a valid, changed formula and shows the preview diff', () => {
    renderModal();
    const input = getExpressionInput('b');
    // Original: MAX(q1,q2,q3) - MIN(q1,q2,q3). A deliberately different
    // (still valid) formula so the preview must show changed cells.
    fireEvent.change(input, { target: { value: 'ABS(q1 - q3)' } });
    expect(getSaveButton().disabled).toBe(false);
    expect(screen.queryByText(/Fix these before saving/i)).toBeNull();
  });

  it('calls onSave with the edited FormulaSet and closes on save', async () => {
    const { onSave, onClose } = renderModal();
    const input = getExpressionInput('b');
    fireEvent.change(input, { target: { value: 'ABS(q1 - q3)' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.steps.find((s: { name: string }) => s.name === 'b').expression).toBe('ABS(q1 - q3)');
    // every other step is untouched
    expect(saved.steps.filter((s: { name: string }) => s.name !== 'b')).toEqual(
      FORCE_ISO7500_1_FORMULA_SET.steps.filter((s) => s.name !== 'b'),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Cancel discards edits without calling onSave', () => {
    const { onClose, onSave } = renderModal();
    const input = getExpressionInput('b');
    fireEvent.change(input, { target: { value: 'ABS(q1 - q3)' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a formula that parses but throws on the preview data blocks Save with a runtime error message', () => {
    renderModal();
    // resolution is never 0 in the preview data's raw inputs, but calPoint IS
    // 0 on the zero row — dividing by it unguarded throws in the evaluator.
    const input = getExpressionInput('a');
    fireEvent.change(input, { target: { value: 'resolution / calPoint * 100' } });
    expect(getSaveButton().disabled).toBe(true);
    expect(screen.getByText(/fails to evaluate on the preview data/i)).toBeTruthy();
  });
});
