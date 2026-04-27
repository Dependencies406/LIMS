/**
 * Section Panel Component
 * Displays components available in a specific section
 */

import React from 'react';
import { sections, getSectionById } from './sections';
import { createPdfElement } from '../models/PdfElement';
import type { PdfElementType } from '../types';

export interface SectionPanelProps {
  selectedSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  onComponentAdd: (element: any) => void;
}

export const SectionPanel: React.FC<SectionPanelProps> = ({
  selectedSectionId,
  onSectionSelect,
  onComponentAdd,
}) => {
  const selectedSection = selectedSectionId ? getSectionById(selectedSectionId) : null;

  // Debug: Log when section changes
  React.useEffect(() => {
    if (selectedSectionId && selectedSection) {
      console.log('[SectionPanel] Section selected:', selectedSectionId, selectedSection.name);
      console.log('[SectionPanel] Available components:', selectedSection.components.length);
    }
  }, [selectedSectionId, selectedSection]);

  const handleAddComponent = (componentDef: any) => {
    console.log('[SectionPanel] Adding component:', componentDef.name, componentDef.type);
    const element = createPdfElement(
      componentDef.type as PdfElementType,
      100,
      100,
      componentDef.defaultProperties
    );
    console.log('[SectionPanel] Created element:', element.id, element.type);
    onComponentAdd(element);
  };

  return (
    <div className="w-[280px] border-r flex flex-col" style={{ borderRightColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
      {/* Section List */}
      <div className="p-4 border-b" style={{ borderBottomColor: '#E5E7EB' }}>
        <h3 className="font-semibold mb-3 text-sm text-gray-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>Sections</h3>
        <div className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                console.log('[SectionPanel] Section clicked:', section.id, section.name);
                onSectionSelect(section.id);
              }}
              className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
                selectedSectionId === section.id
                  ? 'bg-blue-100 border border-blue-500 text-blue-900 font-semibold'
                  : 'bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{section.icon}</span>
                <span className="font-medium">{section.name}</span>
                {selectedSectionId === section.id && section.components.length > 0 && (
                  <span className="ml-auto text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">
                    {section.components.length}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Components in Selected Section */}
      {selectedSection && (
        <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: '#FFFFFF' }}>
          <div className="mb-4 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{selectedSection.icon}</span>
              <h4 className="font-semibold text-sm text-gray-900">{selectedSection.name}</h4>
            </div>
            <p className="text-xs text-gray-500 mt-1">{selectedSection.description}</p>
          </div>
          
          {selectedSection.components.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No components available for this section</p>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                  Available Components ({selectedSection.components.length})
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Click a component below to add it to your template canvas
                </p>
              </div>
              <div className="space-y-2">
                {selectedSection.components.map((component, idx) => (
                  <button
                    key={`${component.type}-${idx}`}
                    onClick={() => {
                      console.log('[SectionPanel] Component button clicked:', component.name);
                      handleAddComponent(component);
                    }}
                    className="w-full text-left p-3 rounded-md border-2 border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all active:bg-blue-100 active:scale-[0.98] shadow-sm hover:shadow-md"
                    title={`Click to add ${component.name} to canvas at position (100, 100)`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{component.icon}</span>
                      <span className="font-semibold text-sm text-gray-900">{component.name}</span>
                    </div>
                    {component.description && (
                      <p className="text-xs text-gray-600 mt-1 ml-7">{component.description}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1 ml-7">
                      Type: <span className="font-mono">{component.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!selectedSection && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-gray-500 text-center">
            Select a section to view available components
          </p>
        </div>
      )}
    </div>
  );
};
