import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecorderTemplate } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import {
  recorderTemplateService,
  TemplateNotPublishableError,
  TemplateVersionResetBlockedError,
  TemplateVersionDeleteBlockedError,
} from '../recorderTemplateService';

type NewTemplate = Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'version'>;

function newTemplate(overrides: Partial<NewTemplate> = {}): NewTemplate {
  return {
    name: 'UTM Calibration',
    description: 'Universal testing machine',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 5,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['UTM'],
      separator: '-',
      includeYear: true,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    },
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'error(CAL_NOM, CAL_IND)' },
        ],
      },
    ],
    summaryFields: [
      { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' },
    ],
    customFunctions: [
      { name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' },
    ],
    createdBy: 'user1',
    updatedBy: 'user1',
    ...overrides,
  };
}

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

describe('recorderTemplateService — CRUD round trip', () => {
  it('every field survives a write -> read round trip', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const stored = await recorderTemplateService.getTemplateById(id);

    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('UTM Calibration');
    expect(stored!.description).toBe('Universal testing machine');
    expect(stored!.equipmentTypeId).toBe('eqtype1');
    expect(stored!.roundCount).toBe(2);
    expect(stored!.defaultRowCount).toBe(5);
    expect(stored!.allowRowAdd).toBe(true);
    expect(stored!.recordNumberFormat).toEqual({
      parts: ['UTM'],
      separator: '-',
      includeYear: true,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    });
    expect(stored!.sections).toHaveLength(1);
    expect(stored!.sections[0].columns).toHaveLength(3);
    expect(stored!.sections[0].columns[2].expression).toBe('error(CAL_NOM, CAL_IND)');
    expect(stored!.summaryFields).toEqual([
      { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' },
    ]);
    expect(stored!.customFunctions).toEqual([
      { name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' },
    ]);
    expect(stored!.status).toBe('draft');
    expect(stored!.version).toBe(0);
    expect(stored!.createdBy).toBe('user1');
    expect(stored!.updatedBy).toBe('user1');
    expect(stored!.createdAt).toBeInstanceOf(Date);
    expect(stored!.updatedAt).toBeInstanceOf(Date);
  });

  it('updateTemplate persists changed fields, including nested arrays', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());

    await recorderTemplateService.updateTemplate(id, {
      name: 'Renamed',
      roundCount: 3,
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [{ id: 'NOM', label: 'Nominal', order: 0, type: 'number' }],
        },
      ],
      updatedBy: 'user2',
    });

    const stored = await recorderTemplateService.getTemplateById(id);
    expect(stored!.name).toBe('Renamed');
    expect(stored!.roundCount).toBe(3);
    expect(stored!.sections[0].columns).toHaveLength(1);
    expect(stored!.updatedBy).toBe('user2');
  });

  it('rejects changing equipmentTypeId on an active template', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');

    await expect(
      recorderTemplateService.updateTemplate(id, { equipmentTypeId: 'other-type' }),
    ).rejects.toThrow(/Archive it first/);
  });

  it('getAllTemplates returns every template, getActiveTemplates filters to active', async () => {
    const draftId = await recorderTemplateService.createTemplate(newTemplate({ name: 'Draft One' }));
    const activeId = await recorderTemplateService.createTemplate(
      newTemplate({ name: 'Active One', equipmentTypeId: 'eqtype2' }),
    );
    await recorderTemplateService.publishTemplate(activeId, 'admin1');

    const all = await recorderTemplateService.getAllTemplates();
    expect(all.map((t) => t.id).sort()).toEqual([draftId, activeId].sort());

    const active = await recorderTemplateService.getActiveTemplates();
    expect(active.map((t) => t.id)).toEqual([activeId]);
  });

  it('getActiveTemplateByEquipmentTypeId finds the active template', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');

    const found = await recorderTemplateService.getActiveTemplateByEquipmentTypeId('eqtype1');
    expect(found?.id).toBe(id);
    expect(await recorderTemplateService.getActiveTemplateByEquipmentTypeId('nope')).toBeNull();
  });

  it('deleteDraftTemplate removes a never-published draft', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.deleteDraftTemplate(id);
    expect(await recorderTemplateService.getTemplateById(id)).toBeNull();
  });

  it('deleteDraftTemplate refuses to delete a published template', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await expect(recorderTemplateService.deleteDraftTemplate(id)).rejects.toThrow(/Only draft templates/);
  });
});

