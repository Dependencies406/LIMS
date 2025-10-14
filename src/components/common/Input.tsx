import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * Reusable Input component with consistent styling
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error = false, ...props }, ref) => {
    const errorStyles = error ? 'border-red-500 focus:ring-red-500' : '';
    const classes = `input ${errorStyles} ${className}`.trim();

    return <input ref={ref} className={classes} {...props} />;
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

/**
 * Reusable Textarea component with consistent styling
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', error = false, ...props }, ref) => {
    const errorStyles = error ? 'border-red-500 focus:ring-red-500' : '';
    const classes = `input ${errorStyles} ${className}`.trim();

    return <textarea ref={ref} className={classes} {...props} />;
  }
);

Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

/**
 * Reusable Select component with consistent styling
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', error = false, children, ...props }, ref) => {
    const errorStyles = error ? 'border-red-500 focus:ring-red-500' : '';
    const classes = `input ${errorStyles} ${className}`.trim();

    return (
      <select ref={ref} className={classes} {...props}>
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';

