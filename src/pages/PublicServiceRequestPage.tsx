import React, { useState } from 'react';
import { ServiceRequestModal } from '../components/ServiceRequestModal';
import { ToastContainer } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { AuthProvider } from '../contexts/AuthContext';

/**
 * Public Service Request Page
 * Accessible without authentication for customers to submit service requests
 */
const PublicServiceRequestPageContent: React.FC = () => {
  const { toasts, removeToast } = useToast();
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submit Service Request
          </h1>
          <p className="text-gray-600">
            Please fill out the form below to submit your service request. 
            Our team will review it and get back to you shortly.
          </p>
        </div>

        {/* Service Request Form - Standalone mode for public access */}
        <ServiceRequestModal
          isOpen={showServiceRequestModal}
          standalone={true}
          hideCloseButton={true}
          onClose={() => {
            // Allow closing but reset form for new submission
            setShowServiceRequestModal(false);
            setTimeout(() => {
              setShowServiceRequestModal(true);
            }, 500);
          }}
          onSuccess={() => {
            // After successful submission, reset form for new submission
            setShowServiceRequestModal(false);
            setTimeout(() => {
              setShowServiceRequestModal(true);
            }, 2000);
          }}
        />
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

/**
 * Wrapper component with AuthProvider for public access
 */
export const PublicServiceRequestPage: React.FC = () => {
  return (
    <AuthProvider>
      <PublicServiceRequestPageContent />
    </AuthProvider>
  );
};
