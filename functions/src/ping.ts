/**
 * pingFunctions Cloud Function
 *
 * Phase 35A gate (ADR-019 D7): proves that a Cloud Function can be deployed to
 * this Firebase project and called from the app. Until this answers, the
 * server-side certificate-number allocation in ADR-019 D3 cannot be built.
 *
 * Deliberately trivial: it reads no Firestore data and writes nothing. Its only
 * job is to prove the client -> function round trip works, and that the caller's
 * authentication reaches the server.
 *
 * Requires no secrets and no setup beyond the project being on the Blaze plan.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

export interface PingResult {
  ok: true;
  /** The authenticated caller's Firebase Auth uid, as the server saw it. */
  uid: string;
  /** Server clock at the moment of the call, ISO 8601. */
  serverTime: string;
}

export const pingFunctions = onCall(
  {
    region: 'asia-southeast1',
    invoker: 'public',     // Allow browser CORS preflight; auth is still enforced inside via request.auth
  },
  async (request): Promise<PingResult> => {
    // ── Auth guard ────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to call this function.');
    }

    return {
      ok: true,
      uid: request.auth.uid,
      serverTime: new Date().toISOString(),
    };
  }
);
