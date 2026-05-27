/**
 * CustomerSignPage.tsx
 *
 * Public page (no authentication required) that lets a customer review
 * job details and sign the work authorization form.
 *
 * Route: /customer-sign/:token
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  getShareToken,
  getShareTokenRaw,
  signShareToken,
  TOKEN_TTL_MS,
} from '../services/jobShareTokenService';
import type { JobShareToken, JobSnapshot, DigitalSignature } from '../types';

// ---------------------------------------------------------------------------
// Tiny signature-pad shim (canvas-based, no external deps)
// ---------------------------------------------------------------------------

interface SignaturePadProps {
  onSign: (dataUrl: string) => void;
  disabled?: boolean;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSign, disabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasSig, setHasSig] = useState(false);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawing.current = true;
    lastPos.current = getPos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
  };

  const endDraw = () => {
    drawing.current = false;
    if (hasSig && canvasRef.current) {
      onSign(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    onSign('');
  };

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white touch-none"
           style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full cursor-crosshair"
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={clear}
          className="text-xs text-gray-500 hover:text-red-600 underline"
        >
          Clear signature
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Countdown timer hook
// ---------------------------------------------------------------------------

function useCountdown(expiresAt: Date | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, expiresAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type PageState = 'loading' | 'valid' | 'expired' | 'used' | 'not_found' | 'submitted' | 'error';

export const CustomerSignPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [tokenData, setTokenData] = useState<JobShareToken | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [signerName, setSignerName] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const remaining = useCountdown(tokenData?.expiresAt ?? null);

  // Load the token
  useEffect(() => {
    if (!token) { setPageState('not_found'); return; }

    (async () => {
      try {
        // First try active token
        const active = await getShareToken(token);
        if (active) {
          setTokenData(active);
          setSignerName(active.jobSnapshot?.customerContact ?? '');
          setPageState('valid');
          return;
        }

        // If not active, check if it ever existed (expired / used)
        const raw = await getShareTokenRaw(token);
        if (!raw) { setPageState('not_found'); return; }
        if (raw.used) { setPageState('used'); return; }
        setPageState('expired');           // exists but past expiry
      } catch (err) {
        console.error('Error loading token:', err);
        setPageState('error');
        setErrorMsg('Failed to load signing link. Please try again or contact the laboratory.');
      }
    })();
  }, [token]);

  // Expire in real-time
  useEffect(() => {
    if (pageState === 'valid' && remaining === 0) {
      setPageState('expired');
    }
  }, [remaining, pageState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !tokenData) return;
    if (!signerName.trim()) { setErrorMsg('Please enter your name.'); return; }
    if (!signatureData) { setErrorMsg('Please draw your signature.'); return; }

    setErrorMsg('');
    setSubmitting(true);

    try {
      const signature: DigitalSignature = {
        signatureData,
        signerName: signerName.trim(),
        signedDate: new Date(),
      };
      await signShareToken(token, signature);
      setPageState('submitted');
    } catch (err) {
      console.error('Error submitting signature:', err);
      setErrorMsg('Failed to submit signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // â”€â”€â”€ Render helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            L
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">Laboratory Management System</p>
            <p className="text-xs text-gray-500">Work Authorization — Customer Signing</p>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );

  // Loading
  if (pageState === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading signing formâ€¦</p>
          </div>
        </div>
      </Shell>
    );
  }

  // Not found
  if (pageState === 'not_found') {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-4">ðŸ”</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link not found</h2>
          <p className="text-gray-500 text-sm">
            This signing link doesn't exist. Please check the link or contact the laboratory.
          </p>
        </div>
      </Shell>
    );
  }

  // Expired
  if (pageState === 'expired') {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-8 text-center">
          <div className="text-5xl mb-4">â°</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link expired</h2>
          <p className="text-gray-500 text-sm">
            This signing link has expired (links are valid for {TOKEN_TTL_MS / 60000} minutes).
            Please ask the laboratory to generate a new link.
          </p>
        </div>
      </Shell>
    );
  }

  // Already used / signed
  if (pageState === 'used') {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center">
          <div className="text-5xl mb-4">âœ…</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Already signed</h2>
          <p className="text-gray-500 text-sm">
            Your signature has already been submitted for this job. Thank you!
          </p>
        </div>
      </Shell>
    );
  }

  // Submitted successfully
  if (pageState === 'submitted') {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center">
          <div className="text-5xl mb-4">ðŸŽ‰</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Signature submitted!</h2>
          <p className="text-gray-500 text-sm">
            Thank you, <strong>{signerName}</strong>. Your work authorization signature has been
            successfully recorded. The laboratory will be notified.
          </p>
        </div>
      </Shell>
    );
  }

  // Generic error
  if (pageState === 'error') {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
          <div className="text-5xl mb-4">âš ï¸</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </Shell>
    );
  }

  // â”€â”€â”€ Valid token — show form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const snap = (tokenData!.jobSnapshot ?? {}) as JobSnapshot & Record<string, any>;
  const isUrgent = remaining < 120_000; // last 2 minutes

  return (
    <Shell>
      <div className="space-y-6">
        {/* Countdown banner */}
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium ${
          isUrgent
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          <span>{isUrgent ? 'â°' : 'ðŸ”—'}</span>
          <span>
            {isUrgent
              ? `This link expires in ${formatCountdown(remaining)} — please sign now!`
              : `This signing link is valid for ${formatCountdown(remaining)}`}
          </span>
        </div>

        {/* Job summary card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{snap.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">Job #{tokenData!.jobNumber}</p>
            </div>
            <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {snap.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {snap.customerName && (
              <div>
                <span className="text-gray-500">Customer: </span>
                <span className="text-gray-900 font-medium">{snap.customerName}</span>
              </div>
            )}
            {snap.customerContact && (
              <div>
                <span className="text-gray-500">Contact: </span>
                <span className="text-gray-900 font-medium">{snap.customerContact}</span>
              </div>
            )}
            {snap.customerAddress && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">Address: </span>
                <span className="text-gray-900">{snap.customerAddress}</span>
              </div>
            )}
            {snap.scheduleDate && (
              <div>
                <span className="text-gray-500">Schedule date: </span>
                <span className="text-gray-900">{snap.scheduleDate}</span>
              </div>
            )}
          </div>

          {/* Equipment list */}
          {snap.equipment && snap.equipment.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Equipment ({snap.equipment.length} item{snap.equipment.length !== 1 ? 's' : ''})
              </p>
              <div className="space-y-1.5">
                {snap.equipment.map((eq, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                    <span className="text-gray-900">
                      {eq.name || '—'}
                      {eq.manufacturer && <span className="text-gray-500"> Â· {eq.manufacturer}</span>}
                      {eq.model && <span className="text-gray-500"> {eq.model}</span>}
                      {eq.serialNumber && (
                        <span className="text-gray-400 text-xs"> (S/N: {eq.serialNumber})</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Service info */}
          {snap.serviceInformation && (
            <div className="pt-2 border-t border-gray-100 text-sm space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Service</p>
              {snap.serviceInformation.serviceRequested && (
                <div>
                  <span className="text-gray-500">Service: </span>
                  <span className="text-gray-900">{snap.serviceInformation.serviceRequested}</span>
                </div>
              )}
              {snap.serviceInformation.reportingFormat && (
                <div>
                  <span className="text-gray-500">Report format: </span>
                  <span className="text-gray-900">{snap.serviceInformation.reportingFormat}</span>
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          {snap.comments && (
            <div className="pt-2 border-t border-gray-100 text-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-gray-700 whitespace-pre-wrap">{snap.comments}</p>
            </div>
          )}
        </div>

        {/* Work Authorization statement */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Work Authorization Statement</h3>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-gray-700 leading-relaxed space-y-2">
            {snap.workAuthorizationStatement
              ? snap.workAuthorizationStatement.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))
              : <p>By signing below, you authorize the laboratory to proceed with the requested services.</p>
            }
          </div>
        </div>

        {/* Signature form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Your Signature</h3>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Name field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              required
              disabled={submitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
            />
          </div>

          {/* Signature canvas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Signature <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">Draw your signature in the box below using a mouse or your finger.</p>
            <SignaturePad onSign={setSignatureData} disabled={submitting} />
          </div>

          {/* Date (auto, read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <p className="text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
              {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !signatureData || !signerName.trim()}
            className="w-full bg-blue-600 text-white font-semibold rounded-lg px-4 py-3 text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submittingâ€¦' : 'Submit Work Authorization'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            By submitting, you confirm you have read and agreed to the work authorization statement above.
          </p>
        </form>
      </div>
    </Shell>
  );
};
