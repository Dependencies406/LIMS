import { describe, it, expect } from 'vitest';
import { buildNameReport, formatNameReport, type NameSource } from '../equipmentTypeNameReport';

describe('buildNameReport — grouping', () => {
  it('groups exact-match names from both origins into one group', () => {
    const sources: NameSource[] = [
      { raw: 'Digital Caliper', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Digital Caliper', origin: 'equipmentItem', ref: 'job1[0]' },
    ];
    const report = buildNameReport(sources);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].totalCount).toBe(2);
    expect(report.groups[0].variants).toHaveLength(1);
    expect([...report.groups[0].variants[0].origins]).toEqual(
      expect.arrayContaining(['certificateNumberConfig', 'equipmentItem'])
    );
  });

  it('collapses case and whitespace differences into one group with multiple variants', () => {
    const sources: NameSource[] = [
      { raw: 'Pressure Gauge', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'pressure gauge', origin: 'equipmentItem', ref: 'job1[0]' },
      { raw: '  Pressure   Gauge  ', origin: 'equipmentItem', ref: 'job2[1]' },
    ];
    const report = buildNameReport(sources);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].normalizedKey).toBe('pressure gauge');
    // trim/whitespace-collapse is applied only to the normalized key, not to
    // `raw` itself, so all three distinct raw spellings remain distinct variants.
    expect(report.groups[0].variants).toHaveLength(3);
    expect(report.groups[0].totalCount).toBe(3);
  });

  it('keeps genuinely different names in separate groups', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Thermometer', origin: 'certificateNumberConfig', ref: 'cfg2' },
    ];
    const report = buildNameReport(sources);
    expect(report.groups).toHaveLength(2);
  });

  it('ignores empty or whitespace-only names', () => {
    const sources: NameSource[] = [
      { raw: '', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: '   ', origin: 'equipmentItem', ref: 'job1[0]' },
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg2' },
    ];
    const report = buildNameReport(sources);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].normalizedKey).toBe('balance');
  });

  it('tracks refs for traceability back to source documents', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'equipmentItem', ref: 'jobA[0]' },
      { raw: 'Balance', origin: 'equipmentItem', ref: 'jobB[2]' },
    ];
    const report = buildNameReport(sources);
    expect(report.groups[0].variants[0].refs).toEqual(['jobA[0]', 'jobB[2]']);
  });

  it('never mutates or merges input — pure function, same input twice gives equal-shaped output', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' },
    ];
    const r1 = buildNameReport(sources);
    const r2 = buildNameReport(sources);
    expect(r1.groups[0].totalCount).toBe(r2.groups[0].totalCount);
    expect(sources).toEqual([{ raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' }]);
  });
});

describe('buildNameReport — near-duplicate detection', () => {
  it('flags a probable typo between two different groups within the edit-distance threshold', () => {
    const sources: NameSource[] = [
      { raw: 'Thermometer', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Termometer', origin: 'equipmentItem', ref: 'job1[0]' }, // missing 'h'
    ];
    const report = buildNameReport(sources);
    expect(report.groups).toHaveLength(2);
    expect(report.nearDuplicatePairs).toHaveLength(1);
    expect(report.nearDuplicatePairs[0].distance).toBe(1);
  });

  it('does not flag names beyond the distance threshold', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Thermometer', origin: 'certificateNumberConfig', ref: 'cfg2' },
    ];
    const report = buildNameReport(sources, 2);
    expect(report.nearDuplicatePairs).toHaveLength(0);
  });

  it('does not flag very short names to avoid noisy false positives', () => {
    const sources: NameSource[] = [
      { raw: 'pH', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'RH', origin: 'certificateNumberConfig', ref: 'cfg2' },
    ];
    const report = buildNameReport(sources, 2);
    expect(report.nearDuplicatePairs).toHaveLength(0);
  });

  it('respects a custom distance threshold', () => {
    const sources: NameSource[] = [
      { raw: 'Calibrator', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Calibratr', origin: 'equipmentItem', ref: 'job1[0]' }, // distance 1
    ];
    expect(buildNameReport(sources, 0).nearDuplicatePairs).toHaveLength(0);
    expect(buildNameReport(sources, 1).nearDuplicatePairs).toHaveLength(1);
  });
});

describe('formatNameReport', () => {
  it('produces a human-readable summary mentioning group counts and variants', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'balance', origin: 'equipmentItem', ref: 'job1[0]' },
    ];
    const report = buildNameReport(sources);
    const text = formatNameReport(report);
    expect(text).toContain('Distinct normalized names: 1');
    expect(text).toContain('MULTIPLE RAW VARIANTS');
    expect(text).toContain('"Balance"');
    expect(text).toContain('"balance"');
  });

  it('lists near-duplicate pairs when present', () => {
    const sources: NameSource[] = [
      { raw: 'Thermometer', origin: 'certificateNumberConfig', ref: 'cfg1' },
      { raw: 'Termometer', origin: 'equipmentItem', ref: 'job1[0]' },
    ];
    const text = formatNameReport(buildNameReport(sources));
    expect(text).toContain('Probable near-duplicates');
    expect(text).toContain('thermometer');
    expect(text).toContain('termometer');
  });

  it('omits the near-duplicate section entirely when there are none', () => {
    const sources: NameSource[] = [
      { raw: 'Balance', origin: 'certificateNumberConfig', ref: 'cfg1' },
    ];
    const text = formatNameReport(buildNameReport(sources));
    expect(text).not.toContain('Probable near-duplicates');
  });
});
