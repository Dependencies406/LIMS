/**
 * Reports exactly what is stored in every `certificate_number_configs`
 * document — with the JavaScript type of each counter field — so the open
 * question in ADR-019 ("What `currentYear` values are actually in the live
 * documents?") can be answered from data rather than from assumption.
 *
 * Why the types matter (ADR-019 D5, and the allocation transaction at
 * `src/services/certificateNumberGeneratorService.ts:109-118`):
 *   - The yearly reset test is `config.currentYear !== new Date().getFullYear()`,
 *     a strict comparison against a four-digit NUMBER. A `currentYear` that is
 *     the string "2026", or the two-digit number 26, is never equal to 2026, so
 *     the test is true on EVERY allocation — the counter resets to 0 each time
 *     and the same number is silently reissued.
 *   - `currentNumber` and `currentSequence` are written to the same value by
 *     that transaction (`:133-134`). If they disagree in the live data,
 *     something other than the transaction has written one of them.
 *
 * READ-ONLY. This script performs zero writes; there is no write path
 * implemented. `--dry-run` is accepted for symmetry with the sibling report
 * scripts, but has no effect — every run of this script is already a dry run.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run report:certificate-configs -- --dry-run
 *
 * Requires a Firebase service-account key (Firestore read access is enough)
 * referenced via GOOGLE_APPLICATION_CREDENTIALS. Never paste that key's
 * contents into chat, a commit, or anywhere else — point the env var at a
 * local file only.
 */

// NOTE ON THE IMPORT STYLE — deliberately different from the sibling report
// scripts. Those use the legacy namespaced API (`admin.apps`,
// `admin.credential`, `admin.firestore`) from a default `firebase-admin`
// import. firebase-admin 14 removed all three from the root export, so under
// the current (uncommitted) dependency migration those scripts throw
// `Cannot read properties of undefined (reading 'length')` before they read
// anything. This script uses the modular API, which works on 14.
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * What one document looks like once read. Values stay `unknown` deliberately:
 * the whole point is to report what is really there, not what the type says.
 */
interface ConfigRow {
  id: string;
  name: unknown;
  prefix: unknown;
  resetPolicy: unknown;
  isActive: unknown;
  currentNumber: unknown;
  currentSequence: unknown;
  currentYear: unknown;
  hasLastAllocatedAt: boolean;
  hasLastResetAt: boolean;
}

/** `typeof`, but distinguishing null and arrays — both of which report as "object". */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function show(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

/**
 * A sound year is a NUMBER of exactly four digits. Anything else breaks the
 * reset test described in this file's header.
 */
function isFourDigitYearNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= 9999;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function formatTable(rows: ConfigRow[]): string {
  const header = [
    'document id', 'name', 'prefix', 'resetPolicy', 'isActive',
    'currentNumber', 'currentSequence', 'currentYear',
    'lastAllocatedAt', 'lastResetAt',
  ];
  const body = rows.map((r) => [
    r.id,
    show(r.name),
    show(r.prefix),
    show(r.resetPolicy),
    show(r.isActive),
    `${show(r.currentNumber)} (${describeType(r.currentNumber)})`,
    `${show(r.currentSequence)} (${describeType(r.currentSequence)})`,
    `${show(r.currentYear)} (${describeType(r.currentYear)})`,
    r.hasLastAllocatedAt ? 'present' : 'absent',
    r.hasLastResetAt ? 'present' : 'absent',
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...body.map((cells) => cells[i].length)));

  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c, widths[i])).join('  ');

  return [
    line(header),
    widths.map((w) => '-'.repeat(w)).join('  '),
    ...body.map(line),
  ].join('\n');
}

/** The plain-English verdict the owner reads. Pure: takes rows, returns text. */
export function buildConclusion(rows: ConfigRow[]): string {
  const out: string[] = [];

  if (rows.length === 0) {
    return 'No documents found in certificate_number_configs — there is nothing to assess.';
  }

  const badYear = rows.filter((r) => !isFourDigitYearNumber(r.currentYear));
  if (badYear.length === 0) {
    out.push(`YEAR VALUES: SOUND. All ${rows.length} document(s) store currentYear as a four-digit number.`);
  } else {
    out.push(`YEAR VALUES: NOT SOUND. ${badYear.length} of ${rows.length} document(s) do NOT store currentYear as a four-digit number:`);
    badYear.forEach((r) => {
      const v = r.currentYear;
      let why: string;
      if (v === undefined) why = 'missing';
      else if (typeof v === 'string') why = 'stored as a string';
      else if (typeof v === 'number' && v >= 0 && v <= 99) why = 'a two-digit value';
      else why = `unexpected ${describeType(v)}`;
      out.push(`  - ${r.id} (${show(r.name)}): currentYear = ${show(v)} — ${why}`);
    });
    out.push('  Each of these makes the yearly reset test true on EVERY allocation,');
    out.push('  restarting the counter at 001 and reissuing numbers already used.');
  }

  out.push('');

  const disagree = rows.filter((r) => r.currentNumber !== r.currentSequence);
  if (disagree.length === 0) {
    out.push('COUNTERS: currentNumber and currentSequence agree in every document.');
  } else {
    out.push(`COUNTERS: ${disagree.length} document(s) where currentNumber and currentSequence DISAGREE:`);
    disagree.forEach((r) => {
      out.push(`  - ${r.id} (${show(r.name)}): currentNumber = ${show(r.currentNumber)} (${describeType(r.currentNumber)}), currentSequence = ${show(r.currentSequence)} (${describeType(r.currentSequence)})`);
    });
    out.push('  The allocation transaction writes both to the same value, so a');
    out.push('  disagreement means something else has written one of them.');
  }

  return out.join('\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun
    ? 'Running in report-only mode (this script never writes, with or without --dry-run).'
    : 'Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.');

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
    });
  }
  const db = getFirestore();

  const snap = await db.collection('certificate_number_configs').get();

  const rows: ConfigRow[] = [];
  snap.forEach((doc) => {
    const d = doc.data();
    rows.push({
      id: doc.id,
      name: d.name,
      prefix: d.prefix,
      resetPolicy: d.resetPolicy,
      isActive: d.isActive,
      currentNumber: d.currentNumber,
      currentSequence: d.currentSequence,
      currentYear: d.currentYear,
      hasLastAllocatedAt: d.lastAllocatedAt !== undefined && d.lastAllocatedAt !== null,
      hasLastResetAt: d.lastResetAt !== undefined && d.lastResetAt !== null,
    });
  });

  rows.sort((a, b) => a.id.localeCompare(b.id));

  console.log('');
  console.log(`certificate_number_configs documents read: ${rows.length}`);
  console.log('');
  console.log(formatTable(rows));
  console.log('');
  console.log('--- Conclusion ---');
  console.log(buildConclusion(rows));
  console.log('');
  console.log('Diagnostic only (ADR-019 open question). This script makes no changes.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Report failed:', err);
    process.exit(1);
  });
