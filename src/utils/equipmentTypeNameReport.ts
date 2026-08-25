/**
 * Groups and flags near-duplicate equipment-type name strings, for the
 * report-only migration script. Pure logic, no I/O — this is what
 * scripts/reportEquipmentTypeNames.ts calls after fetching data from
 * Firestore. `certificate_number_configs` IS the equipment type (ADR-012).
 */

export interface NameSource {
  raw: string;
  origin: 'certificateNumberConfig' | 'equipmentItem';
  /** Doc id (or job id[index]) this raw string was seen at, for traceability. */
  ref: string;
}

export interface NameVariant {
  raw: string;
  count: number;
  origins: Set<NameSource['origin']>;
  refs: string[];
}

export interface NameGroup {
  /** trim + collapse-whitespace + lowercase */
  normalizedKey: string;
  variants: NameVariant[];
  totalCount: number;
}

export interface NearDuplicatePair {
  groupA: string;
  groupB: string;
  distance: number;
}

export interface NameReport {
  groups: NameGroup[];
  nearDuplicatePairs: NearDuplicatePair[];
}

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Groups raw name strings by a normalized key (trim/whitespace/case), so
 * pure case or whitespace differences show up as multiple variants within
 * one group. Separately flags pairs of *different* groups whose normalized
 * keys are within `distanceThreshold` edits of each other — probable typos
 * — for human review. Never merges or renames anything itself.
 */
export function buildNameReport(sources: NameSource[], distanceThreshold = 2): NameReport {
  const groupsByKey = new Map<string, NameGroup>();

  for (const { raw, origin, ref } of sources) {
    if (!raw || !raw.trim()) continue;
    const key = normalize(raw);

    let group = groupsByKey.get(key);
    if (!group) {
      group = { normalizedKey: key, variants: [], totalCount: 0 };
      groupsByKey.set(key, group);
    }

    let variant = group.variants.find(v => v.raw === raw);
    if (!variant) {
      variant = { raw, count: 0, origins: new Set(), refs: [] };
      group.variants.push(variant);
    }
    variant.count += 1;
    variant.origins.add(origin);
    variant.refs.push(ref);
    group.totalCount += 1;
  }

  const groups = [...groupsByKey.values()].sort((a, b) => b.totalCount - a.totalCount);

  const nearDuplicatePairs: NearDuplicatePair[] = [];
  const keys = groups.map(g => g.normalizedKey);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      // Too short for edit distance to mean much (e.g. "pH" vs "ph" already
      // collapses to one group; short strings produce noisy false positives).
      if (Math.min(a.length, b.length) < 4) continue;
      const dist = levenshtein(a, b);
      if (dist > 0 && dist <= distanceThreshold) {
        nearDuplicatePairs.push({ groupA: a, groupB: b, distance: dist });
      }
    }
  }

  return { groups, nearDuplicatePairs };
}

export function formatNameReport(report: NameReport): string {
  const lines: string[] = [];
  lines.push(`Distinct normalized names: ${report.groups.length}`);
  lines.push('');

  for (const group of report.groups) {
    const variantSummaries = group.variants
      .map(v => `"${v.raw}" (${v.count}x - ${[...v.origins].join(', ')})`)
      .join('; ');
    const flag = group.variants.length > 1 ? '  [MULTIPLE RAW VARIANTS]' : '';
    lines.push(`- ${group.normalizedKey}  [total ${group.totalCount}]${flag}`);
    lines.push(`    ${variantSummaries}`);
  }

  if (report.nearDuplicatePairs.length > 0) {
    lines.push('');
    lines.push('Probable near-duplicates across different groups (for human review):');
    for (const pair of report.nearDuplicatePairs) {
      lines.push(`  "${pair.groupA}" <-> "${pair.groupB}"  (edit distance ${pair.distance})`);
    }
  }

  return lines.join('\n');
}
