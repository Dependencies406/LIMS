/**
 * Phase 35B Task 4 — stop the firebase-admin root-namespace breakage from
 * coming back.
 *
 * firebase-admin 14 removed `admin.apps`, `admin.credential` and
 * `admin.firestore` from the root export. `import * as admin from
 * 'firebase-admin'` followed by `admin.apps.length` compiles fine but throws
 * `Cannot read properties of undefined (reading 'length')` at runtime — see
 * docs/PHASE_35B_RESULT.md. This test asserts every script that mentions
 * firebase-admin at all uses the modular API instead.
 *
 * Files are discovered by reading the `scripts/` directory, not from a
 * hard-coded list, so a script added later is covered automatically.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = join(__dirname, '..');

const adminScriptFiles = readdirSync(SCRIPTS_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(SCRIPTS_DIR, name))
  .filter((path) => readFileSync(path, 'utf-8').includes('firebase-admin'));

describe('scripts/ — firebase-admin import style', () => {
  it('found at least one script that mentions firebase-admin (sanity check on discovery itself)', () => {
    expect(adminScriptFiles.length).toBeGreaterThan(0);
  });

  it.each(adminScriptFiles.map((path) => [path] as const))(
    '%s does not use the legacy namespaced import and does import from firebase-admin/app',
    (path) => {
      const contents = readFileSync(path, 'utf-8');

      expect(contents).not.toContain("import * as admin from 'firebase-admin'");
      expect(contents).toMatch(/from ['"]firebase-admin\/app['"]/);
    },
  );
});
