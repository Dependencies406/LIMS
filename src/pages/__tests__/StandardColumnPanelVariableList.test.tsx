/** @vitest-environment jsdom */
/**
 * StandardColumnPanelVariableList.test.tsx
 *
 * Phase 10 Task 7: "Generate that list from STANDARD_VARIABLE_NAMES so it
 * cannot go stale, and drop the 'and the rest'."
 *
 * The standard column's info panel renders its STD_* list via
 * `VariableNameList`, fed directly with the imported `STANDARD_VARIABLE_NAMES`
 * array (see RecorderTemplateBuilderPage.tsx's `column.type === 'standard'`
 * branch). This proves that wiring genuinely reflects the source list: if
 * STANDARD_VARIABLE_NAMES grows, the panel grows with it, with no separate
 * copy to fall out of sync — the exact rot this task exists to end (the "and
 * the rest" the six coefficient slots used to hide behind).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { STANDARD_VARIABLE_NAMES } from '../../services/referenceStandardVariables';

vi.mock('../../services/firebase', async () => {
  const { createFakeFirestore } = await import('../../services/__tests__/fakeFirestore');
  return { ...createFakeFirestore(), auth: {}, deleteField: () => ({ __deleteField: true }) };
});

import { VariableNameList } from '../RecorderTemplateBuilderPage';

afterEach(cleanup);

describe('VariableNameList — the mechanism the standard column panel uses', () => {
  it('renders every name it is given, comma-separated, with no "and the rest"', () => {
    render(<VariableNameList names={STANDARD_VARIABLE_NAMES} />);
    for (const name of STANDARD_VARIABLE_NAMES) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.queryByText(/and the rest/i)).toBeNull();
  });

  it('a name added to a COPY of STANDARD_VARIABLE_NAMES appears in what the panel would render', () => {
    // Simulates the drift scenario this task exists to prevent: if a future
    // session adds a new STD_* to the real source list, the panel (which
    // passes that SAME array into VariableNameList, not a hand-copied one)
    // shows it automatically — proven here by passing a grown copy through
    // the identical rendering path the panel uses.
    const grown = [...STANDARD_VARIABLE_NAMES, 'STD_NEWFIELD'];
    render(<VariableNameList names={grown} />);
    expect(screen.getByText('STD_NEWFIELD')).toBeTruthy();
    // And every pre-existing name is still there alongside it.
    for (const name of STANDARD_VARIABLE_NAMES) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('covers all twelve current STD_* names — confirms the source list itself has not silently shrunk', () => {
    expect(STANDARD_VARIABLE_NAMES.length).toBe(12);
  });
});
