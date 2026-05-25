import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
  /** Render as an inline element (no centering wrapper) */
  inline?: boolean;
  className?: string;
}

/**
 * Reusable LoadingSpinner component
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message = 'Loading...',
  fullScreen = false,
  inline = false,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const spinner = (
    <>
      <div
        className={`animate-spin rounded-full border-b-2 border-primary-600 ${sizeClasses[size]} mx-auto`}
      />
      {message && <p className="text-gray-600 mt-4">{message}</p>}
    </>
  );

  if (inline) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className={`animate-spin rounded-full border-b-2 border-primary-600 ${sizeClasses[size]}`} />
        {message && <span className="text-gray-600 text-sm">{message}</span>}
      </div>
    );
  }

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">{spinner}</div>
      </div>
    );
  }

  return <div className={`text-center py-12 ${className}`}>{spinner}</div>;
};

