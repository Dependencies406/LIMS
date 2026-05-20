/**
 * Audit Trail Component
 * Displays the complete audit trail for a document (ISO/IEC 17025 requirement)
 */

import React from 'react';
import type { AuditTrailEntry } from '../types';

interface AuditTrailProps {
  entries: AuditTrailEntry[];
}

export const AuditTrail: React.FC<AuditTrailProps> = ({ entries }) => {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No audit trail entries available</p>
      </div>
    );
  }

  const getActionIcon = (action: AuditTrailEntry['action']) => {
    switch (action) {
      case 'created':
        return '📄';
      case 'edited':
        return '✏️';
      case 'reviewed':
        return '👁️';
      case 'approved':
        return '✅';
      case 'published':
        return '📢';
      case 'obsoleted':
        return '🗄️';
      case 'archived':
        return '📦';
      case 'restored':
        return '♻️';
      default:
        return '📝';
    }
  };

  const getActionColor = (action: AuditTrailEntry['action']) => {
    switch (action) {
      case 'created':
        return 'bg-blue-100 text-blue-800';
      case 'edited':
        return 'bg-yellow-100 text-yellow-800';
      case 'reviewed':
        return 'bg-purple-100 text-purple-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'published':
        return 'bg-green-200 text-green-900';
      case 'obsoleted':
        return 'bg-red-100 text-red-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      case 'restored':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h3>
      
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        
        <div className="space-y-6">
          {entries.map((entry) => (
            <div key={entry.id} className="relative flex items-start">
              {/* Timeline dot */}
              <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-gray-300">
                <span className="text-lg">{getActionIcon(entry.action)}</span>
              </div>
              
              {/* Content */}
              <div className="ml-4 flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(entry.action)}`}>
                        {entry.action.charAt(0).toUpperCase() + entry.action.slice(1)}
                      </span>
                      {entry.previousState && entry.newState && (
                        <span className="text-xs text-gray-500">
                          {entry.previousState} → {entry.newState}
                        </span>
                      )}
                      {entry.previousRevision && entry.newRevision && (
                        <span className="text-xs text-gray-500">
                          {entry.previousRevision} → {entry.newRevision}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm font-medium text-gray-900">
                      {entry.userName} ({entry.userEmail})
                    </p>
                    
                    {entry.changeSummary && (
                      <p className="text-sm text-gray-600 mt-1">{entry.changeSummary}</p>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDate(entry.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

