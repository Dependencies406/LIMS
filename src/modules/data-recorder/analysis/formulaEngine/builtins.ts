/**
 * builtins.ts
 *
 * The formula language's built-in function library — the "Excel built-ins"
 * a step's expression can call. These WRAP the existing, already-tested
 * numeric.ts / uncertaintyBudget.ts / studentT.ts helpers rather than
 * reimplementing them, per design §2: the numerical algorithms stay code,
 * only the arithmetic that combines them becomes editable.
 *
 * A function is variadic if `arity` is null; otherwise arity is the exact
 * argument count `call()` enforces before invoking `apply`.
 */

import { roundHalfAwayFromZero, truncToDecimals } from '../numeric';
import { tinv, FALLBACK_K } from '../studentT';
import { sampleStdDev } from '../uncertaintyBudget';

export interface BuiltinFunction {
  /** Exact argument count, or null for variadic (min 1 arg). */
  arity: number | null;
  apply: (args: number[]) => number;
}

function assertFinite(values: number[], name: string): void {
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new Error(`${name}: received a non-finite argument`);
    }
  }
}

export const BUILTIN_FUNCTIONS: Record<string, BuiltinFunction> = {
  ABS: { arity: 1, apply: ([x]) => Math.abs(x) },
  SQRT: { arity: 1, apply: ([x]) => Math.sqrt(x) },
  ROUND: { arity: 2, apply: ([x, dp]) => roundHalfAwayFromZero(x, dp) },
  TRUNC: {
    arity: null,
    apply: (args) => truncToDecimals(args[0], args.length > 1 ? args[1] : 0),
  },
  MAX: { arity: null, apply: (args) => Math.max(...args) },
  MIN: { arity: null, apply: (args) => Math.min(...args) },
  AVERAGE: {
    arity: null,
    apply: (args) => args.reduce((a, b) => a + b, 0) / args.length,
  },
  SUM: { arity: null, apply: (args) => args.reduce((a, b) => a + b, 0) },
  RSS: {
    arity: null,
    apply: (args) => Math.sqrt(args.reduce((sum, v) => sum + v * v, 0)),
  },
  STDEV: { arity: null, apply: (args) => sampleStdDev(args) },
  /**
   * TINV(alpha, nu) — two-tailed inverse Student-t, with the workbook's own
   * `=IFERROR(TINV(...), 2)` fallback baked in (spec §3 col N): the formula
   * language has no IFERROR, and this is the only place TINV is used.
   */
  TINV: {
    arity: 2,
    apply: ([alpha, nu]) => {
      const k = tinv(alpha, nu);
      return Number.isFinite(k) ? k : FALLBACK_K;
    },
  },
  /** IF(condition, whenTrue, whenFalse) — condition is any nonzero value. */
  IF: {
    arity: 3,
    apply: ([cond, whenTrue, whenFalse]) => (cond !== 0 ? whenTrue : whenFalse),
  },
};

/** Invoke a built-in by (uppercased) name, validating arity and finiteness. */
export function callBuiltin(name: string, args: number[]): number {
  const fn = BUILTIN_FUNCTIONS[name];
  if (!fn) throw new Error(`Unknown function '${name}'`);
  if (fn.arity !== null && args.length !== fn.arity) {
    throw new Error(`${name} expects ${fn.arity} argument(s), got ${args.length}`);
  }
  if (fn.arity === null && args.length === 0) {
    throw new Error(`${name} expects at least 1 argument`);
  }
  assertFinite(args, name);
  return fn.apply(args);
}
