/**
 * allocateCertificateNumber Cloud Function
 *
 * ADR-019 D3: allocation of a certificate number moves off the client and onto
 * the server. The client asks for the next number; this function performs the
 * counter transaction with the Admin SDK, which bypasses `firestore.rules`.
 *
 * That is the whole point of the move. Because the Admin SDK bypasses rules,
 * `certificate_number_configs` can stay admin-write-only for configuration
 * edits (ADR-019 D4) while any signed-in technician can still take a number.
 *
 * ADR-019 D2: **any authenticated user may allocate.** There is deliberately NO
 * role check and NO permission check in this function. Taking a number is
 * clerical (D1); authority lives later, at signature of the certificate. Do not
 * add a `certificateNumbers.allocate` check here — D2 declines to create it.
 *
 * Called from `src/services/certificateNumberGeneratorService.ts`
 * (`generateCertificateNumberForEquipment`) since Phase 35D.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  formatCertificateNumber,
  labYearMonth,
  nextNumber as computeNextNumber,
  shouldReset as computeShouldReset,
} from './certificateNumberMath';

const CONFIGS_COLLECTION = 'certificate_number_configs';
const ALLOCATIONS_COLLECTION = 'certificateNumberAllocations';
const COMPANY_INFO_DOC = 'system/companyInfo';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface AllocateCertificateNumberRequest {
  /** Equipment type name — matched against `certificate_number_configs.name`. */
  equipmentName: string;
  /** The job consuming this number. Recorded in the ledger so a gap is explainable (ADR-019 D6). */
  jobId: string;
  /** Zero-based index of the equipment item within that job. */
  equipmentIndex: number;
}

export interface AllocateCertificateNumberResult {
  /** The formatted number, e.g. "SCS-UMT-26001". */
  certificateNumber: string;
  /** The raw running number, e.g. 1. */
  number: number;
  /** Full four-digit year the number belongs to (ADR-019 D5). */
  year: number;
  /** Document id of the `certificate_number_configs` document that issued it. */
  configId: string;
}

/**
 * The subset of a `certificate_number_configs` document this function reads.
 * Field defaults are transcribed from `documentToConfig`
 * (src/services/certificateNumberConfigService.ts:31-52) so a document with a
 * missing field behaves here exactly as it does in the client today.
 */
interface AllocationConfig {
  id: string;
  name: string;
  prefix: string;
  separator: string;
  includeYear: boolean;
  numberPadding: number;
  currentNumber: number;
  currentYear: number;
  resetPolicy: string;
  lastResetAt?: Date;
  isActive: boolean;
}

// -------------------------------------------------------------------
// Formatting and allocation maths
// -------------------------------------------------------------------
//
// `formatCertificateNumber`, `shouldReset`, `nextNumber` and `labYearMonth`
// live in ./certificateNumberMath — a module with no Firebase imports, so the
// app's vitest suite can import and test them directly. See that file's header.

/**
 * Firestore document-id validity check.
 *
 * The ledger uses the formatted certificate number AS its document id — that is
 * what makes a duplicate structurally impossible (see the transaction below).
 * `prefix` and `separator` are free-text fields in the Certificate Number
 * Manager (CertificateNumberManagerModal.tsx:396-414), so a config could
 * produce a string that is not a legal document id. A '/' in particular would
 * NOT error — it would silently write into a subcollection, and the uniqueness
 * guarantee would quietly stop holding. Refuse loudly instead.
 */
const isValidDocumentId = (id: string): boolean => {
  if (!id || id.length === 0) return false;
  if (id.includes('/')) return false;
  if (id === '.' || id === '..') return false;
  if (/^__.*__$/.test(id)) return false;
  if (Buffer.byteLength(id, 'utf8') > 1500) return false;
  return true;
};

// -------------------------------------------------------------------
// Cloud Function
// -------------------------------------------------------------------

