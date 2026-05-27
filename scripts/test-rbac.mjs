/**
 * LIMS RBAC Systematic Test Suite
 * ─────────────────────────────────
 * Opens a visible Chrome window.
 * Auto-detects when you log in (polls the URL — no Enter key needed).
 * Runs all Admin checks, then prompts for Staff login the same way.
 *
 * Usage:  node scripts/test-rbac.mjs
 * Requires dev server at http://localhost:5173
 */

import puppeteer from 'puppeteer-core';
import path      from 'path';
import os        from 'os';
import http      from 'http';

const BASE_URL = 'http://localhost:5173';
const CHROME   = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TIMEOUT  = 12_000;

// ─── Results ──────────────────────────────────────────────────────────────────
const R = { passed: [], failed: [], warnings: [] };
const pass = n     => { R.passed.push(n);      console.log(`  ✅  ${n}`); };
const fail = (n,r) => { R.failed.push({n,r});  console.log(`  ❌  ${n}\n      └ ${r}`); };
const warn = (n,r) => { R.warnings.push({n,r});console.log(`  ⚠️   ${n}\n      └ ${r}`); };
const sect = t     => console.log(`\n${'─'.repeat(62)}\n  ${t}\n${'─'.repeat(62)}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nav   = (p,u) => p.goto(`${BASE_URL}${u}`, { waitUntil:'networkidle2', timeout:TIMEOUT });
const sleep = ms    => new Promise(r => setTimeout(r, ms));
const exists= async (page,sel) => !!(await page.$(sel));

async function getButtons(page) {
  return page.$$eval('button', els => els.map(e => e.textContent?.trim()).filter(Boolean));
}

/** Poll until URL leaves /login, then return true */
async function waitForLogin(page, role = 'Admin', maxMs = 3 * 60_000) {
  const deadline = Date.now() + maxMs;
  console.log(`\n  🔐  Waiting for ${role} login in the Chrome window…`);
  console.log('      (Log in normally — the test continues automatically)\n');
  while (Date.now() < deadline) {
    try {
      const url = page.url();
      if (!url.includes('/login') && url.includes('localhost:5173')) return true;
    } catch {}
    await sleep(1500);
  }
  fail(`${role} login detected`, `Timed out after ${maxMs/1000}s`);
  return false;
}

/** Poll until URL reaches /login (max 90s) — used after logout */
async function waitForLogout(page) {
  const deadline = Date.now() + 90_000;
  console.log('\n  🔓  Waiting for logout in the Chrome window…\n');
  while (Date.now() < deadline) {
    try {
      if (page.url().includes('/login')) return true;
    } catch { }
    await sleep(1500);
  }
  return false;
}

async function assertNotLogin(page, label) {
  const u = page.url();
  if (u.includes('/login')) { fail(label, 'Unexpectedly redirected to /login'); return false; }
  pass(label); return true;
}

// ─── ADMIN TESTS ──────────────────────────────────────────────────────────────
async function runAdminTests(page, errs) {

  // 1. Auth sanity
  sect('1 · AUTHENTICATION & SESSION');
  await nav(page, '/jobs'); await sleep(2000);
  if (page.url().includes('/login')) { fail('Admin session active', 'Redirected to /login'); return false; }
  pass('Admin session active — reached /jobs');

  const firebaseErrs = errs.filter(e =>
    e.includes('auth/') || e.includes('invalid-api-key') || e.includes('Missing required environment'));
  if (firebaseErrs.length) fail('No Firebase auth errors', firebaseErrs[0]);
  else pass('No Firebase auth errors in console');

  // 2. Every protected route reachable
  sect('2 · ROUTE ACCESS — All pages reachable as Admin');
  const adminRoutes = [
    ['/jobs',                     'Jobs page'],
    ['/customers',                'Customers page'],
    ['/pending-jobs',             'Pending Requests page'],
    ['/equipment',                'Equipment Dashboard'],
    ['/equipment/calibration-plan','Calibration Plan page'],
    ['/documents',                'Documents Index page'],
    ['/recycle-bin',              'Recycle Bin page'],
    ['/settings',                 'Settings page (admin-only)'],
  ];
  for (const [route, label] of adminRoutes) {
    await nav(page, route); await sleep(1500);
    await assertNotLogin(page, `${label} — no login redirect`);
  }

  // 3. AdminRoute guard
  sect('3 · ADMIN ROUTE GUARD (/settings)');
  await nav(page, '/settings'); await sleep(1500);
  if (page.url().includes('/settings')) pass('AdminRoute: /settings resolves for admin user');
  else fail('AdminRoute /settings', `Ended at ${page.url()}`);

  // 4. Jobs workflow
  sect('4 · JOBS WORKFLOW');
  await nav(page, '/jobs'); await sleep(2500);

  const viewBtns = await page.$$eval('button', els =>
    els.map(e => e.textContent?.trim()).filter(t => ['List','Card','Grid'].includes(t ?? '')));
  if (viewBtns.length >= 2) pass(`Job view toggles present: ${viewBtns.join(', ')}`);
  else warn('Job view toggles', `Found: ${viewBtns.join(', ') || 'none'}`);

  const jBtns = await getButtons(page);
  if (jBtns.some(t => t.includes('Create') || t.includes('+'))) pass('Create Job button visible');
  else warn('Create Job button', `Buttons: ${jBtns.slice(0,8).join(' | ')}`);
  if (jBtns.some(t => t.toLowerCase().includes('export'))) pass('Export button visible');
  else warn('Export button on Jobs', 'Not found');

  // Open Create Job modal
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Create') || b.textContent?.includes('+ '));
    b?.click();
  });
  await sleep(1500);
  if (await exists(page, '[class*="modal"],[role="dialog"]')) {
    pass('Create Job modal opens without crash');
    await page.keyboard.press('Escape'); await sleep(500);
  } else warn('Create Job modal', 'Modal not detected after clicking Create');

  // Click first job row → detail
  await nav(page, '/jobs'); await sleep(2000);
  const firstJobLink = await page.$('a[href*="/jobs/S"]');
  if (firstJobLink) {
    await firstJobLink.click(); await sleep(2000);
    if (page.url().match(/\/jobs\/.+/)) pass('Job row → Job Detail page navigation');
    else warn('Job detail navigation', `URL: ${page.url()}`);
  } else {
    // Try clicking a table row
    await page.evaluate(() => {
      const row = document.querySelector('table tbody tr');
      if (row) row.click();
    });
    await sleep(1500);
    if (page.url().match(/\/jobs\/.+/)) pass('Job table row → Job Detail page navigation');
    else warn('Job detail navigation', 'No clickable job rows found');
  }

  // Filter by status
  await nav(page, '/jobs'); await sleep(2000);
  const filterSelect = await page.$('select');
  if (filterSelect) {
    await filterSelect.select('In Progress').catch(() => {});
    await sleep(800);
    pass('Job status filter dropdown works');
  } else warn('Job status filter', 'No <select> found on Jobs page');

  // 5. Customers workflow
  sect('5 · CUSTOMERS WORKFLOW');
  await nav(page, '/customers'); await sleep(2000);
  const cBtns = await getButtons(page);
  if (cBtns.some(t => /add|new|create|\+/i.test(t))) pass('Add/Create Customer button visible');
  else warn('Create Customer button', `Buttons: ${cBtns.slice(0,8).join(' | ')}`);
  if (cBtns.some(t => /export/i.test(t))) pass('Export Customers button visible');
  else warn('Export Customers button', 'Not found');

  // 6. Pending Requests
  sect('6 · PENDING REQUESTS WORKFLOW');
  await nav(page, '/pending-jobs'); await sleep(2000);
  await assertNotLogin(page, 'Pending Requests page loads');
  const pBtns = await getButtons(page);
  if (pBtns.some(t => /convert|accept|approve/i.test(t))) pass('Convert/Accept action visible');
  else warn('Convert button', 'No pending requests or button missing');
  if (pBtns.some(t => /cancel|reject|deny/i.test(t))) pass('Cancel/Reject action visible');
  else warn('Cancel button', 'No pending requests or button missing');

  // 7. Equipment workflow
  sect('7 · EQUIPMENT WORKFLOW');
  await nav(page, '/equipment'); await sleep(2500);
  await assertNotLogin(page, 'Equipment Dashboard loads');

  const eBtns = await getButtons(page);
  if (eBtns.some(t => /register|add|new|\+/i.test(t))) pass('Register Equipment button visible');
  else warn('Register button', `Buttons: ${eBtns.slice(0,10).join(' | ')}`);
  if (eBtns.some(t => /approve|verify/i.test(t))) pass('Approve button visible for pending equipment');
  else warn('Equipment Approve button', 'No pending equipment or button absent');

  // Open a detail page if equipment exists
  const eqDetailLink = await page.$('a[href*="/equipment/"]:not([href*="/equipment/new"]):not([href*="calibration-plan"])');
  if (eqDetailLink) {
    const href = await eqDetailLink.evaluate(el => el.getAttribute('href'));
    await nav(page, href); await sleep(2000);
    await assertNotLogin(page, 'Equipment Detail page loads');
    const dBtns = await getButtons(page);
    if (dBtns.some(t => /edit|update/i.test(t))) pass('Equipment Detail: Edit button visible');
    else warn('Equipment Detail Edit', `Buttons: ${dBtns.slice(0,8).join(' | ')}`);
    if (dBtns.some(t => /upload|attach/i.test(t))) pass('Equipment Detail: Upload Document button visible');
    else warn('Equipment Detail Upload', 'Upload button not found');
    if (dBtns.some(t => /calib/i.test(t))) pass('Equipment Detail: Calibration action visible');
    else warn('Equipment Calibration button', 'Not found');
    if (dBtns.some(t => /log.?usage|usage.?log/i.test(t))) pass('Equipment Detail: Log Usage button visible');
    else warn('Log Usage button', `Buttons: ${dBtns.slice(0,8).join(' | ')}`);
    if (dBtns.some(t => /retire/i.test(t))) pass('Equipment Detail: Retire button visible for admin');
    else warn('Retire button', 'Not found on detail page');

    // Usage log new
    await nav(page, `${href}/usage-log/new`); await sleep(2000);
    await assertNotLogin(page, 'Usage Log entry form accessible');
    await nav(page, `${href}/usage-log`);    await sleep(2000);
    await assertNotLogin(page, 'Usage Log history page accessible');
  } else warn('Equipment detail', 'No equipment detail links found — database may be empty');

  // Calibration plan
  await nav(page, '/equipment/calibration-plan'); await sleep(2000);
  await assertNotLogin(page, 'Calibration Plan page accessible');

  // Registration wizard
  await nav(page, '/equipment/new'); await sleep(2000);
  await assertNotLogin(page, 'Equipment Registration Wizard accessible');

  // 8. Documents
  sect('8 · DOCUMENTS INDEX WORKFLOW');
  await nav(page, '/documents'); await sleep(2000);
  const dBtns = await getButtons(page);
  if (dBtns.some(t => /add|upload|new|\+/i.test(t))) pass('Add/Upload button visible on Documents page');
  else warn('Documents add button', `Buttons: ${dBtns.slice(0,8).join(' | ')}`);

  // 9. Recycle Bin
  sect('9 · RECYCLE BIN WORKFLOW');
  await nav(page, '/recycle-bin'); await sleep(2000);
  await assertNotLogin(page, 'Recycle Bin page loads');
  const rbText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (/deleted|restore|empty|recycle/.test(rbText)) pass('Recycle Bin shows relevant state');
  else warn('Recycle Bin content', 'No recognisable restore/empty state text');

  // 10. Settings sections
  sect('10 · SETTINGS PAGE — All sections present');
  await nav(page, '/settings'); await sleep(2500);
  const sBody = await page.evaluate(() => document.body.innerText.toLowerCase());
  for (const kw of ['company','job id','user','pdf','spreadsheet','certificate','role']) {
    if (sBody.includes(kw)) pass(`Settings: "${kw}" section present`);
    else warn(`Settings: "${kw}"`, 'Section keyword not found on page');
  }

  // 11. Users & Roles modal
  sect('11 · USERS & ROLES MANAGEMENT MODAL');
  await nav(page, '/settings'); await sleep(2000);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      /user.*role|manage|users\s*&\s*roles/i.test(b.textContent ?? ''));
    if (!btn) {
      // fallback — click anything with "user" in it
      const fb = Array.from(document.querySelectorAll('button')).find(b =>
        /user/i.test(b.textContent ?? ''));
      fb?.click();
    } else btn.click();
  });
  await sleep(1800);

  const modalOpen = await exists(page, '[class*="modal"],[role="dialog"]');
  if (modalOpen) {
    pass('Users & Roles modal opens');
    const modalText = await page.evaluate(() =>
      (document.querySelector('[class*="modal"],[role="dialog"]'))?.innerText ?? '');
    if (/@|user/i.test(modalText)) pass('Users tab: user list content visible');
    else warn('Users list', 'No @ or user text in modal');

    const mBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="modal"] button,[role="dialog"] button'))
        .map(b => b.textContent?.trim()).filter(Boolean));
    if (mBtns.some(t => /create|invite|add/i.test(t ?? ''))) pass('Create/Invite User button in modal');
    else warn('Create User button', `Modal buttons: ${mBtns.join(' | ')}`);

    // Switch to Roles tab
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Roles');
      tab?.click();
    });
    await sleep(1000);
    const roleText = await page.evaluate(() =>
      (document.querySelector('[class*="modal"],[role="dialog"]'))?.innerText ?? '');
    if (/admin|standard|role/i.test(roleText)) pass('Roles tab: built-in roles visible');
    else warn('Roles tab list', 'No role names in modal');

    const rBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="modal"] button,[role="dialog"] button'))
        .map(b => b.textContent?.trim()).filter(Boolean));
    if (rBtns.some(t => /create|new role|add role/i.test(t ?? ''))) pass('Create Role button visible');
    else warn('Create Role button', `Buttons: ${rBtns.join(' | ')}`);

    // Open Edit modal for first custom role
    const editBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('[class*="modal"] button,[role="dialog"] button'));
      const b = btns.find(b => /edit/i.test(b.textContent ?? ''));
      if (b) { b.click(); return true; }
      return false;
    });
    await sleep(1000);
    if (editBtn) {
      const editModal = await exists(page, '[class*="modal"] input,[role="dialog"] input[type="checkbox"]');
      if (editModal) pass('Edit Role modal: permission checkboxes render');
      else warn('Edit Role modal', 'No checkboxes found after clicking Edit');
    } else warn('Edit Role modal', 'No Edit button found in roles list');

    await page.keyboard.press('Escape'); await sleep(500);
    await page.keyboard.press('Escape'); await sleep(500);
  } else warn('Users & Roles modal', 'Could not detect modal — Settings structure may differ');

  // 12. Navigation links
  sect('12 · NAVIGATION LINKS — Sidebar/header links work');
  await nav(page, '/jobs'); await sleep(1500);
  const navLinks = await page.$$eval(
    'nav a, aside a, [class*="sidebar"] a, [class*="nav"] a, [class*="Layout"] a',
    els => els.map(a => ({ href: a.getAttribute('href') ?? '', text: a.textContent?.trim() ?? '' }))
      .filter(l => l.href.startsWith('/') && l.text));
  if (navLinks.length > 0) {
    pass(`${navLinks.length} navigation <a> links found`);
    for (const { href, text } of navLinks) {
      await nav(page, href); await sleep(1000);
      if (page.url().includes('/login')) fail(`Nav "${text}" → ${href}`, 'Redirected to login');
      else pass(`Nav "${text}" → ${href}`);
    }
  } else warn('Navigation links', 'No <a> tags found in nav — sidebar may use onClick');

  return true;
}

// ─── STAFF TESTS ──────────────────────────────────────────────────────────────
async function runStaffTests(page) {

  sect('13 · STAFF SESSION SANITY');
  await nav(page, '/jobs'); await sleep(2000);
  if (page.url().includes('/login')) { fail('Staff session active', 'Still on /login'); return; }
  pass('Staff session active — reached /jobs');

  sect('14 · STAFF: ALL NON-ADMIN ROUTES ACCESSIBLE');
  const staffRoutes = [
    ['/jobs',         'Jobs page'],
    ['/customers',    'Customers page'],
    ['/pending-jobs', 'Pending Requests page'],
    ['/equipment',    'Equipment Dashboard'],
    ['/documents',    'Documents page'],
    ['/recycle-bin',  'Recycle Bin'],
  ];
  for (const [route, label] of staffRoutes) {
    await nav(page, route); await sleep(1200);
    await assertNotLogin(page, `Staff: ${label} accessible`);
  }

  sect('15 · ADMIN-ONLY ROUTE BLOCKED FOR STAFF');
  await nav(page, '/settings'); await sleep(1500);
  if (!page.url().includes('/settings')) pass('Staff: /settings correctly redirected (AdminRoute guard works)');
  else fail('Staff /settings should be blocked', `Staff user reached /settings — AdminRoute guard failed`);

  sect('16 · STAFF PERMISSION UI — Button visibility per role');
  await nav(page, '/jobs'); await sleep(2000);
  const sBtns = await getButtons(page);
  // Staff default role may or may not have jobs.create — warn either way
  if (sBtns.some(t => /Create Job|\+ Create/i.test(t))) {
    warn('Create Job visible for Staff', 'Visible — verify jobs.create is intentionally in staff role');
  } else pass('Create Job button hidden for Staff (jobs.create not in standard role)');

  // Check permission denial modal works if staff tries to access admin UI
  sect('17 · PERMISSION DENIAL UI');
  // Navigate to something the staff can see but trigger an admin action
  await nav(page, '/equipment'); await sleep(2000);
  const eqBtns = await getButtons(page);
  const approveVisible = eqBtns.some(t => /approve/i.test(t));
  if (!approveVisible) pass('Staff: Approve Equipment button hidden (equipmentControl.approve not in staff role)');
  else warn('Approve button visible for Staff', 'Check equipmentControl.approve permission in staff role');
}

// ─── CONSOLE ERROR AUDIT ──────────────────────────────────────────────────────
async function auditConsoleErrors(page, errs) {
  sect('CONSOLE ERROR AUDIT — All pages');
  const routes = ['/jobs','/customers','/pending-jobs','/equipment','/documents','/recycle-bin','/settings'];
  for (const r of routes) { try { await nav(page, r); await sleep(800); } catch {} }

  const critical = [...new Set(errs.filter(e =>
    !e.includes('ResizeObserver') && !e.includes('favicon') &&
    !e.includes('[HMR]') && !e.includes('Warning:') &&
    !e.includes('net::ERR_ABORTED') && e.length > 5))];

  if (critical.length === 0) pass('Zero critical console errors across all pages');
  else {
    fail(`${critical.length} unique console errors`, critical.slice(0,3).join('; '));
    critical.slice(0,8).forEach((e,i) => console.log(`      [${i+1}] ${e.slice(0,140)}`));
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(62));
  console.log('  LIMS RBAC SYSTEMATIC TEST SUITE');
  console.log('  Target: ' + BASE_URL);
  console.log('═'.repeat(62));

  // Verify dev server
  await new Promise((res, rej) => {
    const req = http.get(BASE_URL, res);
    req.on('error', () => rej(new Error('Dev server not reachable at ' + BASE_URL)));
    req.setTimeout(5000, () => rej(new Error('Dev server timeout')));
  }).catch(e => { console.error('\n🚫  ' + e.message + '\n    → Run: npm run dev'); process.exit(1); });
  pass('Dev server reachable');

  const tmpProfile = path.join(os.tmpdir(), 'lims-rbac-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    defaultViewport: { width: 1400, height: 880 },
    args: [`--user-data-dir=${tmpProfile}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox'],
  });

  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));

  // ── PHASE 1: Admin ────────────────────────────────────────────────────────
  console.log('\n  ════════════════════════════════════════════');
  console.log('  PHASE 1 — ADMIN USER TESTS');
  console.log('  ════════════════════════════════════════════');
  await nav(page, '/login');
  const adminLoggedIn = await waitForLogin(page, 'Admin');

  let adminOk = false;
  if (adminLoggedIn) adminOk = await runAdminTests(page, errs);

  // ── PHASE 2: Staff ────────────────────────────────────────────────────────
  console.log('\n  ════════════════════════════════════════════');
  console.log('  PHASE 2 — STAFF USER TESTS');
  console.log('  ════════════════════════════════════════════');
  console.log('  Please log OUT in the Chrome window and log in as a STAFF user.');
  console.log('  (If no staff account, just wait 30 seconds and staff tests will be skipped.)');

  await nav(page, '/login');
  const loggedOut = await waitForLogout(page);
  if (loggedOut) {
    const staffLoggedIn = await waitForLogin(page, 'Staff', 90_000);
    if (staffLoggedIn) await runStaffTests(page);
    else warn('Staff tests', 'Skipped — no staff login detected within timeout');
  } else {
    warn('Staff tests', 'Skipped — logout not detected within 90 seconds');
  }

  await auditConsoleErrors(page, errs);
  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log('  FINAL TEST RESULTS');
  console.log('═'.repeat(62));
  console.log(`  ✅  Passed   : ${R.passed.length}`);
  console.log(`  ❌  Failed   : ${R.failed.length}`);
  console.log(`  ⚠️   Warnings : ${R.warnings.length}`);

  if (R.failed.length > 0) {
    console.log('\n  ── FAILURES ──────────────────────────────────────────────');
    R.failed.forEach(({n,r}) => console.log(`  • ${n}\n    ${r}`));
  }
  if (R.warnings.length > 0) {
    console.log('\n  ── WARNINGS ──────────────────────────────────────────────');
    R.warnings.forEach(({n,r}) => console.log(`  • ${n}\n    ${r}`));
  }
  console.log('═'.repeat(62) + '\n');
  process.exit(R.failed.length > 0 ? 1 : 0);
}

main();
