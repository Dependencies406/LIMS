import React, { useState } from 'react';
import { ServiceRequestModal } from '../components/ServiceRequestModal';
import { ToastContainer } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthProvider } from '../contexts/AuthContext';

/** Shown after a successful submission */
const SuccessView: React.FC<{ onReset: () => void }> = ({ onReset }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center">
    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6 ring-8 ring-green-50">
      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2 className="text-3xl font-bold text-gray-900 mb-3">Request Submitted!</h2>
    <p className="text-gray-600 mb-2 max-w-md">
      Thank you for submitting your service request. Our team will review it and contact you to confirm the schedule.
    </p>
    <p className="text-sm text-gray-500 mb-10">
      A copy of your request has been recorded. Please keep a note of your submission for reference.
    </p>
    <button
      onClick={onReset}
      className="btn btn-primary px-8 py-3 text-base"
    >
      Submit Another Request
    </button>
  </div>
);

const PublicServiceRequestPageContent: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  // Incrementing the key forces ServiceRequestModal to remount with a clean form state
  const [formKey, setFormKey] = useState(0);

  const handleSuccess = () => setSubmitted(true);

  const handleReset = () => {
    setSubmitted(false);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Icon badge */}
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 leading-none uppercase tracking-wide">Calibration Laboratory</p>
              <p className="text-sm font-semibold text-gray-900 leading-snug">Service Request Portal</p>
            </div>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure &amp; Confidential
          </span>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {submitted ? (
          <SuccessView onReset={handleReset} />
        ) : (
          <>
            {/* Page intro */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Submit a Service Request</h1>
              <p className="text-gray-500 text-sm">
                Fill in the details below and our team will contact you to confirm scheduling and pricing.
                Fields marked <span className="text-red-500 font-medium">*</span> are required.
              </p>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span className="font-medium text-gray-700">Your Details</span>
              </div>
              <div className="flex-1 h-px bg-gray-200" />
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <span className="font-medium text-gray-700">Equipment</span>
              </div>
              <div className="flex-1 h-px bg-gray-200" />
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center font-bold">3</span>
                <span className="text-gray-400">Confirmation</span>
              </div>
            </div>

            {/* Form card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <ServiceRequestModal
                key={formKey}
                isOpen={true}
                standalone={true}
                hideCloseButton={true}
                onClose={() => {}}
                onSuccess={handleSuccess}
              />
            </div>
          </>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white mt-8 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Calibration Laboratory. All rights reserved.</span>
          <span>Your information is kept confidential and used solely to process your calibration request.</span>
        </div>
      </footer>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

/**
 * Public Service Request Page — accessible without authentication.
 * Wrapped in AuthProvider so the inner modal can call useAuth() safely
 * (returns null user, which is handled gracefully).
 */
export const PublicServiceRequestPage: React.FC = () => (
  <AuthProvider>
    <PublicServiceRequestPageContent />
  </AuthProvider>
);
