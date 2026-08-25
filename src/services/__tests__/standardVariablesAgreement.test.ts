/**
 * standardVariablesAgreement.test.ts
 *
 * Phase 15 Task 4a: validator.ts's comment (line 70 as of Phase 15) claims a
 * test asserts its local `STANDARD_VARIABLES` list agrees with
 * `referenceStandardVariables.STANDARD_VARIABLE_NAMES`. No such test
 * existed before this file — verified by grep across
 * src/modules/recorder/formula/__tests__/ before writing this.
 *
 * The duplication itself is deliberate (the formula module stays standalone
 * — see the comment at validator.ts's STANDARD_VARIABLES) and is NOT fixed
 * by importing services/ into the formula module. This test lives outside
 * the module (in services/__tests__, not formula/__tests__) specifically so
 * it — not the module itself — is the one place that knows about both
 * lists, existing to catch drift: e.g. if MAX_COEFFICIENT_INDEX is ever
 * raised without updating validator.ts's hardcoded copy.
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_VARIABLES } from '../../modules/recorder/formula/validator';
import { STANDARD_VARIABLE_NAMES } from '../referenceStandardVariables';

describe('validator.STANDARD_VARIABLES vs referenceStandardVariables.STANDARD_VARIABLE_NAMES', () => {
  it('are exactly equal', () => {
    expect(STANDARD_VARIABLES).toEqual(STANDARD_VARIABLE_NAMES);
  });
});
