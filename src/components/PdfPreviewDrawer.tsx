/**
 * PdfPreviewDrawer
 *
 * A full-screen overlay that generates a PDF on open, shows it in an iframe,
 * and lets the user download only if they choose to.
 *
 * Usage:
 *   <PdfPreviewDrawer
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     title="Equipment Control Record"
 *     docRef="LAB-FM-QP-05-003"
 *     filename="EquipmentRecord_EQ-001_2026-05-15.pdf"
 *     generate={() => generateEquipmentDatasheetBytes(equipment, events)}
 *   />
 *
 * `generate` is called once when the drawer opens.
 * It must return a Promise<ArrayBuffer> — the raw PDF bytes.
 * The drawer creates a blob URL from those bytes and renders it in an <iframe>.
 * The blob URL is revoked when the drawer closes.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Heading shown in the drawer toolbar */
  title: string;
  /** ISO document reference shown below the title, e.g. "LAB-FM-QP-05-003" */
  docRef?: string;
  /** Suggested filename for the download */
  filename: string;
  /** Async function that builds the PDF and returns raw bytes */
  generate: () => Promise<ArrayBuffer>;
}

type State = 'idle' | 'loading' | 'ready' | 'error';

export const PdfPreviewDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  title,
  docRef,
  filename,
  generate,
}) => {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const generateRef = useRef(generate);
  generateRef.current = generate;

  // Use a ref for the blob URL to avoid stale closures in cleanup functions
  const blobUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Clean up when closed
      revokeBlob();
      setBlobUrl(null);
      setState('idle');
      setErrorMsg('');
      return;
    }

    // Guard: if we already have a blob for this session, don't regenerate.
    // This prevents double-generation from React 18 Strict Mode and from
    // parent re-renders caused by real-time Firestore subscriptions.
    if (blobUrlRef.current) return;

    let cancelled = false;
    setState('loading');
    setErrorMsg('');

    generateRef.current()
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        revokeBlob();               // revoke any previous (safe — uses ref, no stale closure)
        blobUrlRef.current = url;
        setBlobUrl(url);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg((err as Error)?.message || 'Failed to generate PDF');
        setState('error');
      });

    return () => { cancelled = true; };
  }, [isOpen, revokeBlob]);

  // Cleanup on unmount
  useEffect(() => () => revokeBlob(), [revokeBlob]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  function handleDownload() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
  }

  function handleRetry() {
    revokeBlob();
    setBlobUrl(null);
    setState('loading');
    setErrorMsg('');
    generateRef.current()
      .then((bytes) => {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        revokeBlob();
        blobUrlRef.current = url;
        setBlobUrl(url);
        setState('ready');
      })
      .catch((err: unknown) => {
        setErrorMsg((err as Error)?.message || 'Failed to generate PDF');
        setState('error');
      });
  }

  if (!isOpen) return null;

  return (
    /* Full-screen backdrop */
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* PDF icon */}
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
            {docRef && (
              <p className="text-xs text-gray-400 mt-0.5">{docRef} · {filename}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status chip */}
          {state === 'loading' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Generating…
            </span>
          )}
          {state === 'ready' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Ready
            </span>
          )}
          {state === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Error
            </span>
          )}

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={state !== 'ready'}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex items-stretch p-4 gap-4">

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-gray-600">Generating PDF…</p>
            <p className="text-xs text-gray-400 mt-1">Loading company info and building layout</p>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-red-200 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Could not generate PDF</p>
            <p className="text-xs text-red-600 mb-4 max-w-xs text-center">{errorMsg}</p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* PDF iframe */}
        {state === 'ready' && blobUrl && (
          <iframe
            src={blobUrl}
            className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm"
            title={title}
          />
        )}
      </div>
    </div>
  );
};
