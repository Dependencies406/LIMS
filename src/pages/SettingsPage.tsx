import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { JobIdSettingsModal } from '../components/JobIdSettingsModal';
import { CompanyInfoSettingsModal } from '../components/CompanyInfoSettingsModal';
import { UserManagementModal } from '../components/UserManagementModal';
import { useJobIdSettings } from '../hooks/useJobIdSettings';
import { useCompanyInfo } from '../contexts/CompanyInfoContext';
import { previewJobId } from '../services/jobIdService';
import { formatCompanyAddress, formatCompanyContact } from '../services/companyInfoService';

export const SettingsPage: React.FC = () => {
  const { error: showError } = useToast();
  const { settings: jobIdSettings, updateSettings, refreshSettings } = useJobIdSettings();
  const { companyInfo, updateCompanyInfo, refreshCompanyInfo } = useCompanyInfo();
  const [showJobIdSettings, setShowJobIdSettings] = useState(false);
  const [showCompanyInfo, setShowCompanyInfo] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  
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
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage system settings and configurations</p>
        </div>

        {/* Settings Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Job ID Settings */}
          <div className="relative group">
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
                    <h3 className="text-lg font-semibold text-gray-900 truncate">Job ID Configuration</h3>
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
            
            {/* Help Tooltip */}
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-gray-900 text-white text-sm rounded-lg p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
              <div className="space-y-2">
                <h4 className="font-semibold">Job ID Configuration</h4>
                <p>Configure the automatic job ID generation format. Set organization prefix, job type, and manage sequence numbering for all new jobs.</p>
                <div className="pt-2 border-t border-gray-700">
                  <p className="text-xs text-gray-300 mb-1">Next Job: <span className="font-mono text-primary-300">{previewJobId(jobIdSettings)}</span></p>
                  <p className="text-xs text-gray-300">After That: <span className="font-mono text-gray-300">{previewJobId({...jobIdSettings, currentSequence: jobIdSettings.currentSequence + 1})}</span></p>
                </div>
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• Set organization and job type prefixes</li>
                  <li>• Monitor and adjust year and sequence numbers</li>
                  <li>• Enable automatic yearly reset</li>
                  <li>• Preview job ID format before saving</li>
                </ul>
              </div>
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>

          {/* Company Information */}
          <div className="relative group">
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
            
            {/* Help Tooltip */}
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-gray-900 text-white text-sm rounded-lg p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
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
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>

          {/* User Management */}
          <div className="relative group">
            <button
              onClick={() => setShowUserManagement(true)}
              className="w-full p-6 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-200 text-left group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">👤</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">User Management</h3>
                    <p className="text-sm text-gray-500 truncate">Manage user accounts and roles</p>
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
            
            {/* Help Tooltip */}
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-gray-900 text-white text-sm rounded-lg p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
              <div className="space-y-2">
                <h4 className="font-semibold">User Management</h4>
                <p>Manage user accounts, roles, and permissions. Create new users, edit profiles, assign roles, and track user activity.</p>
                <ul className="text-xs text-gray-300 space-y-1 pt-2 border-t border-gray-700">
                  <li>• Create and edit user profiles</li>
                  <li>• Assign admin or staff roles</li>
                  <li>• Activate/deactivate accounts</li>
                  <li>• Track login activity</li>
                  <li>• Manage permissions</li>
                </ul>
              </div>
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
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
                <span className="text-xl">🔄</span>
              </div>
              <h3 className="text-sm font-medium text-gray-500">Backup & Export</h3>
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

      {/* Company Information Settings Modal */}
      <CompanyInfoSettingsModal
        isOpen={showCompanyInfo}
        onClose={() => setShowCompanyInfo(false)}
        currentInfo={companyInfo}
        onSave={handleCompanyInfoSave}
      />

      {/* User Management Modal */}
      <UserManagementModal
        isOpen={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
    </div>
  );
};

