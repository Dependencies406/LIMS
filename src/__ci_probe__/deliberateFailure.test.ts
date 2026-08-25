import { describe, it, expect } from 'vitest';

// Temporary probe for Phase 31 Task 4 — proves the CI test gate blocks a
// failing suite. Removed in the immediately following commit.
describe('Phase 31 CI gate probe', () => {
  it('is deliberately failing', () => {
    expect(1).toBe(2);
  });
});
