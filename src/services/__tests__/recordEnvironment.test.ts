import { describe, it, expect } from 'vitest';
import { buildEnvironmentDrafts, buildEnvironmentFromDrafts, isEnvironmentComplete, environmentToEnvMap } from '../recordEnvironment';

describe('buildEnvironmentDrafts', () => {
  it('creates exactly roundCount drafts, 1-indexed', () => {
    const drafts = buildEnvironmentDrafts(3, []);
    expect(drafts.map((d) => d.roundIndex)).toEqual([1, 2, 3]);
  });

  it('pre-fills drafts from already-saved rounds', () => {
    const drafts = buildEnvironmentDrafts(2, [{ roundIndex: 2, temperatureC: 21.5, relativeHumidity: 45 }]);
    expect(drafts[0]).toEqual({ roundIndex: 1, temperatureC: '', relativeHumidity: '' });
    expect(drafts[1]).toEqual({ roundIndex: 2, temperatureC: '21.5', relativeHumidity: '45' });
  });

  it('produces zero drafts for a zero roundCount', () => {
    expect(buildEnvironmentDrafts(0, [])).toEqual([]);
  });
});

describe('buildEnvironmentFromDrafts', () => {
  it('excludes a round where both fields are blank', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: '', relativeHumidity: '' }]);
    expect(result).toEqual([]);
  });

  it('excludes a round where only one field is filled', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: '20', relativeHumidity: '' }]);
    expect(result).toEqual([]);
  });

  it('includes a round once both fields parse as numbers', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: '20.5', relativeHumidity: '48' }]);
    expect(result).toEqual([{ roundIndex: 1, temperatureC: 20.5, relativeHumidity: 48 }]);
  });

  it('preserves a real zero reading, distinct from blank', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: '0', relativeHumidity: '0' }]);
    expect(result).toEqual([{ roundIndex: 1, temperatureC: 0, relativeHumidity: 0 }]);
  });

  it('excludes a round with non-numeric text', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: 'abc', relativeHumidity: '48' }]);
    expect(result).toEqual([]);
  });

  it('handles multiple rounds independently, including gaps', () => {
    const result = buildEnvironmentFromDrafts([
      { roundIndex: 1, temperatureC: '20', relativeHumidity: '48' },
      { roundIndex: 2, temperatureC: '', relativeHumidity: '' },
      { roundIndex: 3, temperatureC: '22', relativeHumidity: '50' },
    ]);
    expect(result).toEqual([
      { roundIndex: 1, temperatureC: 20, relativeHumidity: 48 },
      { roundIndex: 3, temperatureC: 22, relativeHumidity: 50 },
    ]);
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = buildEnvironmentFromDrafts([{ roundIndex: 1, temperatureC: ' 20 ', relativeHumidity: ' 48 ' }]);
    expect(result).toEqual([{ roundIndex: 1, temperatureC: 20, relativeHumidity: 48 }]);
  });
});

describe('isEnvironmentComplete', () => {
  it('is false when fewer rounds are filled than roundCount', () => {
    expect(isEnvironmentComplete([{ roundIndex: 1, temperatureC: 20, relativeHumidity: 48 }], 2)).toBe(false);
  });

  it('is true once every round is filled', () => {
    const env = [
      { roundIndex: 1, temperatureC: 20, relativeHumidity: 48 },
      { roundIndex: 2, temperatureC: 21, relativeHumidity: 49 },
    ];
    expect(isEnvironmentComplete(env, 2)).toBe(true);
  });

  it('is true for a zero roundCount with an empty environment', () => {
    expect(isEnvironmentComplete([], 0)).toBe(true);
  });
});

describe('environmentToEnvMap', () => {
  it('maps each round to ENV_TEMP_R{n} / ENV_RH_R{n} keys', () => {
    const map = environmentToEnvMap([
      { roundIndex: 1, temperatureC: 20, relativeHumidity: 48 },
      { roundIndex: 2, temperatureC: 21.5, relativeHumidity: 50 },
    ]);
    expect(map).toEqual({
      ENV_TEMP_R1: 20,
      ENV_RH_R1: 48,
      ENV_TEMP_R2: 21.5,
      ENV_RH_R2: 50,
      // Record-scoped, and null because no reporting unit was supplied.
      REPORT_TO_N: null,
    });
  });

  it('returns only REPORT_TO_N for an empty environment', () => {
    expect(environmentToEnvMap([])).toEqual({ REPORT_TO_N: null });
  });
});

// ── ADR-014 D5: the reporting unit is a record-scoped scalar ────────────────

describe('environmentToEnvMap — REPORT_TO_N', () => {
  it.each([
    ['N', 1],
    ['kN', 1000],
    ['kgF', 9.80665],
    ['gF', 0.00980665],
  ])('resolves %s to %s newtons', (unit, expected) => {
    expect(environmentToEnvMap([], unit).REPORT_TO_N).toBe(expected);
  });

  it('is null when no reporting unit is set — never defaulted to 1', () => {
    // Defaulting to newtons would silently report N for a record meant to be
    // in kN. Null makes the formula raise awaiting-input instead.
    expect(environmentToEnvMap([], undefined).REPORT_TO_N).toBeNull();
    expect(environmentToEnvMap([], null).REPORT_TO_N).toBeNull();
  });

  it('is null for a unit outside the newton table', () => {
    expect(environmentToEnvMap([], 'kg').REPORT_TO_N).toBeNull();
    expect(environmentToEnvMap([], 'lbf').REPORT_TO_N).toBeNull();
  });
});
