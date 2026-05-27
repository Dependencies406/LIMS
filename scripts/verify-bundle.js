/**
 * verify-bundle.js
 *
 * Checks a built JS bundle to confirm it is the CORRECT "new version" layout.
 * Run this on ANY bundle before declaring it ready or asking the user to approve.
 *
 * Usage:
 *   node scripts/verify-bundle.js                      ← checks dist/assets/index-*.js
 *   node scripts/verify-bundle.js path/to/bundle.js    ← checks a specific file
 *
 * Exit code 0 = PASS (new version confirmed)
 * Exit code 1 = FAIL (old version detected or required features missing)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// ─── What the NEW (correct) version MUST contain ──────────────────────────────
const MUST_HAVE = [
  { pattern: 'Filter by status',     reason: 'StatFilterDropdown (new layout)' },
  { pattern: /typeof.*toDate.*function|toDate==="function"|toDate=="function"/, reason: 'safe firestoreToDate (no crash on load)' },
  { pattern: 'jobShareTokens',       reason: 'signing-link token service present' },
  { pattern: /720\*60\*1e3|43200000/, reason: '12-hour signing-link TTL' },
];

// ─── What the OLD (wrong) version contains — must NOT be present ──────────────
const MUST_NOT_HAVE = [
  { pattern: 'sidebarCollapsed',  reason: 'OLD sidebar layout detected' },
  { pattern: 'PDF Settings',      reason: 'OLD "PDF Settings" button detected' },
  { pattern: '"aside"',           reason: 'OLD <aside> sidebar element detected' },
];

// ─── Find the bundle to check ─────────────────────────────────────────────────
function findBundle() {
  const arg = process.argv[2];
  if (arg) {
    if (!fs.existsSync(arg)) { console.error(`File not found: ${arg}`); process.exit(1); }
    return arg;
  }
  // Auto-find the main JS bundle in dist/assets/
  const distDir = path.join(__dirname, '..', 'dist', 'assets');
  if (!fs.existsSync(distDir)) {
    console.error('ERROR: dist/assets/ not found. Has a build been run?');
    process.exit(1);
  }
  const files = fs.readdirSync(distDir).filter(f => f.startsWith('index-') && f.endsWith('.js'));
  if (files.length === 0) { console.error('ERROR: No index-*.js found in dist/assets/'); process.exit(1); }
  // Pick the largest (main bundle)
  const sorted = files.sort((a, b) => {
    return fs.statSync(path.join(distDir, b)).size - fs.statSync(path.join(distDir, a)).size;
  });
  return path.join(distDir, sorted[0]);
}

// ─── Run checks ──────────────────────────────────────────────────────────────
const bundlePath = findBundle();
console.log(`\nChecking bundle: ${path.basename(bundlePath)}`);
console.log('─'.repeat(60));

const bundle = fs.readFileSync(bundlePath, 'utf8');

let passed = true;

// Check MUST HAVE
console.log('\n✅  REQUIRED (new version features):');
for (const { pattern, reason } of MUST_HAVE) {
  const found = typeof pattern === 'string' ? bundle.includes(pattern) : pattern.test(bundle);
  const mark = found ? '  PASS' : '  FAIL ←';
  console.log(`  ${mark}  ${reason}`);
  if (!found) passed = false;
}

// Check MUST NOT HAVE
console.log('\n🚫  FORBIDDEN (old version markers):');
for (const { pattern, reason } of MUST_NOT_HAVE) {
  const found = typeof pattern === 'string' ? bundle.includes(pattern) : pattern.test(bundle);
  const mark = found ? '  FAIL ← OLD VERSION DETECTED' : '  PASS';
  console.log(`  ${mark}  ${reason}`);
  if (found) passed = false;
}

// ─── Result ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (passed) {
  console.log('✅  RESULT: NEW VERSION CONFIRMED — safe to show the user\n');
  process.exit(0);
} else {
  console.log('❌  RESULT: WRONG VERSION — DO NOT show this to the user!\n');
  process.exit(1);
}