/**
 * Regression: clearing a column's optional Unit back to "None" made the
 * builder emit `unitMode: undefined, unit: undefined, unitChoices: undefined`
 * inside sections[].columns[]. Real Firestore rejects an explicit undefined
 * ANYWHERE in the payload, so every save failed with
 * "Unsupported field value: undefined". The top-level fields were already
 * guarded; the nested ones were handed through whole and unchecked.
 */
describe('recorderTemplateService — undefined is stripped from nested payloads', () => {
  function columnWithClearedUnit() {
    return {
      sections: [
        {
          id: 'READ',
          label: 'Measurement Results',
          order: 0,
          columns: [
            // Exactly what the builder produces after picking Unit = "None".
            { id: 'STD', label: 'Used Standard', order: 0, type: 'standard' as const, unitMode: undefined, unit: undefined, unitChoices: undefined },
          ],
        },
      ],
      summaryFields: [],
      customFunctions: [],
    };
  }

  it('updateTemplate saves a column whose unit was cleared, instead of throwing', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await expect(
      recorderTemplateService.updateTemplate(id, columnWithClearedUnit()),
    ).resolves.toBeUndefined();
  });

  it('the cleared keys are absent from the stored column, not stored as null', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.updateTemplate(id, columnWithClearedUnit());

    const raw = (firebaseMock as any).store.get(`recorderTemplates/${id}`).data;
    const column = raw.sections[0].columns[0];
    expect('unitMode' in column).toBe(false);
    expect('unit' in column).toBe(false);
    expect('unitChoices' in column).toBe(false);
    // The real data on the column is untouched.
    expect(column.id).toBe('STD');
    expect(column.type).toBe('standard');
  });

  it('createTemplate also strips nested undefined', async () => {
    await expect(
      recorderTemplateService.createTemplate(newTemplate(columnWithClearedUnit())),
    ).resolves.toBeTruthy();
  });

  it('a unit that IS set still round-trips intact', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.updateTemplate(id, {
      sections: [
        {
          id: 'READ', label: 'Measurement Results', order: 0,
          columns: [
            { id: 'F', label: 'Force', order: 0, type: 'number' as const, unitMode: 'fixed' as const, unit: 'kN', unitChoices: undefined },
          ],
        },
      ],
      summaryFields: [],
      customFunctions: [],
    });

    const stored = await recorderTemplateService.getTemplateById(id);
    const column = stored!.sections[0].columns[0];
    expect(column.unitMode).toBe('fixed');
    expect(column.unit).toBe('kN');
    expect('unitChoices' in column).toBe(false);
  });
});

