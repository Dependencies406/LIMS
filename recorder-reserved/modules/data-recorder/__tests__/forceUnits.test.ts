import { describe, it, expect } from 'vitest';
import { convertForce, isForceUnit, FORCE_UNIT_FACTORS } from '../forceUnits';

describe('forceUnits', () => {
  it('converts kN to N (the workbook divisor-0.001 case)', () => {
    expect(convertForce(39.96421, 'kN', 'N')).toBeCloseTo(39964.21, 6);
  });

  it('converts N to kN', () => {
    expect(convertForce(4000, 'N', 'kN')).toBeCloseTo(4, 12);
  });

  it('converts N to kgf via standard gravity', () => {
    expect(convertForce(9.80665, 'N', 'kgf')).toBeCloseTo(1, 12);
    expect(convertForce(40000, 'N', 'kgf')).toBeCloseTo(4078.865, 3);
  });

  it('converts kgf to gf', () => {
    expect(convertForce(1, 'kgf', 'gf')).toBeCloseTo(1000, 9);
  });

  it('is identity for same-unit conversion', () => {
    expect(convertForce(123.456, 'kN', 'kN')).toBe(123.456);
  });

  it('round-trips without drift beyond float noise', () => {
    const back = convertForce(convertForce(2500.5, 'N', 'gf'), 'gf', 'N');
    expect(back).toBeCloseTo(2500.5, 9);
  });

  it('returns null for null/undefined/NaN values', () => {
    expect(convertForce(null, 'N', 'kN')).toBeNull();
    expect(convertForce(undefined, 'N', 'kN')).toBeNull();
    expect(convertForce(Number.NaN, 'N', 'kN')).toBeNull();
  });

  it('returns null for unsupported units', () => {
    expect(convertForce(1, 'lbf', 'N')).toBeNull();
    expect(convertForce(1, 'N', 'bar')).toBeNull();
  });

  it('exposes exactly the four supported units', () => {
    expect(Object.keys(FORCE_UNIT_FACTORS).sort()).toEqual(['N', 'gf', 'kN', 'kgf']);
    expect(isForceUnit('kgf')).toBe(true);
    expect(isForceUnit('lbf')).toBe(false);
  });
});
