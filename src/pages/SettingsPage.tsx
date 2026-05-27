import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { JobIdSettingsModal } from '../components/JobIdSettingsModal';
import { CompanyInfoSettingsModal } from '../components/CompanyInfoSettingsModal';
import { UsersAndRolesManagementModal } from '../components/UsersAndRolesManagementModal';
import { useJobIdSettings } from '../hooks/useJobIdSettings';
import { useCustomerIdSettings } from '../hooks/useCustomerIdSettings';
import { useCompanyInfo } from '../contexts/CompanyInfoContext';
import { previewJobId } from '../services/jobIdService';
import { previewCustomerId } from '../services/customerIdService';
import { CustomerIdSettingsModal } from '../components/CustomerIdSettingsModal';
import { PdfTemplateManagerModal } from '../components/PdfTemplateManagerModal';
import { CertificateNumberManagerModal } from '../components/CertificateNumberManagerModal';
import { MasterListsManagementModal } from '../components/MasterListsManagementModal';
import { DriveBackupModal } from '../components/DriveBackupModal';
import {
  HashIcon,
  BuildingIcon,
  UsersIcon,
  MailIcon,
  BarChartIcon,
  ShieldIcon,
  FileTextIcon,
  DownloadIcon,
  WrenchIcon,
  IdCardIcon,
  TagIcon,
} from '../components/common';

// ── Inline chevron (right) ────────────────────────────────────────────────
const ChevronRight = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

// ── External-link icon (for Equipment Lists which leaves Settings) ─────────
const ExternalLinkIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ── Section divider header ────────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex items-center gap-3 mb-3">
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
      {title}
    </h2>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

// ── Reusable settings card ────────────────────────────────────────────────
interface SettingsCardProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentHover: string;
  title: string;
  description: string;
  badge?: string;
  badgeStyle?: string;
  onClick: () => void;
  linkOut?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  icon, iconBg, iconColor, accentHover,
  title, description, badge, badgeStyle = 'bg-gray-100 text-gray-600',
  onClick, linkOut = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group w-full flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-200 ${accentHover} hover:shadow-md transition-all duration-150 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400`}
  >
    {/* Icon container */}
    <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-150`}>
      <span className={iconColor}>{icon}</span>
    </div>

    {/* Text */}
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900 leading-snug">{title}</span>
        {linkOut
          ? <ExternalLinkIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5 group-hover:text-gray-600 transition-colors" />
          : <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all duration-150" />
        }
      </div>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      {badge && (
        <span className={`mt-2.5 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono ${badgeStyle}`}>
          {badge}
        </span>
      )}
    </div>
  </button>
);

