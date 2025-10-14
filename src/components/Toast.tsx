import React from 'react';
import type { Toast as ToastType } from '../types';

interface ToastProps {
  toast: ToastType;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const { id, message, type } = toast;

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500'
  }[type];

  const icon = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }[type];

  return (
    <div className={`${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px] max-w-md`}>
      <span className="text-xl font-bold">{icon}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={() => onClose(id)}
        className="text-white hover:text-gray-200 font-bold text-xl"
      >
        ×
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastType[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

