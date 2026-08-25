/**
 * Minimal in-memory Firestore fake for testing certificateNumberConfigService /
 * certificateNumberGeneratorService without hitting real Firestore.
 *
 * Implements just enough of the SDK surface those two services use
 * (doc/collection/query/where/orderBy/getDoc/getDocs/setDoc/deleteDoc/
 * serverTimestamp/Timestamp/runTransaction) including optimistic-concurrency
 * retry semantics for runTransaction, so tests can exercise real concurrent
 * allocation races.
 */
import { vi } from 'vitest';

interface StoreEntry {
  data: Record<string, any>;
  version: number;
}

interface DocRef {
  path: string;
  id: string;
}

interface CollectionRef {
  __collection: true;
  name: string;
}

interface WhereClause {
  __type: 'where';
  field: string;
  op: string;
  value: any;
}

interface OrderByClause {
  __type: 'orderBy';
  field: string;
  direction: 'asc' | 'desc';
}

interface QueryRef {
  __collection: CollectionRef;
  clauses: (WhereClause | OrderByClause)[];
}

export function createFakeFirestore() {
  const store = new Map<string, StoreEntry>();
  let autoIdCounter = 0;

  const db = {};

  // Firestore accepts a variadic path: collection(db, 'a', 'id', 'b') is the
  // subcollection 'b' under document 'a/id'. Joining the segments keeps the
  // flat store keyed by full path, so a subcollection is just a longer prefix.
  const collection = (_db: unknown, ...segments: string[]): CollectionRef => ({
    __collection: true,
    name: segments.join('/'),
  });

  const doc = (...args: any[]): DocRef => {
    if (args.length === 2 && args[1] && args[1].__collection) {
      const collRef = args[1] as CollectionRef;
      const id = `auto_${++autoIdCounter}`;
      return { path: `${collRef.name}/${id}`, id };
    }
    if (args.length === 1 && args[0] && args[0].__collection) {
      const collRef = args[0] as CollectionRef;
      const id = `auto_${++autoIdCounter}`;
      return { path: `${collRef.name}/${id}`, id };
    }
    // doc(collectionRef, id) — an explicit id within a (possibly nested) collection.
    if (args.length === 2 && args[0] && args[0].__collection) {
      const collRef = args[0] as CollectionRef;
      const id = String(args[1]);
      return { path: `${collRef.name}/${id}`, id };
    }
    // doc(db, ...segments) — the last segment is the document id.
    const [, ...segments] = args;
    const id = String(segments[segments.length - 1]);
    return { path: segments.join('/'), id };
  };

  const where = (field: string, op: string, value: any): WhereClause => ({ __type: 'where', field, op, value });
  const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): OrderByClause => ({ __type: 'orderBy', field, direction });

  const query = (collRef: CollectionRef, ...clauses: (WhereClause | OrderByClause)[]): QueryRef => ({
    __collection: collRef,
    clauses,
  });

  const snapshotFor = (path: string, entry: StoreEntry | undefined, id: string) => ({
    exists: () => !!entry,
    data: () => (entry ? entry.data : undefined),
    id,
  });

  const getDoc = async (ref: DocRef) => {
    const entry = store.get(ref.path);
    return snapshotFor(ref.path, entry, ref.id);
  };

  const getDocs = async (q: QueryRef) => {
    const prefix = `${q.__collection.name}/`;
    // Direct children only. A query on 'equipmentControl' must not return
    // 'equipmentControl/{id}/conversionEquations/{id}' — real Firestore does
    // not surface subcollection documents in a parent-collection query, and
    // matching on prefix alone would.
    let entries = [...store.entries()].filter(
      ([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    );

    for (const clause of q.clauses) {
      if (clause.__type === 'where') {
        entries = entries.filter(([, entry]) => entry.data[clause.field] === clause.value);
      }
    }

    const order = q.clauses.find((c): c is OrderByClause => c.__type === 'orderBy');
    if (order) {
      entries.sort((a, b) => {
        const av = a[1].data[order.field];
        const bv = b[1].data[order.field];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return order.direction === 'desc' ? -cmp : cmp;
      });
    }

    return {
      docs: entries.map(([path, entry]) => ({
        id: path.slice(prefix.length),
        data: () => entry.data,
      })),
      empty: entries.length === 0,
      size: entries.length,
      forEach(callback: (doc: { id: string; data: () => Record<string, any> }) => void) {
        entries.forEach(([path, entry]) => {
          callback({ id: path.slice(prefix.length), data: () => entry.data });
        });
      },
    };
  };

  // Mimics Firestore resolving a serverTimestamp() FieldValue placeholder
  // into a real Timestamp at write time, so reads always see a value with
  // .toDate() rather than the raw sentinel.
  const resolveServerTimestamps = (data: Record<string, any>): Record<string, any> => {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      resolved[key] = value && value.__serverTimestamp ? Timestamp.now() : value;
    }
    return resolved;
  };

  /**
   * Real Firestore rejects an explicit `undefined` field value outright:
   *   "Function updateDoc() called with invalid data.
   *    Unsupported field value: undefined (found in document ...)"
   * and it checks NESTED values too, not just top-level keys.
   *
   * This fake used to accept `undefined` silently, which let a real defect
   * ship: a cleared optional column property (`unit: undefined` inside
   * `sections[].columns[]`) passed every test and then failed every save in
   * production. Rejecting it here keeps the fake honest about the one
   * constraint that actually broke.
   */
  const assertNoUndefined = (data: unknown, fnName: string, path: string, trail = '') => {
    if (Array.isArray(data)) {
      data.forEach((item, i) => assertNoUndefined(item, fnName, path, `${trail}[${i}]`));
      return;
    }
    if (data !== null && typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype) {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const where = trail ? `${trail}.${key}` : key;
        if (value === undefined) {
          throw new Error(
            `Function ${fnName}() called with invalid data. Unsupported field value: undefined ` +
              `(found in field ${where} in document ${path})`,
          );
        }
        assertNoUndefined(value, fnName, path, where);
      }
    }
  };

  const setDoc = async (ref: DocRef, data: Record<string, any>) => {
    assertNoUndefined(data, 'setDoc', ref.path);
    store.set(ref.path, { data: resolveServerTimestamps(data), version: 0 });
  };

  /**
   * Real Firestore's `addDoc(collRef, data)` is `setDoc(doc(collRef), data)`
   * under an auto-generated id — composed the same way here, from the
   * EXISTING `doc`/`setDoc` above, rather than a parallel implementation.
   * Added for `unitConversionRuleService.ts` (ADR-015), the first service
   * exercised through this fake that calls `addDoc` instead of `setDoc`.
   */
  const addDoc = async (collRef: CollectionRef, data: Record<string, any>): Promise<DocRef> => {
    const ref = doc(collRef);
    await setDoc(ref, data);
    return ref;
  };

  const updateDoc = async (ref: DocRef, data: Record<string, any>) => {
    const existing = store.get(ref.path);
    if (!existing) {
      throw new Error(`No document to update: ${ref.path}`);
    }
    assertNoUndefined(data, 'updateDoc', ref.path);
    store.set(ref.path, {
      data: { ...existing.data, ...resolveServerTimestamps(data) },
      version: existing.version + 1,
    });
  };

  const deleteDoc = async (ref: DocRef) => {
    store.delete(ref.path);
  };

  const serverTimestamp = () => ({ __serverTimestamp: true });

  const Timestamp = {
    fromDate: (d: Date) => ({ toDate: () => d }),
    now: () => ({ toDate: () => new Date() }),
  };

  const onSnapshot = (_q: QueryRef, _cb: (snap: unknown) => void, _errCb?: (e: Error) => void) => {
    return () => {};
  };

  // Simulates Firestore's optimistic-concurrency transaction retries: each
  // transaction.get() records the version it read; if the doc's version
  // changed by the time we're ready to commit, the whole updateFunction is
  // re-run from scratch against fresh data (matching real Firestore).
  type PendingWrite =
    | { op: 'update' | 'set'; data: Record<string, any> }
    | { op: 'delete' };

  const runTransaction = async (_db: unknown, updateFn: (txn: any) => Promise<any>) => {
    const MAX_ATTEMPTS = 50;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const reads = new Map<string, number>();
      const pendingWrites = new Map<string, PendingWrite>();

      const transaction = {
        get: async (ref: DocRef) => {
          const entry = store.get(ref.path);
          reads.set(ref.path, entry ? entry.version : -1);
          // Yield a real microtask turn so concurrent transaction() calls
          // issued via Promise.all can genuinely interleave their reads.
          await Promise.resolve();
          return snapshotFor(ref.path, entry, ref.id);
        },
        // Merges into the existing document, like real Firestore update().
        update: (ref: DocRef, data: Record<string, any>) => {
          pendingWrites.set(ref.path, { op: 'update', data });
        },
        // Replaces the whole document, like real Firestore set() without merge.
        set: (ref: DocRef, data: Record<string, any>) => {
          pendingWrites.set(ref.path, { op: 'set', data });
        },
        delete: (ref: DocRef) => {
          pendingWrites.set(ref.path, { op: 'delete' });
        },
      };

      const result = await updateFn(transaction);

      let conflict = false;
      for (const [path, readVersion] of reads) {
        const entry = store.get(path);
        const currentVersion = entry ? entry.version : -1;
        if (currentVersion !== readVersion) {
          conflict = true;
          break;
        }
      }

      if (conflict) continue;

      for (const [path, write] of pendingWrites) {
        if (write.op === 'delete') {
          store.delete(path);
          continue;
        }
        const existing = store.get(path) || { data: {}, version: 0 };
        const nextData = write.op === 'set'
          ? resolveServerTimestamps(write.data)
          : { ...existing.data, ...resolveServerTimestamps(write.data) };
        store.set(path, { data: nextData, version: existing.version + 1 });
      }

      return result;
    }
    throw new Error('Fake transaction retry limit exceeded');
  };

  return {
    store,
    db,
    collection,
    doc,
    query,
    where,
    orderBy,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
    onSnapshot,
    runTransaction,
  };
}

export type FakeFirestore = ReturnType<typeof createFakeFirestore>;

// Re-exported so test files can build a vi.mock factory without importing vi themselves.
export { vi };
