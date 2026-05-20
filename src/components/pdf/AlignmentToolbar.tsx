/**
 * Alignment Toolbar Component
 * Floating toolbar that appears when multiple elements are selected
 * Provides alignment and distribution tools
 */

import React from 'react';

interface AlignmentToolbarProps {
  selectedCount: number;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignMiddle: () => void;
  onAlignBottom: () => void;
  onDistributeVertically: () => void;
  onDistributeHorizontally: () => void;
}

export const AlignmentToolbar: React.FC<AlignmentToolbarProps> = ({
  selectedCount,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignTop,
  onAlignMiddle,
  onAlignBottom,
  onDistributeVertically,
  onDistributeHorizontally,
}) => {
  // Only show toolbar when 2+ elements are selected
  if (selectedCount < 2) {
    return null;
  }

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 flex items-center gap-1">
      <div className="text-xs text-gray-600 px-2 py-1 border-r border-gray-300">
        {selectedCount} selected
      </div>

      {/* Horizontal Alignment */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <button
          onClick={onAlignLeft}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Left"
          aria-label="Align Left"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 5H17M3 10H12M3 15H17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M2 5L2 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={onAlignCenter}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Center (Horizontal)"
          aria-label="Align Center Horizontal"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 5H17M5 10H15M3 15H17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10 5L10 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={onAlignRight}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Right"
          aria-label="Align Right"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 5H17M8 10H17M3 15H17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M18 5L18 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Vertical Alignment */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <button
          onClick={onAlignTop}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Top"
          aria-label="Align Top"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 3V17M10 3V17M15 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 2L15 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={onAlignMiddle}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Middle (Vertical)"
          aria-label="Align Middle Vertical"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 3V17M10 3V17M15 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 10L15 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={onAlignBottom}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Align Bottom"
          aria-label="Align Bottom"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 3V17M10 3V17M15 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M5 18L15 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Distribution */}
      <div className="flex items-center gap-1">
        <button
          onClick={onDistributeVertically}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Distribute Vertically"
          aria-label="Distribute Vertically"
          disabled={selectedCount < 3}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 2V18M3 5H17M3 10H17M3 15H17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          onClick={onDistributeHorizontally}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Distribute Horizontally"
          aria-label="Distribute Horizontally"
          disabled={selectedCount < 3}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 10H18M5 3V17M10 3V17M15 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};





