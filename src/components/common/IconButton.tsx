import React from 'react';

export type IconButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  title: string;
  children: React.ReactNode;
}

/**
 * Icon-only button styled to match JobsPage action icons.
 * - md: w-10 h-10
 * - sm: w-8 h-8
 */
export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  title,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  const enabledVariantClass: Record<IconButtonVariant, string> = {
    primary: 'border-primary-600 bg-primary-600 hover:bg-primary-700 text-white',
    secondary: 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700',
    danger: 'border-red-600 bg-red-600 hover:bg-red-700 text-white',
    ghost: 'border-transparent bg-transparent hover:bg-gray-100 text-gray-600',
  };

  const disabledVariantClass: Record<IconButtonVariant, string> = {
    primary: 'border-primary-300 bg-primary-100 text-primary-400',
    secondary: 'border-gray-300 bg-gray-50 text-gray-400',
    danger: 'border-red-200 bg-red-50 text-red-300',
    ghost: 'border-transparent bg-transparent text-gray-400',
  };

  const classes = [
    'flex items-center justify-center rounded-lg border transition-all',
    sizeClass,
    disabled ? `${disabledVariantClass[variant]} opacity-50 cursor-not-allowed` : enabledVariantClass[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} title={title} disabled={disabled} {...props}>
      {children}
    </button>
  );
};

