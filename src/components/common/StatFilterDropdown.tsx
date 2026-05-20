import React from 'react';

export type StatFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type StatFilterDropdownProps = {
  id?: string;
  label: string;
  value: string;
  options: StatFilterOption[];
  onChange: (value: string) => void;
  className?: string;
};

/**
 * Single select that replaces stacked “stat card” filters — same behavior, less vertical space on mobile.
 */
export const StatFilterDropdown: React.FC<StatFilterDropdownProps> = ({
  id = 'stat-filter',
  label,
  value,
  options,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full min-w-0 ${className}`}
    >
      <label htmlFor={id} className="text-sm font-medium text-gray-700 shrink-0">
        {label}
      </label>
      <select
        id={id}
        className="input text-sm w-full min-w-0 sm:max-w-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
};
