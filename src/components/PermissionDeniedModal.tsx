import React from 'react';
import { Modal } from './common';

interface PermissionDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: string;
  requiredPermission?: string;
}

export const PermissionDeniedModal: React.FC<PermissionDeniedModalProps> = ({
  isOpen,
  onClose,
  action,
  requiredPermission,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Permission Denied" size="small">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <svg
            className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Access Denied</h3>
            <p className="text-red-700 mb-2">
              You do not have permission to {action}.
            </p>
            {requiredPermission && (
              <p className="text-sm text-red-600 mt-2">
                Required permission: <code className="bg-red-100 px-2 py-1 rounded">{requiredPermission}</code>
              </p>
            )}
            <p className="text-sm text-red-600 mt-2">
              Please contact your administrator if you need access to this feature.
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="btn btn-primary">
          Close
        </button>
      </div>
    </Modal>
  );
};
