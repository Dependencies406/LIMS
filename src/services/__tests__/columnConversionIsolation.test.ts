/**
 * columnConversionIsolation.test.ts
 *
 * ADR-015 D1's non-negotiable boundary: "The formula engine, the validator,
 * the evaluator and the recalculation services do not know conversion
 * exists." Structural grep over source files — the same technique
 * `recordColumnUnit.test.ts` uses for the Phase 15 unit-label invariant —
 * applied to the same file list `standardNamespaceIsolation.test.ts` treats
 * as the boundary that must never leak across (that file proves it
 * BEHAVIOURALLY, for a different invariant; this one proves it
 * STRUCTURALLY, which is the right tool for "does file X import file Y").
 *
 * Patterns are identifier-shaped, not the bare word "conversion" — that
 * word already appears throughout this file list in ordinary prose (the
 * STD_TO_N/REPORT_TO_N force-conversion pattern, "Conversion Equation" —
 * the equipment module's own unrelated concept). A substring match on
 * "conversion" would false-positive on that legitimate prose; these
 * patterns match only the actual new identifiers this phase introduces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const EVALUATION_PATH_FILES = [
  '../../modules/recorder/formula/lexer.ts',
  '../../modules/recorder/formula/parser.ts',
  '../../modules/recorder/formula/ast.ts',
  '../../modules/recorder/formula/evaluator.ts',
  '../../modules/recorder/formula/validator.ts',
  '../../modules/recorder/formula/builtins.ts',
  '../../modules/recorder/formula/builtinDocs.ts',
  '../../modules/recorder/formula/variableDocs.ts',
  '../../modules/recorder/formula/numeric.ts',
  '../../modules/recorder/formula/studentT.ts',
  '../../modules/recorder/formula/errors.ts',
  '../../modules/recorder/formula/index.ts',
  '../recordRecalculation.ts',
  '../recorderTemplateMockup.ts',
  '../recordEnvironment.ts',
  '../../modules/recorder/hooks/useLiveRecalculation.ts',
];

// Identifier-shaped, not the bare word "conversion" — see file header.
const FORBIDDEN_PATTERNS = [
  /columnConversion/,
  /unitConversionRuleService/,
  /conversionRuleValidation/,
  /\bConversionRule\b/,
  /\bConversionCellSnapshot\b/,
  /\bConversionFailure\b/,
  /\bConversionApplied\b/,
  /\.conversionEnabled\b/,
  /\.conversionSourceUnit\b/,
];

describe('ADR-015 D1 — the formula module and recalculation services know nothing of conversion', () => {
  it('no evaluation-path file imports, references, or reads any conversion-related name', () => {
    for (const relPath of EVALUATION_PATH_FILES) {
      const abs = resolve(__dirname, relPath);
      const source = readFileSync(abs, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source, `${relPath} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