describe('recorderTemplateService — reserved section ids rejected', () => {
  it('rejects ENV as a section id at create time is NOT enforced by createTemplate itself, but publish rejects it', async () => {
    // createTemplate does not run the verifier (drafts may be incomplete);
    // publish is the hard gate.
    const id = await recorderTemplateService.createTemplate(
      newTemplate({
        sections: [{ id: 'ENV', label: 'x', order: 0, columns: [] }],
        summaryFields: [],
        customFunctions: [],
      }),
    );
    await expect(recorderTemplateService.publishTemplate(id, 'admin1')).rejects.toThrow(TemplateNotPublishableError);
  });

  it('reports the reserved-id issue on the thrown error', async () => {
    const id = await recorderTemplateService.createTemplate(
      newTemplate({
        sections: [{ id: 'SUMMARY', label: 'x', order: 0, columns: [] }],
        summaryFields: [],
        customFunctions: [],
      }),
    );
    try {
      await recorderTemplateService.publishTemplate(id, 'admin1');
      throw new Error('expected publish to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateNotPublishableError);
      const issues = (error as TemplateNotPublishableError).issues;
      expect(issues.some((i) => i.message.includes("Section id 'SUMMARY' is reserved"))).toBe(true);
    }
  });
});

describe('recorderTemplateService — the verifier is actually invoked before publish', () => {
  it('rejects publishing a template with a broken formula reference', async () => {
    const id = await recorderTemplateService.createTemplate(
      newTemplate({
        sections: [
          {
            id: 'CAL',
            label: 'x',
            order: 0,
            columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula', expression: 'NOPE + 1' }],
          },
        ],
        summaryFields: [],
        customFunctions: [],
      }),
    );
    await expect(recorderTemplateService.publishTemplate(id, 'admin1')).rejects.toThrow(TemplateNotPublishableError);
  });

  it('a clean template publishes successfully', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const result = await recorderTemplateService.publishTemplate(id, 'admin1');
    expect(result.version).toBe(1);
  });
});

describe('recorderTemplateService — publishing produces an immutable version snapshot', () => {
  it('the version snapshot includes customFunctions', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');

    const version = await recorderTemplateService.getVersion(id, 1);
    expect(version).not.toBeNull();
    expect(version!.templateId).toBe(id);
    expect(version!.version).toBe(1);
    expect(version!.publishedBy).toBe('admin1');
    expect(version!.publishedAt).toBeInstanceOf(Date);
    expect(version!.snapshot.customFunctions).toEqual([
      { name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' },
    ]);
    expect(version!.snapshot.sections).toEqual(newTemplate().sections);
  });

  it('editing the template after publish does not change the already-published version', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');

    await recorderTemplateService.updateTemplate(id, { name: 'Edited after publish', roundCount: 99 });

    const version = await recorderTemplateService.getVersion(id, 1);
    expect(version!.snapshot.name).toBe('UTM Calibration');
    expect(version!.snapshot.roundCount).toBe(2);

    const live = await recorderTemplateService.getTemplateById(id);
    expect(live!.name).toBe('Edited after publish');
    expect(live!.roundCount).toBe(99);
  });

  it('a published version document cannot be mutated (rules-level immutability is enforced separately; here we assert the service never attempts to write to an existing version)', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    const versionId = `${id}_v1`;

    const before = (firebaseMock as any).store.get(`recorderTemplateVersions/${versionId}`);
    expect(before).toBeDefined();

    // Republishing bumps to version 2, creating a NEW version document —
    // it must never touch the v1 document.
    await recorderTemplateService.publishTemplate(id, 'admin1');
    const stillV1 = (firebaseMock as any).store.get(`recorderTemplateVersions/${versionId}`);
    expect(stillV1).toEqual(before);

    const v2 = await recorderTemplateService.getVersion(id, 2);
    expect(v2).not.toBeNull();
  });

  it('publishing twice produces two distinct, independently retrievable versions', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await recorderTemplateService.updateTemplate(id, { name: 'v2 name' });
    await recorderTemplateService.publishTemplate(id, 'admin1');

    const versions = await recorderTemplateService.getAllVersions(id);
    expect(versions).toHaveLength(2);
    expect(versions[0].snapshot.name).toBe('UTM Calibration');
    expect(versions[1].snapshot.name).toBe('v2 name');
  });
});

