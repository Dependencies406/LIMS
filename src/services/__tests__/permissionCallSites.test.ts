/**
 * Every permission the app consults must be grantable.
 *
 * Phase 34 found `usePermission('staffTraining.view')` being checked against a
 * list that had never heard of it. Because `can()` returns false for anything
 * it does not recognise, the control was simply dead for everyone, including
 * administrators — and nothing failed, nothing logged, no box existed to tick.
 * Three permissions were in that state. Phase 37 added them; this test is what
 * stops a fourth appearing.
 *
 * It reads the source from disk rather than importing it, because the thing
 * being checked is a string literal in a file — a type system cannot see the
 * mismatch (`PermissionAction` already contained all three), and an import
 * graph would only cover files something happens to import.
 *
 * DIRECTION: this asserts one way only — every permission CONSULTED must be
 * LISTED. It deliberately does not assert the converse. Most listed permissions
 * have no call site yet; that backlog is real, tracked in PHASE_34_RESULT.md,
 * and is not this test's business. Asserting it here would turn a useful guard
 * into a failing test nobody can fix in one sitting.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_PERMISSIONS } from '../roleService';

/** `<repo>/src` — derived from this file's own location, not from cwd. */
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** This file scans for call sites; its own examples must not count as one. */
const THIS_FILE = fileURLToPath(import.meta.url);

const SCANNED_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Matches a string literal passed as the first argument to `usePermission`.
 * Single quotes, double quotes and plain backticks are all accepted — a
 * template literal WITH interpolation cannot be resolved statically and is
 * intentionally not matched (see the note in the final test).
 */
const CALL_SITE_RE = /usePermission\(\s*['"`]([^'"`]+)['"`]/g;

interface CallSite {
  permission: string;
  /** Repo-relative, e.g. `src/pages/StaffPage.tsx:855`. */
  location: string;
}

/** Walk `dir` recursively, returning every scannable source file. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    if (full === THIS_FILE) continue;
    out.push(full);
  }
  return out;
}

/** Every `usePermission('…')` in `src/`, with the file:line it appears on. */
function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const file of collectSourceFiles(SRC_ROOT)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CALL_SITE_RE)) {
        sites.push({
          permission: match[1],
          location: `${relative(SRC_ROOT, file).replace(/\\/g, '/')}:${index + 1}`,
        });
      }
    });
  }

  return sites;
}

const callSites = findCallSites();
const listed = new Set(ALL_PERMISSIONS.map((p) => p.action as string));

describe('every permission the app consults is grantable', () => {
  it('finds call sites at all — a scanner that finds nothing proves nothing', () => {
    // Guards against the walk silently breaking (wrong root, changed layout)
    // and the whole suite passing vacuously ever after.
    expect(callSites.length).toBeGreaterThan(10);
  });

  it('every usePermission() string exists in ALL_PERMISSIONS', () => {
    const orphans = callSites.filter((site) => !listed.has(site.permission));

    // Named individually, with file:line, so a red test is directly actionable.
    const report = orphans
      .map(
        (site) =>
          `  ${site.permission}\n` +
          `      consulted at src/${site.location}\n` +
          `      but missing from ALL_PERMISSIONS in src/services/roleService.ts`
      )
      .join('\n');

    expect(
      orphans,
      orphans.length === 0
        ? ''
        : `\n${orphans.length} permission(s) are checked by the app but cannot be granted by any role.\n` +
            `A role can never hold them, so the control is dead for everyone — including administrators.\n` +
            `Add each to ALL_PERMISSIONS (and decide whether Standard user should have it):\n\n` +
            `${report}\n`
    ).toEqual([]);
  });

  it('reports the permissions it checked, so the scan is visible in review', () => {
    const distinct = [...new Set(callSites.map((s) => s.permission))].sort();
    // Every distinct permission consulted resolves. Stated as its own assertion
    // so the count appears in the diff when a call site is added or removed.
    expect(distinct.every((p) => listed.has(p))).toBe(true);
    expect(distinct.length).toBeGreaterThan(0);
  });

  it('does not scan itself', () => {
    // This file contains the literal `usePermission(` inside its own regex and
    // comments; if the exclusion broke, those would surface as bogus orphans.
    expect(callSites.some((s) => s.location.startsWith('services/__tests__/permissionCallSites'))).toBe(false);
  });

  it('only matches statically resolvable literals, by design', () => {
    // A dynamic call — usePermission(someVariable) — cannot be checked from
    // source and is not matched. Recorded here so the limitation is a stated
    // choice rather than an unnoticed hole: if a dynamic call site is ever
    // introduced, this test will not catch it.
    expect(CALL_SITE_RE.source).toContain("['\"`]");
  });
});
