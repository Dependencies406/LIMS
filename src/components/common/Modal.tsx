import React from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  showCloseButton?: boolean;
}

/**
 * Reusable Modal component
 * Provides consistent modal styling and behavior
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth,
  size = 'medium',
  showCloseButton = true,
}) => {
  if (!isOpen) return null;

  // Size mapping
  const sizeToMaxWidth = {
    small: 'md',
    medium: '2xl',
    large: '4xl',
    xlarge: '6xl',
  };

  const finalMaxWidth = maxWidth || sizeToMaxWidth[size];

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
  };

  return (
    <div className="modal" onClick={onClose}>
      <div
        className={`modal-content ${maxWidthClasses[finalMaxWidth as keyof typeof maxWidthClasses]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              type="button"
            >
              ×
            </button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal footer component for consistent action button placement
 */
export const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex justify-end space-x-3 pt-4 border-t border-gray-200 ${className}`}>
      {children}
    </div>
  );
};

