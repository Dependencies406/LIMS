import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { firestoreToDate } from '../utils/dateUtils';
import type { Job, Customer, Equipment, User, WorkAuthorization } from '../types';
import { db, doc, setDoc, updateDoc, getDoc, serverTimestamp, deleteField } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { usePermission } from '../hooks/usePermission';
import { getNextJobId, incrementJobIdSequence } from '../services/jobIdService';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { generateCertificateNumberForEquipment } from '../services/certificateNumberGeneratorService';
import { getManufacturerNames } from '../services/manufacturerListService';
import { getModelNames } from '../services/modelListService';
import { getCalibrationMethodNames } from '../services/calibrationMethodListService';
import { SignatureCanvas } from './SignatureCanvas';
import { EquipmentFileUpload } from './EquipmentFileUpload';
import { TemplateBasedPdfPreviewModal } from './TemplateBasedPdfPreviewModal';
import { StatementOfConformityPdfUpload } from './StatementOfConformityPdfUpload';
import { matchUserFromAssignedStaffValue } from '../services/userService';
import { jobService } from '../services/jobService';
import { IconButton, PlusIcon } from './common';

interface JobModalProps {
  job: Job | null;
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
  /** Full-page layout for `/jobs/:jobId` instead of overlay modal */
  layout?: 'modal' | 'page';
  /** Called after the job is soft-deleted (moved to Recycle Bin) */
  onDeleted?: () => void;
}

type JobModalTab = 'job' | 'customer' | 'service' | 'items' | 'workAuth' | 'notes';

const JOB_MODAL_TABS: { id: JobModalTab; label: string }[] = [
  { id: 'job', label: 'Job' },
  { id: 'customer', label: 'Customer' },
  { id: 'service', label: 'Service' },
  { id: 'items', label: 'Items' },
  { id: 'workAuth', label: 'Work auth' },
  { id: 'notes', label: 'Notes' },
];

/** Equipment type names from Certificate Number Manager, plus legacy job name if not in list */
function equipmentTypeSelectOptions(allowed: string[], currentName: string): string[] {
  const cur = currentName.trim();
  const set = new Set(allowed);
  if (cur && !set.has(cur)) set.add(cur);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Filter Settings master list by substring (case-insensitive), like customer name matching */
function filterMasterListByQuery(names: string[], query: string, max = 25): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return names.filter((n) => n.toLowerCase().includes(q)).slice(0, max);
}

/** Display name for Users & Roles directory (matches Assigned Staff dropdown). */
function formatUserDirectoryName(u: User): string {
  const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  if (full) return full;
  return (u.displayName || '').trim() || u.email || '';
}

const WORK_AUTH_TERMS_AND_CONDITIONS = [
  'Traceability: All calibration results are traceable to SI units via NIMT or equivalent NMI. Calibration certificates will reference the traceability chain.',
  'Confidentiality: SCS treats all customer data and technical information as strictly confidential and will not disclose it to third parties without prior written consent.',
  'Subcontracting: SCS does not normally subcontract calibration work. If subcontracting is required, prior written customer approval will be obtained.',
  'No Urgent Service: Express or urgent service is not available. Standard turnaround time will be confirmed at contract review. This policy is in line with current operational capacity.',
].join('\n\n');

