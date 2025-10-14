import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  helpText?: string;
  children: React.ReactNode;
}

/**
 * Reusable FormField component
 * Provides consistent layout for form inputs with labels, errors, and help text
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required = false,
  helpText,
  children,
}) => {
  return (
    <div className="form-field">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {children}
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {helpText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helpText}</p>
      )}
    </div>
  );
};

