import React, { useState } from 'react';

interface SignatureConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  signerName: string;
  signatureType: 'customer' | 'staff';
}

export const SignatureConsentModal: React.FC<SignatureConsentModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  signerName,
  signatureType
}) => {
  const [hasConsented, setHasConsented] = useState(false);

  if (!isOpen) return null;

  const isCustomer = signatureType === 'customer';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Signature Consent</h2>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            <strong>{signerName || (isCustomer ? 'Customer' : 'Staff member')}</strong>, before finalizing your signature, please read and acknowledge the following:
          </p>
          
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-r-lg">
            <p className="text-sm text-gray-800 font-medium mb-2">
              {isCustomer 
                ? "Customer Authorization Statement:" 
                : "Staff Authorization Statement:"}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {isCustomer
                ? "I confirm that the information provided is correct and I ACCEPT ALL CONDITIONS set forth in this work authorization. I AUTHORIZE THE LABORATORY TO COMMENCE the requested services according to the laboratory's terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding."
                : "I confirm that I have reviewed the work authorization and I ACCEPT ALL CONDITIONS. I AUTHORIZE THE WORK TO COMMENCE as specified in this document."}
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-800 mb-1">Important Notice</p>
                <p className="text-sm text-yellow-700 mb-2">
                  By providing your signature, you (or the customer you represent) CONSENT that this signature means:
                </p>
                <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1 ml-2">
                  <li>You <strong>ACCEPT ALL CONDITIONS</strong> stated in this work authorization</li>
                  <li>You <strong>AUTHORIZE THE WORK TO COMMENCE</strong> as specified</li>
                  <li>This signature is <strong>FINAL</strong> and cannot be modified except by an administrator</li>
                </ul>
              </div>
            </div>
          </div>

          <label className="flex items-start cursor-pointer">
            <input
              type="checkbox"
              checked={hasConsented}
              onChange={(e) => setHasConsented(e.target.checked)}
              className="mt-1 mr-3 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              <strong>I understand and consent:</strong> I acknowledge that by signing, I (or the customer I represent) <strong>accept all conditions</strong> and <strong>authorize the work to commence</strong>. I understand that this signature will be final and binding.
            </span>
          </label>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!hasConsented}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              hasConsented
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            I Consent - Finalize Signature
          </button>
        </div>
      </div>
    </div>
  );
};
