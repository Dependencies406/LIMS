/**
 * builtins.ts
 *
 * The function whitelist of docs/FORMULA_GRAMMAR.md §3.
 *
 * Two families:
 *   - general builtins (ALL-CAPS), valid in both evaluation contexts
 *   - column aggregates (`col_*`), valid ONLY in the summary context and never
 *     inside a custom function body. Their names are declared here so the
 *     validator can recognise them; their evaluation needs whole-column data
 *     and therefore lives in the evaluator.
 *
 * `IF(cond, a, b)` is deliberately absent. The ternary (`a if cond else b`) is
 * the single conditional form — two spellings of one concept would be test and
 * documentation surface for no benefit (§3).
 */

import { invalidComputation } from './errors';
import { roundHalfAwayFromZero, sampleStandardDeviation, truncateToDecimals } from './numeric';
import { tinv } from './studentT';

export interface BuiltinFunction {
  /** Minimum argument count. */
  minArgs: number;
  /** Maximum argument count, or null when variadic. */
  maxArgs: number | null;
  apply: (args: number[]) => number;
}

/** Raises when a result is not a finite number — §6 makes these errors, not NaN. */
function requireFinite(value: number, description: string): number {
  if (!Number.isFinite(value)) {
    throw invalidComputation(`${description} produced a value that is not a finite number.`);
  }
  return value;
}

export const BUILTIN_FUNCTIONS: Record<string, BuiltinFunction> = {
  ABS: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([x]) => Math.abs(x),
  },
  SQRT: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([x]) => {
      // §3: negative input is an error, not NaN.
      if (x < 0) {
        throw invalidComputation('SQRT of a negative number is not defined.');
      }
      return Math.sqrt(x);
    },
  },
  ROUND: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([x, dp]) => roundHalfAwayFromZero(x, dp),
  },
  TRUNC: {
    minArgs: 1,
    maxArgs: 2,
    apply: (args) => truncateToDecimals(args[0], args.length > 1 ? args[1] : 0),
  },
  MAX: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => Math.max(...args),
  },
  MIN: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => Math.min(...args),
  },
  AVERAGE: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => args.reduce((sum, v) => sum + v, 0) / args.length,
  },
  SUM: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => args.reduce((sum, v) => sum + v, 0),
  },
  RSS: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => Math.sqrt(args.reduce((sum, v) => sum + v * v, 0)),
  },
  STDEV: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => {
      // Sample standard deviation uses an n−1 denominator, so a single value
      // has no defined spread.
      if (args.length < 2) {
        throw invalidComputation('STDEV needs at least 2 values.');
      }
      return sampleStandardDeviation(args);
    },
  },
  TINV: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([alpha, nu]) => {
      const k = tinv(alpha, nu);
      if (!Number.isFinite(k)) {
        // §6: TINV outside its domain is an error. Unlike the archived engine,
        // there is no IFERROR-to-2 fallback baked in here.
        throw invalidComputation(
          `TINV is not defined for alpha=${alpha}, degrees of freedom=${nu}.`,
        );
      }
      return k;
    },
  },
};

/** Column aggregate names (§3). Summary context only; never inside a function body. */
export const COLUMN_AGGREGATES = [
  'col_mean',
  'col_max',
  'col_min',
  'col_sum',
  'col_count',
  'col_stdev',
] as const;

export type ColumnAggregateName = (typeof COLUMN_AGGREGATES)[number];

const COLUMN_AGGREGATE_SET = new Set<string>(COLUMN_AGGREGATES);

export function isBuiltin(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_FUNCTIONS, name);
}

export function isColumnAggregate(name: string): name is ColumnAggregateName {
  return COLUMN_AGGREGATE_SET.has(name);
}

/** Human-readable arity, for validation messages. */
export function describeArity(fn: BuiltinFunction): string {
  if (fn.maxArgs === null) return `at least ${fn.minArgs}`;
  if (fn.maxArgs === fn.minArgs) return `${fn.minArgs}`;
  return `${fn.minArgs} to ${fn.maxArgs}`;
}

/** Invokes a general builtin, enforcing arity and finiteness. */
export function callBuiltin(name: string, args: number[]): number {
  const fn = BUILTIN_FUNCTIONS[name];
  if (!fn) {
    throw invalidComputation(`Unknown function '${name}'.`);
  }
  if (args.length < fn.minArgs || (fn.maxArgs !== null && args.length > fn.maxArgs)) {
    throw invalidComputation(
      `${name} expects ${describeArity(fn)} argument(s), got ${args.length}.`,
    );
  }
  return requireFinite(fn.apply(args), `${name}()`);
}
