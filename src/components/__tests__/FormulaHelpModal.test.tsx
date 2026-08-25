/** @vitest-environment jsdom */
/**
 * FormulaHelpModal.test.tsx
 *
 * Phase 10 Task 4: the modal opens and lists every builtin — proving the
 * function list is genuinely generated from BUILTIN_FUNCTIONS at render
 * time, not a second hand-written copy that could silently diverge.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormulaHelpModal } from '../FormulaHelpModal';
import { BUILTIN_FUNCTIONS, COLUMN_AGGREGATES } from '../../modules/recorder/formula';
import { STANDARD_VARIABLE_NAMES } from '../../services/referenceStandardVariables';

// This project has no global RTL setupFiles — cleanup is not automatic.
afterEach(cleanup);

function renderModal(overrides: Partial<Parameters<typeof FormulaHelpModal>[0]> = {}) {
  return render(
    <FormulaHelpModal
      isOpen
      onClose={() => {}}
      language="en"
      onLanguageChange={() => {}}
      {...overrides}
    />,
  );
}

describe('FormulaHelpModal — opens and renders', () => {
  it('renders when isOpen is true', () => {
    renderModal();
    expect(screen.getByText('Formula Help')).toBeTruthy();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.textContent).toBe('');
  });
});

describe('FormulaHelpModal — the function list is GENERATED, not hand-copied', () => {
  it('lists every general builtin from BUILTIN_FUNCTIONS on the Functions tab', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Functions' }));
    for (const name of Object.keys(BUILTIN_FUNCTIONS)) {
      expect(document.getElementById(`fn-${name}`), `expected an entry for ${name}`).not.toBeNull();
    }
  });

  it('lists every column aggregate from COLUMN_AGGREGATES on the Functions tab', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Functions' }));
    for (const name of COLUMN_AGGREGATES) {
      expect(document.getElementById(`fn-${name}`), `expected an entry for ${name}`).not.toBeNull();
    }
  });

  it('a search query narrows the list rather than replacing it with a second source', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Functions' }));
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'ROUND' } });
    expect(document.getElementById('fn-ROUND')).not.toBeNull();
    expect(document.getElementById('fn-ABS')).toBeNull();
  });
});

describe('FormulaHelpModal — the variable list is GENERATED from STANDARD_VARIABLE_NAMES', () => {
  it('lists every STD_* name on the Variables tab', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
    for (const name of STANDARD_VARIABLE_NAMES) {
      expect(document.getElementById(`var-${name}`), `expected an entry for ${name}`).not.toBeNull();
    }
  });

  it('lists REPORT_TO_N on the Variables tab', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
    expect(document.getElementById('var-REPORT_TO_N')).not.toBeNull();
  });

  it('shows the ENV_ patterns, not a fixed instantiated list', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
    expect(screen.getByText('ENV_TEMP_R{n}')).toBeTruthy();
    expect(screen.getByText('ENV_RH_R{n}')).toBeTruthy();
  });
});

describe('FormulaHelpModal — arity comes from describeArity() at render time', () => {
  it('shows ROUND\'s arity as exactly 2, matching BUILTIN_FUNCTIONS', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Functions' }));
    const entry = document.getElementById('fn-ROUND');
    expect(entry?.textContent).toContain('arity: 2');
  });

  it('shows a variadic function\'s arity as "at least N"', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Functions' }));
    const entry = document.getElementById('fn-MAX');
    expect(entry?.textContent).toContain('at least 1');
  });
});

describe('FormulaHelpModal — language toggle', () => {
  it('shows Thai tab labels when language="th"', () => {
    renderModal({ language: 'th' });
    expect(screen.getByRole('button', { name: 'พื้นฐาน' })).toBeTruthy();
  });

  it('calls onLanguageChange when the toggle is clicked, without managing its own state', () => {
    let called: string | null = null;
    renderModal({ onLanguageChange: (l) => { called = l; } });
    fireEvent.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(called).toBe('th');
  });
});

describe('FormulaHelpModal — initialTab targets a specific section (Task 5)', () => {
  it('opens on the Functions tab when initialTab="functions"', () => {
    renderModal({ initialTab: 'functions' });
    expect(document.getElementById('fn-ROUND')).not.toBeNull();
  });
});

describe('FormulaHelpModal — recipes tab', () => {
  it('shows the mandatory TINV explicit-fallback recipe', () => {
    renderModal({ initialTab: 'recipes' });
    expect(screen.getByText(/TINV\(0\.05, CAL_NU\) if CAL_NU >= 1 else 2/)).toBeTruthy();
  });
});
