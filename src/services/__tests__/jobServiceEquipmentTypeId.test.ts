import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import { jobService, removeUndefinedForFirestore } from '../jobService';
import type { JobInput } from '../jobService';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

const baseEquipmentItem = {
  id: 'eq1',
  name: 'UTM',
  manufacturer: 'Acme',
  model: 'X1',
  serialNumber: 'SN1',
  calibrationPoint: '',
  calibrationMethods: '',
  accessories: '',
  machineLocation: '',
  remark: '',
};

function baseJobInput(overrides: Partial<JobInput> = {}): JobInput {
  return {
    jobId: 'JOB-1',
    title: 'Test job',
    status: 'Pending' as any,
    customerCode: 'CUST1',
    customerContact: 'Someone',
    equipment: [{ ...baseEquipmentItem, equipmentTypeId: 'cfg_abc123' }] as any,
    ...overrides,
  };
}

describe('removeUndefinedForFirestore — the mechanism createJob/updateJob route equipment through', () => {
  it('preserves equipmentTypeId when set', () => {
    const result = removeUndefinedForFirestore({ ...baseEquipmentItem, equipmentTypeId: 'cfg_abc123' }) as any;
    expect(result.equipmentTypeId).toBe('cfg_abc123');
  });

  it('omits an unset equipmentTypeId (undefined) rather than writing a null — Firestore rejects literal undefined, so the key is dropped instead', () => {
    const result = removeUndefinedForFirestore({ ...baseEquipmentItem, equipmentTypeId: undefined }) as any;
    expect('equipmentTypeId' in result).toBe(false);
    // Every other field survives untouched.
    expect(result.name).toBe(baseEquipmentItem.name);
  });

  it('preserves equipmentTypeId nested inside an equipment array, matching the shape createJob writes', () => {
    const result = removeUndefinedForFirestore({
      equipment: [{ ...baseEquipmentItem, equipmentTypeId: 'cfg_xyz' }],
    }) as any;
    expect(result.equipment[0].equipmentTypeId).toBe('cfg_xyz');
  });
});

describe('jobService.createJob — Equipment.equipmentTypeId round trip', () => {
  it('persists equipmentTypeId through to the written document', async () => {
    const id = await jobService.createJob(baseJobInput(), 'user1');

    const raw = (firebaseMock as any).store.get(`jobs/${id}`);
    expect(raw.data.equipment[0].equipmentTypeId).toBe('cfg_abc123');
  });
});

describe('jobService.updateJob — Equipment.equipmentTypeId round trip', () => {
  it('persists a changed equipmentTypeId', async () => {
    const id = await jobService.createJob(baseJobInput(), 'user1');

    await jobService.updateJob(id, {
      equipment: [{ ...baseEquipmentItem, equipmentTypeId: 'cfg_new' }] as any,
    });

    const raw = (firebaseMock as any).store.get(`jobs/${id}`);
    expect(raw.data.equipment[0].equipmentTypeId).toBe('cfg_new');
  });

  it('does not drop equipmentTypeId on unrelated equipment updates', async () => {
    const id = await jobService.createJob(baseJobInput(), 'user1');

    await jobService.updateJob(id, {
      equipment: [{ ...baseEquipmentItem, equipmentTypeId: 'cfg_abc123', remark: 'updated remark' }] as any,
    });

    const raw = (firebaseMock as any).store.get(`jobs/${id}`);
    expect(raw.data.equipment[0].equipmentTypeId).toBe('cfg_abc123');
    expect(raw.data.equipment[0].remark).toBe('updated remark');
  });
});
