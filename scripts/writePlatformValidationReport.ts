/**
 * Renders the Tier 1 Platform Validation Report (ADR-018 D9) from the vitest
 * JSON report produced by the CI test step, and writes it as Markdown to
 * validation-reports/ (generated output — not project documentation, not
 * committed; see CLAUDE.md RULE 9 and .gitignore).
 *
 * Must run after the vitest JSON report has been written.
 *
 * Usage:
 *   npx tsx scripts/writePlatformValidationReport.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function formatBangkok(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date);
}

function formatDuration(testReport: any): string {
  const start = testReport.startTime;
  const endTimes = Array.isArray(testReport.testResults)
    ? testReport.testResults
        .map((r: any) => r.endTime)
        .filter((t: any) => typeof t === 'number')
    : [];
  if (typeof start !== 'number' || endTimes.length === 0) return 'unknown';
  const end = Math.max(...endTimes);
  return `${((end - start) / 1000).toFixed(2)}s`;
}

function main() {
  const testReportPath = path.join(ROOT, 'test-results', 'vitest-report.json');
  if (!fs.existsSync(testReportPath)) {
    console.error(
      `Test report not found at ${testReportPath}. This script must run after the vitest JSON reporter step.`
    );
    process.exit(1);
  }
  const testReport = readJson(testReportPath);
  const pkgJson = readJson(path.join(ROOT, 'package.json'));
  const vitestPkgPath = path.join(ROOT, 'node_modules', 'vitest', 'package.json');
  const vitestVersion = fs.existsSync(vitestPkgPath) ? readJson(vitestPkgPath).version : 'unknown';
  const npmVersion = execSync('npm --version').toString().trim();

  const now = new Date();
  const sha = process.env.GITHUB_SHA ?? 'unknown';
  const branch = process.env.GITHUB_REF_NAME ?? 'unknown';
  const runId = process.env.GITHUB_RUN_ID ?? 'unknown';
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY ?? 'unknown/unknown';
  const runUrl = `${serverUrl}/${repo}/actions/runs/${runId}`;

  const lines: string[] = [
    '# Platform Validation Report',
    '',
    `- **Run date (UTC):** ${now.toISOString()}`,
    `- **Run date (Asia/Bangkok):** ${formatBangkok(now)}`,
    `- **Commit SHA:** ${sha}`,
    `- **Branch:** ${branch}`,
    `- **Workflow run:** [${runId}](${runUrl})`,
    '',
    '## Test suite result',
    '',
    `- **Test files:** ${Array.isArray(testReport.testResults) ? testReport.testResults.length : 'unknown'}`,
    `- **Tests:** ${testReport.numTotalTests ?? 'unknown'}`,
    `- **Passed:** ${testReport.numPassedTests ?? 'unknown'}`,
    `- **Failed:** ${testReport.numFailedTests ?? 'unknown'}`,
    `- **Skipped:** ${testReport.numPendingTests ?? 'unknown'}`,
    `- **Duration:** ${formatDuration(testReport)}`,
    '',
    '## Tooling',
    '',
    `- **Node version:** ${process.version}`,
    `- **npm version:** ${npmVersion}`,
    `- **vitest version:** ${vitestVersion}`,
    `- **App version:** ${pkgJson.version}`,
    '',
    '## Scope of this evidence',
    '',
    'Tier 1 platform validation per ADR-018 D9. Covers the expression interpreter, ' +
      'number formatting and round-on-display rules, unit conversion, PDF rendering ' +
      'and Firestore rules to the extent exercised by the automated suite. It does ' +
      'NOT constitute validation of any individual Recorder Template version.',
    '',
  ];

  const outDir = path.join(ROOT, 'validation-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `platform-validation-${sha.slice(0, 12)}.md`);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`Platform Validation Report written to ${outPath}`);
}

main();
