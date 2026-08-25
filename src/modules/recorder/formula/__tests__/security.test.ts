import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-001's entire security argument is that an AST interpreter never executes
 * user text as code. Template documents are user-writable and the Firestore
 * rules on them are permissive, so a formula that could reach eval() would be a
 * stored code-injection vector against every other user's browser.
 *
 * This test makes that guarantee permanent rather than a matter of review
 * discipline: it fails if any dynamic-code construct is ever introduced into
 * the module.
 */

const MODULE_DIR = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Comment-stripped source, so prose mentioning `eval` does not trip the scan. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ['eval(', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\s*\(/],
  ['Function constructor call', /\bFunction\s*\(\s*['"`]/],
  ['setTimeout with a string', /\bsetTimeout\s*\(\s*['"`]/],
  ['setInterval with a string', /\bsetInterval\s*\(\s*['"`]/],
  ['indirect eval via globalThis', /globalThis\s*\[\s*['"`]eval['"`]\s*\]/],
  ['import()', /\bimport\s*\(/],
  ['require()', /\brequire\s*\(/],
];

describe('no dynamic code construction anywhere in the formula module', () => {
  const files = sourceFiles(MODULE_DIR);

  it('finds the module source files to scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN)('contains no %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(code(file)));
    expect(offenders).toEqual([]);
  });

  it('does not import from the recorder-reserved archive', () => {
    const offenders = files.filter((file) => /recorder-reserved/.test(code(file)));
    expect(offenders).toEqual([]);
  });
});
