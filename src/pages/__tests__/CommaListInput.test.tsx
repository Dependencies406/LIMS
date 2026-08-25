/** @vitest-environment jsdom */
/**
 * CommaListInput.test.tsx
 *
 * Regression test for a bug reported after Phase 15's supersession shipped:
 * typing a comma into the "Choices" / "Allowed units" field was impossible.
 *
 * Root cause: the naive version renders `value={list.join(', ')}` and
 * reparses+rejoins on every keystroke. Typing a trailing comma parses to an
 * empty final entry, which `parseCommaSeparatedList` drops — so the input's
 * displayed value snaps back to the pre-comma text on the very next render,
 * before the user can type the following character. `CommaListInput` fixes
 * this by keeping the raw typed text as local state, never reflecting the
 * re-joined parsed array back into the input's own value.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../services/firebase', async () => {
  const { createFakeFirestore } = await import('../../services/__tests__/fakeFirestore');
  return { ...createFakeFirestore(), auth: {}, deleteField: () => ({ __deleteField: true }) };
});

import { CommaListInput } from '../RecorderTemplateBuilderPage';

afterEach(cleanup);

describe('CommaListInput — typing a comma is not erased', () => {
  it('keeps a trailing comma visible in the input after typing it', () => {
    render(<CommaListInput value={[]} onChange={() => {}} placeholder="e.g. N, kN" />);
    const input = screen.getByPlaceholderText('e.g. N, kN') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'N,' } });

    // This is the whole bug: a naive `value={parsed.join(', ')}` would have
    // snapped this back to "N", silently deleting the character just typed.
    expect(input.value).toBe('N,');
  });

  it('lets a full comma-separated list be typed character by character', () => {
    render(<CommaListInput value={[]} onChange={() => {}} placeholder="e.g. N, kN" />);
    const input = screen.getByPlaceholderText('e.g. N, kN') as HTMLInputElement;

    for (const partial of ['N', 'N,', 'N, ', 'N, k', 'N, kN']) {
      fireEvent.change(input, { target: { value: partial } });
      expect(input.value).toBe(partial);
    }
  });

  it('still reports the correctly parsed array to onChange while the comma is visible', () => {
    const onChange = vi.fn();
    render(<CommaListInput value={[]} onChange={onChange} placeholder="e.g. N, kN" />);
    const input = screen.getByPlaceholderText('e.g. N, kN') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'N,' } });
    expect(onChange).toHaveBeenLastCalledWith(['N']);
    expect(input.value).toBe('N,');

    fireEvent.change(input, { target: { value: 'N, kN' } });
    expect(onChange).toHaveBeenLastCalledWith(['N', 'kN']);
  });

  it('seeds its initial text from the given value, joined with ", "', () => {
    render(<CommaListInput value={['N', 'kN', 'kgF']} onChange={() => {}} placeholder="units" />);
    expect((screen.getByPlaceholderText('units') as HTMLInputElement).value).toBe('N, kN, kgF');
  });
});
