import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

/**
 * Reusable Card component
 * Provides consistent card styling
 */
export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false,
}) => {
  const hoverStyles = hoverable || onClick ? 'hover:shadow-lg cursor-pointer transition-shadow' : '';
  const classes = `card ${hoverStyles} ${className}`.trim();

  return (
    <div className={classes} onClick={onClick}>
      {children}
    </div>
  );
};