export const allocateCertificateNumber = onCall(
  {
    region: 'asia-southeast1',
    invoker: 'public',     // Allow browser CORS preflight; auth is still enforced inside via request.auth
  },
  async (request): Promise<AllocateCertificateNumberResult> => {
    // ── Auth guard ────────────────────────────────────────────────
    // ADR-019 D2: authentication is the ONLY gate. No role, no permission.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to allocate a certificate number.');
    }
    const uid = request.auth.uid;

    // ── Argument validation ───────────────────────────────────────
    const { equipmentName, jobId, equipmentIndex } =
      (request.data ?? {}) as Partial<AllocateCertificateNumberRequest>;

    if (typeof equipmentName !== 'string' || !equipmentName.trim()) {
      throw new HttpsError('invalid-argument', 'equipmentName is required.');
    }
    if (typeof jobId !== 'string' || !jobId.trim()) {
      throw new HttpsError('invalid-argument', 'jobId is required.');
    }
    if (typeof equipmentIndex !== 'number' || !Number.isInteger(equipmentIndex) || equipmentIndex < 0) {
      throw new HttpsError('invalid-argument', 'equipmentIndex must be a non-negative integer.');
    }

    // ── Init Firebase Admin ───────────────────────────────────────
    if (!getApps().length) initializeApp();
    const db = getFirestore();

    // ── Resolve the config, exactly as the client does today ──────
    // Transcribed from certificateNumberConfigService.getActiveConfigs()
    // (:109-123) + getConfigByEquipmentName() (:291-296): query the configs
    // where isActive == true, then find the one whose stored `name` equals the
    // TRIMMED incoming equipment name. Note the trim applies to the incoming
    // name only — the stored name is compared as-is, which is what the client
    // does. Deliberately not "improved" (see docs/PHASE_35C_RESULT.md §9 for
    // why name-based lookup is accepted debt rather than fixed here).
    const wantedName = equipmentName.trim();
    const activeConfigsSnap = await db
      .collection(CONFIGS_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('name', 'asc')
      .get();

    const match = activeConfigsSnap.docs.find((d) => (d.data().name || '') === wantedName);
    if (!match) {
      throw new HttpsError(
        'not-found',
        `No certificate number configuration found for equipment "${wantedName}". ` +
          'Select an equipment name from the Certificate Number Manager (Settings).'
      );
    }
    const configId = match.id;
    const configRef = db.collection(CONFIGS_COLLECTION).doc(configId);

    // ── Company abbreviation ──────────────────────────────────────
    // Read BEFORE the transaction, for two reasons: the formatted number is the
    // ledger's document id so it must be known before the write, and keeping
    // `system/companyInfo` out of the transaction's read set avoids needless
    // contention with unrelated company-info edits.
    //
    // Swallow-on-failure is transcribed from
    // certificateNumberGeneratorService.ts:152-158: if company info cannot be
    // read, issue the number WITHOUT the abbreviation rather than failing. A
    // technician is never blocked by an unreadable settings document.
    let companyAbbreviation: string | undefined;
    try {
      const companySnap = await db.doc(COMPANY_INFO_DOC).get();
      companyAbbreviation = companySnap.exists
        ? (companySnap.data()?.companyAbbreviation as string | undefined)
        : undefined;
    } catch (error) {
      logger.warn('Could not load company info for certificate number; issuing without abbreviation', {
        configId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // ── Allocate ──────────────────────────────────────────────────
    let allocated: { certificateNumber: string; number: number; year: number };
    try {
      allocated = await db.runTransaction(async (transaction) => {
        // ---- READS (all reads must precede all writes) ----
        const configDoc = await transaction.get(configRef);

        if (!configDoc.exists) {
          // Deleted between the lookup query above and this read.
          throw new HttpsError('not-found', `Certificate number configuration ${configId} not found.`);
        }

        const configData = configDoc.data() as Record<string, any>;

        // Field defaults transcribed from documentToConfig
        // (certificateNumberConfigService.ts:31-52).
        const config: AllocationConfig = {
          id: configDoc.id,
          name: configData.name || '',
          prefix: configData.prefix || '',
          separator: configData.separator || '-',
          includeYear: configData.includeYear !== false,
          numberPadding: configData.numberPadding || 3,
          currentNumber: configData.currentNumber || 0,
          currentYear: configData.currentYear ?? labYearMonth(new Date()).year,
          resetPolicy: configData.resetPolicy || 'never',
          lastResetAt: configData.lastResetAt?.toDate?.() || undefined,
          isActive: configData.isActive !== false,
        };

        // Re-check inside the transaction, mirroring
        // certificateNumberGeneratorService.ts:98-100. The lookup above already
        // filtered on isActive == true, so this fires only when the config was
        // deactivated in the window between that query and this read.
        if (!config.isActive) {
          throw new HttpsError(
            'failed-precondition',
            `Certificate number configuration "${config.name}" is not active.`
          );
        }

        // ---- Year sanity guard (ADR-019 open question) ----
        // The live `currentYear` values have never been inspected. The code has
        // only ever written four digits, but a two-digit value would make the
        // yearly reset test true on EVERY allocation and silently reissue the
        // same number. Fail loudly on one config rather than corrupt a series.
        // Deliberately NOT coerced, and a two-digit year is NOT expanded to
        // four — guessing here is exactly the failure mode being guarded.
        if (
          !Number.isInteger(config.currentYear) ||
          config.currentYear < 2000 ||
          config.currentYear > 2100
        ) {
          throw new HttpsError(
            'failed-precondition',
            `Certificate number configuration "${configId}" has an invalid currentYear ` +
              `(${JSON.stringify(config.currentYear)}). Expected a four-digit integer between ` +
              '2000 and 2100. Fix the document before allocating.'
          );
        }

        // ---- Reset policy ----
        // The decision lives in ./certificateNumberMath so it can be tested.
        // Year and month are evaluated in Asia/Bangkok, not the host timezone
        // (ADR-019 D8) — on Cloud Functions the host is UTC, which would
        // disagree with the browser's preview for 1 Jan 00:00-07:00 Bangkok.
        const now = new Date();
        const currentYear = labYearMonth(now).year;

        const shouldReset = computeShouldReset(config, now);
        const nextNumber = computeNextNumber(config, shouldReset);

        const certificateNumber = formatCertificateNumber(
          config,
          nextNumber,
          companyAbbreviation,
          currentYear
        );

        if (!isValidDocumentId(certificateNumber)) {
          throw new HttpsError(
            'failed-precondition',
            `Certificate number configuration "${configId}" produces "${certificateNumber}", ` +
              'which is not a valid Firestore document id and cannot be recorded in the ' +
              'allocation ledger. Check the prefix and separator.'
          );
        }

        // ---- WRITES ----
        // Exactly the fields certificateNumberGeneratorService.ts:132-141 writes,
        // and no others.
        //
        // Deliberately does NOT touch `updatedAt` — that field means "a human
        // last edited this equipment type" (ADR-012). Allocation writes its own
        // `lastAllocatedAt`, so the two timestamps never get confused. Writing
        // `updatedAt` from here would corrupt that meaning on every allocation.
        //
        // `yearlyReset` is intentionally not written — it is derived on read.
        transaction.update(configRef, {
          currentNumber: nextNumber,
          currentSequence: nextNumber,
          currentYear,
          lastAllocatedAt: Timestamp.now(),
          ...(shouldReset ? { lastResetAt: Timestamp.now() } : {}),
        });

        // ---- The ledger (ADR-019 D6) ----
        // The document id IS the certificate number, and this is a CREATE, not
        // a set: Firestore refuses the write if that id already exists, and the
        // whole transaction aborts.
        //
        // This is the strongest guarantee in this phase. A duplicate certificate
        // number is not merely unlikely, it is structurally impossible — the
        // database itself refuses the second one, even if the counter logic
        // above is somehow wrong. The answer to "what prevents two certificates
        // carrying the same number?" is now a demonstration, not a promise
        // (ADR-019 D3).
        //
        // It also makes a gap in the register explainable (D6): every number
        // ever issued has a row naming the job and the person that took it.
        const allocationRef = db.collection(ALLOCATIONS_COLLECTION).doc(certificateNumber);
        transaction.create(allocationRef, {
          certificateNumber,
          number: nextNumber,
          year: currentYear,
          configId,
          configName: config.name,
          jobId,
          equipmentIndex,
          allocatedBy: uid,
          allocatedAt: Timestamp.now(),
        });

        return { certificateNumber, number: nextNumber, year: currentYear };
      });
    } catch (error: any) {
      // Let our own guards through untouched.
      if (error instanceof HttpsError) {
        throw error;
      }
      // gRPC ALREADY_EXISTS (6) — the ledger refused a duplicate id.
      if (error?.code === 6 || /ALREADY_EXISTS/i.test(String(error?.message))) {
        logger.error('Certificate number allocation collided with an existing ledger entry', {
          uid,
          configId,
          jobId,
          equipmentIndex,
          error: String(error?.message),
        });
        throw new HttpsError(
          'already-exists',
          'That certificate number has already been allocated. The counter for this equipment ' +
            'type is out of step with the allocation ledger — no number was issued.'
        );
      }
      logger.error('Certificate number allocation failed', {
        uid,
        configId,
        jobId,
        equipmentIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError('internal', 'Failed to allocate certificate number.');
    }

    logger.info('Allocated certificate number', {
      uid,
      configId,
      jobId,
      equipmentIndex,
      number: allocated.number,
      certificateNumber: allocated.certificateNumber,
    });

    return {
      certificateNumber: allocated.certificateNumber,
      number: allocated.number,
      year: allocated.year,
      configId,
    };
  }
);
