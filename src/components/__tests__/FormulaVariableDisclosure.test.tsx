/** @vitest-environment jsdom */
/**
 * FormulaVariableDisclosure.test.tsx
 *
 * Phase 10 Task 7: the disclosure is closed by default (near-zero visual
 * weight), clicking a name calls onInsert, and a disabled (self-reference)
 * entry cannot be clicked.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormulaVariableDisclosure } from '../FormulaVariableDisclosure';
import type { FormulaVariableGroup } from '../../services/formulaVariableList';

afterEach(cleanup);

const GROUPS: FormulaVariableGroup[] = [
  {
    label: "This row's columns",
    entries: [
      { name: 'CAL_NOM', title: 'Nominal' },
      { name: 'CAL_ERR', title: 'Error', disabled: true },
    ],
  },
  {
    label: 'Environment',
    entries: [{ name: 'ENV_TEMP_R1', title: 'Temperature, round 1' }],
  },
];

describe('FormulaVariableDisclosure — closed by default (near-zero default visual weight)', () => {
  it('does not render any variable names until opened', () => {
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={() => {}} />);
    expect(screen.queryByText('CAL_NOM')).toBeNull();
  });

  it('shows exactly one line — the toggle — when closed', () => {
    const { container } = render(<FormulaVariableDisclosure groups={GROUPS} onInsert={() => {}} />);
    expect(container.querySelectorAll('button').length).toBe(1);
    expect(screen.getByText(/Variables you can use/)).toBeTruthy();
  });

  it('renders nothing at all when every group is empty', () => {
    const { container } = render(<FormulaVariableDisclosure groups={[{ label: 'Empty', entries: [] }]} onInsert={() => {}} />);
    expect(container.textContent).toBe('');
  });
});

describe('FormulaVariableDisclosure — opened', () => {
  it('shows every entry once the toggle is clicked', () => {
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={() => {}} />);
    fireEvent.click(screen.getByText(/Variables you can use/));
    expect(screen.getByText('CAL_NOM')).toBeTruthy();
    expect(screen.getByText('ENV_TEMP_R1')).toBeTruthy();
  });
});

describe('FormulaVariableDisclosure — click to insert', () => {
  it('calls onInsert with the clicked name', () => {
    const onInsert = vi.fn();
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={onInsert} />);
    fireEvent.click(screen.getByText(/Variables you can use/));
    fireEvent.click(screen.getByText('CAL_NOM'));
    expect(onInsert).toHaveBeenCalledWith('CAL_NOM');
  });

  it('a disabled (self-reference) entry is not clickable and does not call onInsert', () => {
    const onInsert = vi.fn();
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={onInsert} />);
    fireEvent.click(screen.getByText(/Variables you can use/));
    const selfButton = screen.getByText('CAL_ERR').closest('button')! as HTMLButtonElement;
    expect(selfButton.disabled).toBe(true);
    fireEvent.click(selfButton);
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('the disabled entry\'s title explains the self-reference rule', () => {
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={() => {}} />);
    fireEvent.click(screen.getByText(/Variables you can use/));
    const selfButton = screen.getByText('CAL_ERR').closest('button')!;
    expect(selfButton.title.toLowerCase()).toContain('dependency loop');
  });

  it('a non-disabled entry shows its meaning as the hover title', () => {
    render(<FormulaVariableDisclosure groups={GROUPS} onInsert={() => {}} />);
    fireEvent.click(screen.getByText(/Variables you can use/));
    const button = screen.getByText('CAL_NOM').closest('button')!;
    expect(button.title).toBe('Nominal');
  });
});