// ── Main component ────────────────────────────────────────────────────────
export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

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

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveJobIdSettings = async (newSettings: typeof jobIdSettings) => {
    try {
      await updateSettings(newSettings);
      await refreshSettings();
      showSuccess('Request number settings saved');
      setShowJobIdSettings(false);
    } catch {
      showError('Failed to save request number settings');
    }
  };

  const handleSaveCustomerIdSettings = async (newSettings: typeof customerIdSettings) => {
    try {
      await updateCustomerIdSettings(newSettings);
      await refreshCustomerIdSettings();
      showSuccess('Customer ID settings saved');
      setShowCustomerIdSettings(false);
    } catch {
      showError('Failed to save customer ID settings');
    }
  };

  const handleCompanyInfoSave = async (info: any) => {
    try {
      updateCompanyInfo(info);
      await refreshCompanyInfo();
      showSuccess('Company information saved');
      setShowCompanyInfo(false);
    } catch {
      showError('Failed to save company information');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure and manage your laboratory information management system
          </p>
        </div>

        {/* ── Numbering & IDs ──────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Numbering & IDs" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SettingsCard
              icon={<HashIcon className="w-5 h-5" />}
              iconBg="bg-primary-50"
              iconColor="text-primary-600"
              accentHover="hover:border-primary-300"
              title="Request Number"
              description="Set the prefix, year, and sequence format used when generating new service request numbers."
              badge={`Next: ${previewJobId(jobIdSettings)}`}
              badgeStyle="bg-primary-50 text-primary-700"
              onClick={() => setShowJobIdSettings(true)}
            />
            <SettingsCard
              icon={<IdCardIcon className="w-5 h-5" />}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              accentHover="hover:border-emerald-300"
              title="Customer ID"
              description="Configure how customer identifiers are generated — prefix, digit count, and starting sequence."
              badge={`Next: ${previewCustomerId(customerIdSettings)}`}
              badgeStyle="bg-emerald-50 text-emerald-700"
              onClick={() => setShowCustomerIdSettings(true)}
            />
          </div>
        </section>

        {/* ── Organization ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Organization" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SettingsCard
              icon={<BuildingIcon className="w-5 h-5" />}
              iconBg="bg-sky-50"
              iconColor="text-sky-600"
              accentHover="hover:border-sky-300"
              title="Company Information"
              description="Name, logo, address, and contact details printed on all PDF certificates and reports."
              badge={companyInfo?.companyName || undefined}
              badgeStyle="bg-sky-50 text-sky-700"
              onClick={() => setShowCompanyInfo(true)}
            />
            <SettingsCard
              icon={<UsersIcon className="w-5 h-5" />}
              iconBg="bg-indigo-50"
              iconColor="text-indigo-600"
              accentHover="hover:border-indigo-300"
              title="Users & Roles"
              description="Manage staff accounts, assign roles, and control which permissions each role grants."
              onClick={() => setShowUsersAndRoles(true)}
            />
          </div>
        </section>

        {/* ── Documents & Certificates ─────────────────────────────────── */}
        <section>
          <SectionHeader title="Documents & Certificates" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SettingsCard
              icon={<FileTextIcon className="w-5 h-5" />}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
              accentHover="hover:border-purple-300"
              title="PDF Templates"
              description="Design and manage reusable templates for calibration certificates, job reports, and staff records."
              onClick={() => setShowPdfTemplateManager(true)}
            />
            <SettingsCard
              icon={<TagIcon className="w-5 h-5" />}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              accentHover="hover:border-amber-300"
              title="Certificate Numbers"
              description="Define numbering categories and sequences for calibration certificates issued to customers."
              onClick={() => setShowCertificateNumberManager(true)}
            />
          </div>
        </section>

        {/* ── Data & Equipment ─────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Data & Equipment" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SettingsCard
              icon={<DownloadIcon className="w-5 h-5" />}
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
              accentHover="hover:border-teal-300"
              title="Backup & Export"
              description="Download a full JSON snapshot of all jobs, equipment, and measurements as an offline backup."
              onClick={() => setShowDriveBackup(true)}
            />
            <SettingsCard
              icon={<WrenchIcon className="w-5 h-5" />}
              iconBg="bg-green-50"
              iconColor="text-green-600"
              accentHover="hover:border-green-300"
              title="Equipment Lists"
              description="View and manage all registered lab instruments, calibration schedules, and usage logs."
              onClick={() => navigate('/equipment')}
              linkOut
            />
          </div>
        </section>

        {/* ── Coming Soon ──────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Coming Soon" />
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <MailIcon className="w-3.5 h-3.5" />, label: 'Email Alerts' },
              { icon: <span className="text-sm leading-none">🔔</span>, label: 'Notifications' },
              { icon: <BarChartIcon className="w-3.5 h-3.5" />, label: 'Analytics & Reports' },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 text-xs font-medium cursor-not-allowed select-none"
              >
                {icon}
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Admin notice ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl">
          <ShieldIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-600">Administrator access required.</span>
            {' '}Changes made here apply to all users and the entire system. Configure with care.
          </p>
        </div>

      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <JobIdSettingsModal
        isOpen={showJobIdSettings}
        onClose={() => setShowJobIdSettings(false)}
        currentSettings={jobIdSettings}
        onSave={handleSaveJobIdSettings}
      />
      <CustomerIdSettingsModal
        isOpen={showCustomerIdSettings}
        onClose={() => setShowCustomerIdSettings(false)}
        currentSettings={customerIdSettings}
        onSave={handleSaveCustomerIdSettings}
      />
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
      <PdfTemplateManagerModal
        isOpen={showPdfTemplateManager}
        onClose={() => setShowPdfTemplateManager(false)}
      />
      <CertificateNumberManagerModal
        isOpen={showCertificateNumberManager}
        onClose={() => setShowCertificateNumberManager(false)}
      />
      <MasterListsManagementModal
        isOpen={showMasterLists}
        onClose={() => setShowMasterLists(false)}
      />
      <DriveBackupModal
        isOpen={showDriveBackup}
        onClose={() => setShowDriveBackup(false)}
      />
    </div>
  );
};
