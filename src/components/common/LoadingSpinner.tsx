import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

/**
 * Reusable LoadingSpinner component
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message = 'Loading...',
  fullScreen = false,
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

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">{spinner}</div>
      </div>
    );
  }

  return <div className="text-center py-12">{spinner}</div>;
};

