/**
 * conversionRuleValidation.test.ts
 *
 * ADR-015 D4/D5 save-time checks, pure — required tests 1 and 2.
 */
import { describe, it, expect } from 'vitest';
import { validateConversionRule, isConversionRuleValid, CONVERSION_RULE_VARIABLE } from '../conversionRuleValidation';

describe('validateConversionRule — D5: force-to-force rules are rejected (test 1)', () => {
  it('rejects N -> kgF, naming STD_TO_N and REPORT_TO_N', () => {
    const issues = validateConversionRule({ fromUnit: 'N', toUnit: 'kgF', expression: 'VALUE * 9.80665' });
    expect(issues.length).toBeGreaterThan(0);
    const message = issues.map((i) => i.message).join(' ');
    expect(message).toContain('STD_TO_N');
    expect(message).toContain('REPORT_TO_N');
  });

  it('rejects every force pair, not just one', () => {
    const pairs: Array<[string, string]> = [['N', 'kN'], ['kN', 'gF'], ['gF', 'kgF'], ['kgF', 'N']];
    for (const [fromUnit, toUnit] of pairs) {
      expect(isConversionRuleValid({ fromUnit, toUnit, expression: 'VALUE * 2' }), `${fromUnit}->${toUnit} should be rejected`).toBe(false);
    }
  });

  it('a non-force pair is NOT rejected by the force check', () => {
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100' })).toBe(true);
  });

  it('one force unit paired with a non-force unit is allowed (only BOTH-force is rejected)', () => {
    // Not a realistic real-world rule, but the D5 rule specifically says
    // "both fromUnit AND toUnit are ForceUnit values" — one side alone must
    // not trip it.
    expect(isConversionRuleValid({ fromUnit: 'N', toUnit: 'mm', expression: 'VALUE * 2' })).toBe(true);
  });
});

describe('validateConversionRule — D4: only VALUE may be referenced (test 2)', () => {
  it('rejects a column reference', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'CAL_NOM * 2' });
    expect(issues.some((i) => i.message.includes('CAL_NOM'))).toBe(true);
  });

  it('rejects STD_C0', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * STD_C0' });
    expect(issues.some((i) => i.message.includes('STD_C0'))).toBe(true);
  });

  it('rejects ENV_TEMP_R1', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE + ENV_TEMP_R1' });
    expect(issues.some((i) => i.message.includes('ENV_TEMP_R1'))).toBe(true);
  });

  it('rejects REPORT_TO_N', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE / REPORT_TO_N' });
    expect(issues.some((i) => i.message.includes('REPORT_TO_N'))).toBe(true);
  });

  it('rejects SUMMARY_MAXDEV', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE + SUMMARY_MAXDEV' });
    expect(issues.some((i) => i.message.includes('SUMMARY_MAXDEV'))).toBe(true);
  });

  it('accepts VALUE alone', () => {
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE' })).toBe(true);
  });

  it(`accepts an expression using ${CONVERSION_RULE_VARIABLE} with a builtin function`, () => {
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '%', expression: 'ROUND(VALUE * 100, 2)' })).toBe(true);
  });

  it('rejects a column aggregate — meaningless with no template/rows in scope', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'col_mean(VALUE)' });
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('validateConversionRule — structural checks', () => {
  it('rejects fromUnit === toUnit', () => {
    const issues = validateConversionRule({ fromUnit: 'mV/V', toUnit: 'mV/V', expression: 'VALUE' });
    expect(issues.some((i) => i.message.includes('must be different'))).toBe(true);
  });

  it('rejects an empty expression', () => {
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '%', expression: '' })).toBe(false);
  });

  it('rejects a syntactically invalid expression without throwing', () => {
    expect(() => validateConversionRule({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE +' })).not.toThrow();
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE +' })).toBe(false);
  });

  it('rejects empty fromUnit/toUnit', () => {
    expect(isConversionRuleValid({ fromUnit: '', toUnit: '%', expression: 'VALUE' })).toBe(false);
    expect(isConversionRuleValid({ fromUnit: 'mV/V', toUnit: '', expression: 'VALUE' })).toBe(false);
  });
});

describe('validateConversionRule — test 4: offset conversion works (Celsius -> Fahrenheit family)', () => {
  it('accepts an offset expression: (VALUE - 32) * 5 / 9', () => {
    expect(isConversionRuleValid({ fromUnit: '°F', toUnit: '°C', expression: '(VALUE - 32) * 5 / 9' })).toBe(true);
  });
});