export const JobModal: React.FC<JobModalProps> = ({
  job,
  customers,
  onClose,
  onSuccess,
  layout = 'modal',
  onDeleted,
}) => {
  const { currentUser, isAdmin } = useAuth();
  const { users } = useUsers();
  const { hasPermission: hasEditJobPermission, loading: loadingEditPerm } = usePermission('jobs.edit');
  const { hasPermission: hasCreateJobPermission, loading: loadingCreatePerm } = usePermission('jobs.create');
  const { hasPermission: hasGenerateTemplatePdfPermission } = usePermission('jobs.generatePdf');
  const { hasPermission: hasDeleteJobPermission } = usePermission('jobs.delete');
  const permLoading = loadingEditPerm || loadingCreatePerm;
  const [loading, setLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(job);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [showMoveToRecycleConfirm, setShowMoveToRecycleConfirm] = useState(false);
  const [recycleMoveLoading, setRecycleMoveLoading] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTemplatePdfPreview, setShowTemplatePdfPreview] = useState(false);
  /** Template linked to this job — persisted immediately to Firestore when the user picks one */
  const [linkedPdfTemplateId, setLinkedPdfTemplateId] = useState<string | undefined>(job?.pdfTemplateId);
  const [activeJobTab, setActiveJobTab] = useState<JobModalTab>('job');
  const [customerSuggestOpen, setCustomerSuggestOpen] = useState(false);
  const [receivedByUserSuggestOpen, setReceivedByUserSuggestOpen] = useState(false);
  const [technicalReviewerUserSuggestOpen, setTechnicalReviewerUserSuggestOpen] = useState(false);
  const customerComboRef = useRef<HTMLDivElement>(null);
  const receivedByComboAnchorRef = useRef<HTMLElement | null>(null);
  const technicalReviewerComboAnchorRef = useRef<HTMLElement | null>(null);
  const [receivedBySuggestRect, setReceivedBySuggestRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [technicalReviewerSuggestRect, setTechnicalReviewerSuggestRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Close status dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showStatusDropdown) {
        const target = event.target as HTMLElement;
        if (!target.closest('.status-dropdown-container')) {
          setShowStatusDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusDropdown]);

  useEffect(() => {
    const closeOnOutside = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!customerComboRef.current?.contains(el)) {
        setCustomerSuggestOpen(false);
      }
      if (!el.closest('[data-workauth-receivedby-combo]')) {
        setReceivedByUserSuggestOpen(false);
      }
      if (!el.closest('[data-workauth-reviewer-combo]')) {
        setTechnicalReviewerUserSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  useEffect(() => {
    setActiveJobTab('job');
  }, [job?.id]);

  useEffect(() => {
    const unsub = certificateNumberConfigService.subscribeToEquipmentNames(
      setCertificateEquipmentTypeNames
    );
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mfg, mdl, calMethods] = await Promise.all([
          getManufacturerNames(),
          getModelNames(),
          getCalibrationMethodNames(),
        ]);
        if (!cancelled) {
          setMasterManufacturerNames(mfg);
          setMasterModelNames(mdl);
          setMasterCalibrationMethodNames(calMethods);
        }
      } catch {
        if (!cancelled) {
          setMasterManufacturerNames([]);
          setMasterModelNames([]);
          setMasterCalibrationMethodNames([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('[data-jobitem-mfg-combo]')) setManufacturerSuggestRow(null);
      if (!el.closest('[data-jobitem-model-combo]')) setModelSuggestRow(null);
      if (!el.closest('[data-jobitem-calmethods-combo]')) setCalibrationMethodSuggestRow(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const [form, setForm] = useState({
    jobId: '',
    title: '',
    status: 'Pending' as Job['status'],
    customerCode: '',
    customerName: '',
    customerAddress: '',
    customerContact: '',
    customerPhone: '',
    customerEmail: '',
    assignedStaff: '',
    startDate: '',
    appointmentDate: '',
    poNumber: '',
    comments: '',
    // Service Information
    serviceRequested: 'Calibration',
    statementOfConformity: 'Not required' as 'Required' | 'Not required',
    statementOfConformityRequirements: '',
    decisionRule: '',
    // Work Authorization
    itemsConditionOnReceipt: 'Acceptable' as 'Acceptable' | 'Damaged or altered' | 'Improper storage/transportation conditions' | 'Insufficient quantity' | 'Other issues',
    itemsConditionSpecification: '',
    laboratoryCapabilityAssessment: 'Full capability' as 'Full capability' | 'Partial capability' | 'Lacks capability',
    capabilitySpecification: ''
  });

  const [equipment, setEquipment] = useState<Equipment[]>([{
    name: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    calibrationPoint: '',
    unit: '',
    calibrationMethods: '',
    accessories: '',
    machineLocation: '',
    calibrationDate: '',
    remark: '',
    certificateNumber: ''
  }]);
  /** Per-item panel open state (same length as `equipment`). Collapsed rows keep the list compact. */
  const [itemExpanded, setItemExpanded] = useState<boolean[]>([true]);
  /** Active certificate config names (equipment types) — matches `CertificateNumberManagerModal` / cert number sequences */
  const [certificateEquipmentTypeNames, setCertificateEquipmentTypeNames] = useState<string[]>([]);
  /** Master lists (Settings → manufacturer / model lists) for typeahead */
  const [masterManufacturerNames, setMasterManufacturerNames] = useState<string[]>([]);
  const [masterModelNames, setMasterModelNames] = useState<string[]>([]);
  const [masterCalibrationMethodNames, setMasterCalibrationMethodNames] = useState<string[]>([]);
  /** Which item row shows manufacturer or model suggestion popup (customer-name style) */
  const [manufacturerSuggestRow, setManufacturerSuggestRow] = useState<number | null>(null);
  const [modelSuggestRow, setModelSuggestRow] = useState<number | null>(null);
  const [calibrationMethodSuggestRow, setCalibrationMethodSuggestRow] = useState<number | null>(null);
  const [generatingCertificateForRow, setGeneratingCertificateForRow] = useState<number | null>(null);
  const [excelCopiedRow, setExcelCopiedRow] = useState<number | null>(null);
  const [showCustomerSignatureModal, setShowCustomerSignatureModal] = useState(false);
  const [showStaffSignatureModal, setShowStaffSignatureModal] = useState(false);
  const [showTechnicalReviewerSignatureModal, setShowTechnicalReviewerSignatureModal] = useState(false);

  // Work Authorization signatures
  const [customerSignature, setCustomerSignature] = useState<WorkAuthorization['customerSignature']>();
  const [staffSignature, setStaffSignature] = useState<WorkAuthorization['staffSignature']>();
  const [technicalReviewerSignature, setTechnicalReviewerSignature] =
    useState<WorkAuthorization['technicalReviewerSignature']>();
  const [preWorkChecklist, setPreWorkChecklist] = useState<NonNullable<WorkAuthorization['preWorkChecklist']>>({
    capabilityResourcesAvailable: false,
    methodAppropriateValidatedUpToDate: false,
    equipmentConditionChecked: false,
    customerRequirementsUnderstood: false,
  });

  // Update currentJob when job prop changes
  useEffect(() => {
    setCurrentJob(job);
    setLinkedPdfTemplateId(job?.pdfTemplateId);
  }, [job]);

  useEffect(() => {
    if (currentJob) {
      setForm({
        jobId: currentJob.jobId,
        title: currentJob.title,
        status: currentJob.status,
        customerCode: currentJob.customerCode,
        customerName: currentJob.customerName || '',
        customerAddress: currentJob.customerAddress || '',
        customerContact: currentJob.customerContact || '',
        customerPhone: currentJob.customerPhone || '',
        customerEmail: currentJob.customerEmail || '',
        assignedStaff: (() => {
          const raw = currentJob.assignedStaff || '';
          const m = matchUserFromAssignedStaffValue(raw, users);
          return m ? m.uid : raw;
        })(),
        startDate: currentJob.startDate || '',
        // Back-compat: treat existing scheduleDate as appointmentDate
        appointmentDate: currentJob.appointmentDate || (currentJob as any).scheduleDate || '',
        poNumber: currentJob.poNumber || '',
        comments: currentJob.comments || '',
        // Service Information
        serviceRequested: currentJob.serviceInformation?.serviceRequested || 'Calibration',
        statementOfConformity: currentJob.serviceInformation?.statementOfConformity || 'Not required',
        statementOfConformityRequirements: currentJob.serviceInformation?.statementOfConformityRequirements || '',
        decisionRule: currentJob.serviceInformation?.decisionRule || '',
        // Work Authorization
        itemsConditionOnReceipt: currentJob.workAuthorization?.itemsConditionOnReceipt || 'Acceptable',
        itemsConditionSpecification: currentJob.workAuthorization?.itemsConditionSpecification || '',
        laboratoryCapabilityAssessment: currentJob.workAuthorization?.laboratoryCapabilityAssessment || 'Full capability',
        capabilitySpecification: currentJob.workAuthorization?.capabilitySpecification || ''
      });
      setPreWorkChecklist({
        capabilityResourcesAvailable: currentJob.workAuthorization?.preWorkChecklist?.capabilityResourcesAvailable ?? false,
        methodAppropriateValidatedUpToDate:
          currentJob.workAuthorization?.preWorkChecklist?.methodAppropriateValidatedUpToDate ?? false,
        equipmentConditionChecked: currentJob.workAuthorization?.preWorkChecklist?.equipmentConditionChecked ?? false,
        customerRequirementsUnderstood: currentJob.workAuthorization?.preWorkChecklist?.customerRequirementsUnderstood ?? false,
      });
      const loadedEq = currentJob.equipment.length > 0 ? currentJob.equipment : [{
        name: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        assetTag: '',
        calibrationPoint: '',
        unit: '',
        calibrationMethods: '',
        accessories: '',
        machineLocation: '',
        calibrationDate: '',
        remark: '',
        certificateNumber: ''
      }];
      setEquipment(
        loadedEq.map((eq) => ({
          ...eq,
          unit: eq.unit ?? '',
          calibrationDate: eq.calibrationDate ?? '',
          assetTag: (eq as any).assetTag ?? '',
          certificateNumber: eq.certificateNumber ?? ''
        }))
      );
      setItemExpanded(
        loadedEq.length > 1 ? loadedEq.map(() => false) : [true]
      );
      
      // Load work authorization signatures
      setCustomerSignature(currentJob.workAuthorization?.customerSignature);
      setStaffSignature(currentJob.workAuthorization?.staffSignature);
      setTechnicalReviewerSignature(currentJob.workAuthorization?.technicalReviewerSignature);
    } else {
      // Reset form for new job creation
      setForm({
        jobId: '',
        title: '',
        status: 'Pending' as Job['status'],
        customerCode: '',
        customerName: '',
        customerAddress: '',
        customerContact: '',
        customerPhone: '',
        customerEmail: '',
        assignedStaff: '',
        startDate: '',
        appointmentDate: '',
        poNumber: '',
        comments: '',
        // Service Information - reset to defaults
        serviceRequested: 'Calibration',
        statementOfConformity: 'Not required',
        statementOfConformityRequirements: '',
        decisionRule: '',
        // Work Authorization - reset to defaults
        itemsConditionOnReceipt: 'Acceptable',
        itemsConditionSpecification: '',
        laboratoryCapabilityAssessment: 'Full capability',
        capabilitySpecification: ''
      });
      setPreWorkChecklist({
        capabilityResourcesAvailable: false,
        methodAppropriateValidatedUpToDate: false,
        equipmentConditionChecked: false,
        customerRequirementsUnderstood: false,
      });
      
      // Reset equipment to single empty row
      setEquipment([{
        name: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        assetTag: '',
        calibrationPoint: '',
        unit: '',
        calibrationMethods: '',
        accessories: '',
        machineLocation: '',
        calibrationDate: '',
        remark: '',
        certificateNumber: ''
      }]);
      setItemExpanded([true]);
      
      // Reset signatures
      setCustomerSignature(undefined);
      setStaffSignature(undefined);
      setTechnicalReviewerSignature(undefined);
      
      // Get next Job ID for preview (without incrementing sequence)
      const getJobId = async () => {
        try {
          const newJobId = await getNextJobId();
          setForm(prev => ({ ...prev, jobId: newJobId }));
        } catch (error) {
          console.error('Error getting job ID:', error);
          // Fallback to timestamp-based ID
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
          setForm(prev => ({ ...prev, jobId: `JOB-${dateStr}-${randomStr}` }));
        }
      };
      getJobId();
    }
  }, [currentJob, users]);

  // Auto-update customer signer name when contact name changes
  useEffect(() => {
    if (form.customerContact && customerSignature) {
      setCustomerSignature({
        ...customerSignature,
        signerName: form.customerContact
      });
    }
  }, [form.customerContact]);

  // Auto-update staff signer name when assigned staff changes
  useEffect(() => {
    if (!form.assignedStaff || !staffSignature) return;
    const m = matchUserFromAssignedStaffValue(form.assignedStaff, users);
    const displayName = m ? formatUserDirectoryName(m) : form.assignedStaff;
    // Only auto-fix when the stored signerName looks like an ID (common bug) or is empty.
    if (!staffSignature.signerName || staffSignature.signerName === form.assignedStaff) {
      setStaffSignature({
        ...staffSignature,
        signerName: displayName,
      });
    }
  }, [form.assignedStaff]);

  /** Called when the user selects a template inside the PDF preview modal — saves to Firestore immediately. */
  const handlePdfTemplateSelected = useCallback(async (templateId: string) => {
    setLinkedPdfTemplateId(templateId);
    if (currentJob) {
      try {
        await updateDoc(doc(db, 'jobs', currentJob.id), { pdfTemplateId: templateId });
      } catch (err) {
        console.error('Failed to save linked PDF template:', err);
      }
    }
  }, [currentJob]);

  /** Live Job snapshot from the form for template-based PDF. */
  const getJobForPreview = (): Job => {
    const serviceInformation = {
      serviceRequested: form.serviceRequested,
      statementOfConformity: form.statementOfConformity,
      ...(form.statementOfConformity === 'Required' && form.statementOfConformityRequirements
        ? { statementOfConformityRequirements: form.statementOfConformityRequirements }
        : {}),
      ...(form.decisionRule.trim() ? { decisionRule: form.decisionRule.trim() } : {}),
      ...(currentJob?.serviceInformation?.statementOfConformityReferencePdf
        ? { statementOfConformityReferencePdf: currentJob.serviceInformation.statementOfConformityReferencePdf }
        : {}),
    };

    const workAuthorization = {
      workAuthorizationStatement: WORK_AUTH_TERMS_AND_CONDITIONS,
      itemsConditionOnReceipt: form.itemsConditionOnReceipt,
      ...(form.itemsConditionOnReceipt !== 'Acceptable' && form.itemsConditionOnReceipt !== 'Insufficient quantity' && form.itemsConditionSpecification ? { itemsConditionSpecification: form.itemsConditionSpecification } : {}),
      laboratoryCapabilityAssessment: form.laboratoryCapabilityAssessment,
      ...(form.laboratoryCapabilityAssessment !== 'Full capability' && form.capabilitySpecification ? { capabilitySpecification: form.capabilitySpecification } : {}),
      preWorkChecklist,
      ...(customerSignature ? { customerSignature } : {}),
      ...(staffSignature ? { staffSignature } : {}),
      ...(technicalReviewerSignature ? { technicalReviewerSignature } : {})
    };

    return {
      id: currentJob?.id || '',
      jobId: form.jobId,
      title: form.title,
      status: form.status,
      customerCode: form.customerCode,
      customerName: form.customerName,
      customerAddress: form.customerAddress,
      customerContact: form.customerContact,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      assignedStaff: form.assignedStaff,
      startDate: form.startDate,
      appointmentDate: form.appointmentDate || undefined,
      poNumber: form.poNumber.trim() || undefined,
      comments: form.comments,
      equipment: equipment.filter(eq => eq.name || eq.model),
      serviceInformation,
      workAuthorization,
      createdAt: currentJob?.createdAt || new Date(),
      updatedAt: new Date(),
      createdBy: currentUser?.uid || ''
    };
  };

  // Function to refresh job data from Firestore
  const refreshJobData = async (jobId: string) => {
    try {
      const jobDoc = await getDoc(doc(db, 'jobs', jobId));
      if (jobDoc.exists()) {
        const jobData = {
          id: jobDoc.id,
          ...jobDoc.data(),
          createdAt: firestoreToDate(jobDoc.data().createdAt),
          updatedAt: firestoreToDate(jobDoc.data().updatedAt),
        } as Job;
        setCurrentJob(jobData);
      }
    } catch (error) {
      console.error('Error refreshing job data:', error);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const formatDateForExcel = (value?: string): string => {
    if (!value) return '';
    const v = String(value).trim();
    if (!v) return '';
    // If already looks like d/m/y, keep as-is
    if (v.includes('/')) return v;
    // ISO date (yyyy-mm-dd) -> d/m/yyyy
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m;
      return `${Number(dd)}/${Number(mm)}/${yyyy}`;
    }
    return v;
  };

  const writeTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers / permissions
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textArea);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const signatureDateToInputValue = (date?: any): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : (typeof date?.toDate === 'function' ? date.toDate() : new Date(date));
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const dateInputValueToDate = (value: string): Date | undefined => {
    const v = String(value || '').trim();
    if (!v) return undefined;
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const buildExcelCopyText = (equipmentIndex: number): string => {
    const eq = equipment[equipmentIndex] ?? ({} as Equipment);

    const rows: Array<[string, string]> = [
      ['Job Information', ''],
      ['Job ID', form.jobId || ''],
      ['Title', form.title || ''],
      ['Status', form.status || ''],
      ['Staff', assignedStaffDisplayName || ''],
      ['Contact', form.customerContact || ''],
      ['Received', formatDateForExcel(currentJob?.receivedDate || form.startDate)],
      ['Appointment', formatDateForExcel(form.appointmentDate || (currentJob as any)?.appointmentDate || (currentJob as any)?.scheduleDate)],
      ['Completed', formatDateForExcel(currentJob?.completedDate)],
      ['', ''],
      ['Customer Information', ''],
      ['Company / Organization', form.customerName || ''],
      ['Customer Code', form.customerCode || ''],
      ['Address', form.customerAddress || ''],
      ['Contact Person', form.customerContact || ''],
      ['Phone', form.customerPhone || ''],
      ['Email', form.customerEmail || ''],
      ['', ''],
      ['Equipment', ''],
      ['Name', eq.name || ''],
      ['Manufacturer', eq.manufacturer || ''],
      ['Model', eq.model || ''],
      ['Serial Number', eq.serialNumber || ''],
      ['Calibration Point', eq.calibrationPoint || ''],
      ['Calibration Date', formatDateForExcel(eq.calibrationDate)],
      ['Resolution', String((eq as any).resolution ?? '')],
      ['Unit', String(eq.unit ?? '')],
      ['Calibration Methods', eq.calibrationMethods || ''],
      ['Accessories', eq.accessories || ''],
      ['Location', eq.machineLocation || ''],
      ['Remark', eq.remark || ''],
      ['Certificate Number', String(eq.certificateNumber ?? '')],
    ];

    // TSV so Excel paste fills two columns
    return rows.map(([a, b]) => `${a}\t${b}`).join('\n');
  };

  const handleCopyExcelForItem = async (equipmentIndex: number) => {
    const text = buildExcelCopyText(equipmentIndex);
    const ok = await writeTextToClipboard(text);
    if (!ok) {
      setError('Failed to copy. Please try again.');
      return;
    }
    setExcelCopiedRow(equipmentIndex);
    setTimeout(() => {
      setExcelCopiedRow((cur) => (cur === equipmentIndex ? null : cur));
    }, 1500);
  };

  const applyCustomerFromRecord = useCallback((c: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerCode: c.customerCode,
      customerName: c.name,
      customerAddress: c.address || '',
      customerPhone: c.phone || '',
      customerEmail: c.email || '',
      customerContact: c.contact?.trim() ? c.contact : prev.customerContact,
    }));
    setCustomerSuggestOpen(false);
  }, []);

  /** Company name: free text; clears linked customer code if it no longer matches the saved record. */
  const handleCompanyNameChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        let nextCode = prev.customerCode;
        if (nextCode) {
          const linked = customers.find((x) => x.customerCode === nextCode);
          if (!linked || linked.name.trim() !== value.trim()) {
            nextCode = '';
          }
        }
        return { ...prev, customerName: value, customerCode: nextCode };
      });
      setCustomerSuggestOpen(value.trim().length > 0);
    },
    [customers]
  );

  const customerNameQuery = form.customerName.trim().toLowerCase();
  const customerMatches = useMemo(() => {
    if (!customerNameQuery) return [];
    const active = customers.filter((c) => c.isActive !== false);
    const q = customerNameQuery;
    return active
      .filter((c) => {
        const name = c.name.toLowerCase();
        const code = c.customerCode.toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .slice(0, 25);
  }, [customers, customerNameQuery]);

  const assignedStaffUser = useMemo(
    () => matchUserFromAssignedStaffValue(form.assignedStaff || '', users),
    [form.assignedStaff, users]
  );
  const assignedStaffDisplayName = assignedStaffUser ? formatUserDirectoryName(assignedStaffUser) : (form.assignedStaff || '');

  const receivedByDisplayValue = staffSignature?.signerName || assignedStaffDisplayName || '';
  const receivedByNameQuery = receivedByDisplayValue.trim().toLowerCase();
  const receivedByDirectoryMatches = useMemo(() => {
    if (!receivedByNameQuery) return [];
    const q = receivedByNameQuery;
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => {
        const full = formatUserDirectoryName(u).toLowerCase();
        const email = (u.email || '').toLowerCase();
        const pos = (u.position || '').toLowerCase();
        return full.includes(q) || email.includes(q) || pos.includes(q);
      })
      .slice(0, 25);
  }, [users, receivedByNameQuery, staffSignature?.signerName, form.assignedStaff]);

  const technicalReviewerNameQuery = (technicalReviewerSignature?.signerName ?? '').trim().toLowerCase();
  const technicalReviewerDirectoryMatches = useMemo(() => {
    if (!technicalReviewerNameQuery) return [];
    const q = technicalReviewerNameQuery;
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => {
        const full = formatUserDirectoryName(u).toLowerCase();
        const email = (u.email || '').toLowerCase();
        const pos = (u.position || '').toLowerCase();
        return full.includes(q) || email.includes(q) || pos.includes(q);
      })
      .slice(0, 25);
  }, [users, technicalReviewerNameQuery, technicalReviewerSignature?.signerName]);

  const handleReceivedByNameChange = useCallback((value: string) => {
    setStaffSignature((prev) => ({
      signatureData: prev?.signatureData || '',
      signerName: value,
      signedDate: prev?.signedDate || new Date(),
    }));
    setReceivedByUserSuggestOpen(value.trim().length > 0);
  }, []);

  const applyReceivedByFromUser = useCallback((u: User) => {
    const name = formatUserDirectoryName(u);
    setStaffSignature((prev) => ({
      signatureData: prev?.signatureData || '',
      signerName: name,
      signedDate: prev?.signedDate || new Date(),
    }));
    setReceivedByUserSuggestOpen(false);
  }, []);

  const handleTechnicalReviewerNameChange = useCallback((value: string) => {
    setTechnicalReviewerSignature((prev) => ({
      signatureData: prev?.signatureData || '',
      signerName: value,
      signedDate: prev?.signedDate || new Date(),
    }));
    setTechnicalReviewerUserSuggestOpen(value.trim().length > 0);
  }, []);

  const applyTechnicalReviewerFromUser = useCallback((u: User) => {
    const name = formatUserDirectoryName(u);
    setTechnicalReviewerSignature((prev) => ({
      signatureData: prev?.signatureData || '',
      signerName: name,
      signedDate: prev?.signedDate || new Date(),
    }));
    setTechnicalReviewerUserSuggestOpen(false);
  }, []);

  const syncReceivedBySuggestRect = useCallback(() => {
    const anchor = receivedByComboAnchorRef.current;
    if (!anchor) {
      setReceivedBySuggestRect(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const gap = 4;
    setReceivedBySuggestRect({
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const syncTechnicalReviewerSuggestRect = useCallback(() => {
    const anchor = technicalReviewerComboAnchorRef.current;
    if (!anchor) {
      setTechnicalReviewerSuggestRect(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const gap = 4;
    setTechnicalReviewerSuggestRect({
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (
      !receivedByUserSuggestOpen ||
      receivedByDirectoryMatches.length === 0 ||
      receivedByNameQuery.length === 0
    ) {
      setReceivedBySuggestRect(null);
      return;
    }
    syncReceivedBySuggestRect();
    const anchor = receivedByComboAnchorRef.current;
    const scrollParents: HTMLElement[] = [];
    let node: HTMLElement | null = anchor;
    while (node) {
      const st = window.getComputedStyle(node);
      if (
        st.overflowY === 'auto' ||
        st.overflowY === 'scroll' ||
        st.overflow === 'auto' ||
        st.overflow === 'scroll'
      ) {
        scrollParents.push(node);
      }
      node = node.parentElement;
    }
    window.addEventListener('resize', syncReceivedBySuggestRect);
    window.addEventListener('scroll', syncReceivedBySuggestRect, true);
    scrollParents.forEach((el) => el.addEventListener('scroll', syncReceivedBySuggestRect, { passive: true }));
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncReceivedBySuggestRect);
    vv?.addEventListener('scroll', syncReceivedBySuggestRect);
    return () => {
      window.removeEventListener('resize', syncReceivedBySuggestRect);
      window.removeEventListener('scroll', syncReceivedBySuggestRect, true);
      scrollParents.forEach((el) => el.removeEventListener('scroll', syncReceivedBySuggestRect));
      vv?.removeEventListener('resize', syncReceivedBySuggestRect);
      vv?.removeEventListener('scroll', syncReceivedBySuggestRect);
    };
  }, [
    receivedByUserSuggestOpen,
    receivedByDirectoryMatches.length,
    receivedByNameQuery,
    syncReceivedBySuggestRect,
  ]);

  useLayoutEffect(() => {
    if (
      !technicalReviewerUserSuggestOpen ||
      technicalReviewerDirectoryMatches.length === 0 ||
      technicalReviewerNameQuery.length === 0
    ) {
      setTechnicalReviewerSuggestRect(null);
      return;
    }
    syncTechnicalReviewerSuggestRect();
    const anchor = technicalReviewerComboAnchorRef.current;
    const scrollParents: HTMLElement[] = [];
    let node: HTMLElement | null = anchor;
    while (node) {
      const st = window.getComputedStyle(node);
      if (
        st.overflowY === 'auto' ||
        st.overflowY === 'scroll' ||
        st.overflow === 'auto' ||
        st.overflow === 'scroll'
      ) {
        scrollParents.push(node);
      }
      node = node.parentElement;
    }
    window.addEventListener('resize', syncTechnicalReviewerSuggestRect);
    window.addEventListener('scroll', syncTechnicalReviewerSuggestRect, true);
    scrollParents.forEach((el) => el.addEventListener('scroll', syncTechnicalReviewerSuggestRect, { passive: true }));
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncTechnicalReviewerSuggestRect);
    vv?.addEventListener('scroll', syncTechnicalReviewerSuggestRect);
    return () => {
      window.removeEventListener('resize', syncTechnicalReviewerSuggestRect);
      window.removeEventListener('scroll', syncTechnicalReviewerSuggestRect, true);
      scrollParents.forEach((el) => el.removeEventListener('scroll', syncTechnicalReviewerSuggestRect));
      vv?.removeEventListener('resize', syncTechnicalReviewerSuggestRect);
      vv?.removeEventListener('scroll', syncTechnicalReviewerSuggestRect);
    };
  }, [
    technicalReviewerUserSuggestOpen,
    technicalReviewerDirectoryMatches.length,
    technicalReviewerNameQuery,
    syncTechnicalReviewerSuggestRect,
  ]);

  const handleEquipmentChange = (index: number, field: keyof Equipment, value: string) => {
    const newEquipment = [...equipment];
    newEquipment[index] = { ...newEquipment[index], [field]: value };
    setEquipment(newEquipment);
  };

  const handleManufacturerFieldChange = (index: number, value: string) => {
    handleEquipmentChange(index, 'manufacturer', value);
    setManufacturerSuggestRow(value.trim().length > 0 ? index : null);
  };

  const applyManufacturerFromMaster = (index: number, value: string) => {
    handleEquipmentChange(index, 'manufacturer', value);
    setManufacturerSuggestRow(null);
  };

  const handleModelFieldChange = (index: number, value: string) => {
    handleEquipmentChange(index, 'model', value);
    setModelSuggestRow(value.trim().length > 0 ? index : null);
  };

  const applyModelFromMaster = (index: number, value: string) => {
    handleEquipmentChange(index, 'model', value);
    setModelSuggestRow(null);
  };

  const handleCalibrationMethodsFieldChange = (index: number, value: string) => {
    handleEquipmentChange(index, 'calibrationMethods', value);
    setCalibrationMethodSuggestRow(value.trim().length > 0 ? index : null);
  };

  const applyCalibrationMethodsFromMaster = (index: number, value: string) => {
    handleEquipmentChange(index, 'calibrationMethods', value);
    setCalibrationMethodSuggestRow(null);
  };

  const addEquipment = () => {
    setEquipment([
      ...equipment,
      {
        name: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        calibrationPoint: '',
        unit: '',
        calibrationMethods: '',
        accessories: '',
        machineLocation: '',
        calibrationDate: '',
        remark: '',
        certificateNumber: ''
      }
    ]);
    setItemExpanded((prev) => [...prev.map(() => false), true]);
  };

  const removeEquipment = (index: number) => {
    if (equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
      setItemExpanded((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const toggleItemPanel = (index: number) => {
    setItemExpanded((prev) =>
      prev.map((open, i) => (i === index ? !open : open))
    );
  };

  const handleCertificateNumberGenerated = async (equipmentIndex: number, certificateNumber: string) => {
    if (!currentJob) return;
    const next = [...equipment];
    next[equipmentIndex] = { ...next[equipmentIndex], certificateNumber };
    setEquipment(next);
    const filtered = next.filter((eq) => eq.name || eq.model);
    await updateDoc(doc(db, 'jobs', currentJob.id), {
      equipment: filtered,
      updatedAt: serverTimestamp(),
    });
    await refreshJobData(currentJob.id);
  };

  const handleGenerateCertificateNumberForItem = async (equipmentIndex: number) => {
    setError('');

    if (formDisabled) return;

    if (!currentJob) {
      setActiveJobTab('items');
      setError('Save the job first before generating a certificate number.');
      return;
    }

    const eq = equipment[equipmentIndex];
    const equipmentName = String(eq?.name || '').trim();

    if (!equipmentName) {
      setActiveJobTab('items');
      setError('Select an equipment type (name) before generating a certificate number.');
      return;
    }

    if (eq?.certificateNumber && String(eq.certificateNumber).trim()) {
      setActiveJobTab('items');
      setError('Certificate number already generated for this item.');
      return;
    }

    if (
      certificateEquipmentTypeNames.length > 0 &&
      !certificateEquipmentTypeNames.includes(equipmentName)
    ) {
      setActiveJobTab('items');
      setError(
        `Equipment type (name) "${equipmentName}" is not in Certificate Number Manager. Select a managed type to generate a certificate number.`
      );
      return;
    }

    const ok = window.confirm(
      `Generate certificate number for "${equipmentName}"?\n\nThis will advance the running sequence for that equipment type.`
    );
    if (!ok) return;

    setGeneratingCertificateForRow(equipmentIndex);
    try {
      const certificateNumber = await generateCertificateNumberForEquipment(equipmentName);

      const next = [...equipment];
      next[equipmentIndex] = { ...next[equipmentIndex], certificateNumber };
      setEquipment(next);

      await updateDoc(doc(db, 'jobs', currentJob.id), {
        equipment: next.filter((row) => row.name || row.model),
        updatedAt: serverTimestamp(),
      });

      await refreshJobData(currentJob.id);
    } catch (err: any) {
      setActiveJobTab('items');
      setError(err?.message || 'Failed to generate certificate number.');
    } finally {
      setGeneratingCertificateForRow((cur) => (cur === equipmentIndex ? null : cur));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation (tabs hide sections, so we jump to the tab that needs attention)
    if (!form.jobId || !form.title) {
      setActiveJobTab('job');
      setError('Please fill in Job ID and Title.');
      return;
    }
    if (!form.customerName.trim() || !form.customerContact.trim()) {
      setActiveJobTab('customer');
      setError('Please enter company / organization name and contact person.');
      return;
    }

    const hasCertTypes = certificateEquipmentTypeNames.length > 0;
    if (hasCertTypes) {
      const hasTypedItem = equipment.some((eq) =>
        certificateEquipmentTypeNames.includes(eq.name.trim())
      );
      if (!hasTypedItem) {
        setActiveJobTab('items');
        setError(
          'Select an equipment type (name) from Certificate Number Manager for at least one item. Certificate numbers use the sequence for that type.'
        );
        return;
      }
    } else if (!equipment.some((eq) => eq.name || eq.model)) {
      setActiveJobTab('items');
      setError(
        'Please add at least one item with a name or model. Add equipment types under Settings → Certificate Number Manager to align with certificate numbering.'
      );
      return;
    }

    setLoading(true);

    try {
      // Separate service information and work authorization from form data
      const { 
        serviceRequested, statementOfConformity, statementOfConformityRequirements,
        itemsConditionOnReceipt, itemsConditionSpecification, laboratoryCapabilityAssessment, capabilitySpecification,
        ...restForm 
      } = form;
      
      const serviceInformation = {
        serviceRequested,
        statementOfConformity,
        ...(statementOfConformity === 'Required' && statementOfConformityRequirements ? { statementOfConformityRequirements } : {}),
        ...(form.decisionRule.trim() ? { decisionRule: form.decisionRule.trim() } : {}),
        ...(currentJob?.serviceInformation?.statementOfConformityReferencePdf
          ? { statementOfConformityReferencePdf: currentJob.serviceInformation.statementOfConformityReferencePdf }
          : {}),
      };

      const workAuthorization = {
        itemsConditionOnReceipt,
        ...(itemsConditionOnReceipt !== 'Acceptable' && itemsConditionSpecification ? { itemsConditionSpecification } : {}),
        laboratoryCapabilityAssessment,
        ...(laboratoryCapabilityAssessment !== 'Full capability' && capabilitySpecification ? { capabilitySpecification } : {}),
        preWorkChecklist,
        ...(customerSignature ? { customerSignature } : {}),
        ...(staffSignature ? { staffSignature } : {}),
        ...(technicalReviewerSignature ? { technicalReviewerSignature } : {})
      };

      const jobData = {
        ...restForm,
        poNumber: form.poNumber.trim(),
        equipment: equipment.filter(eq => eq.name || eq.model), // Filter empty equipment
        serviceInformation,
        workAuthorization,
        ...(linkedPdfTemplateId ? { pdfTemplateId: linkedPdfTemplateId } : {}),
        updatedAt: serverTimestamp(),
        ...(job ? {} : { 
          createdAt: serverTimestamp(), 
          createdBy: currentUser?.uid || '' 
        })
      };
      // Remove legacy scheduleDate if present on existing docs
      if (currentJob) {
        (jobData as any).scheduleDate = deleteField();
      }

      if (currentJob) {
        // Updating existing job
        await updateDoc(doc(db, 'jobs', currentJob.id), jobData);
        
        // Refresh job data to get the latest from Firestore
        await refreshJobData(currentJob.id);
      } else {
        // Creating new job
        const newJobId = `job-${Date.now()}`;
        await setDoc(doc(db, 'jobs', newJobId), jobData);
        
        // Refresh job data to get the latest from Firestore
        await refreshJobData(newJobId);
        
        // Increment job ID sequence ONLY after successful save
        try {
          await incrementJobIdSequence();
        } catch (seqError) {
          console.error('Warning: Job saved but sequence not incremented:', seqError);
          // Job was saved successfully, so we continue despite sequence error
        }
      }

      // Clear loading state
      setLoading(false);
      
      // Show success message
      setSuccessMessage(currentJob ? 'Changes saved!' : 'Job created successfully!');
      setShowSuccess(true);
      
      // Notify parent component to refresh data
      onSuccess();
      
      // Hide success message after 2 seconds but keep modal open
      setTimeout(() => {
        setShowSuccess(false);
        setSuccessMessage('');
      }, 2000);
    } catch (err) {
      console.error('Error saving job:', err);
      setError('Failed to save job. Please try again.');
      setLoading(false);
    }
  };

  const handleConfirmMoveToRecycle = async () => {
    if (!currentJob?.id) return;
    if (!currentUser?.uid) {
      setError('You must be signed in to remove a job.');
      return;
    }
    setRecycleMoveLoading(true);
    setError('');
    try {
      await jobService.deleteJob(currentJob.id, currentUser.uid);
      setShowMoveToRecycleConfirm(false);
      setSuccessMessage(
        'Job moved to the Recycle Bin. You can restore it from there, or permanently delete it when you no longer need it.'
      );
      setShowSuccess(true);
      onDeleted?.();
      setTimeout(() => {
        setShowSuccess(false);
        setSuccessMessage('');
        onClose();
      }, 1800);
    } catch (err) {
      console.error('Error moving job to Recycle Bin:', err);
      setError(
        err instanceof Error ? err.message : 'Could not move this job to the Recycle Bin. Please try again.'
      );
    } finally {
      setRecycleMoveLoading(false);
    }
  };

  const isPageLayout = layout === 'page';
  const canSave = currentJob ? hasEditJobPermission : hasCreateJobPermission;
  const formDisabled = !canSave || permLoading;

  return (
    <div
      className={isPageLayout ? 'min-h-screen bg-gray-100 py-6 px-4' : 'modal'}
      onClick={isPageLayout ? undefined : onClose}
    >
      <div
        className={
          isPageLayout
            ? 'max-w-6xl w-full min-w-0 mx-auto bg-white rounded-xl shadow-lg border border-gray-200 overflow-y-auto overflow-x-hidden max-h-[calc(100vh-3rem)]'
            : 'modal-content'
        }
        onClick={e => e.stopPropagation()}
      >
        {/* Loading/Success Overlay */}
        {(loading || recycleMoveLoading || showSuccess) && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-lg">
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
                    <p className="text-gray-600 text-sm">
                      {successMessage.includes('Recycle Bin')
                        ? 'Closing in a moment…'
                        : 'You can continue editing or close the modal'}
                    </p>
                  </>
                ) : (
                  <>
                    {/* Loading Spinner */}
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {recycleMoveLoading
                        ? 'Moving job to Recycle Bin...'
                        : currentJob
                          ? 'Saving changes...'
                          : 'Creating job...'}
                    </h3>
                    <p className="text-gray-600 text-sm">Please wait</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Move to Recycle Bin — first-step confirmation (soft delete) */}
        {showMoveToRecycleConfirm && currentJob && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
            onClick={() => !recycleMoveLoading && setShowMoveToRecycleConfirm(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Move job to Recycle Bin?</h3>
                  <p className="text-sm text-gray-500">This does not permanently erase data</p>
                </div>
              </div>
              <p className="text-gray-700 mb-2">
                <strong>{currentJob.title || currentJob.jobId}</strong> will be removed from the active job list. All job
                information stays in your database until you go to the{' '}
                <span className="font-medium">Recycle Bin</span> and delete it permanently (with a second confirmation
                there).
              </p>
              <p className="text-sm text-gray-600 mb-6">You can restore this job from the Recycle Bin at any time before permanent deletion.</p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowMoveToRecycleConfirm(false)}
                  disabled={recycleMoveLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmMoveToRecycle()}
                  disabled={recycleMoveLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {recycleMoveLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span>Moving…</span>
                    </>
                  ) : (
                    'Move to Recycle Bin'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 sm:px-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center z-20 min-w-0">
          <div className="flex flex-col gap-3 min-w-0 w-full sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            {isPageLayout && (
              <button
                type="button"
                onClick={onClose}
                className="flex shrink-0 items-center gap-2 self-start px-2.5 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span aria-hidden>←</span>
                <span>Back to jobs</span>
              </button>
            )}
           <h2 className="text-xl sm:text-2xl font-bold text-gray-900 min-w-0 break-words">
             {currentJob ? 'Edit Job' : 'Create New Job'}
           </h2>
            
            {/* Status Dropdown (Admin only) */}
            <div className="relative status-dropdown-container">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                    form.status === 'Pending' ? 'border-yellow-200 bg-yellow-50 text-yellow-900' :
                    form.status === 'In Progress' ? 'border-blue-200 bg-blue-50 text-blue-900' :
                    form.status === 'Completed' ? 'border-green-200 bg-green-50 text-green-900' :
                    form.status === 'Halt' ? 'border-red-200 bg-red-50 text-red-900' :
                    'border-gray-200 bg-gray-50 text-gray-800'
                  }`}
                    title="Change Status (Admin only)"
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      form.status === 'Pending' ? 'bg-yellow-600' :
                      form.status === 'In Progress' ? 'bg-blue-600' :
                      form.status === 'Completed' ? 'bg-green-600' :
                      form.status === 'Halt' ? 'bg-red-600' :
                      'bg-gray-400'
                    }`}></span>
                    <span className="text-sm font-medium">{form.status}</span>
                    <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu */}
                  {showStatusDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('status', 'Pending');
                            setShowStatusDropdown(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-yellow-50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-yellow-600"></span>
                          <span>Pending</span>
                          {form.status === 'Pending' && (
                            <svg className="w-4 h-4 ml-auto text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('status', 'In Progress');
                            setShowStatusDropdown(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span>In Progress</span>
                          {form.status === 'In Progress' && (
                            <svg className="w-4 h-4 ml-auto text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('status', 'Completed');
                            setShowStatusDropdown(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-green-50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-green-600"></span>
                          <span>Completed</span>
                          {form.status === 'Completed' && (
                            <svg className="w-4 h-4 ml-auto text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('status', 'Halt');
                            setShowStatusDropdown(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-red-50 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-red-600"></span>
                          <span>Halt</span>
                          {form.status === 'Halt' && (
                            <svg className="w-4 h-4 ml-auto text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Read-only status display for non-admins */
                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-sm font-medium ${
                  form.status === 'Pending' ? 'border-yellow-200 bg-yellow-50 text-yellow-900' :
                  form.status === 'In Progress' ? 'border-blue-200 bg-blue-50 text-blue-900' :
                  form.status === 'Completed' ? 'border-green-200 bg-green-50 text-green-900' :
                  form.status === 'Halt' ? 'border-red-200 bg-red-50 text-red-900' :
                  'border-gray-200 bg-gray-50 text-gray-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    form.status === 'Pending' ? 'bg-yellow-600' :
                    form.status === 'In Progress' ? 'bg-blue-600' :
                    form.status === 'Completed' ? 'bg-green-600' :
                    form.status === 'Halt' ? 'bg-red-600' :
                    'bg-gray-400'
                  }`}></span>
                  <span className="text-sm font-medium">{form.status}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:flex-shrink-0 sm:justify-end">
           {/* Template PDF (only for existing jobs) */}
           {currentJob && hasGenerateTemplatePdfPermission && (
              <div className="flex items-center min-w-0">
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={loading}
                  title="Template PDF preview"
                  onClick={() => setShowTemplatePdfPreview(true)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </button>
              </div>
            )}

           {/* Delete Button (only show when editing) */}
           {currentJob && hasDeleteJobPermission && (
              <button
                type="button"
                onClick={() => setShowMoveToRecycleConfirm(true)}
                className="flex items-center justify-center h-9 w-9 rounded-md border border-gray-200 bg-white text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || recycleMoveLoading}
                title="Move job to Recycle Bin"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            
            {/* Cancel Button */}
            {!isPageLayout && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              title="Cancel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            )}
            
            {/* Save Button */}
            <button
              type="submit"
              form="job-form"
              className="flex items-center justify-center h-9 w-9 rounded-md bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || formDisabled}
              title={loading ? 'Saving...' : job ? 'Update Job' : 'Create Job'}
            >
              {loading ? (
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

        {currentJob && hasGenerateTemplatePdfPermission && (
          <TemplateBasedPdfPreviewModal
            isOpen={showTemplatePdfPreview}
            onClose={() => setShowTemplatePdfPreview(false)}
            job={getJobForPreview()}
            defaultTemplateId={linkedPdfTemplateId}
            onTemplateSelected={handlePdfTemplateSelected}
          />
        )}

        <form id="job-form" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 min-w-0">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Signature popups */}
          {showCustomerSignatureModal ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Customer signature</div>
                    <div className="text-xs text-gray-500">Sign in the box, then click Done</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomerSignatureModal(false)}
                    className="h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Accepted and Agreed by</label>
                      <input
                        type="text"
                        value={customerSignature?.signerName || form.customerContact || ''}
                        onChange={(e) => {
                          const name = e.target.value;
                          setCustomerSignature((prev) => ({
                            signatureData: prev?.signatureData || '',
                            signerName: name,
                            signedDate: prev?.signedDate || new Date(),
                          }));
                        }}
                        disabled={formDisabled}
                        className="input w-full text-sm"
                        placeholder="Customer name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={signatureDateToInputValue(customerSignature?.signedDate)}
                        onChange={(e) => {
                          const d = dateInputValueToDate(e.target.value);
                          if (!d) return;
                          setCustomerSignature((prev) => ({
                            signatureData: prev?.signatureData || '',
                            signerName: prev?.signerName || form.customerContact || '',
                            signedDate: d,
                          }));
                        }}
                        disabled={formDisabled}
                        className="input w-full text-sm"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <SignatureCanvas
                      value={customerSignature}
                      onChange={setCustomerSignature}
                      placeholder="Customer signature"
                      disabled={formDisabled}
                      showSignerNameInput={false}
                      signerName={customerSignature?.signerName || form.customerContact}
                      onSignerNameChange={(name) => {
                        if (customerSignature) {
                          setCustomerSignature({
                            ...customerSignature,
                            signerName: name
                          });
                        } else {
                          setCustomerSignature({
                            signatureData: '',
                            signerName: name,
                            signedDate: new Date()
                          });
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowCustomerSignatureModal(false)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showStaffSignatureModal ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Received by — signature</div>
                    <div className="text-xs text-gray-500">Sign in the box, then click Done</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStaffSignatureModal(false)}
                    className="h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Received by</label>
                      <div className="relative w-full min-w-0" data-workauth-receivedby-combo>
                        <input
                          type="text"
                            value={staffSignature?.signerName || assignedStaffDisplayName || ''}
                          onChange={(e) => {
                            receivedByComboAnchorRef.current =
                              e.currentTarget.closest('[data-workauth-receivedby-combo]');
                            handleReceivedByNameChange(e.target.value);
                          }}
                          onFocus={(e) => {
                            receivedByComboAnchorRef.current =
                              e.currentTarget.closest('[data-workauth-receivedby-combo]');
                            if (receivedByDisplayValue.trim().length > 0) setReceivedByUserSuggestOpen(true);
                          }}
                          autoComplete="off"
                          disabled={formDisabled}
                          className="input w-full text-sm"
                          placeholder="Type to search users or enter a name"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={signatureDateToInputValue(staffSignature?.signedDate)}
                        onChange={(e) => {
                          const d = dateInputValueToDate(e.target.value);
                          if (!d) return;
                          setStaffSignature((prev) => ({
                            signatureData: prev?.signatureData || '',
                            signerName: prev?.signerName || assignedStaffDisplayName || '',
                            signedDate: d,
                          }));
                        }}
                        disabled={formDisabled}
                        className="input w-full text-sm"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <SignatureCanvas
                      value={staffSignature}
                      onChange={setStaffSignature}
                      placeholder="Staff signature"
                      disabled={formDisabled}
                      showSignerNameInput={false}
                      signerName={staffSignature?.signerName || assignedStaffDisplayName}
                      onSignerNameChange={handleReceivedByNameChange}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowStaffSignatureModal(false)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showTechnicalReviewerSignatureModal ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Technical reviewer — signature</div>
                    <div className="text-xs text-gray-500">Sign in the box, then click Done</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTechnicalReviewerSignatureModal(false)}
                    className="h-9 w-9 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Technical reviewer</label>
                      <div className="relative w-full min-w-0" data-workauth-reviewer-combo>
                        <input
                          type="text"
                          value={technicalReviewerSignature?.signerName || ''}
                          onChange={(e) => {
                            technicalReviewerComboAnchorRef.current =
                              e.currentTarget.closest('[data-workauth-reviewer-combo]');
                            handleTechnicalReviewerNameChange(e.target.value);
                          }}
                          onFocus={(e) => {
                            technicalReviewerComboAnchorRef.current =
                              e.currentTarget.closest('[data-workauth-reviewer-combo]');
                            if ((technicalReviewerSignature?.signerName || '').trim().length > 0) {
                              setTechnicalReviewerUserSuggestOpen(true);
                            }
                          }}
                          autoComplete="off"
                          disabled={formDisabled}
                          className="input w-full text-sm"
                          placeholder="Type to search users or enter a name"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={signatureDateToInputValue(technicalReviewerSignature?.signedDate)}
                        onChange={(e) => {
                          const d = dateInputValueToDate(e.target.value);
                          if (!d) return;
                          setTechnicalReviewerSignature((prev) => ({
                            signatureData: prev?.signatureData || '',
                            signerName: prev?.signerName || '',
                            signedDate: d,
                          }));
                        }}
                        disabled={formDisabled}
                        className="input w-full text-sm"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <SignatureCanvas
                      value={technicalReviewerSignature}
                      onChange={setTechnicalReviewerSignature}
                      placeholder="Technical reviewer signature"
                      disabled={formDisabled}
                      showSignerNameInput={false}
                      signerName={technicalReviewerSignature?.signerName || ''}
                      onSignerNameChange={handleTechnicalReviewerNameChange}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowTechnicalReviewerSignatureModal(false)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {currentJob && !hasEditJobPermission && !permLoading && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded text-sm">
              You don&apos;t have permission to edit this job. You can still view data and open spreadsheets or template PDFs if allowed.
            </div>
          )}
          {!currentJob && !hasCreateJobPermission && !permLoading && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded text-sm">
              You don&apos;t have permission to create jobs.
            </div>
          )}

          <div
            className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 -mt-2 mb-2 bg-white/95 backdrop-blur-sm border-b border-gray-200"
            role="tablist"
            aria-label="Edit job sections"
          >
            <div className="flex gap-0.5 overflow-x-auto pb-0.5">
              {JOB_MODAL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeJobTab === tab.id}
                  onClick={() => setActiveJobTab(tab.id)}
                  className={`shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                    activeJobTab === tab.id
                      ? 'border-primary-600 text-primary-700 bg-primary-50/90'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <fieldset disabled={formDisabled} className="min-w-0 border-0 m-0 p-0">
          {activeJobTab === 'job' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                <span className="text-primary-600 text-sm">📋</span>
              </span>
              Job Information
            </h3>
            
            <div className="space-y-3">
              {/* Request Number (stored as jobId) */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Request No. <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Unique request number for this service request</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="text"
                    value={form.jobId}
                    onChange={(e) => handleChange('jobId', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    required
                    disabled={!!currentJob}
                  />
                </div>
              </div>

              {/* (Removed duplicate "Job ID" vs "Request No." field; they are the same) */}

              {/* Title */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Brief description of the job</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    required
                  />
                </div>
              </div>

              {/* PO Number */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">PO number</label>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-prose">
                    Optional. Enter when the job is confirmed by purchase order instead of a signed request form.
                  </p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="text"
                    value={form.poNumber}
                    onChange={(e) => handleChange('poNumber', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    placeholder="e.g. PO-2026-0142"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Start Date */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Start Date</label>
                  <p className="text-xs text-gray-500">When the job begins</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    className="input text-sm w-full min-w-0"
                  />
                </div>
              </div>

              {/* Schedule Date */}
              {/* Appointment Date */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Appointment Date</label>
                  <p className="text-xs text-gray-500">Scheduled/confirmed calibration appointment date</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="date"
                    value={form.appointmentDate}
                    onChange={(e) => handleChange('appointmentDate', e.target.value)}
                    className="input text-sm w-full min-w-0"
                  />
                </div>
              </div>

              {/* Assigned Staff */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Assigned Staff</label>
                  <p className="text-xs text-gray-500">Staff member responsible for this job</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <select
                    value={form.assignedStaff}
                    onChange={(e) => handleChange('assignedStaff', e.target.value)}
                    className="input text-sm w-full min-w-0"
                  >
                    <option value="">Select a staff member</option>
                    {users
                      .filter((user) => user.isActive !== false)
                      .map((user) => (
                        <option key={user.uid} value={user.uid}>
                          {user.firstName} {user.lastName} {user.position ? `(${user.position})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          )}

          {activeJobTab === 'customer' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                <span className="text-blue-600 text-sm">🏢</span>
              </span>
              Customer Information
            </h3>
            
            <div className="space-y-3">
              {/* Company name: type to search directory or enter any company */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="job-customer-company">
                    Company / organization name <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">
                    Type to match saved customers, or enter a new name. Pick a row to fill address and phone from the directory.
                  </p>
                </div>
                <div
                  className="relative w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0"
                  ref={customerComboRef}
                >
                  <input
                    id="job-customer-company"
                    type="text"
                    value={form.customerName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    onFocus={() => {
                      if (form.customerName.trim().length > 0) setCustomerSuggestOpen(true);
                    }}
                    autoComplete="off"
                    className="input text-sm w-full min-w-0"
                    placeholder="e.g. Acme Calibration Ltd"
                  />
                  {form.customerCode ? (
                    <p className="text-xs text-primary-700 mt-1">
                      Linked to customer code <span className="font-mono">{form.customerCode}</span>
                    </p>
                  ) : null}
                  {customerSuggestOpen && customerMatches.length > 0 && customerNameQuery.length > 0 ? (
                    <ul
                      className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                      role="listbox"
                    >
                      {customerMatches.map((c) => (
                        <li key={c.id} role="option">
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyCustomerFromRecord(c);
                            }}
                          >
                            <span className="font-medium text-gray-900">{c.name}</span>
                            <span className="ml-2 text-xs text-gray-500">{c.customerCode}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Address</label>
                  <p className="text-xs text-gray-500">Editable. Filled when you pick a directory match.</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <textarea
                    value={form.customerAddress}
                    onChange={(e) => handleChange('customerAddress', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    rows={3}
                    placeholder="Street, city, postal code…"
                  />
                </div>
              </div>

              {/* Contact Person - Required */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Name of contact person for this job</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="text"
                    value={form.customerContact}
                    onChange={(e) => handleChange('customerContact', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    placeholder="Enter contact person name"
                    required
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Phone Number</label>
                  <p className="text-xs text-gray-500">Auto-filled, can be edited</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={(e) => handleChange('customerPhone', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="w-full min-w-0 sm:flex-1">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <p className="text-xs text-gray-500">Auto-filled, can be edited</p>
                </div>
                <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => handleChange('customerEmail', e.target.value)}
                    className="input text-sm w-full min-w-0"
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {activeJobTab === 'service' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                <span className="text-purple-600 text-sm">⚙️</span>
              </span>
              Service Information
              <span className="text-red-500 ml-1">*</span>
            </h3>
            <p className="text-sm text-gray-600 mb-4">Important information for both laboratory and customer</p>
            
            <div className="space-y-6">
              {/* Service Requested */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Service Requested</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="serviceRequested"
                      value="Calibration"
                      checked={form.serviceRequested === 'Calibration'}
                      onChange={(e) => handleChange('serviceRequested', e.target.value)}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Calibration</span>
                  </label>
                </div>
              </div>

              {/* Statement of Conformity */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Statement of Conformity</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="statementOfConformity"
                      value="Required"
                      checked={form.statementOfConformity === 'Required'}
                      onChange={(e) => handleChange('statementOfConformity', e.target.value)}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="statementOfConformity"
                      value="Not required"
                      checked={form.statementOfConformity === 'Not required'}
                      onChange={(e) => handleChange('statementOfConformity', e.target.value)}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Not required</span>
                  </label>
                </div>
                
                {/* Requirements + optional reference PDF (only when Statement of Conformity is Required) */}
                {form.statementOfConformity === 'Required' && (
                  <div className="mt-3 ml-0 sm:ml-6 space-y-4">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block font-medium">
                        Please specify requirements/specifications:
                      </label>
                      <textarea
                        value={form.statementOfConformityRequirements}
                        onChange={(e) => handleChange('statementOfConformityRequirements', e.target.value)}
                        className="input text-sm w-full h-20 resize-none"
                        placeholder="Enter specific requirements or specifications for the statement of conformity"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block font-medium">
                        Customer-specified Decision Rule (required for SoC):
                      </label>
                      <textarea
                        value={form.decisionRule}
                        onChange={(e) => handleChange('decisionRule', e.target.value)}
                        className="input text-sm w-full h-16 resize-none"
                        placeholder="Enter decision rule (acceptance criteria, guard band, confidence level, etc.)"
                      />
                    </div>
                    {currentJob ? (
                      <StatementOfConformityPdfUpload
                        jobId={currentJob.id}
                        attachment={currentJob.serviceInformation?.statementOfConformityReferencePdf}
                        disabled={formDisabled}
                        onUpdated={() => void refreshJobData(currentJob.id)}
                      />
                    ) : (
                      <p className="text-xs text-gray-500">
                        Save the job first to attach a Statement of conformity reference PDF.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {activeJobTab === 'items' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <div className="flex flex-row items-start justify-between gap-3 mb-4 w-full min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center min-w-0 pr-2">
                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                  <span className="text-green-600 text-sm">🔧</span>
                </span>
                <span className="min-w-0 break-words">Item Details <span className="text-red-500">*</span></span>
              </h3>
              <IconButton variant="primary" title="Add Item Row" onClick={addEquipment}><PlusIcon /></IconButton>
            </div>

            <div className="space-y-3">
              {equipment.map((eq, index) => {
                const expanded = itemExpanded[index] ?? true;
                const summary =
                  [eq.name, eq.model].filter(Boolean).join(' · ') ||
                  [eq.manufacturer, eq.serialNumber].filter(Boolean).join(' · ') ||
                  'No details yet';
                const mfgMatches = filterMasterListByQuery(masterManufacturerNames, eq.manufacturer);
                const modelMatches = filterMasterListByQuery(masterModelNames, eq.model);
                const calibrationMethodMatches = filterMasterListByQuery(
                  masterCalibrationMethodNames,
                  eq.calibrationMethods
                );
                return (
                <div
                  key={index}
                  className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-gray-100 bg-gray-50/80">
                    <button
                      type="button"
                      onClick={() => toggleItemPanel(index)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left hover:bg-gray-100/80 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 -m-1 p-1"
                      aria-expanded={expanded}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600"
                        aria-hidden
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-gray-900">
                          Item {index + 1}
                        </span>
                        {!expanded ? (
                          <span className="mt-0.5 block truncate text-xs text-gray-600">{summary}</span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyExcelForItem(index)}
                      className={`shrink-0 text-sm font-medium px-2 py-1.5 rounded border ${
                        excelCopiedRow === index
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      title="Copy Job + Equipment info to paste into Excel"
                    >
                      {excelCopiedRow === index ? 'Copied!' : 'Copy (Excel)'}
                    </button>
                    {equipment.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(`Remove Item ${index + 1}?`);
                          if (!ok) return;
                          removeEquipment(index);
                        }}
                        className="shrink-0 text-sm font-medium text-red-600 hover:text-red-800 px-2 py-1.5 rounded hover:bg-red-50"
                        title="Remove this item"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  {expanded ? (
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Equipment type (name)</label>
                        <p className="text-xs text-gray-500">
                          {certificateEquipmentTypeNames.length > 0
                            ? 'Same labels as Certificate Number Manager. Certificate numbers advance the sequence for this type.'
                            : 'No types in Certificate Number Manager yet—use free text, or add types under Settings → Certificate Number Manager.'}
                        </p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        {certificateEquipmentTypeNames.length > 0 ? (
                          <select
                            value={eq.name}
                            onChange={(e) => handleEquipmentChange(index, 'name', e.target.value)}
                            className="input text-sm w-full min-w-0"
                          >
                            <option value="">Select equipment type…</option>
                            {equipmentTypeSelectOptions(certificateEquipmentTypeNames, eq.name).map(
                              (opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                  {certificateEquipmentTypeNames.includes(opt)
                                    ? ''
                                    : ' (not in manager)'}
                                </option>
                              )
                            )}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={eq.name}
                            onChange={(e) => handleEquipmentChange(index, 'name', e.target.value)}
                            className="input text-sm w-full min-w-0"
                            placeholder="Item or equipment name"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Certificate number</label>
                        <p className="text-xs text-gray-500">
                          Official ID for the calibration certificate for this item. Leave blank until issued, or enter manually.
                        </p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={eq.certificateNumber ?? ''}
                            onChange={(e) => handleEquipmentChange(index, 'certificateNumber', e.target.value)}
                            autoComplete="off"
                            className="input text-sm w-full min-w-0 font-mono"
                            placeholder="Certificate number"
                          />
                          <button
                            type="button"
                            onClick={() => void handleGenerateCertificateNumberForItem(index)}
                            disabled={
                              formDisabled ||
                              !currentJob ||
                              generatingCertificateForRow === index ||
                              Boolean(String(eq.certificateNumber ?? '').trim())
                            }
                            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title={
                              !currentJob
                                ? 'Save the job first'
                                : String(eq.certificateNumber ?? '').trim()
                                  ? 'Certificate number already generated'
                                  : generatingCertificateForRow === index
                                    ? 'Generating…'
                                    : 'Generate certificate number'
                            }
                          >
                            {generatingCertificateForRow === index ? 'Generating…' : 'Generate'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Manufacturer</label>
                        <p className="text-xs text-gray-500">
                          Type to match the manufacturer list in Settings, or enter any text. Pick a row to fill from the list.
                        </p>
                      </div>
                      <div
                        className="relative w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0"
                        data-jobitem-mfg-combo={index}
                      >
                        <input
                          type="text"
                          value={eq.manufacturer}
                          onChange={(e) => handleManufacturerFieldChange(index, e.target.value)}
                          onFocus={() => {
                            if (eq.manufacturer.trim().length > 0) setManufacturerSuggestRow(index);
                          }}
                          autoComplete="off"
                          className="input text-sm w-full min-w-0"
                          placeholder="Manufacturer"
                        />
                        {manufacturerSuggestRow === index &&
                        mfgMatches.length > 0 &&
                        eq.manufacturer.trim().length > 0 ? (
                          <ul
                            className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                            role="listbox"
                          >
                            {mfgMatches.map((m) => (
                              <li key={`mfg-${index}-${m}`} role="option">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyManufacturerFromMaster(index, m);
                                  }}
                                >
                                  {m}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Model</label>
                        <p className="text-xs text-gray-500">
                          Type to match the model list in Settings, or enter any text. Pick a row to fill from the list.
                        </p>
                      </div>
                      <div
                        className="relative w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0"
                        data-jobitem-model-combo={index}
                      >
                        <input
                          type="text"
                          value={eq.model}
                          onChange={(e) => handleModelFieldChange(index, e.target.value)}
                          onFocus={() => {
                            if (eq.model.trim().length > 0) setModelSuggestRow(index);
                          }}
                          autoComplete="off"
                          className="input text-sm w-full min-w-0"
                          placeholder="Model"
                        />
                        {modelSuggestRow === index &&
                        modelMatches.length > 0 &&
                        eq.model.trim().length > 0 ? (
                          <ul
                            className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                            role="listbox"
                          >
                            {modelMatches.map((m) => (
                              <li key={`mdl-${index}-${m}`} role="option">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyModelFromMaster(index, m);
                                  }}
                                >
                                  {m}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Serial number</label>
                        <p className="text-xs text-gray-500">Serial or ID number</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="text"
                          value={eq.serialNumber}
                          onChange={(e) => handleEquipmentChange(index, 'serialNumber', e.target.value)}
                          className="input text-sm w-full min-w-0"
                          placeholder="Serial number"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Asset tag / ID tag</label>
                        <p className="text-xs text-gray-500">Customer asset tag (optional)</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="text"
                          value={(eq as any).assetTag ?? ''}
                          onChange={(e) => handleEquipmentChange(index, 'assetTag' as any, e.target.value)}
                          className="input text-sm w-full min-w-0"
                          placeholder="Asset tag"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Accessories</label>
                        <p className="text-xs text-gray-500">Included accessories or parts</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <textarea
                          value={eq.accessories}
                          onChange={(e) => handleEquipmentChange(index, 'accessories', e.target.value)}
                          rows={2}
                          className="input text-sm w-full min-w-0 resize-y"
                          placeholder="Accessories"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Calibration point</label>
                        <p className="text-xs text-gray-500">Point or range to calibrate</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="text"
                          value={eq.calibrationPoint}
                          onChange={(e) => handleEquipmentChange(index, 'calibrationPoint', e.target.value)}
                          className="input text-sm w-full min-w-0"
                          placeholder="Calibration point"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Unit</label>
                        <p className="text-xs text-gray-500">Measurement unit (e.g., V, °C, bar)</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="text"
                          value={eq.unit ?? ''}
                          onChange={(e) => handleEquipmentChange(index, 'unit', e.target.value)}
                          className="input text-sm w-full min-w-0"
                          placeholder="Unit"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Calibration methods</label>
                        <p className="text-xs text-gray-500">
                          Type to match the calibration method list in Settings, or enter any short text. Pick a row to fill from the list.
                        </p>
                      </div>
                      <div
                        className="relative w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0"
                        data-jobitem-calmethods-combo={index}
                      >
                        <input
                          type="text"
                          value={eq.calibrationMethods}
                          onChange={(e) => handleCalibrationMethodsFieldChange(index, e.target.value)}
                          onFocus={() => {
                            if (eq.calibrationMethods.trim().length > 0) setCalibrationMethodSuggestRow(index);
                          }}
                          autoComplete="off"
                          className="input text-sm w-full min-w-0"
                          placeholder="Calibration methods"
                        />
                        {calibrationMethodSuggestRow === index &&
                        calibrationMethodMatches.length > 0 &&
                        eq.calibrationMethods.trim().length > 0 ? (
                          <ul
                            className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                            role="listbox"
                          >
                            {calibrationMethodMatches.map((m) => (
                              <li key={`calm-${index}-${m}`} role="option">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    applyCalibrationMethodsFromMaster(index, m);
                                  }}
                                >
                                  {m}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Location</label>
                        <p className="text-xs text-gray-500">Machine or site location</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="text"
                          value={eq.machineLocation}
                          onChange={(e) => handleEquipmentChange(index, 'machineLocation', e.target.value)}
                          className="input text-sm w-full min-w-0"
                          placeholder="Location"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Calibration date</label>
                        <p className="text-xs text-gray-500">Date the calibration was performed</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <input
                          type="date"
                          value={eq.calibrationDate ?? ''}
                          onChange={(e) => handleEquipmentChange(index, 'calibrationDate', e.target.value)}
                          className="input text-sm w-full min-w-0"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <label className="text-sm font-medium text-gray-700">Remark</label>
                        <p className="text-xs text-gray-500">Additional notes for this item</p>
                      </div>
                      <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                        <textarea
                          value={eq.remark}
                          onChange={(e) => handleEquipmentChange(index, 'remark', e.target.value)}
                          rows={2}
                          className="input text-sm w-full min-w-0 resize-y"
                          placeholder="Remark"
                        />
                      </div>
                    </div>

                    {(eq.name || eq.model) && (
                      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 border-t border-gray-100 pt-4 mt-1">
                        <div className="w-full min-w-0 sm:flex-1">
                          <label className="text-sm font-medium text-gray-700">Certificates & photos</label>
                          <p className="text-xs text-gray-500">
                            Attach files for this item. Uploads save to the job immediately.
                          </p>
                        </div>
                        <div className="w-full min-w-0 sm:w-96 sm:max-w-md sm:flex-shrink-0">
                          {currentJob ? (
                            <EquipmentFileUpload
                              jobId={currentJob.id}
                              equipmentIndex={index}
                              equipment={eq}
                              isReadOnly={formDisabled}
                              onFileUploaded={() => refreshJobData(currentJob.id)}
                              onFileDeleted={() => refreshJobData(currentJob.id)}
                            />
                          ) : (
                            <p className="text-xs text-gray-500">
                              Save the job first to attach certificates and photos for this item.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  ) : null}
                </div>
              );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Add another item with the + button above. Equipment type (name) comes from Certificate Number Manager so each certificate number uses the correct running sequence. Collapse rows to scan the list quickly.
            </p>
          </div>
          )}

          {activeJobTab === 'workAuth' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                <span className="text-orange-600 text-sm">📋</span>
              </span>
              Work Authorization
              <span className="text-red-500 ml-1">*</span>
            </h3>
            <p className="text-sm text-gray-600 mb-6">Customer authorization and laboratory review</p>

            <div className="space-y-8">
              {/* Customer Authorization Sub-section */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-2">
                    <span className="text-blue-600 text-xs">👤</span>
                  </span>
                  Customer Authorization
                </h4>
                
                <div className="space-y-4">
                  {/* Work Authorization Statement */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Work Authorization Statement
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
                        {WORK_AUTH_TERMS_AND_CONDITIONS.split('\n\n').map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      By signing below, you acknowledge and agree to the above terms and conditions.
                    </p>
                  </div>

                  {/* Customer Signature */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Customer Signature
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCustomerSignatureModal(true)}
                        disabled={formDisabled}
                        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {customerSignature?.signatureData ? 'Edit signature' : 'Sign'}
                      </button>
                      {customerSignature?.signatureData ? (
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                          Signed
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Opens a popup for easier signing</span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accepted and Agreed by</label>
                        <input
                          type="text"
                          value={customerSignature?.signerName || form.customerContact || ''}
                          onChange={(e) => {
                            const name = e.target.value;
                            setCustomerSignature((prev) => ({
                              signatureData: prev?.signatureData || '',
                              signerName: name,
                              signedDate: prev?.signedDate || new Date(),
                            }));
                          }}
                          disabled={formDisabled}
                          className="input w-full text-sm"
                          placeholder="Customer name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                          type="date"
                          value={signatureDateToInputValue(customerSignature?.signedDate)}
                          onChange={(e) => {
                            const d = dateInputValueToDate(e.target.value);
                            if (!d) return;
                            setCustomerSignature((prev) => ({
                              signatureData: prev?.signatureData || '',
                              signerName: prev?.signerName || form.customerContact || '',
                              signedDate: d,
                            }));
                          }}
                          disabled={formDisabled}
                          className="input w-full text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Request Review (Laboratory Use Only) Sub-section */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center">
                  <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center mr-2">
                    <span className="text-green-600 text-xs">🔬</span>
                  </span>
                  Request Review (Laboratory Use Only)
                </h4>
                
                <div className="space-y-6">
                  {/* Items Condition on Receipt */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-800">FOR LABORATORY USE ONLY</div>
                    </div>
                    <div className="px-3 py-3 space-y-3">
                      <div className="text-sm font-medium text-gray-800">
                        Item/Machine Condition upon Received:
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        {[
                          { value: 'Acceptable', label: 'Good' },
                          { value: 'Damaged or altered', label: 'Damaged' },
                          { value: 'Improper storage/transportation conditions', label: 'Dirty' },
                          { value: 'Other issues', label: 'Other' },
                          { value: 'Insufficient quantity', label: 'Insufficient qty' },
                        ].map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-800">
                            <input
                              type="radio"
                              name="itemsConditionOnReceipt"
                              value={opt.value}
                              checked={form.itemsConditionOnReceipt === opt.value}
                              onChange={(e) => handleChange('itemsConditionOnReceipt', e.target.value)}
                              className="h-4 w-4 text-primary-600 border-gray-400 focus:ring-primary-500"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        <div className="flex items-center gap-2 min-w-[14rem] flex-1">
                          <span className="text-sm text-gray-800">Details:</span>
                          <input
                            type="text"
                            value={form.itemsConditionSpecification}
                            onChange={(e) => handleChange('itemsConditionSpecification', e.target.value)}
                            disabled={formDisabled || form.itemsConditionOnReceipt === 'Acceptable'}
                            className="input text-sm w-full min-w-0"
                            placeholder="(if Other / Damaged / Dirty)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pre-Work Capability Checklist */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-800">
                        Pre-Work Capability Checklist <span className="font-normal text-gray-600">(Reviewer to tick all items before issuing confirmation)</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {[
                        {
                          key: 'capabilityResourcesAvailable',
                          label: 'Capability & technical resources are available to perform the requested calibration',
                        },
                        {
                          key: 'methodAppropriateValidatedUpToDate',
                          label: 'Calibration method is appropriate, validated, and up-to-date per current scope of accreditation',
                        },
                        {
                          key: 'equipmentConditionChecked',
                          label: 'Equipment condition has been checked; equipment is suitable for calibration without remedial action',
                        },
                        {
                          key: 'customerRequirementsUnderstood',
                          label: 'Customer requirements (including Decision Rule, if applicable) are understood and documented',
                        },
                      ].map((item) => (
                        <label key={item.key} className="flex items-start gap-3 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={Boolean((preWorkChecklist as any)[item.key])}
                            onChange={(e) =>
                              setPreWorkChecklist((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            disabled={formDisabled}
                            className="mt-0.5 h-4 w-4 text-primary-600 border-gray-400 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-800 leading-relaxed">{item.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="px-3 py-3 border-t border-gray-200 bg-white">
                      <div className="text-sm font-medium text-gray-800 mb-2">Laboratory Capability Assessment</div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        {['Full capability', 'Partial capability', 'Lacks capability'].map((capability) => (
                          <label key={capability} className="flex items-center gap-2 text-sm text-gray-800">
                            <input
                              type="radio"
                              name="laboratoryCapabilityAssessment"
                              value={capability}
                              checked={form.laboratoryCapabilityAssessment === capability}
                              onChange={(e) => handleChange('laboratoryCapabilityAssessment', e.target.value)}
                              disabled={formDisabled}
                              className="h-4 w-4 text-primary-600 border-gray-400 focus:ring-primary-500"
                            />
                            <span>{capability}</span>
                          </label>
                        ))}
                      </div>
                      {form.laboratoryCapabilityAssessment !== 'Full capability' ? (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {form.laboratoryCapabilityAssessment === 'Partial capability' ? 'Specify limitations' : 'Specify lacking capabilities'}
                          </label>
                          <textarea
                            value={form.capabilitySpecification}
                            onChange={(e) => handleChange('capabilitySpecification', e.target.value)}
                            disabled={formDisabled}
                            className="input text-sm w-full h-20 resize-none"
                            placeholder="Add details"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Received by + Technical reviewer (laboratory) */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-800">Laboratory signatures</div>
                      <p className="text-xs text-gray-600 mt-0.5">Received by and technical reviewer (as on the paper form).</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                      <div className="p-3 space-y-3">
                        <div className="text-sm font-medium text-gray-800">Received by</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowStaffSignatureModal(true)}
                            disabled={formDisabled}
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {staffSignature?.signatureData ? 'Edit signature' : 'Sign'}
                          </button>
                          {staffSignature?.signatureData ? (
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                              Signed
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Popup signing</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <div className="relative w-full min-w-0" data-workauth-receivedby-combo>
                              <input
                                type="text"
                                value={staffSignature?.signerName || assignedStaffDisplayName || ''}
                                onChange={(e) => {
                                  receivedByComboAnchorRef.current =
                                    e.currentTarget.closest('[data-workauth-receivedby-combo]');
                                  handleReceivedByNameChange(e.target.value);
                                }}
                                onFocus={(e) => {
                                  receivedByComboAnchorRef.current =
                                    e.currentTarget.closest('[data-workauth-receivedby-combo]');
                                  if (receivedByDisplayValue.trim().length > 0) setReceivedByUserSuggestOpen(true);
                                }}
                                autoComplete="off"
                                disabled={formDisabled}
                                className="input w-full text-sm"
                                placeholder="Type to search users or enter a name"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                              type="date"
                              value={signatureDateToInputValue(staffSignature?.signedDate)}
                              onChange={(e) => {
                                const d = dateInputValueToDate(e.target.value);
                                if (!d) return;
                                setStaffSignature((prev) => ({
                                  signatureData: prev?.signatureData || '',
                                  signerName: prev?.signerName || assignedStaffDisplayName || '',
                                  signedDate: d,
                                }));
                              }}
                              disabled={formDisabled}
                              className="input w-full text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="p-3 space-y-3">
                        <div className="text-sm font-medium text-gray-800">Technical reviewer</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowTechnicalReviewerSignatureModal(true)}
                            disabled={formDisabled}
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {technicalReviewerSignature?.signatureData ? 'Edit signature' : 'Sign'}
                          </button>
                          {technicalReviewerSignature?.signatureData ? (
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                              Signed
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Popup signing</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <div className="relative w-full min-w-0" data-workauth-reviewer-combo>
                              <input
                                type="text"
                                value={technicalReviewerSignature?.signerName || ''}
                                onChange={(e) => {
                                  technicalReviewerComboAnchorRef.current =
                                    e.currentTarget.closest('[data-workauth-reviewer-combo]');
                                  handleTechnicalReviewerNameChange(e.target.value);
                                }}
                                onFocus={(e) => {
                                  technicalReviewerComboAnchorRef.current =
                                    e.currentTarget.closest('[data-workauth-reviewer-combo]');
                                  if ((technicalReviewerSignature?.signerName || '').trim().length > 0) {
                                    setTechnicalReviewerUserSuggestOpen(true);
                                  }
                                }}
                                autoComplete="off"
                                disabled={formDisabled}
                                className="input w-full text-sm"
                                placeholder="Type to search users or enter a name"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                              type="date"
                              value={signatureDateToInputValue(technicalReviewerSignature?.signedDate)}
                              onChange={(e) => {
                                const d = dateInputValueToDate(e.target.value);
                                if (!d) return;
                                setTechnicalReviewerSignature((prev) => ({
                                  signatureData: prev?.signatureData || '',
                                  signerName: prev?.signerName || '',
                                  signedDate: d,
                                }));
                              }}
                              disabled={formDisabled}
                              className="input w-full text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {activeJobTab === 'notes' && (
          <div className="bg-gray-50 rounded-lg p-4 sm:p-6 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                <span className="text-yellow-600 text-sm">📝</span>
              </span>
              Notes
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments
              </label>
              <textarea
                value={form.comments}
                onChange={(e) => setForm({ ...form, comments: e.target.value })}
                className="input w-full h-32 resize-none"
                placeholder="Enter any additional comments or notes..."
              />
            </div>
          </div>
          )}
          </fieldset>
        </form>
      </div>

      {receivedByUserSuggestOpen &&
        receivedByDirectoryMatches.length > 0 &&
        receivedByNameQuery.length > 0 &&
        receivedBySuggestRect &&
        createPortal(
          <div
            data-workauth-receivedby-combo="true"
            className="fixed z-[10000] max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{
              top: receivedBySuggestRect.top,
              left: receivedBySuggestRect.left,
              width: receivedBySuggestRect.width,
            }}
            role="listbox"
          >
            <ul className="m-0 list-none p-0">
              {receivedByDirectoryMatches.map((u) => (
                <li key={u.uid} role="option">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyReceivedByFromUser(u);
                    }}
                  >
                    <span className="font-medium text-gray-900">{formatUserDirectoryName(u)}</span>
                    {u.position ? (
                      <span className="ml-2 text-xs text-gray-500">{u.position}</span>
                    ) : null}
                    {u.email ? (
                      <span className="ml-2 text-xs text-gray-500">{u.email}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}

      {technicalReviewerUserSuggestOpen &&
        technicalReviewerDirectoryMatches.length > 0 &&
        technicalReviewerNameQuery.length > 0 &&
        technicalReviewerSuggestRect &&
        createPortal(
          <div
            data-workauth-reviewer-combo="true"
            className="fixed z-[10000] max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{
              top: technicalReviewerSuggestRect.top,
              left: technicalReviewerSuggestRect.left,
              width: technicalReviewerSuggestRect.width,
            }}
            role="listbox"
          >
            <ul className="m-0 list-none p-0">
              {technicalReviewerDirectoryMatches.map((u) => (
                <li key={u.uid} role="option">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyTechnicalReviewerFromUser(u);
                    }}
                  >
                    <span className="font-medium text-gray-900">{formatUserDirectoryName(u)}</span>
                    {u.position ? (
                      <span className="ml-2 text-xs text-gray-500">{u.position}</span>
                    ) : null}
                    {u.email ? (
                      <span className="ml-2 text-xs text-gray-500">{u.email}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};
