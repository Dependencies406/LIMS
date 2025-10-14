import React from 'react';

export type ViewType = 'list' | 'card' | 'grid';

export interface ViewToggleProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

/**
 * ViewToggle component - Allows users to switch between different view modes
 * Supports: List, Card, and Grid views
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({ currentView, onViewChange }) => {
  const views: Array<{ type: ViewType; icon: string; label: string }> = [
    { type: 'list', icon: '☰', label: 'List' },
    { type: 'card', icon: '▦', label: 'Card' },
    { type: 'grid', icon: '▢', label: 'Grid' },
  ];

  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 shadow-sm">
      {views.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={() => onViewChange(type)}
          className={`
            px-3 py-1.5 rounded-md text-sm font-medium transition-all
            flex items-center space-x-1
            ${
              currentView === type
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }
          `}
          title={`${label} view`}
        >
          <span className="text-base">{icon}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};