describe('recorderTemplateService — one active template per equipment type (ADR-003)', () => {
  it('rejects publishing a second template for the same equipment type while one is already active', async () => {
    const idA = await recorderTemplateService.createTemplate(newTemplate({ name: 'A' }));
    const idB = await recorderTemplateService.createTemplate(newTemplate({ name: 'B' }));

    await recorderTemplateService.publishTemplate(idA, 'admin1');
    await expect(recorderTemplateService.publishTemplate(idB, 'admin1')).rejects.toThrow(
      /already has a different active template/,
    );
  });

  it('allows a different equipment type to have its own active template', async () => {
    const idA = await recorderTemplateService.createTemplate(newTemplate({ equipmentTypeId: 'type-a' }));
    const idB = await recorderTemplateService.createTemplate(newTemplate({ equipmentTypeId: 'type-b' }));

    await recorderTemplateService.publishTemplate(idA, 'admin1');
    await expect(recorderTemplateService.publishTemplate(idB, 'admin1')).resolves.toEqual({ version: 1 });
  });

  it('allows republishing the SAME template again (does not collide with its own lock)', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await expect(recorderTemplateService.publishTemplate(id, 'admin1')).resolves.toEqual({ version: 2 });
  });

  it('archiving releases the lock, allowing a different template to become active', async () => {
    const idA = await recorderTemplateService.createTemplate(newTemplate({ name: 'A' }));
    const idB = await recorderTemplateService.createTemplate(newTemplate({ name: 'B' }));

    await recorderTemplateService.publishTemplate(idA, 'admin1');
    await recorderTemplateService.archiveTemplate(idA, 'admin1');

    await expect(recorderTemplateService.publishTemplate(idB, 'admin1')).resolves.toEqual({ version: 1 });

    const templateA = await recorderTemplateService.getTemplateById(idA);
    expect(templateA!.status).toBe('archived');
  });

  it('is enforced transactionally: two concurrent publish attempts for the same equipment type — exactly one wins', async () => {
    const idA = await recorderTemplateService.createTemplate(newTemplate({ name: 'A' }));
    const idB = await recorderTemplateService.createTemplate(newTemplate({ name: 'B' }));

    const results = await Promise.allSettled([
      recorderTemplateService.publishTemplate(idA, 'admin1'),
      recorderTemplateService.publishTemplate(idB, 'admin1'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const all = await recorderTemplateService.getAllTemplates();
    const activeCount = all.filter((t) => t.status === 'active').length;
    expect(activeCount).toBe(1);
  });

  it('is enforced transactionally: three concurrent publish attempts for the same equipment type — exactly one wins', async () => {
    const ids = await Promise.all([
      recorderTemplateService.createTemplate(newTemplate({ name: 'A' })),
      recorderTemplateService.createTemplate(newTemplate({ name: 'B' })),
      recorderTemplateService.createTemplate(newTemplate({ name: 'C' })),
    ]);

    const results = await Promise.allSettled(
      ids.map((id) => recorderTemplateService.publishTemplate(id, 'admin1')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);

    const all = await recorderTemplateService.getAllTemplates();
    expect(all.filter((t) => t.status === 'active')).toHaveLength(1);
  });
});

// ── Phase 23 Task 5: reset a template's version counter ─────────────────────

describe('recorderTemplateService.resetTemplateVersion — the guard is the feature', () => {
  it('test 9: refused when any record references the template — count query is called, write never happens', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await recorderTemplateService.publishTemplate(id, 'admin1'); // now v2

    const countFn = vi.fn().mockResolvedValue(3);
    await expect(recorderTemplateService.resetTemplateVersion(id, 'admin1', countFn)).rejects.toThrow(
      TemplateVersionResetBlockedError,
    );
    expect(countFn).toHaveBeenCalledWith(id);

    const stillV2 = await recorderTemplateService.getTemplateById(id);
    expect(stillV2!.version).toBe(2); // untouched
  });

  it('the blocked error carries the actual referencing-record count, for the admin to see', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const countFn = vi.fn().mockResolvedValue(7);
    try {
      await recorderTemplateService.resetTemplateVersion(id, 'admin1', countFn);
      throw new Error('expected reject');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateVersionResetBlockedError);
      expect((error as TemplateVersionResetBlockedError).recordCount).toBe(7);
    }
  });

  it('test 9 (permitted case): reset succeeds when nothing references the template — version returns to 0', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v2, status active

    const countFn = vi.fn().mockResolvedValue(0);
    await recorderTemplateService.resetTemplateVersion(id, 'admin1', countFn);

    const reset = await recorderTemplateService.getTemplateById(id);
    expect(reset!.version).toBe(0);
  });

  it('reverts status to draft and releases the equipment-type lock when the template was active — so a stale active-with-v0 state can never block createDraftRecord', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    const beforeReset = await recorderTemplateService.getTemplateById(id);
    expect(beforeReset!.status).toBe('active');

    await recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0));

    const afterReset = await recorderTemplateService.getTemplateById(id);
    expect(afterReset!.status).toBe('draft');

    // Lock released: a DIFFERENT template for the same equipment type can now publish active.
    const otherId = await recorderTemplateService.createTemplate(newTemplate({ name: 'Other' }));
    await expect(recorderTemplateService.publishTemplate(otherId, 'admin1')).resolves.toEqual({ version: 1 });
  });

  it('checks the record count TWICE before writing (best-effort race-window narrowing, documented as non-atomic)', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const countFn = vi.fn().mockResolvedValue(0);
    await recorderTemplateService.resetTemplateVersion(id, 'admin1', countFn);
    expect(countFn).toHaveBeenCalledTimes(2);
  });

  it('a record appearing between the two checks is still caught by the second check', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const countFn = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(recorderTemplateService.resetTemplateVersion(id, 'admin1', countFn)).rejects.toThrow(
      TemplateVersionResetBlockedError,
    );
    const stillV0 = await recorderTemplateService.getTemplateById(id);
    expect(stillV0!.version).toBe(0); // was never published, so this just confirms nothing else changed
  });

  // ── found live 2026-08-19: reset must free the v1 slot, not just the counter ──

  it('deletes the old v1 snapshot as part of reset, so a republish is a CREATE, never an UPDATE firestore.rules would refuse', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v1 snapshot now exists
    expect(await recorderTemplateService.getVersion(id, 1)).not.toBeNull();

    await recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0));

    expect(await recorderTemplateService.getVersion(id, 1)).toBeNull();
  });

  it('republishing after a reset succeeds and the new v1 snapshot reflects the CURRENT template content, not the old one', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate({ name: 'UTM v1 draft' }));
    await recorderTemplateService.publishTemplate(id, 'admin1');

    await recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0));
    await recorderTemplateService.updateTemplate(id, { name: 'UTM final' });

    await expect(recorderTemplateService.publishTemplate(id, 'admin1')).resolves.toEqual({ version: 1 });
    const newV1 = await recorderTemplateService.getVersion(id, 1);
    expect(newV1!.snapshot.name).toBe('UTM final');
  });

  it('resetting a template that was never published (no v1 snapshot to delete) does not error', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await expect(
      recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0)),
    ).resolves.toBeUndefined();
  });

  // ── Phase 25 Task 2a: reset must delete EVERY version, not just _v1 ────────

  it('test 5: a fixture holding v1, v2 and v3 has ALL THREE version snapshots deleted by one reset — not just the one about to be reused', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v1
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v2
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v3
    expect(await recorderTemplateService.getVersion(id, 1)).not.toBeNull();
    expect(await recorderTemplateService.getVersion(id, 2)).not.toBeNull();
    expect(await recorderTemplateService.getVersion(id, 3)).not.toBeNull();

    await recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0));

    expect(await recorderTemplateService.getVersion(id, 1)).toBeNull();
    expect(await recorderTemplateService.getVersion(id, 2)).toBeNull();
    expect(await recorderTemplateService.getVersion(id, 3)).toBeNull();
    expect(await recorderTemplateService.getAllVersions(id)).toEqual([]);
  });

  it('test 8: publish succeeds immediately after a reset, even from v3 — the end-to-end proof the multi-version bug is gone', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v1
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v2
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v3

    await recorderTemplateService.resetTemplateVersion(id, 'admin1', vi.fn().mockResolvedValue(0));

    await expect(recorderTemplateService.publishTemplate(id, 'admin1')).resolves.toEqual({ version: 1 });
  });
});

