import React, { useState, useEffect } from 'react';
import { usePdfSettings } from '../contexts/PdfSettingsContext';
import { useToast } from '../hooks/useToast';
import { PdfPreviewViewer } from './PdfPreviewViewer';
import type { PdfSettings, Job } from '../types';
import { EQUIPMENT_COLUMNS, HEADER_FOOTER_PRESETS } from '../utils/constants';

interface JobPdfSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs?: Job[];
  onSave?: () => void;
}

export const JobPdfSettingsModal: React.FC<JobPdfSettingsModalProps> = ({
  isOpen,
  onClose,
  jobs,
  onSave
}) => {
  const { pdfSettings, updatePdfSettings, resetPdfSettings } = usePdfSettings();
  const { success } = useToast();
  const [settings, setSettings] = useState<PdfSettings>(pdfSettings);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [showApplyDropdown, setShowApplyDropdown] = useState(false);

  // Close apply dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showApplyDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest('.apply-dropdown-container')) {
          setShowApplyDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showApplyDropdown]);

  // Update local state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSettings(pdfSettings);
      // Auto-select first job if available
      if (jobs && jobs.length > 0 && !selectedJobId) {
        setSelectedJobId(jobs[0].id);
      }
    }
  }, [isOpen, pdfSettings, jobs, selectedJobId]);

  // Get the selected job object
  const selectedJob = jobs?.find(job => job.id === selectedJobId) || null;

  const handleSave = () => {
    setShowApplyDropdown(false);
    updatePdfSettings(settings);
    if (onSave) {
      onSave();
    } else {
      success('PDF settings saved successfully!');
      onClose();
    }
  };

  const handleApplyToAll = () => {
    setShowApplyDropdown(false);
    updatePdfSettings(settings);
    success('PDF settings applied to all jobs!');
    // Always close modal after applying to all jobs
    setTimeout(() => {
      onClose();
    }, 1000); // Give time for success message to show
  };

  const handleReset = () => {
    setSettings(pdfSettings);
    resetPdfSettings();
    success('PDF settings reset to defaults!');
  };

  const handleCancel = () => {
    setSettings(pdfSettings);
    onClose();
  };

  // Helper functions for "Select All" checkboxes
  const areAllJobColumnsSelected = () => {
    return Object.values(settings.jobTableColumns).every(value => value === true);
  };

  const areAllEquipmentColumnsSelected = () => {
    return Object.values(settings.equipmentTableColumns).every(value => value === true);
  };

  const handleSelectAllJobColumns = (checked: boolean) => {
    const newJobTableColumns = Object.keys(settings.jobTableColumns).reduce((acc, key) => {
      acc[key as keyof typeof settings.jobTableColumns] = checked;
      return acc;
    }, {} as typeof settings.jobTableColumns);

    setSettings({
      ...settings,
      jobTableColumns: newJobTableColumns
    });
  };

  const handleSelectAllEquipmentColumns = (checked: boolean) => {
    const newEquipmentTableColumns = Object.keys(settings.equipmentTableColumns).reduce((acc, key) => {
      acc[key as keyof typeof settings.equipmentTableColumns] = checked;
      return acc;
    }, {} as typeof settings.equipmentTableColumns);

    setSettings({
      ...settings,
      equipmentTableColumns: newEquipmentTableColumns
    });
  };

  const areAllServiceInfoFieldsSelected = () => {
    return settings.serviceInformationVisibility && 
           Object.values(settings.serviceInformationVisibility).every(value => value === true);
  };

  const handleSelectAllServiceInfoFields = (checked: boolean) => {
    const newServiceInformationVisibility = {
      serviceRequested: checked,
      statementOfConformity: checked,
      statementOfConformityRequirements: checked,
      statementOfConformityReferencePdf: checked,
    };

    setSettings({
      ...settings,
      serviceInformationVisibility: newServiceInformationVisibility
    });
  };

  const areAllWorkAuthFieldsSelected = () => {
    return settings.workAuthorizationVisibility && 
           Object.values(settings.workAuthorizationVisibility).every(value => value === true);
  };

  const handleSelectAllWorkAuthFields = (checked: boolean) => {
    const newWorkAuthorizationVisibility = {
      workAuthorizationStatement: checked,
      customerSignature: checked,
      itemsConditionOnReceipt: checked,
      laboratoryCapabilityAssessment: checked,
      staffSignature: checked
    };

    setSettings({
      ...settings,
      workAuthorizationVisibility: newWorkAuthorizationVisibility
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-7xl" onClick={e => e.stopPropagation()}>
        {/* Header with action buttons */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Job PDF Settings</h2>
          <div className="flex items-center space-x-3">
            {/* Reset Button */}
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 transition-all duration-200 hover:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              title="Reset to Defaults"
            >
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              title="Cancel"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Apply Button with Dropdown */}
            <div className="relative apply-dropdown-container">
              <button
                type="button"
                onClick={() => setShowApplyDropdown(!showApplyDropdown)}
                className="px-4 py-2 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 flex items-center space-x-2"
                title="Apply Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">Apply</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showApplyDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Apply to Current Job</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyToAll}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Apply to All Jobs</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Settings Panel */}
            <div className="space-y-6 overflow-y-auto pr-2">
              {/* Page Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-blue-600 text-sm">📄</span>
                  </span>
                  Page Settings
                </h3>
                
                {/* Page Size */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Page Size</label>
                    <p className="text-xs text-gray-500">Select the paper size for PDF generation</p>
                  </div>
                  <div className="w-48">
                    <select
                      value={settings.pageSize}
                      onChange={(e) => setSettings({ ...settings, pageSize: e.target.value as any })}
                      className="input text-sm"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>
                </div>

                {/* Orientation */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Orientation</label>
                    <p className="text-xs text-gray-500">Choose portrait or landscape layout</p>
                  </div>
                  <div className="w-48">
                    <select
                      value={settings.orientation}
                      onChange={(e) => setSettings({ ...settings, orientation: e.target.value as any })}
                      className="input text-sm"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                {/* Top Margin */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Top Margin</label>
                    <p className="text-xs text-gray-500">Distance from top edge in millimeters</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.margin.top}
                      onChange={(e) => setSettings({
                        ...settings,
                        margin: { ...settings.margin, top: parseInt(e.target.value) || 0 }
                      })}
                      className="input text-sm"
                      min="0"
                      max="50"
                    />
                  </div>
                </div>

                {/* Right Margin */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Right Margin</label>
                    <p className="text-xs text-gray-500">Distance from right edge in millimeters</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.margin.right}
                      onChange={(e) => setSettings({
                        ...settings,
                        margin: { ...settings.margin, right: parseInt(e.target.value) || 0 }
                      })}
                      className="input text-sm"
                      min="0"
                      max="50"
                    />
                  </div>
                </div>

                {/* Bottom Margin */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Bottom Margin</label>
                    <p className="text-xs text-gray-500">Distance from bottom edge in millimeters</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.margin.bottom}
                      onChange={(e) => setSettings({
                        ...settings,
                        margin: { ...settings.margin, bottom: parseInt(e.target.value) || 0 }
                      })}
                      className="input text-sm"
                      min="0"
                      max="50"
                    />
                  </div>
                </div>

                {/* Left Margin */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Left Margin</label>
                    <p className="text-xs text-gray-500">Distance from left edge in millimeters</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.margin.left}
                      onChange={(e) => setSettings({
                        ...settings,
                        margin: { ...settings.margin, left: parseInt(e.target.value) || 0 }
                      })}
                      className="input text-sm"
                      min="0"
                      max="50"
                    />
                  </div>
                </div>

                {/* Font Sizes */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-md font-medium text-gray-800 border-t pt-3">Font Sizes (pt)</h4>
                  
                  {/* Title Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Title Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.title}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, title: parseInt(e.target.value) || 16 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 16"
                      />
                    </div>
                  </div>

                  {/* Heading Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Heading Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.heading}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, heading: parseInt(e.target.value) || 12 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 12"
                      />
                    </div>
                  </div>

                  {/* Body Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Body Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.body}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, body: parseInt(e.target.value) || 10 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 10"
                      />
                    </div>
                  </div>

                  {/* Small Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Small Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.small}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, small: parseInt(e.target.value) || 8 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 8"
                      />
                    </div>
                  </div>

                  {/* Header Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Header Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.header}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, header: parseInt(e.target.value) || 10 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 10"
                      />
                    </div>
                  </div>

                  {/* Footer Font Size */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Footer Font Size</span>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="1"
                        value={settings.fontSize.footer}
                        onChange={(e) => setSettings({
                          ...settings,
                          fontSize: { ...settings.fontSize, footer: parseInt(e.target.value) || 9 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 9"
                      />
                    </div>
                  </div>
                </div>

                {/* Logo Size */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-md font-medium text-gray-800 border-t pt-3">Company Logo Size (px)</h4>
                  
                  {/* Logo Max Height */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Max Height</span>
                      <p className="text-xs text-gray-500">Maximum logo height in pixels</p>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="10"
                        max="200"
                        value={settings.logoSize.maxHeight}
                        onChange={(e) => setSettings({
                          ...settings,
                          logoSize: { ...settings.logoSize, maxHeight: parseInt(e.target.value) || 40 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 40"
                      />
                    </div>
                  </div>

                  {/* Logo Max Width */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">Max Width</span>
                      <p className="text-xs text-gray-500">Maximum logo width in pixels</p>
                    </div>
                    <div className="w-48">
                      <input
                        type="number"
                        min="10"
                        max="400"
                        value={settings.logoSize.maxWidth}
                        onChange={(e) => setSettings({
                          ...settings,
                          logoSize: { ...settings.logoSize, maxWidth: parseInt(e.target.value) || 150 }
                        })}
                        className="input text-sm"
                        placeholder="e.g., 150"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Header & Footer Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-green-600 text-sm">📋</span>
                  </span>
                  Header & Footer
                </h3>

                {/* Header Content */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-md font-medium text-gray-800">Header Content (3 Columns)</h4>
                  
                  {/* Header Left */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Header Left</label>
                    <select
                      value={
                        settings.headerContent?.left === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.headerContent?.left && p.value !== 'custom' && p.value !== '') 
                          ? settings.headerContent?.left 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, left: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text (not empty, not preset) */}
                    {settings.headerContent?.left !== '' && !settings.headerContent?.left?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.headerContent?.left || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, left: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.headerContent?.left?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.headerContent.left}</p>
                    )}
                    {/* Show info for None */}
                    {settings.headerContent?.left === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>

                  {/* Header Center */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Header Center</label>
                    <select
                      value={
                        settings.headerContent?.center === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.headerContent?.center && p.value !== 'custom' && p.value !== '') 
                          ? settings.headerContent?.center 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, center: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text */}
                    {settings.headerContent?.center !== '' && !settings.headerContent?.center?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.headerContent?.center || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, center: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.headerContent?.center?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.headerContent.center}</p>
                    )}
                    {/* Show info for None */}
                    {settings.headerContent?.center === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>

                  {/* Header Right */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Header Right</label>
                    <select
                      value={
                        settings.headerContent?.right === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.headerContent?.right && p.value !== 'custom' && p.value !== '') 
                          ? settings.headerContent?.right 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, right: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text */}
                    {settings.headerContent?.right !== '' && !settings.headerContent?.right?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.headerContent?.right || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          headerContent: { ...settings.headerContent, right: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.headerContent?.right?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.headerContent.right}</p>
                    )}
                    {/* Show info for None */}
                    {settings.headerContent?.right === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>
                </div>

                {/* Footer Content */}
                <div className="space-y-3 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-md font-medium text-gray-800">Footer Content (3 Columns)</h4>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={settings.showTableBorders}
                        onChange={(e) => setSettings({ ...settings, showTableBorders: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Show Table Borders</span>
                    </label>
                  </div>
                  
                  {/* Footer Left */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Footer Left</label>
                    <select
                      value={
                        settings.footerContent?.left === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.footerContent?.left && p.value !== 'custom' && p.value !== '') 
                          ? settings.footerContent?.left 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, left: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text */}
                    {settings.footerContent?.left !== '' && !settings.footerContent?.left?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.footerContent?.left || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, left: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.footerContent?.left?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.footerContent.left}</p>
                    )}
                    {/* Show info for None */}
                    {settings.footerContent?.left === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>

                  {/* Footer Center */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Footer Center</label>
                    <select
                      value={
                        settings.footerContent?.center === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.footerContent?.center && p.value !== 'custom' && p.value !== '') 
                          ? settings.footerContent?.center 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, center: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text */}
                    {settings.footerContent?.center !== '' && !settings.footerContent?.center?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.footerContent?.center || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, center: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.footerContent?.center?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.footerContent.center}</p>
                    )}
                    {/* Show info for None */}
                    {settings.footerContent?.center === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>

                  {/* Footer Right */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Footer Right</label>
                    <select
                      value={
                        settings.footerContent?.right === '' ? '' :
                        HEADER_FOOTER_PRESETS.find(p => p.value === settings.footerContent?.right && p.value !== 'custom' && p.value !== '') 
                          ? settings.footerContent?.right 
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, right: value }
                        });
                      }}
                      className="input text-sm"
                    >
                      {HEADER_FOOTER_PRESETS.map((preset) => (
                        <option key={preset.value || 'none'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    {/* Show input only for custom text */}
                    {settings.footerContent?.right !== '' && !settings.footerContent?.right?.startsWith('{') && (
                      <input
                        type="text"
                        value={settings.footerContent?.right || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          footerContent: { ...settings.footerContent, right: e.target.value }
                        })}
                        className="input text-sm"
                        placeholder="Enter custom text..."
                      />
                    )}
                    {/* Show preview for presets */}
                    {settings.footerContent?.right?.startsWith('{') && (
                      <p className="text-xs text-gray-500 italic">Placeholder: {settings.footerContent.right}</p>
                    )}
                    {/* Show info for None */}
                    {settings.footerContent?.right === '' && (
                      <p className="text-xs text-gray-400 italic">This section will be empty</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section Headers */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-indigo-600 text-sm">📝</span>
                  </span>
                  Section Headers
                </h3>
                <p className="text-sm text-gray-600">Customize the names of sections that appear in the PDF</p>
                
                <div className="space-y-3">
                  {/* Job Information Header */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Job Information Section</label>
                      <p className="text-xs text-gray-500">Header text for job details section</p>
                    </div>
                    <div className="w-64">
                      <input
                        type="text"
                        value={settings.sectionHeaders?.jobInformation || 'Job Information'}
                        onChange={(e) => setSettings({
                          ...settings,
                          sectionHeaders: {
                            ...settings.sectionHeaders,
                            jobInformation: e.target.value
                          }
                        })}
                        className="input text-sm"
                        placeholder="e.g., Job Information"
                      />
                    </div>
                  </div>

                  {/* Service Information Header */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Service Information Section</label>
                      <p className="text-xs text-gray-500">Header text for service details section</p>
                    </div>
                    <div className="w-64">
                      <input
                        type="text"
                        value={settings.sectionHeaders?.serviceInformation || 'Service Information'}
                        onChange={(e) => setSettings({
                          ...settings,
                          sectionHeaders: {
                            ...settings.sectionHeaders,
                            serviceInformation: e.target.value
                          }
                        })}
                        className="input text-sm"
                        placeholder="e.g., Service Information"
                      />
                    </div>
                  </div>

                  {/* Work Authorization Header */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Work Authorization Section</label>
                      <p className="text-xs text-gray-500">Header text for work authorization section</p>
                    </div>
                    <div className="w-64">
                      <input
                        type="text"
                        value={settings.sectionHeaders?.workAuthorization || 'Work Authorization'}
                        onChange={(e) => setSettings({
                          ...settings,
                          sectionHeaders: {
                            ...settings.sectionHeaders,
                            workAuthorization: e.target.value
                          }
                        })}
                        className="input text-sm"
                        placeholder="e.g., Work Authorization"
                      />
                    </div>
                  </div>

                  {/* Equipment Header */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Item Details Section</label>
                      <p className="text-xs text-gray-500">Header text for equipment table section</p>
                    </div>
                    <div className="w-64">
                      <input
                        type="text"
                        value={settings.sectionHeaders?.equipment || 'Equipment'}
                        onChange={(e) => setSettings({
                          ...settings,
                          sectionHeaders: {
                            ...settings.sectionHeaders,
                            equipment: e.target.value
                          }
                        })}
                        className="input text-sm"
                        placeholder="e.g., Item Details"
                      />
                    </div>
                  </div>

                  {/* Comments Header */}
                  <div className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Comments Section</label>
                      <p className="text-xs text-gray-500">Header text for comments section</p>
                    </div>
                    <div className="w-64">
                      <input
                        type="text"
                        value={settings.sectionHeaders?.comments || 'Comments'}
                        onChange={(e) => setSettings({
                          ...settings,
                          sectionHeaders: {
                            ...settings.sectionHeaders,
                            comments: e.target.value
                          }
                        })}
                        className="input text-sm"
                        placeholder="e.g., Comments"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Job Table Columns */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-purple-600 text-sm">📊</span>
                    </span>
                    Job Table Columns
                  </h3>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={areAllJobColumnsSelected()}
                      onChange={(e) => handleSelectAllJobColumns(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Choose which job information fields to display in the PDF
                </p>
                
                <div className="space-y-2">
                  {Object.entries(settings.jobTableColumns).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between py-1">
                      <div className="flex-1">
                        <span className="text-sm text-gray-700 capitalize">
                          {key === 'jobId' ? 'Job ID' : 
                           key === 'scheduleDate' ? 'Schedule Date' : 
                           key === 'assignedStaff' ? 'Assigned Staff' :
                           key === 'startDate' ? 'Start Date' :
                           key}
                        </span>
                      </div>
                      <div className="w-48">
                        <label className="flex items-center justify-end">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setSettings({
                              ...settings,
                              jobTableColumns: {
                                ...settings.jobTableColumns,
                                [key]: e.target.checked
                              }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Service Information Visibility */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-purple-600 text-sm">⚙️</span>
                    </span>
                    Service Information
                  </h3>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={areAllServiceInfoFieldsSelected()}
                      onChange={(e) => handleSelectAllServiceInfoFields(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </label>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { key: 'serviceRequested', label: 'Service Requested' },
                    { key: 'reportingFormat', label: 'Reporting Format' },
                    { key: 'statementOfConformity', label: 'Statement of Conformity' },
                    { key: 'statementOfConformityRequirements', label: 'Conformity Requirements' }
                  ].map((field) => (
                    <div key={field.key} className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.serviceInformationVisibility?.[field.key as keyof typeof settings.serviceInformationVisibility] || false}
                            onChange={(e) => setSettings({
                              ...settings,
                              serviceInformationVisibility: {
                                ...settings.serviceInformationVisibility,
                                [field.key]: e.target.checked
                              }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm font-medium text-gray-700">{field.label}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment Table Columns */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-orange-600 text-sm">🔧</span>
                    </span>
                    Item Details Table Columns
                  </h3>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={areAllEquipmentColumnsSelected()}
                      onChange={(e) => handleSelectAllEquipmentColumns(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Choose which columns to display in the equipment table
                </p>
                
                <div className="space-y-2">
                  {EQUIPMENT_COLUMNS.map((column) => (
                    <div key={column.key} className="flex items-center justify-between py-1">
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">{column.label}</span>
                      </div>
                      <div className="w-48">
                        <label className="flex items-center justify-end">
                          <input
                            type="checkbox"
                            checked={settings.equipmentTableColumns[column.key as keyof typeof settings.equipmentTableColumns]}
                            onChange={(e) => setSettings({
                              ...settings,
                              equipmentTableColumns: {
                                ...settings.equipmentTableColumns,
                                [column.key]: e.target.checked
                              }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work Authorization Visibility */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-orange-600 text-sm">📋</span>
                    </span>
                    Work Authorization
                  </h3>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={areAllWorkAuthFieldsSelected()}
                      onChange={(e) => handleSelectAllWorkAuthFields(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Choose which work authorization fields to display in the PDF
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'workAuthorizationStatement', label: 'Work Authorization Statement' },
                    { key: 'customerSignature', label: 'Customer Signature' },
                    { key: 'itemsConditionOnReceipt', label: 'Items Condition on Receipt' },
                    { key: 'laboratoryCapabilityAssessment', label: 'Laboratory Capability Assessment' },
                    { key: 'staffSignature', label: 'Staff Signature' }
                  ].map((field) => (
                    <div key={field.key} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">{field.label}</span>
                      </div>
                      <div className="w-16">
                        <label className="flex items-center justify-end">
                          <input
                            type="checkbox"
                            checked={settings.workAuthorizationVisibility[field.key as keyof typeof settings.workAuthorizationVisibility]}
                            onChange={(e) => setSettings({
                              ...settings,
                              workAuthorizationVisibility: {
                                ...settings.workAuthorizationVisibility,
                                [field.key]: e.target.checked
                              }
                            })}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm font-medium text-gray-700 ml-2">{field.label}</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work Authorization Statement */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-blue-600 text-sm">📝</span>
                  </span>
                  Work Authorization Statement
                </h3>
                <p className="text-sm text-gray-600">
                  Customize the work authorization statement text that appears in the PDF
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorization Statement Text
                  </label>
                  <textarea
                    value={settings.workAuthorizationStatement}
                    onChange={(e) => setSettings({
                      ...settings,
                      workAuthorizationStatement: e.target.value
                    })}
                    className="input w-full h-32 resize-none"
                    placeholder="Enter the work authorization statement text..."
                  />
                </div>
              </div>


            </div>

            {/* PDF Preview Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">PDF Preview</h3>
              </div>
              
              {/* Job Selector (only show when jobs array is provided) */}
              {jobs && jobs.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Job to Preview
                  </label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a job...</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.jobId} - {job.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Show message when no jobs available */}
              {(!jobs || jobs.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">Preview will be available when viewing from a job</p>
                </div>
              )}
              
              <PdfPreviewViewer
                job={selectedJob}
                settings={settings}
                height="500px"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

