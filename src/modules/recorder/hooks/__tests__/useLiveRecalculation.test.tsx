/** @vitest-environment jsdom */
/**
 * useLiveRecalculation.test.tsx
 *
 * ADR-014 Phase 13: the STD_* wiring proof (Task 3) — selecting a standard
 * on a row makes STD_C1 resolve to a number, not awaiting-input — plus the
 * selection-time warning computation (Task 2's checkOptionWarnings, fed by
 * this hook's own recalculation results).
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useLiveRecalculation } from '../useLiveRecalculation';
import { optionsToStandardsById } from '../../../../services/referenceStandardOptions';
import type { StandardOption } from '../../../../services/referenceStandardOptions';
import type { RecorderTemplate, ConversionEquation, EquipmentRecord } from '../../../../types';
import type { RecordingGridHandle } from '../../components/RecordingGrid';

function makeOption(
  equipmentId: string,
  equationId: string,
  descendingCoefficients: number[],
  equipmentOverrides: Partial<EquipmentRecord> = {},
  equationOverrides: Partial<ConversionEquation> = {},
): StandardOption {
  const equipment = {
    id: equipmentId,
    name: `Transducer ${equipmentId}`,
    category: 'FRC',
    manufacturer: 'm',
    model: 'm',
    serialNumber: `SN-${equipmentId}`,
    location: 'lab',
    status: 'active',
    custodian: 'u1',
    authorizedUsers: [],
    requiresCalibration: true,
    externalProvider: false,
    isReferenceStandard: true,
    registrationDate: '2026-01-01',
    nextCalibrationDate: '2099-01-01',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    ...equipmentOverrides,
  } as EquipmentRecord;

  const equation: ConversionEquation = {
    id: equationId,
    name: `${equipmentId} range`,
    inputUnit: 'mV/V',
    outputUnit: 'N',
    degree: descendingCoefficients.length - 1,
    coefficients: descendingCoefficients.map((value) => ({ value, inputMode: 'decimal', raw: String(value) })),
    divisor: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    ...equationOverrides,
  };

  return { key: `${equipmentId}::${equationId}`, label: `${equipmentId} — ${equation.name}`, equipment, equation };
}

function template(): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading', order: 1, type: 'number' },
          { id: 'F', label: 'Force', order: 2, type: 'formula', expression: 'STD_C1 * M_R' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

function useHarness(options: StandardOption[], reportUnit?: string | null) {
  const gridRef = useRef<RecordingGridHandle | null>(null);
  return useLiveRecalculation(
    template(),
    [],
    [],
    gridRef,
    optionsToStandardsById(options),
    reportUnit,
    options,
  );
}

describe('useLiveRecalculation — STD_* resolves after a picker selection (ADR-014 Phase 13 Task 3)', () => {
  it('a row with no standard selected shows awaiting-input for the force column', () => {
    const optionA = makeOption('EQ-A', 'eq1', [10, 0]);
    const { result } = renderHook(() => useHarness([optionA]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: null, M_R: 2 }]);
    });

    expect(result.current.rowResults[0].M_F.error?.kind).toBe('awaiting-input');
  });

  it('selecting a standard makes STD_C1 resolve to a number', () => {
    const optionA = makeOption('EQ-A', 'eq1', [10, 0]); // F = 10R
    const { result } = renderHook(() => useHarness([optionA]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: optionA.key, M_R: 2 }]);
    });

    expect(result.current.rowResults[0].M_F.error).toBeUndefined();
    expect(result.current.rowResults[0].M_F.value).toBe(20);
  });

  it('two rows on different standards evaluate independently, through this hook end to end', () => {
    const optionA = makeOption('EQ-A', 'eq1', [10, 0]);
    const optionB = makeOption('EQ-B', 'eq1', [100, 0]);
    const { result } = renderHook(() => useHarness([optionA, optionB]));

    act(() => {
      result.current.handleRowsChange([
        { M_STDSEL: optionA.key, M_R: 2 },
        { M_STDSEL: optionB.key, M_R: 2 },
      ]);
    });

    expect(result.current.rowResults[0].M_F.value).toBe(20);
    expect(result.current.rowResults[1].M_F.value).toBe(200);
  });
});

describe('useLiveRecalculation — standardWarnings, computed at selection time', () => {
  it('has no warnings before any row selects a standard', () => {
    const optionA = makeOption('EQ-A', 'eq1', [10, 0]);
    const { result } = renderHook(() => useHarness([optionA]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: null, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0]).toEqual([]);
  });

  it('warns for the row as soon as it selects a past-due standard', () => {
    const pastDue = makeOption('EQ-A', 'eq1', [10, 0], { nextCalibrationDate: '2020-01-01' });
    const { result } = renderHook(() => useHarness([pastDue]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: pastDue.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'due-date')).toBe(true);
  });

  it('warns when the row\'s computed force is outside the selected standard\'s range (same report/output unit)', () => {
    const narrow = makeOption('EQ-A', 'eq1', [10, 0], {}, { rangeMin: 0, rangeMax: 5, outputUnit: 'N' });
    const { result } = renderHook(() => useHarness([narrow], 'N'));

    act(() => {
      // F = 10 * 2 = 20, outside [0, 5].
      result.current.handleRowsChange([{ M_STDSEL: narrow.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'range')).toBe(true);
  });

  it('does NOT warn when report unit differs from output unit and the force is actually in range', () => {
    // Equation range 2-20 kN. R=1000 -> raw computed force = 10*1000 = 10000,
    // and the record reports in N, so this is 10000 N = 10 kN — IN range.
    // A naive (unconverted) comparison of 10000 against [2, 20] would
    // wrongly warn; this proves the hook actually converts before comparing.
    const kn = makeOption('EQ-A', 'eq1', [10, 0], {}, { rangeMin: 2, rangeMax: 20, outputUnit: 'kN' });
    const { result } = renderHook(() => useHarness([kn], 'N'));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: kn.key, M_R: 1000 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'range')).toBe(false);
  });

  it('a row selecting a healthy, in-range standard has no warnings', () => {
    const healthy = makeOption('EQ-A', 'eq1', [10, 0], {}, { rangeMin: 0, rangeMax: 100, outputUnit: 'N' });
    const { result } = renderHook(() => useHarness([healthy], 'N'));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: healthy.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0]).toEqual([]);
  });

  it('one row\'s warning does not leak onto a different row using a different standard', () => {
    const pastDue = makeOption('EQ-A', 'eq1', [10, 0], { nextCalibrationDate: '2020-01-01' });
    const healthy = makeOption('EQ-B', 'eq1', [100, 0], { nextCalibrationDate: '2099-01-01' });
    const { result } = renderHook(() => useHarness([pastDue, healthy]));

    act(() => {
      result.current.handleRowsChange([
        { M_STDSEL: pastDue.key, M_R: 1 },
        { M_STDSEL: healthy.key, M_R: 1 },
      ]);
    });

    expect(result.current.standardWarnings[0].length).toBeGreaterThan(0);
    expect(result.current.standardWarnings[1]).toEqual([]);
  });
});

describe('useLiveRecalculation — ADR-015 D3 conversion source-unit cross-check', () => {
  function templateWithConversionColumn(overrides: Partial<RecorderTemplate['sections'][number]['columns'][number]> = {}) {
    const t = template();
    t.sections[0].columns.push({
      id: 'CONV', label: 'Converted', order: 3, type: 'formula', expression: 'STD_C1 * M_R',
      conversionEnabled: true, conversionSourceUnit: 'mV/V',
      ...overrides,
    });
    return t;
  }

  function useConversionHarness(
    columnOverrides: Partial<RecorderTemplate['sections'][number]['columns'][number]>,
    options: StandardOption[],
  ) {
    const gridRef = useRef<RecordingGridHandle | null>(null);
    return useLiveRecalculation(
      templateWithConversionColumn(columnOverrides),
      [],
      [],
      gridRef,
      optionsToStandardsById(options),
      undefined,
      options,
    );
  }

  it('warns when the declared source unit disagrees with the selected standard\'s output unit', () => {
    const option = makeOption('EQ-A', 'eq1', [10, 0], {}, { outputUnit: 'N' }); // column declares mV/V, standard is N
    const { result } = renderHook(() => useConversionHarness({}, [option]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: option.key, M_R: 2 }]);
    });

    const unitWarnings = result.current.standardWarnings[0].filter((w) => w.kind === 'unit');
    expect(unitWarnings).toHaveLength(1);
    expect(unitWarnings[0].message).toContain('mV/V');
    expect(unitWarnings[0].message).toContain('N');
  });

  it('does not warn when the declared source unit matches the standard\'s output unit', () => {
    const option = makeOption('EQ-A', 'eq1', [10, 0], {}, { outputUnit: 'mV/V' });
    const { result } = renderHook(() => useConversionHarness({}, [option]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: option.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'unit' && w.message.includes('declares its conversion source unit'))).toBe(false);
  });

  it('is silent when the column has not opted into conversion, even with a disagreeing unit', () => {
    const option = makeOption('EQ-A', 'eq1', [10, 0], {}, { outputUnit: 'N' });
    const { result } = renderHook(() => useConversionHarness({ conversionEnabled: false }, [option]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: option.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'unit' && w.message.includes('declares its conversion source unit'))).toBe(false);
  });

  it("is silent when the expression references only STD_TO_N, not a raw STD_C* coefficient", () => {
    const option = makeOption('EQ-A', 'eq1', [10, 0], {}, { outputUnit: 'N' });
    const { result } = renderHook(() => useConversionHarness({ expression: 'M_R * STD_TO_N' }, [option]));

    act(() => {
      result.current.handleRowsChange([{ M_STDSEL: option.key, M_R: 2 }]);
    });

    expect(result.current.standardWarnings[0].some((w) => w.kind === 'unit' && w.message.includes('declares its conversion source unit'))).toBe(false);
  });
});
