import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { 
  saveCompanyInfoWithLogo, 
  validateCompanyInfo, 
  formatCompanyAddress,
  formatCompanyContact
} from '../services/companyInfoService';
import type { CompanyInfo as CompanyInfoType } from '../types';

interface CompanyInfoSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInfo: CompanyInfoType | null;
  onSave: (info: CompanyInfoType) => Promise<void>;
}

export const CompanyInfoSettingsModal: React.FC<CompanyInfoSettingsModalProps> = ({
  isOpen,
  onClose,
  currentInfo,
  onSave
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [info, setInfo] = useState<Partial<CompanyInfoType>>({
    companyName: '',
    logoUrl: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    contactInfo: {
      phone: '',
      email: '',
      website: '',
      fax: ''
    },
    additionalInfo: {
      taxId: '',
      registrationNumber: '',
      businessLicense: ''
    }
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Update local state when modal opens
  useEffect(() => {
    if (isOpen && currentInfo) {
      setInfo(currentInfo);
      setLogoPreview(currentInfo.logoUrl || '');
      setLogoFile(null);
      setErrors([]);
    }
  }, [isOpen, currentInfo]);

  const handleChange = (field: string, value: any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setInfo(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof typeof prev] as any),
          [child]: value
        }
      }));
    } else {
      setInfo(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // Validate on change
    const updatedInfo = { ...info, [field]: value };
    const validationErrors = validateCompanyInfo(updatedInfo);
    setErrors(validationErrors);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError('Image file size must be less than 5MB');
        return;
      }
      
      setLogoFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!currentUser) {
      showError('User not authenticated');
      return;
    }

    // Final validation
    const validationErrors = validateCompanyInfo(info);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      const savedInfo = await saveCompanyInfoWithLogo(
        info,
        logoFile,
        currentUser.uid
      );
      
      await onSave(savedInfo);
      success('Company information saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving company info:', error);
      showError('Failed to save company information');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setInfo(currentInfo || {
      companyName: '',
      logoUrl: '',
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      },
      contactInfo: {
        phone: '',
        email: '',
        website: '',
        fax: ''
      },
      additionalInfo: {
        taxId: '',
        registrationNumber: '',
        businessLicense: ''
      }
    });
    setLogoFile(null);
    setLogoPreview(currentInfo?.logoUrl || '');
    setErrors([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>
        {/* Header with action buttons */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Company Information</h2>
          <div className="flex items-center space-x-3">
            {/* Cancel Button */}
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
              title="Cancel"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || errors.length > 0}
              title={saving ? 'Saving...' : 'Save Company Info'}
            >
              {saving ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Settings Panel */}
            <div className="space-y-6 overflow-y-auto pr-2">
              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-red-800 font-semibold mb-2">⚠️ Validation Errors:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index} className="text-red-700 text-sm">{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-blue-600 text-sm">🏢</span>
                  </span>
                  Basic Information
                </h3>
                
                {/* Company Name */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Company Name <span className="text-red-500">*</span></label>
                    <p className="text-xs text-gray-500">Your organization's legal name</p>
                  </div>
                  <div className="w-64">
                    <input
                      type="text"
                      value={info.companyName || ''}
                      onChange={(e) => handleChange('companyName', e.target.value)}
                      className="input text-sm"
                      placeholder="Enter company name"
                    />
                  </div>
                </div>

                {/* Company Logo */}
                <div className="space-y-2 py-2">
                  <label className="text-sm font-medium text-gray-700">Company Logo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="input text-sm"
                  />
                  {logoPreview && (
                    <div className="mt-2 flex justify-center">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-20 w-auto object-contain border border-gray-300 rounded p-2"
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Recommended: PNG or JPG, max 5MB, 200x200px or larger
                  </p>
                </div>
              </div>

              {/* Address Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-green-600 text-sm">📍</span>
                  </span>
                  Address Information
                </h3>
                
                {/* Street Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Street Address <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={info.address?.street || ''}
                    onChange={(e) => handleChange('address.street', e.target.value)}
                    className="input text-sm"
                    placeholder="Enter street address"
                  />
                </div>

                {/* City and State */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">City <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={info.address?.city || ''}
                      onChange={(e) => handleChange('address.city', e.target.value)}
                      className="input text-sm"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">State/Province <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={info.address?.state || ''}
                      onChange={(e) => handleChange('address.state', e.target.value)}
                      className="input text-sm"
                      placeholder="State"
                    />
                  </div>
                </div>

                {/* Postal Code and Country */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Postal Code <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={info.address?.postalCode || ''}
                      onChange={(e) => handleChange('address.postalCode', e.target.value)}
                      className="input text-sm"
                      placeholder="Code"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Country <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={info.address?.country || ''}
                      onChange={(e) => handleChange('address.country', e.target.value)}
                      className="input text-sm"
                      placeholder="Country"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-purple-600 text-sm">📞</span>
                  </span>
                  Contact Information
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Phone Number <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      value={info.contactInfo?.phone || ''}
                      onChange={(e) => handleChange('contactInfo.phone', e.target.value)}
                      className="input text-sm"
                      placeholder="Phone"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Email Address <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={info.contactInfo?.email || ''}
                      onChange={(e) => handleChange('contactInfo.email', e.target.value)}
                      className="input text-sm"
                      placeholder="Email"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Website</label>
                    <input
                      type="url"
                      value={info.contactInfo?.website || ''}
                      onChange={(e) => handleChange('contactInfo.website', e.target.value)}
                      className="input text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Fax Number</label>
                    <input
                      type="tel"
                      value={info.contactInfo?.fax || ''}
                      onChange={(e) => handleChange('contactInfo.fax', e.target.value)}
                      className="input text-sm"
                      placeholder="Fax"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-orange-600 text-sm">📄</span>
                  </span>
                  Additional Information
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Tax ID</label>
                    <input
                      type="text"
                      value={info.additionalInfo?.taxId || ''}
                      onChange={(e) => handleChange('additionalInfo.taxId', e.target.value)}
                      className="input text-sm"
                      placeholder="Enter tax ID"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Registration Number</label>
                    <input
                      type="text"
                      value={info.additionalInfo?.registrationNumber || ''}
                      onChange={(e) => handleChange('additionalInfo.registrationNumber', e.target.value)}
                      className="input text-sm"
                      placeholder="Enter registration number"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Business License</label>
                    <input
                      type="text"
                      value={info.additionalInfo?.businessLicense || ''}
                      onChange={(e) => handleChange('additionalInfo.businessLicense', e.target.value)}
                      className="input text-sm"
                      placeholder="Enter business license"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Preview</h3>
              </div>
              
              {/* Header Preview */}
              <div className="bg-white border border-gray-300 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Header Display</h4>
                <div className="bg-gray-50 p-4 rounded border border-gray-200">
                  <div className="flex items-center space-x-3">
                    {logoPreview && (
                      <img src={logoPreview} alt="Logo" className="h-12 w-auto object-contain" />
                    )}
                    <span className="font-bold text-xl text-gray-900">{info.companyName || 'Company Name'}</span>
                  </div>
                </div>
              </div>

              {/* Address Preview */}
              <div className="bg-white border border-gray-300 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Address Display</h4>
                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-700 whitespace-pre-line">
                  {info.address ? formatCompanyAddress(info.address) : 'No address entered'}
                </div>
              </div>

              {/* Contact Preview */}
              <div className="bg-white border border-gray-300 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Contact Display</h4>
                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-700 whitespace-pre-line">
                  {info.contactInfo ? formatCompanyContact(info.contactInfo) : 'No contact info entered'}
                </div>
              </div>

              {/* Additional Info Preview */}
              {(info.additionalInfo?.taxId || info.additionalInfo?.registrationNumber || info.additionalInfo?.businessLicense) && (
                <div className="bg-white border border-gray-300 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Business Details</h4>
                  <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-700 space-y-2">
                    {info.additionalInfo?.taxId && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tax ID:</span>
                        <span className="font-medium">{info.additionalInfo.taxId}</span>
                      </div>
                    )}
                    {info.additionalInfo?.registrationNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Registration:</span>
                        <span className="font-medium">{info.additionalInfo.registrationNumber}</span>
                      </div>
                    )}
                    {info.additionalInfo?.businessLicense && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">License:</span>
                        <span className="font-medium">{info.additionalInfo.businessLicense}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
