import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveLocalDraftBackup,
  loadLocalDraftBackup,
  clearLocalDraftBackup,
  localBackupDiffersFromServer,
  type DraftStorage,
} from '../draftRecovery';

function fakeStorage(): DraftStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('saveLocalDraftBackup / loadLocalDraftBackup', () => {
  let storage: DraftStorage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('round-trips rows and environment for the given record id', () => {
    const rows = [{ CAL_NOM: 100, CAL_IND: 100.2 }];
    const environment = [{ roundIndex: 1, temperatureC: 20, relativeHumidity: 48 }];
    saveLocalDraftBackup(storage, 'rec1', rows, environment);
    const loaded = loadLocalDraftBackup(storage, 'rec1');
    expect(loaded?.rows).toEqual(rows);
    expect(loaded?.environment).toEqual(environment);
    expect(loaded?.recordId).toBe('rec1');
  });

  it('returns null when nothing has been saved for that record id', () => {
    expect(loadLocalDraftBackup(storage, 'nonexistent')).toBeNull();
  });

  it('keeps separate backups for different record ids', () => {
    saveLocalDraftBackup(storage, 'rec1', [{ A: 1 }], []);
    saveLocalDraftBackup(storage, 'rec2', [{ A: 2 }], []);
    expect(loadLocalDraftBackup(storage, 'rec1')?.rows).toEqual([{ A: 1 }]);
    expect(loadLocalDraftBackup(storage, 'rec2')?.rows).toEqual([{ A: 2 }]);
  });

  it('overwrites the previous backup for the same record id', () => {
    saveLocalDraftBackup(storage, 'rec1', [{ A: 1 }], []);
    saveLocalDraftBackup(storage, 'rec1', [{ A: 2 }], []);
    expect(loadLocalDraftBackup(storage, 'rec1')?.rows).toEqual([{ A: 2 }]);
  });

  it('returns null for corrupted JSON rather than throwing', () => {
    storage.setItem('lims-draft-backup:rec1', '{not json');
    expect(loadLocalDraftBackup(storage, 'rec1')).toBeNull();
  });

  it('returns null when the stored backup belongs to a different record id (defensive)', () => {
    storage.setItem('lims-draft-backup:rec1', JSON.stringify({ recordId: 'other', rows: [], environment: [], savedAt: 'x' }));
    expect(loadLocalDraftBackup(storage, 'rec1')).toBeNull();
  });
});

describe('clearLocalDraftBackup', () => {
  it('removes the backup so a subsequent load returns null', () => {
    const storage = fakeStorage();
    saveLocalDraftBackup(storage, 'rec1', [{ A: 1 }], []);
    clearLocalDraftBackup(storage, 'rec1');
    expect(loadLocalDraftBackup(storage, 'rec1')).toBeNull();
  });

  it('clearing one record does not affect another', () => {
    const storage = fakeStorage();
    saveLocalDraftBackup(storage, 'rec1', [{ A: 1 }], []);
    saveLocalDraftBackup(storage, 'rec2', [{ A: 2 }], []);
    clearLocalDraftBackup(storage, 'rec1');
    expect(loadLocalDraftBackup(storage, 'rec2')?.rows).toEqual([{ A: 2 }]);
  });
});

describe('localBackupDiffersFromServer', () => {
  it('is false when the backup matches the server exactly', () => {
    const backup = { recordId: 'rec1', rows: [{ A: 1 }], environment: [], savedAt: 'x' };
    expect(localBackupDiffersFromServer(backup, [{ A: 1 }], [])).toBe(false);
  });

  it('is true when rows differ', () => {
    const backup = { recordId: 'rec1', rows: [{ A: 2 }], environment: [], savedAt: 'x' };
    expect(localBackupDiffersFromServer(backup, [{ A: 1 }], [])).toBe(true);
  });

  it('is true when environment differs', () => {
    const backup = { recordId: 'rec1', rows: [], environment: [{ roundIndex: 1, temperatureC: 5, relativeHumidity: 10 }], savedAt: 'x' };
    expect(localBackupDiffersFromServer(backup, [], [])).toBe(true);
  });
});
