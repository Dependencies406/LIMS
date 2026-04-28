import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { JobIdSettingsModal } from '../components/JobIdSettingsModal';
import { CompanyInfoSettingsModal } from '../components/CompanyInfoSettingsModal';
import { UsersAndRolesManagementModal } from '../components/UsersAndRolesManagementModal';
import { useJobIdSettings } from '../hooks/useJobIdSettings';
import { useCustomerIdSettings } from '../hooks/useCustomerIdSettings';
import { useCompanyInfo } from '../contexts/CompanyInfoContext';
import { previewJobId } from '../services/jobIdService';
import { previewCustomerId } from '../services/customerIdService';
import { formatCompanyAddress, formatCompanyContact } from '../services/companyInfoService';
import { CustomerIdSettingsModal } from '../components/CustomerIdSettingsModal';
import { PdfTemplateManagerModal } from '../components/PdfTemplateManagerModal';
import { CertificateNumberManagerModal } from '../components/CertificateNumberManagerModal';
import { MasterListsManagementModal } from '../components/MasterListsManagementModal';
import { SettingsCardHelpTooltip } from '../components/SettingsCardHelpTooltip';
import { DriveBackupModal } from '../components/DriveBackupModal';

export const SettingsPage: React.FC = () => {
  const { error: showError } = useToast();
  const { settings: jobIdSettings, updateSettings, refreshSettings } = useJobIdSettings();
  const { settings: customerIdSettings, updateSettings: updateCustomerIdSettings, refreshSettings: refreshCustomerIdSettings } = useCustomerIdSettings();
  const { companyInfo, updateCompanyInfo, refreshCompanyInfo } = useCompanyInfo();
  const [showJobIdSettings, setShowJobIdSettings] = useState(false);
  const [showCustomerIdSettings, setShowCustomerIdSettings] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);
  const [showUsersAndRoles, setShowUsersAndRoles] = useState(false);
  const [showPdfTemplateManager, setShowPdfTemplateManager] = useState(false);
  const [showCertificateNumberManager, setShowCertificateNumberManager] = useState(false);
  const [showMasterLists, setShowMasterLists] = useState(false);
  const [showDriveBackup, setShowDriveBackup] = useState(false);
  // Loading and success states
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [loadingOperation, setLoadingOperation] = useState('');

  const handleSaveJobIdSettings = async (newSettings: typeof jobIdSettings) => {
    setLoading(true);
    setLoadingOperation('Saving Job ID settings...');
    
    try {
      await updateSettings(newSettings);
      await refreshSettings();
      setSuccessMessage('Job ID settings saved successfully!');
      setShowSuccess(true);
      setShowJobIdSettings(false);
      
      // Hide success message after 2 seconds
      setTimeout(() => {
        setShowSuccess(false);
        setSuccessMessage('');
      }, 2000);
    } catch (error) {
      console.error('Error saving Job ID settings:', error);
      showError('Failed to save Job ID settings');
    } finally {
      setLoading(false);
      setLoadingOperation('');
    }
  };

  const handleSaveCustomerIdSettings = async (newSettings: typeof customerIdSettings) => {
    setLoading(true);
    setLoadingOperation('Saving Customer ID settings...');

    try {
      await updateCustomerIdSettings(newSettings);
      await refreshCustomerIdSettings();
      setSuccessMessage('Customer ID settings saved successfully!');
      setShowSuccess(true);
      setShowCustomerIdSettings(false);

      setTimeout(() => {
        setShowSuccess(false);
        setSuccessMessage('');
      }, 2000);
    } catch (error) {
      console.error('Error saving Customer ID settings:', error);
      showError('Failed to save Customer ID settings');
    } finally {
      setLoading(false);
      setLoadingOperation('');
    }
  };

  const handleCompanyInfoSave = async (info: any) => {
    setLoading(true);
    setLoadingOperation('Saving company information...');
    
    try {
      updateCompanyInfo(info);
      await refreshCompanyInfo();
      setSuccessMessage('Company information saved successfully!');
      setShowSuccess(true);
      setShowCompanyInfo(false);
      
      // Hide success message after 2 seconds
      setTimeout(() => {
        setShowSuccess(false);
        setSuccessMessage('');
      }, 2000);
    } catch (error) {
      console.error('Error saving company info:', error);
      showError('Failed to save company information');
    } finally {
      setLoading(false);
      setLoadingOperation('');
    }
  };

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Loading/Success Overlay */}
      {(loading || showSuccess) && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4">
            <div className="text-center">
              {showSuccess ? (
                <>
                  {/* Success Checkmark */}
                  <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-green-600 mb-2">
                    {successMessage}
                  </h3>
                  <p className="text-gray-600 text-sm">Settings have been updated successfully</p>
                </>
              ) : (
                <>
                  {/* Loading Spinner */}
                  <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4"></div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    {loadingOperation}
                  </h3>
                  <p className="text-gray-600 text-sm">Please wait</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Settings Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Request Number Settings (stored as Job ID settings) */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-2">
                <h4 className="font-semibold">Request Number Configuration</h4>
                <p>Configure the automatic request number format. Set organization prefix, request type, and manage sequence numbering for all new requests.</p>
                <div className="pt-2 border-t border-gray-700">
                  <p className="text-xs text-gray-300 mb-1">Next Request No.: <span className="font-mono text-primary-300">{previewJobId(jobIdSettings)}</span></p>
                  <p className="text-xs text-gray-300">After That: <span className="font-mono text-gray-300">{previewJobId({...jobIdSettings, currentSequence: jobIdSettings.currentSequence + 1})}</span></p>
                </div>
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• Set organization and job type prefixes</li>
                  <li>• Monitor and adjust year and sequence numbers</li>
                  <li>• Enable automatic yearly reset</li>
                  <li>• Preview request number format before saving</li>
                </ul>
              </div>
            }
          >
            <button
              onClick={() => setShowJobIdSettings(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🔢</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Request Number Configuration</h3>
                    <p className="text-sm text-gray-500 truncate">Next: {previewJobId(jobIdSettings)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>

          {/* Customer ID Settings */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-2">
                <h4 className="font-semibold">Customer ID Configuration</h4>
                <p>Configure automatic customer ID generation (prefix, numbering, and formatting) for new customers.</p>
                <div className="pt-2 border-t border-gray-700">
                  <p className="text-xs text-gray-300">Next Customer: <span className="font-mono text-primary-300">{previewCustomerId(customerIdSettings)}</span></p>
                </div>
              </div>
            }
          >
            <button
              onClick={() => setShowCustomerIdSettings(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🆔</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Customer ID Configuration</h3>
                    <p className="text-sm text-gray-500 truncate">Next: {previewCustomerId(customerIdSettings)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>

          {/* Company Information */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-2">
                <h4 className="font-semibold">Company Information</h4>
                <p>Configure your company details including name, logo, address, and contact information. This information will be used in PDF documents and reports.</p>
                {companyInfo && (
                  <div className="pt-2 border-t border-gray-700">
                    <p className="text-xs text-gray-300 mb-1">Company: <span className="text-primary-300">{companyInfo.companyName}</span></p>
                    <p className="text-xs text-gray-300 mb-1">Address: <span className="text-gray-300">{formatCompanyAddress(companyInfo.address)}</span></p>
                    <p className="text-xs text-gray-300">Contact: <span className="text-gray-300">{formatCompanyContact(companyInfo.contactInfo)}</span></p>
                  </div>
                )}
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• Set company name and logo</li>
                  <li>• Configure address information</li>
                  <li>• Add contact details</li>
                  <li>• Include additional business information</li>
                </ul>
              </div>
            }
          >
            <button
              onClick={() => setShowCompanyInfo(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Company Information</h3>
                    <p className="text-sm text-gray-500 truncate">{companyInfo?.companyName || 'Not configured'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>

          {/* Users & roles — same card pattern as other settings; tabs live inside the modal */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-3">
                <h4 className="font-semibold">Users & roles</h4>
                <p>
                  Manage who can use the system and what each role can do. The dialog has tabs for{' '}
                  <strong>Users</strong> (accounts) and <strong>Roles</strong> (permission templates).
                </p>
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• Create and edit profiles, assign roles</li>
                  <li>• Define custom roles and permissions</li>
                </ul>
              </div>
            }
          >
            <button
              type="button"
              data-settings-help-anchor
              onClick={() => setShowUsersAndRoles(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-violet-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl" aria-hidden>
                      👥
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Users & roles</h3>
                    <p className="text-sm text-gray-500 truncate">Accounts and permission templates</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>

          {/* PDF Templates */}
          <div className="relative group">
            <button
              onClick={() => setShowPdfTemplateManager(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl" title="PDF document templates" aria-hidden>
                      📄
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">PDF Templates</h3>
                    <p className="text-sm text-gray-500 truncate">Manage template library</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </div>

          {/* Certificate Numbers */}
          <div className="relative group">
            <button
              onClick={() => setShowCertificateNumberManager(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🏷️</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Certificate Numbers</h3>
                    <p className="text-sm text-gray-500 truncate">Manage numbering categories</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </div>

          {/* Backup & Export */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-2">
                <h4 className="font-semibold">Backup &amp; Export</h4>
                <p>Download all job data as a JSON backup file. Save it anywhere — local drive, USB, or Google Drive.</p>
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• All jobs, equipment &amp; measurement data included</li>
                  <li>• Attachment download links included</li>
                  <li>• Option to include deleted jobs</li>
                  <li>• No setup required — works instantly</li>
                </ul>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => setShowDriveBackup(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-teal-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl" aria-hidden>
                      💾
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Backup &amp; Export</h3>
                    <p className="text-sm text-gray-500 truncate">Download all job data as a file</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>

          {/* Equipment master lists — methods, manufacturers, models (tabbed modal) */}
          <SettingsCardHelpTooltip
            panel={
              <div className="space-y-3">
                <h4 className="font-semibold">Equipment master lists</h4>
                <p>
                  Manage dropdown options for equipment: calibration methods, manufacturer names, and model names.
                  Each list opens as a tab inside one dialog.
                </p>
              </div>
            }
          >
            <button
              type="button"
              data-settings-help-anchor
              onClick={() => setShowMasterLists(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-lime-100 via-fuchsia-100 to-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200/60">
                    <span className="text-2xl" aria-hidden>
                      🧰
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Equipment master lists</h3>
                    <p className="text-sm text-gray-500 truncate">Methods, manufacturers & models</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-3 flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </SettingsCardHelpTooltip>
        </div>

        {/* Future Settings */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-500 mb-6">Coming Soon</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center hover:bg-gray-100 transition-colors duration-200">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">📧</span>
              </div>
              <h3 className="text-sm font-medium text-gray-500">Email Alerts</h3>
            </div>
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center hover:bg-gray-100 transition-colors duration-200">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">🔔</span>
              </div>
              <h3 className="text-sm font-medium text-gray-500">Notifications</h3>
            </div>
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center hover:bg-gray-100 transition-colors duration-200">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">📊</span>
              </div>
              <h3 className="text-sm font-medium text-gray-500">Analytics & Reports</h3>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">💡</span>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Admin Settings</h3>
              <p className="text-sm text-blue-800">
                These settings are only accessible to users with administrator privileges. 
                Changes made here will affect all users and the entire system. Please configure 
                settings carefully.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Job ID Settings Modal */}
      <JobIdSettingsModal
        isOpen={showJobIdSettings}
        onClose={() => setShowJobIdSettings(false)}
        currentSettings={jobIdSettings}
        onSave={handleSaveJobIdSettings}
      />

      {/* Customer ID Settings Modal */}
      <CustomerIdSettingsModal
        isOpen={showCustomerIdSettings}
        onClose={() => setShowCustomerIdSettings(false)}
        currentSettings={customerIdSettings}
        onSave={handleSaveCustomerIdSettings}
      />

      {/* Company Information Settings Modal */}
      <CompanyInfoSettingsModal
        isOpen={showCompanyInfo}
        onClose={() => setShowCompanyInfo(false)}
        currentInfo={companyInfo}
        onSave={handleCompanyInfoSave}
      />

      <UsersAndRolesManagementModal
        isOpen={showUsersAndRoles}
        onClose={() => setShowUsersAndRoles(false)}
      />

      {/* PDF Template Manager */}
      <PdfTemplateManagerModal
        isOpen={showPdfTemplateManager}
        onClose={() => setShowPdfTemplateManager(false)}
      />

      {/* Certificate Number Manager */}
      <CertificateNumberManagerModal
        isOpen={showCertificateNumberManager}
        onClose={() => setShowCertificateNumberManager(false)}
      />

      <MasterListsManagementModal
        isOpen={showMasterLists}
        onClose={() => setShowMasterLists(false)}
      />

      {/* Google Drive Backup Modal */}
      <DriveBackupModal
        isOpen={showDriveBackup}
        onClose={() => setShowDriveBackup(false)}
      />
    </div>
  );
};