describe('reportBlocks survive the round trip and reach the published snapshot (ADR-017 D2)', () => {
  // Regression guard. reportBlocks was added to the TYPES and the builder UI
  // before it was added to this service's document mapping, so blocks could
  // be authored, appear to save, and silently vanish on reload — and, worse,
  // never reach the published version snapshot that a committed record pins.
  // Caught by builderRails.test.tsx, pinned here.
  const budget = {
    id: 'BUD', label: 'Uncertainty budget', order: 0, kind: 'table' as const, defaultRowCount: 2,
    columns: [
      { id: 'SRC', label: 'Source', order: 0, type: 'text' as const },
      { id: 'VAL', label: 'Value', order: 1, type: 'number' as const },
      { id: 'SQ', label: 'Squared', order: 2, type: 'formula' as const, expression: 'BUD_VAL ** 2' },
    ],
  };

  it('a block survives create -> read', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate({ reportBlocks: [budget] } as any));
    const loaded = await recorderTemplateService.getTemplateById(id);
    expect(loaded!.reportBlocks).toEqual([budget]);
  });

  it('a block survives updateTemplate', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.updateTemplate(id, { reportBlocks: [budget] } as any);
    const loaded = await recorderTemplateService.getTemplateById(id);
    expect(loaded!.reportBlocks).toEqual([budget]);
  });

  it('a block is PINNED into the published version snapshot — the D2 requirement', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate({ reportBlocks: [budget] } as any));
    await recorderTemplateService.publishTemplate(id, 'admin1');
    const version = await recorderTemplateService.getVersion(id, 1);
    expect(version!.snapshot.reportBlocks).toEqual([budget]);
  });

  it('editing the template afterwards does NOT change the pinned snapshot (ADR-005)', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate({ reportBlocks: [budget] } as any));
    await recorderTemplateService.publishTemplate(id, 'admin1');
    await recorderTemplateService.updateTemplate(id, { reportBlocks: [] } as any);

    const version = await recorderTemplateService.getVersion(id, 1);
    expect(version!.snapshot.reportBlocks).toEqual([budget]);
    const live = await recorderTemplateService.getTemplateById(id);
    expect(live!.reportBlocks).toEqual([]);
  });

  it('a pre-ADR-017 template with no reportBlocks field reads as [], not undefined', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    const loaded = await recorderTemplateService.getTemplateById(id);
    expect(loaded!.reportBlocks).toEqual([]);
  });
});

