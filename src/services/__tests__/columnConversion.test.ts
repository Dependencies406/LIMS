/**
 * columnConversion.test.ts
 *
 * ADR-015 D8's pure pipeline. Required tests 3 (end-to-end, non-force
 * pair), 4 (offset conversion), 7 (full precision, not rounded here — the
 * caller's own ADR-011 rounding applies downstream), 9 (all four failure
 * modes, each asserting the marker/raw-value/warning trio, never a throw).
 */
import { describe, it, expect } from 'vitest';
import { convertColumnDisplayValue } from '../columnConversion';
import type { ConversionRule } from '../../types';

function rule(overrides: Partial<ConversionRule> = {}): ConversionRule {
  return {
    id: 'r1',
    name: 'mV/V to %',
    fromUnit: 'mV/V',
    toUnit: '%',
    expression: 'VALUE * 100',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin1',
    ...overrides,
  };
}

describe('convertColumnDisplayValue — D8 order end-to-end, a non-force pair (test 3)', () => {
  it('mV/V -> %: 0.02345 becomes 2.345, full precision, marked applied', () => {
    const result = convertColumnDisplayValue({
      rawValue: 0.02345,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule()],
    });
    expect(result.applied).toBeDefined();
    expect(result.failure).toBeUndefined();
    expect(result.displayValue).toBeCloseTo(2.345, 10);
    expect(result.applied!.rule.id).toBe('r1');
    expect(result.applied!.sourceUnit).toBe('mV/V');
    expect(result.applied!.targetUnit).toBe('%');
    expect(result.applied!.rawValue).toBe(0.02345);
  });
});

describe('convertColumnDisplayValue — offset conversion (test 4)', () => {
  it('(VALUE - 32) * 5 / 9: 98.6°F becomes 37°C', () => {
    const result = convertColumnDisplayValue({
      rawValue: 98.6,
      column: { conversionEnabled: true, conversionSourceUnit: '°F' },
      targetUnit: '°C',
      rules: [rule({ fromUnit: '°F', toUnit: '°C', expression: '(VALUE - 32) * 5 / 9' })],
    });
    expect(result.applied).toBeDefined();
    expect(result.displayValue).toBeCloseTo(37, 10);
  });

  it('a pure multiplier could never express this — proves the expression language, not just a factor, is actually used', () => {
    const result = convertColumnDisplayValue({
      rawValue: 0,
      column: { conversionEnabled: true, conversionSourceUnit: '°F' },
      targetUnit: '°C',
      rules: [rule({ fromUnit: '°F', toUnit: '°C', expression: '(VALUE - 32) * 5 / 9' })],
    });
    // 0°F is NOT 0°C — a multiplier-only model would wrongly give 0.
    expect(result.displayValue).toBeCloseTo(-17.7778, 3);
  });
});

describe('convertColumnDisplayValue — not applicable (no failure, no rule lookup needed)', () => {
  it('conversion disabled: raw value passed through, no applied, no failure', () => {
    const result = convertColumnDisplayValue({
      rawValue: 12.345,
      column: { conversionEnabled: false, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule()],
    });
    expect(result.displayValue).toBe(12.345);
    expect(result.applied).toBeUndefined();
    expect(result.failure).toBeUndefined();
  });

  it('source equals target: no-op, no rule lookup, no failure even with zero rules', () => {
    const result = convertColumnDisplayValue({
      rawValue: 12.345,
      column: { conversionEnabled: true, conversionSourceUnit: 'mm' },
      targetUnit: 'mm',
      rules: [],
    });
    expect(result.displayValue).toBe(12.345);
    expect(result.failure).toBeUndefined();
  });

  it('no target unit at all (header unresolved): raw value, no failure', () => {
    const result = convertColumnDisplayValue({
      rawValue: 12.345,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: undefined,
      rules: [rule()],
    });
    expect(result.displayValue).toBe(12.345);
    expect(result.failure).toBeUndefined();
  });

  it('no source unit declared: raw value, no failure', () => {
    const result = convertColumnDisplayValue({
      rawValue: 12.345,
      column: { conversionEnabled: true, conversionSourceUnit: undefined },
      targetUnit: '%',
      rules: [rule()],
    });
    expect(result.displayValue).toBe(12.345);
    expect(result.failure).toBeUndefined();
  });
});

describe('convertColumnDisplayValue — full precision, no rounding here (test 7, the pure-module half)', () => {
  it('a value that would round differently at 2 vs 4 decimals is returned UNROUNDED', () => {
    const result = convertColumnDisplayValue({
      rawValue: 1 / 3, // 0.3333333333333333
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE * 100' })],
    });
    expect(result.applied).toBeDefined();
    // Not 33.33, not 33.3333 — the FULL double-precision result, proving
    // this function itself never rounds; a caller applying ADR-011 rounding
    // downstream is what turns this into "33.33".
    expect(result.displayValue).toBe((1 / 3) * 100);
    expect(result.displayValue.toString().length).toBeGreaterThan(6);
  });
});

describe('convertColumnDisplayValue — each D6 failure mode (test 9)', () => {
  it('no-rule: raw value shown, marker present (failure.reason), warning names the pair', () => {
    const result = convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [], // no rule at all
    });
    expect(result.displayValue).toBe(42); // raw value shown
    expect(result.failure).toBeDefined(); // marker present
    expect(result.failure!.reason).toBe('no-rule');
    expect(result.failure!.message).toContain('mV/V');
    expect(result.failure!.message).toContain('%');
    expect(result.applied).toBeUndefined();
  });

  it('expression-error (bad syntax): raw value shown, marker present, warning names the pair, never throws', () => {
    expect(() => convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE +' })], // saved somehow with a broken expression
    })).not.toThrow();

    const result = convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE +' })],
    });
    expect(result.displayValue).toBe(42);
    expect(result.failure).toBeDefined();
    expect(result.failure!.reason).toBe('expression-error');
    expect(result.failure!.message).toContain('mV/V');
    expect(result.failure!.message).toContain('%');
  });

  it('divide-by-zero: raw value shown, marker present, warning names the pair, never throws', () => {
    expect(() => convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE / 0' })],
    })).not.toThrow();

    const result = convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE / 0' })],
    });
    expect(result.displayValue).toBe(42);
    expect(result.failure).toBeDefined();
    expect(result.failure!.reason).toBe('divide-by-zero');
    expect(result.failure!.message).toContain('mV/V');
    expect(result.failure!.message).toContain('%');
  });

  it('non-finite result (overflow): raw value shown, marker present, warning names the pair, never throws', () => {
    expect(() => convertColumnDisplayValue({
      rawValue: 1e300,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE ** 1000' })], // overflows to Infinity
    })).not.toThrow();

    const result = convertColumnDisplayValue({
      rawValue: 1e300,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ expression: 'VALUE ** 1000' })],
    });
    expect(result.displayValue).toBe(1e300);
    expect(result.failure).toBeDefined();
    expect(result.failure!.reason).toBe('non-finite-result');
    expect(result.failure!.message).toContain('mV/V');
    expect(result.failure!.message).toContain('%');
  });

  it('a DEACTIVATED rule for the exact pair is treated as no-rule, never used', () => {
    const result = convertColumnDisplayValue({
      rawValue: 42,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [rule({ active: false })],
    });
    expect(result.failure).toBeDefined();
    expect(result.failure!.reason).toBe('no-rule');
    expect(result.applied).toBeUndefined();
  });
});
