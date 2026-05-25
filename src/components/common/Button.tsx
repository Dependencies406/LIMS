/**
 * Button — the single authoritative button component for the entire application.
 *
 * Variants  : primary | secondary | danger | success | ghost
 * Sizes     : sm | md (default) | lg
 * Features  : loading spinner, left icon slot, fullWidth, all native button props
 *
 * Usage:
 *   <Button>Save</Button>
 *   <Button variant="secondary" size="sm">Cancel</Button>
 *   <Button variant="danger" onClick={handleDelete}>Delete</Button>
 *   <Button variant="success" loading={saving}>Confirm</Button>
 *   <Button icon={<PlusIcon />}>Add Item</Button>
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and disables the button while true */
  loading?: boolean;
  /** Optional icon rendered to the left of the label */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

// Inline spinner so we never need an external dependency
const Spinner: React.FC = () => (
  <svg
    className="animate-spin"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="12" cy="12" r="10"
      stroke="currentColor"
      strokeWidth="4"
      opacity="0.25"
    />
    <path
      fill="currentColor"
      opacity="0.75"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) => {
  const isDisabled = disabled || loading;

  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon ? icon : null}
      {children}
    </button>
  );
};
