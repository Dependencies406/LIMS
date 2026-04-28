/**
 * Template Selector Modal
 * Allows users to select a PDF template for rendering.
 * When `scope` is provided, only templates matching that scope (or 'global') are shown.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { pdfTemplateService } from '../services/pdfTemplateService';
import type { PdfTemplate, PdfTemplateScope } from '../modules/pdf-template-builder/types';

export interface TemplateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: PdfTemplate) => void;
  /** When provided, only templates with this scope or 'global' scope are shown. */
  scope?: PdfTemplateScope;
  /** When provided, a "Create New Template" button is shown that calls this handler. */
  onCreateNew?: () => void;
}

export const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  scope,
  onCreateNew,
}) => {
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const loaded = await pdfTemplateService.getAllTemplates();
      setTemplates(loaded);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter by scope: show templates whose scope matches OR is 'global' (or no scope set = legacy global)
  const scopeFiltered = scope
    ? templates.filter(t => !t.scope || t.scope === 'global' || t.scope === scope)
    : templates;

  const filteredTemplates = scopeFiltered.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (template: PdfTemplate) => {
    onSelect(template);
    // Don't call onClose here — let the parent component handle closing
  };

  const handleCreateNew = () => {
    onClose();
    onCreateNew?.();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 p-4 overflow-y-auto"
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Select PDF Template</h2>
              {scope && scope !== 'global' && (
                <p className="text-sm text-gray-500 mt-0.5 capitalize">
                  Showing {scope} &amp; shared templates
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Templates List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-sm text-gray-600">Loading templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? (
                  <>
                    <p>No templates match your search.</p>
                    <p className="text-sm mt-2">Try a different search term.</p>
                  </>
                ) : (
                  <>
                    <p className="mb-2">No templates found{scope && scope !== 'global' ? ` for ${scope}` : ''}.</p>
                    {onCreateNew && (
                      <button
                        onClick={handleCreateNew}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                      >
                        + Create your first template
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className="text-left p-4 border border-gray-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-lg">{template.name}</div>
                      {template.scope && template.scope !== 'global' && (
                        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {template.scope}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <div className="text-sm text-gray-600 mb-2">{template.description}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {template.elements.length} element(s) • {template.pageSize}
                    </div>
                    {template.metadata?.updatedAt && (
                      <div className="text-xs text-gray-400 mt-1">
                        Updated: {new Date(template.metadata.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
            {onCreateNew ? (
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                + Create New Template
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