describe('recorderTemplateService.deleteVersion — Phase 25 Task 2b/2c: per-version snapshot cleanup', () => {
  it('a version with zero referencing records can be deleted', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v1
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v2

    await expect(
      recorderTemplateService.deleteVersion(id, 2, vi.fn().mockResolvedValue(0)),
    ).resolves.toBeUndefined();
    expect(await recorderTemplateService.getVersion(id, 2)).toBeNull();
    // v1 is untouched — deleteVersion only ever touches the ONE version named.
    expect(await recorderTemplateService.getVersion(id, 1)).not.toBeNull();
  });

  it('a version a live record references cannot be deleted, and the error names the version and the count', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1'); // v1
    const countFn = vi.fn().mockResolvedValue(3);

    try {
      await recorderTemplateService.deleteVersion(id, 1, countFn);
      throw new Error('expected reject');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateVersionDeleteBlockedError);
      expect((e as TemplateVersionDeleteBlockedError).version).toBe(1);
      expect((e as TemplateVersionDeleteBlockedError).recordCount).toBe(3);
    }
    expect(countFn).toHaveBeenCalledWith(id, 1);
    expect(await recorderTemplateService.getVersion(id, 1)).not.toBeNull();
  });

  it('checks the record count TWICE before deleting (same race-window narrowing as resetTemplateVersion)', async () => {
    const id = await recorderTemplateService.createTemplate(newTemplate());
    await recorderTemplateService.publishTemplate(id, 'admin1');
    const countFn = vi.fn().mockResolvedValue(0);
    await recorderTemplateService.deleteVersion(id, 1, countFn);
    expect(countFn).toHaveBeenCalledTimes(2);
  });
});
