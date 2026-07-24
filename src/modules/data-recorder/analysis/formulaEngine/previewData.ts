/**
 * previewData.ts
 *
 * A browser-safe copy of the Stage D golden fixture's tension-direction data
 * (job SCS-CAL-26024), for the admin formula editor's live preview (design
 * §2/§6: "live inputs/outputs shown against the golden fixture point-by-
 * point"). Every number here is transcribed verbatim from
 * analysis/__tests__/fixtures/STAGE_D_GOLDEN_DATA.json's
 * `directions.tension` — NOT re-derived or approximated.
 *
 * This is a SEPARATE copy rather than importing the JSON fixture directly
 * because: (1) the project has no `resolveJsonModule` tsconfig flag, so a
 * bare `import x from '*.json'` would need a config change just for this
 * preview feature; (2) the fixture lives under a `__tests__/` folder and
 * bundling it into the production admin UI (even though it's small and
 * already non-sensitive) blurs the test/production boundary unnecessarily.
 * If the fixture ever changes, this file must be updated to match — there
 * is no automated link between them (documented limitation, not silent).
 */

import type { RelativeErrorInput } from '../relativeError';
import type { UncertaintyParams, CmcStep } from '../uncertaintyBudget';

/** relativeError input for the golden tension-direction data. */
export const PREVIEW_RELATIVE_ERROR_INPUT: RelativeErrorInput = {
  points: [
    { calPoint: 0, forces: { inc1: 0, inc2: 0, inc3: 0, dec3: 0 } },
    { calPoint: 4000, forces: { inc1: 4002.53912, inc2: 4001.28911, inc3: 4001.28911, dec3: '-' } },
    { calPoint: 8000, forces: { inc1: 8013.82552, inc2: 8030.07566, inc3: 8032.57568, dec3: '-' } },
    { calPoint: 12000, forces: { inc1: 12013.85902, inc2: 12008.85898, inc3: 11992.60885, dec3: '-' } },
    { calPoint: 16000, forces: { inc1: 15990.13955, inc2: 16003.88965, inc3: 15986.38952, dec3: '-' } },
    { calPoint: 20000, forces: { inc1: 20050.16787, inc2: 20025.1677, inc3: 19998.91753, dec3: '-' } },
    { calPoint: 25000, forces: { inc1: 24983.94841, inc2: 25001.44851, inc3: 24996.44848, dec3: '-' } },
    { calPoint: 30000, forces: { inc1: 30017.72518, inc2: 30012.72516, inc3: 30005.60012, dec3: '-' } },
    { calPoint: 35000, forces: { inc1: 35003.99734, inc2: 34982.74726, inc3: 34966.49719, dec3: '-' } },
    { calPoint: 40000, forces: { inc1: 39960.26506, inc2: 39994.01517, inc3: 40000.26519, dec3: '-' } },
  ],
  resolution: 0.01,
  decimalPlaces: 2,
};

/** LCDB u_cal/A/B/C for CAL-FRC-004 (250 kN, Tensile 10-100 kN) — the standard this sheet used. */
export const PREVIEW_UNCERTAINTY_PARAMS: UncertaintyParams = {
  uCal: 0.006,
  uA: 0.00577,
  uB: 0.00693,
  uC: 0.00816,
};

/** Tensile CMC steps for this scope of accreditation. */
export const PREVIEW_CMC_STEPS: CmcStep[] = [
  { toN: 100, cmc: 0.26 },
  { toN: 2000, cmc: 0.21 },
  { toN: 247000, cmc: 0.26 },
];

export const PREVIEW_READING_UNIT = 'N';

export const PREVIEW_SOURCE_LABEL = 'SCS-CAL-26024 · Tension · CAL-FRC-004 (250 kN, Tensile 10-100 kN)';
