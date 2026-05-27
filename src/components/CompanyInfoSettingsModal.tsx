import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import {
  saveCompanyInfoWithLogo,
  validateCompanyInfo,
  formatCompanyAddress,
  formatCompanyContact,
} from '../services/companyInfoService';
import type { CompanyInfo as CompanyInfoType } from '../types';
import {
  BuildingIcon, AlertTriangleIcon, XIcon, CheckIcon, MapPinIcon, PhoneIcon, InfoIcon,
} from './common';

// ── Inline sub-section header ─────────────────────────────────────────────
const FormSection: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon, iconBg, title, children }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 ${iconBg} rounded-md flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
        {title}
      </h3>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
    {children}
  </div>
);

interface CompanyInfoSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInfo: CompanyInfoType | null;
  onSave: (info: CompanyInfoType) => Promise<void>;
}

const BLANK: Partial<CompanyInfoType> = {
  companyName: '',
  logoUrl: '',
  address: { street: '', city: '', state: '', postalCode: '', country: '' },
  contactInfo: { phone: '', email: '', website: '', fax: '' },
  additionalInfo: { taxId: '', registrationNumber: '', businessLicense: '' },
};

export const CompanyInfoSettingsModal: React.FC<CompanyInfoSettingsModalProps> = ({
  isOpen,
  onClose,
  currentInfo,
  onSave,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [info, setInfo] = useState<Partial<CompanyInfoType>>(BLANK);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentInfo) {
      setInfo(currentInfo);
      setLogoPreview(currentInfo.logoUrl || '');
      setLogoFile(null);
      setErrors([]);
    }
  }, [isOpen, currentInfo]);

  const handleChange = (field: string, value: any) => {
    let next: Partial<CompanyInfoType>;
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      next = { ...info, [parent]: { ...(info[parent as keyof typeof info] as any), [child]: value } };
    } else {
      next = { ...info, [field]: value };
    }
    setInfo(next);
    setErrors(validateCompanyInfo(next));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Please select a valid image file'); return; }
    if (file.size > 5 * 1024 * 1024) { showError('Image file size must be less than 5MB'); return; }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!currentUser) { showError('User not authenticated'); return; }
    const errs = validateCompanyInfo(info);
    if (errs.length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      const saved = await saveCompanyInfoWithLogo(info, logoFile, currentUser.uid);
      await onSave(saved);
      success('Company information saved');
      onClose();
    } catch {
      showError('Failed to save company information');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setInfo(currentInfo ?? BLANK);
    setLogoFile(null);
    setLogoPreview(currentInfo?.logoUrl || '');
    setErrors([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-4xl" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <BuildingIcon className="w-5 h-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">Company Information</h2>
              <p className="text-xs text-gray-400 mt-0.5">Details printed on all PDF certificates and reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              <XIcon className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || errors.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Left: Form ── */}
            <div className="space-y-6 overflow-y-auto pr-1" style={{ maxHeight: '65vh' }}>

              {/* Validation banner */}
              {errors.length > 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-1">Validation Errors</p>
                    <ul className="space-y-0.5">
                      {errors.map((err, i) => (
                        <li key={i} className="text-xs text-red-700">{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Basic Information */}
              <FormSection icon={<BuildingIcon className="w-3.5 h-3.5 text-sky-600" />} iconBg="bg-sky-100" title="Basic Information">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={info.companyName || ''}
                      onChange={(e) => handleChange('companyName', e.target.value)}
                      className="input w-full"
                      placeholder="Your organization's legal name"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Company Logo</label>
                    {logoPreview && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <img src={logoPreview} alt="Logo preview" className="h-12 w-auto object-contain flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-700">Current logo</p>
                          <button
                            type="button"
                            onClick={() => { setLogoPreview(''); setLogoFile(null); }}
                            className="text-xs text-red-500 hover:text-red-700 mt-0.5 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="block w-full text-sm text-gray-600
                        file:mr-3 file:py-1.5 file:px-4 file:rounded-lg
                        file:border file:border-gray-300 file:text-sm file:font-medium
                        file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                    />
                    <p className="text-xs text-gray-400">PNG or JPG · Max 5 MB · Min 200×200 px recommended</p>
                  </div>
                </div>
              </FormSection>

              {/* Address */}
              <FormSection icon={<MapPinIcon className="w-3.5 h-3.5 text-green-600" />} iconBg="bg-green-100" title="Address">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      Street Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={info.address?.street || ''}
                      onChange={(e) => handleChange('address.street', e.target.value)}
                      className="input w-full"
                      placeholder="123 Main Street"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">City <span className="text-red-500">*</span></label>
                      <input type="text" value={info.address?.city || ''} onChange={(e) => handleChange('address.city', e.target.value)} className="input w-full" placeholder="City" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">State / Province <span className="text-red-500">*</span></label>
                      <input type="text" value={info.address?.state || ''} onChange={(e) => handleChange('address.state', e.target.value)} className="input w-full" placeholder="State" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Postal Code <span className="text-red-500">*</span></label>
                      <input type="text" value={info.address?.postalCode || ''} onChange={(e) => handleChange('address.postalCode', e.target.value)} className="input w-full" placeholder="00000" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Country <span className="text-red-500">*</span></label>
                      <input type="text" value={info.address?.country || ''} onChange={(e) => handleChange('address.country', e.target.value)} className="input w-full" placeholder="Thailand" />
                    </div>
                  </div>
                </div>
              </FormSection>

              {/* Contact */}
              <FormSection icon={<PhoneIcon className="w-3.5 h-3.5 text-purple-600" />} iconBg="bg-purple-100" title="Contact">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Phone <span className="text-red-500">*</span></label>
                    <input type="tel" value={info.contactInfo?.phone || ''} onChange={(e) => handleChange('contactInfo.phone', e.target.value)} className="input w-full" placeholder="+66 2 000 0000" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={info.contactInfo?.email || ''} onChange={(e) => handleChange('contactInfo.email', e.target.value)} className="input w-full" placeholder="info@company.com" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Website</label>
                    <input type="url" value={info.contactInfo?.website || ''} onChange={(e) => handleChange('contactInfo.website', e.target.value)} className="input w-full" placeholder="https://www.company.com" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Fax</label>
                    <input type="tel" value={info.contactInfo?.fax || ''} onChange={(e) => handleChange('contactInfo.fax', e.target.value)} className="input w-full" placeholder="+66 2 000 0001" />
                  </div>
                </div>
              </FormSection>

              {/* Business Details */}
              <FormSection icon={<InfoIcon className="w-3.5 h-3.5 text-amber-600" />} iconBg="bg-amber-100" title="Business Details">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Tax ID</label>
                    <input type="text" value={info.additionalInfo?.taxId || ''} onChange={(e) => handleChange('additionalInfo.taxId', e.target.value)} className="input w-full" placeholder="e.g. 0105550000000" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Registration Number</label>
                    <input type="text" value={info.additionalInfo?.registrationNumber || ''} onChange={(e) => handleChange('additionalInfo.registrationNumber', e.target.value)} className="input w-full" placeholder="e.g. 0105550000000" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Business License</label>
                    <input type="text" value={info.additionalInfo?.businessLicense || ''} onChange={(e) => handleChange('additionalInfo.businessLicense', e.target.value)} className="input w-full" placeholder="License number" />
                  </div>
                </div>
              </FormSection>

            </div>

            {/* ── Right: Live Preview ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Preview</span>
              </div>

              {/* Letterhead */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Letterhead</p>
                </div>
                <div className="p-5 bg-gray-50">
                  <div className="flex items-center gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="h-12 w-auto object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BuildingIcon className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <p className="font-bold text-lg text-gray-900 leading-tight">
                      {info.companyName || <span className="text-gray-400 font-normal italic text-base">Company Name</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Address</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {info.address
                      ? formatCompanyAddress(info.address)
                      : <span className="text-gray-400 italic">No address entered</span>
                    }
                  </p>
                </div>
              </div>

              {/* Contact */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contact</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {info.contactInfo
                      ? formatCompanyContact(info.contactInfo)
                      : <span className="text-gray-400 italic">No contact info entered</span>
                    }
                  </p>
                </div>
              </div>

              {/* Business details */}
              {(info.additionalInfo?.taxId || info.additionalInfo?.registrationNumber || info.additionalInfo?.businessLicense) && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Business Details</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {info.additionalInfo?.taxId && (
                      <div className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-xs text-gray-500">Tax ID</span>
                        <span className="text-xs font-mono text-gray-700">{info.additionalInfo.taxId}</span>
                      </div>
                    )}
                    {info.additionalInfo?.registrationNumber && (
                      <div className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-xs text-gray-500">Registration</span>
                        <span className="text-xs font-mono text-gray-700">{info.additionalInfo.registrationNumber}</span>
                      </div>
                    )}
                    {info.additionalInfo?.businessLicense && (
                      <div className="flex items-center justify-between px-5 py-2.5">
                        <span className="text-xs text-gray-500">License</span>
                        <span className="text-xs font-mono text-gray-700">{info.additionalInfo.businessLicense}</span>
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
