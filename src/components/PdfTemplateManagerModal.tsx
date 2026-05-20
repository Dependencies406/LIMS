/**
 * PDF Template Manager Modal
 * Lists and manages PDF templates - Modern SaaS Design
 */

import React, { useState, useEffect } from 'react';
import { pdfTemplateService } from '../services/pdfTemplateService';
import { PdfTemplateBuilderModal } from './PdfTemplateBuilderModal';
import { useToast } from '../hooks/useToast';
import type { PdfTemplate } from '../modules/pdf-template-builder/types';

export interface PdfTemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PdfTemplateManagerModal: React.FC<PdfTemplateManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { success, error: showError } = useToast();
  const [templates, setTemplates] = useState<PdfTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>();

  useEffect(() => {
    if (isOpen) {
      // Wrap in error handler to prevent unhandled promise rejections
      loadTemplates().catch(error => {
        console.error('Failed to load templates:', error);
      });
    }
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

  const handleCreateNew = () => {
    setEditingTemplateId(undefined);
    setShowBuilder(true);
  };

  const handleEdit = (templateId: string) => {
    setEditingTemplateId(templateId);
    setShowBuilder(true);
  };

  const handleDuplicate = async (templateId: string) => {
    try {
      await pdfTemplateService.duplicateTemplate(templateId);
      await loadTemplates();
      success('Template duplicated successfully');
    } catch (error) {
      console.error('Failed to duplicate template:', error);
      showError('Failed to duplicate template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await pdfTemplateService.deleteTemplate(templateId);
      await loadTemplates();
      success('Template deleted successfully');
    } catch (error) {
      console.error('Failed to delete template:', error);
      showError('Failed to delete template');
    }
  };

  const handleBuilderClose = async () => {
    setShowBuilder(false);
    setEditingTemplateId(undefined);
    // Await to prevent race conditions, wrap in try-catch to prevent unhandled rejections
    try {
      await loadTemplates();
    } catch (error) {
      console.error('Failed to reload templates after builder close:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between" style={{ borderBottomColor: '#E5E7EB' }}>
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
              PDF Template Manager
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                style={{ 
                  backgroundColor: '#0055FF',
                  color: '#FFFFFF'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0044CC'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0055FF'}
              >
                + New Template
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>

          {/* Content - Grid Layout */}
          <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: '#FFFFFF' }}>
            {loading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 mx-auto" style={{ borderColor: '#0055FF' }}></div>
                <p className="mt-4 text-sm text-gray-500">Loading templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-16">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 mb-4">No templates found</p>
                <button
                  onClick={handleCreateNew}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{ 
                    backgroundColor: '#0055FF',
                    color: '#FFFFFF'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0044CC'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0055FF'}
                >
                  Create Your First Template
                </button>
              </div>
            ) : (
              <div 
                className="grid gap-4"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))'
                }}
              >
                {templates.map((template) => {
                  const updatedDate = template.metadata?.updatedAt 
                    ? new Date(template.metadata.updatedAt)
                    : null;
                  
                  return (
                    <div
                      key={template.id}
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-all flex flex-col"
                      style={{
                        borderColor: '#E5E7EB',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#0055FF';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E5E7EB';
                        e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                      }}
                    >
                      {/* Thumbnail Preview */}
                      <div 
                        className="w-full h-40 flex items-center justify-center"
                        style={{ backgroundColor: '#F3F4F6' }}
                      >
                        <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="p-4 flex-1 flex flex-col">
                        <h3 className="font-semibold text-base text-gray-900 mb-1" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
                          {template.name || 'Untitled Template'}
                        </h3>
                        {updatedDate && (
                          <p className="text-xs text-gray-500 mb-3">
                            Updated {updatedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>

                      {/* Footer with Actions */}
                      <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2" style={{ borderTopColor: '#E5E7EB' }}>
                        <button
                          onClick={() => template.id && handleEdit(template.id)}
                          className="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                          style={{ 
                            backgroundColor: '#0055FF',
                            color: '#FFFFFF'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0044CC'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0055FF'}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => template.id && handleDuplicate(template.id)}
                          className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                          style={{ 
                            backgroundColor: '#10B981',
                            color: '#FFFFFF'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10B981'}
                          title="Duplicate template"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => template.id && handleDelete(template.id)}
                          className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-red-600"
                          title="Delete template"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template Builder Modal */}
      {showBuilder && (
        <PdfTemplateBuilderModal
          isOpen={showBuilder}
          onClose={handleBuilderClose}
          templateId={editingTemplateId}
          onSave={() => {
            // Refresh template list but don't close the builder modal
            // The user will close it manually after seeing the success message
            loadTemplates().catch(error => {
              console.error('Failed to reload templates:', error);
            });
          }}
        />
      )}
    </>
  );
};

