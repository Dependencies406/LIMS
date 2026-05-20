import React, { useState, useEffect } from 'react';
import type { Job, Customer, Equipment, WorkAuthorization } from '../types';
import { db, doc, setDoc, updateDoc, getDoc, serverTimestamp } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { usePdfSettings } from '../contexts/PdfSettingsContext';
import { useUsers } from '../hooks/useUsers';
import { generateAndDownloadJobPDF } from '../services/pdfService';
import { PdfPreviewModal } from './PdfPreviewModal';
import { getNextJobId, incrementJobIdSequence } from '../services/jobIdService';
import { SignatureCanvas } from './SignatureCanvas';
import { createShareToken, buildSigningUrl, TOKEN_TTL_MS } from '../services/jobShareTokenService';

interface JobModalProps {
  job: Job | null;
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
}

export const JobModal: React.FC<JobModalProps> = ({ job, customers, onClose, onSuccess }) => {
  const { currentUser, isAdmin } = useAuth();
  const { pdfSettings } = usePdfSettings();
  const { users } = useUsers();
  const [loading, setLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(job);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [signingLinkUrl, setSigningLinkUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

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
    scheduleDate: '', // Renamed from dueDate
    comments: '',
    // Service Information
    serviceRequested: 'Calibration',
    reportingFormat: 'Standard' as 'Standard' | 'Simplified Report' | 'Electronic File' | 'Other',
    reportingFormatOther: '',
    statementOfConformity: 'Not required' as 'Required' | 'Not required',
    statementOfConformityRequirements: '',
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
    calibrationPoint: '',
    calibrationMethods: '',
    accessories: '',
    machineLocation: '',
    remark: ''
  }]);

  // Work Authorization signatures
  const [customerSignature, setCustomerSignature] = useState<WorkAuthorization['customerSignature']>();
  const [staffSignature, setStaffSignature] = useState<WorkAuthorization['staffSignature']>();

  // Update currentJob when job prop changes
  useEffect(() => {
    setCurrentJob(job);
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
        assignedStaff: currentJob.assignedStaff || '',
        startDate: currentJob.startDate || '',
        scheduleDate: currentJob.scheduleDate || '', // Renamed from dueDate
        comments: currentJob.comments || '',
        // Service Information
        serviceRequested: currentJob.serviceInformation?.serviceRequested || 'Calibration',
        reportingFormat: currentJob.serviceInformation?.reportingFormat || 'Standard',
        reportingFormatOther: currentJob.serviceInformation?.reportingFormatOther || '',
        statementOfConformity: currentJob.serviceInformation?.statementOfConformity || 'Not required',
        statementOfConformityRequirements: currentJob.serviceInformation?.statementOfConformityRequirements || '',
        // Work Authorization
        itemsConditionOnReceipt: currentJob.workAuthorization?.itemsConditionOnReceipt || 'Acceptable',
        itemsConditionSpecification: currentJob.workAuthorization?.itemsConditionSpecification || '',
        laboratoryCapabilityAssessment: currentJob.workAuthorization?.laboratoryCapabilityAssessment || 'Full capability',
        capabilitySpecification: currentJob.workAuthorization?.capabilitySpecification || ''
      });
      setEquipment(currentJob.equipment.length > 0 ? currentJob.equipment : [{
        name: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        calibrationPoint: '',
        calibrationMethods: '',
        accessories: '',
        machineLocation: '',
        remark: ''
      }]);
      
      // Load work authorization signatures
      setCustomerSignature(currentJob.workAuthorization?.customerSignature);
      setStaffSignature(currentJob.workAuthorization?.staffSignature);
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
        scheduleDate: '',
        comments: '',
        // Service Information - reset to defaults
        serviceRequested: 'Calibration',
        reportingFormat: 'Standard',
        reportingFormatOther: '',
        statementOfConformity: 'Not required',
        statementOfConformityRequirements: '',
        // Work Authorization - reset to defaults
        itemsConditionOnReceipt: 'Acceptable',
        itemsConditionSpecification: '',
        laboratoryCapabilityAssessment: 'Full capability',
        capabilitySpecification: ''
      });
      
      // Reset equipment to single empty row
      setEquipment([{
        name: '',
        manufacturer: '',
        model: '',
        serialNumber: '',
        calibrationPoint: '',
        calibrationMethods: '',
        accessories: '',
        machineLocation: '',
        remark: ''
      }]);
      
      // Reset signatures
      setCustomerSignature(undefined);
      setStaffSignature(undefined);
      
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
  }, [currentJob]);

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
    if (form.assignedStaff && staffSignature) {
      setStaffSignature({
        ...staffSignature,
        signerName: form.assignedStaff
      });
    }
  }, [form.assignedStaff]);

  // Create job object for PDF preview
  const getJobForPreview = (): Job => {
    const serviceInformation = {
      serviceRequested: form.serviceRequested,
      reportingFormat: form.reportingFormat,
      ...(form.reportingFormat === 'Other' && form.reportingFormatOther ? { reportingFormatOther: form.reportingFormatOther } : {}),
      statementOfConformity: form.statementOfConformity,
      ...(form.statementOfConformity === 'Required' && form.statementOfConformityRequirements ? { statementOfConformityRequirements: form.statementOfConformityRequirements } : {})
    };

    const workAuthorization = {
      workAuthorizationStatement: 'I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory\'s terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding.',
      itemsConditionOnReceipt: form.itemsConditionOnReceipt,
      ...(form.itemsConditionOnReceipt !== 'Acceptable' && form.itemsConditionOnReceipt !== 'Insufficient quantity' && form.itemsConditionSpecification ? { itemsConditionSpecification: form.itemsConditionSpecification } : {}),
      laboratoryCapabilityAssessment: form.laboratoryCapabilityAssessment,
      ...(form.laboratoryCapabilityAssessment !== 'Full capability' && form.capabilitySpecification ? { capabilitySpecification: form.capabilitySpecification } : {}),
      ...(customerSignature ? { customerSignature } : {}),
      ...(staffSignature ? { staffSignature } : {})
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
      scheduleDate: form.scheduleDate,
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
          createdAt: jobDoc.data().createdAt?.toDate() || new Date(),
          updatedAt: jobDoc.data().updatedAt?.toDate() || new Date(),
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

  // Auto-fill customer information when customer is selected
  const handleCustomerChange = (customerCode: string) => {
    setForm(prev => ({ ...prev, customerCode }));
    
    if (customerCode) {
      const selectedCustomer = customers.find(c => c.customerCode === customerCode);
      if (selectedCustomer) {
        setForm(prev => ({
          ...prev,
          customerCode,
          customerName: selectedCustomer.name,
          customerAddress: selectedCustomer.address,
          customerPhone: selectedCustomer.phone || '',
          customerEmail: selectedCustomer.email || ''
        }));
      }
    } else {
      // Clear customer fields if no customer selected
      setForm(prev => ({
        ...prev,
        customerCode: '',
        customerName: '',
        customerAddress: '',
        customerPhone: '',
        customerEmail: ''
      }));
    }
  };

  const handleEquipmentChange = (index: number, field: keyof Equipment, value: string) => {
    const newEquipment = [...equipment];
    newEquipment[index] = { ...newEquipment[index], [field]: value };
    setEquipment(newEquipment);
  };

  const addEquipment = () => {
    setEquipment([...equipment, {
      name: '',
      manufacturer: '',
      model: '',
      serialNumber: '',
      calibrationPoint: '',
      calibrationMethods: '',
      accessories: '',
      machineLocation: '',
      remark: ''
    }]);
  };

  const removeEquipment = (index: number) => {
    if (equipment.length > 1) {
      setEquipment(equipment.filter((_, i) => i !== index));
    }
  };

  const handleGeneratePDF = async () => {
    if (!job) return;

    try {
      await generateAndDownloadJobPDF(job, pdfSettings);
    } catch (err) {
      setError('Failed to generate PDF');
    }
  };

  const handleGenerateSigningLink = async () => {
    if (!currentJob || !currentUser) return;
    setGeneratingLink(true);
    try {
      const token = await createShareToken(currentJob, currentUser.uid);
      const url = buildSigningUrl(token);
      setSigningLinkUrl(url);
    } catch (err) {
      setError('Failed to generate signing link. Please try again.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopySigningLink = () => {
    if (signingLinkUrl) {
      navigator.clipboard.writeText(signingLinkUrl).catch(() => {});
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!form.jobId || !form.title || !form.customerCode || !form.customerContact) {
      setError('Please fill in all required fields (Job ID, Title, Customer, Contact Person)');
      return;
    }

    // Validate at least one equipment has data
    const hasEquipment = equipment.some(eq => eq.name || eq.model);
    if (!hasEquipment) {
      setError('Please add at least one equipment');
      return;
    }

    setLoading(true);

    try {
      // Separate service information and work authorization from form data
      const { 
        serviceRequested, reportingFormat, reportingFormatOther, statementOfConformity, statementOfConformityRequirements,
        itemsConditionOnReceipt, itemsConditionSpecification, laboratoryCapabilityAssessment, capabilitySpecification,
        ...restForm 
      } = form;
      
      const serviceInformation = {
        serviceRequested,
        reportingFormat,
        ...(reportingFormat === 'Other' && reportingFormatOther ? { reportingFormatOther } : {}),
        statementOfConformity,
        ...(statementOfConformity === 'Required' && statementOfConformityRequirements ? { statementOfConformityRequirements } : {})
      };

      const workAuthorization = {
        itemsConditionOnReceipt,
        ...(itemsConditionOnReceipt !== 'Acceptable' && itemsConditionSpecification ? { itemsConditionSpecification } : {}),
        laboratoryCapabilityAssessment,
        ...(laboratoryCapabilityAssessment !== 'Full capability' && capabilitySpecification ? { capabilitySpecification } : {}),
        ...(customerSignature ? { customerSignature } : {}),
        ...(staffSignature ? { staffSignature } : {})
      };

      const jobData = {
        ...restForm,
        equipment: equipment.filter(eq => eq.name || eq.model), // Filter empty equipment
        serviceInformation,
        workAuthorization,
        updatedAt: serverTimestamp(),
        ...(job ? {} : { 
          createdAt: serverTimestamp(), 
          createdBy: currentUser?.uid || '' 
        })
      };

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


  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Loading/Success Overlay */}
        {(loading || showSuccess) && (
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
                    <p className="text-gray-600 text-sm">You can continue editing or close the modal</p>
                  </>
                ) : (
                  <>
                    {/* Loading Spinner */}
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary-600 mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {showDeleteConfirm ? 'Deleting job...' : job ? 'Saving changes...' : 'Creating job...'}
                    </h3>
                    <p className="text-gray-600 text-sm">Please wait</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
           <h2 className="text-2xl font-bold text-gray-900">
             {currentJob ? 'Edit Job' : 'Create New Job'}
           </h2>
            
            {/* Status Dropdown (Admin only) */}
            <div className="relative status-dropdown-container">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-all ${
                    form.status === 'Pending' ? 'bg-yellow-100 border-yellow-400' :
                    form.status === 'In Progress' ? 'bg-blue-100 border-blue-400' :
                    form.status === 'Completed' ? 'bg-green-100 border-green-400' :
                    form.status === 'Halt' ? 'bg-red-100 border-red-400' :
                    'bg-white border-gray-300'
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
                    <span className="text-sm font-medium text-gray-700">{form.status}</span>
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border ${
                  form.status === 'Pending' ? 'bg-yellow-100 border-yellow-400' :
                  form.status === 'In Progress' ? 'bg-blue-100 border-blue-400' :
                  form.status === 'Completed' ? 'bg-green-100 border-green-400' :
                  form.status === 'Halt' ? 'bg-red-100 border-red-400' :
                  'bg-white border-gray-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    form.status === 'Pending' ? 'bg-yellow-600' :
                    form.status === 'In Progress' ? 'bg-blue-600' :
                    form.status === 'Completed' ? 'bg-green-600' :
                    form.status === 'Halt' ? 'bg-red-600' :
                    'bg-gray-400'
                  }`}></span>
                  <span className="text-sm font-medium text-gray-700">{form.status}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
           {/* Export/PDF Buttons (only for existing jobs) */}
           {currentJob && (
              <>
                <button
                  type="button"
                  onClick={handleGeneratePDF}
                  className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                  title="Download PDF"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                  title="Preview PDF"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
              </>
            )}

           {/* Delete Button (only show when editing) */}
           {currentJob && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center w-10 h-10 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 transition-all duration-200 hover:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
                title="Delete Job"
              >
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            
            {/* Cancel Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              title="Cancel"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Save Button */}
            <button
              type="submit"
              form="job-form"
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
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

        <form id="job-form" onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Job Information Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-primary-600 text-sm">📋</span>
              </span>
              Job Information
            </h3>
            
            <div className="space-y-3">
              {/* Job ID */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Job ID <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Unique identifier for this job</p>
                </div>
                <div className="w-96">
                  <input
                    type="text"
                    value={form.jobId}
                    onChange={(e) => handleChange('jobId', e.target.value)}
                    className="input text-sm"
                    required
                    disabled={!!currentJob}
                  />
                </div>
              </div>

              {/* Title */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Brief description of the job</p>
                </div>
                <div className="w-96">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    className="input text-sm"
                    required
                  />
                </div>
              </div>

              {/* Start Date */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Start Date</label>
                  <p className="text-xs text-gray-500">When the job begins</p>
                </div>
                <div className="w-96">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    className="input text-sm"
                  />
                </div>
              </div>

              {/* Schedule Date */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Schedule Date</label>
                  <p className="text-xs text-gray-500">Target completion date</p>
                </div>
                <div className="w-96">
                  <input
                    type="date"
                    value={form.scheduleDate}
                    onChange={(e) => handleChange('scheduleDate', e.target.value)}
                    className="input text-sm"
                  />
                </div>
              </div>

              {/* Assigned Staff */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Assigned Staff</label>
                  <p className="text-xs text-gray-500">Staff member responsible for this job</p>
                </div>
                <div className="w-96">
                  <select
                    value={form.assignedStaff}
                    onChange={(e) => handleChange('assignedStaff', e.target.value)}
                    className="input text-sm"
                  >
                    <option value="">Select a staff member</option>
                    {users
                      .filter(user => user.isActive !== false)
                      .map(user => (
                        <option key={user.uid} value={`${user.firstName} ${user.lastName}`}>
                          {user.firstName} {user.lastName} {user.position ? `(${user.position})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Information Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-blue-600 text-sm">🏢</span>
              </span>
              Customer Information
            </h3>
            
            <div className="space-y-3">
              {/* Customer */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Select customer from database</p>
                </div>
                <div className="w-96">
                  <select
                    value={form.customerCode}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="input text-sm"
                    required
                  >
                    <option value="">Select a customer</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.customerCode}>
                        {customer.customerCode} - {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Company/Organization Name - Auto-filled */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Company/Organization Name</label>
                  <p className="text-xs text-gray-500">Auto-filled from customer database</p>
                </div>
                <div className="w-96">
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => handleChange('customerName', e.target.value)}
                    className="input text-sm bg-gray-100"
                    placeholder="Auto-filled from customer"
                    readOnly
                  />
                </div>
              </div>

              {/* Address - Auto-filled */}
              <div className="flex items-start justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Address</label>
                  <p className="text-xs text-gray-500">Auto-filled from customer database</p>
                </div>
                <div className="w-96">
                  <textarea
                    value={form.customerAddress}
                    onChange={(e) => handleChange('customerAddress', e.target.value)}
                    className="input text-sm bg-gray-100"
                    rows={2}
                    placeholder="Auto-filled from customer"
                    readOnly
                  />
                </div>
              </div>

              {/* Contact Person - Required */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500">Name of contact person for this job</p>
                </div>
                <div className="w-96">
                  <input
                    type="text"
                    value={form.customerContact}
                    onChange={(e) => handleChange('customerContact', e.target.value)}
                    className="input text-sm"
                    placeholder="Enter contact person name"
                    required
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Phone Number</label>
                  <p className="text-xs text-gray-500">Auto-filled, can be edited</p>
                </div>
                <div className="w-96">
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={(e) => handleChange('customerPhone', e.target.value)}
                    className="input text-sm"
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <p className="text-xs text-gray-500">Auto-filled, can be edited</p>
                </div>
                <div className="w-96">
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => handleChange('customerEmail', e.target.value)}
                    className="input text-sm"
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Service Information Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
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

              {/* Reporting Formats */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-3 block">Reporting Format</label>
                <div className="space-y-2">
                  {['Standard', 'Simplified Report', 'Electronic File', 'Other'].map((format) => (
                    <label key={format} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reportingFormat"
                        value={format}
                        checked={form.reportingFormat === format}
                        onChange={(e) => handleChange('reportingFormat', e.target.value)}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{format}</span>
                    </label>
                  ))}
                </div>
                
                {/* Other format text input */}
                {form.reportingFormat === 'Other' && (
                  <div className="mt-3 ml-6">
                    <input
                      type="text"
                      value={form.reportingFormatOther}
                      onChange={(e) => handleChange('reportingFormatOther', e.target.value)}
                      className="input text-sm w-full"
                      placeholder="Please specify the reporting format"
                    />
                  </div>
                )}
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
                
                {/* Requirements text input */}
                {form.statementOfConformity === 'Required' && (
                  <div className="mt-3 ml-6">
                    <label className="text-xs text-gray-600 mb-1 block">Please specify requirements/specifications:</label>
                    <textarea
                      value={form.statementOfConformityRequirements}
                      onChange={(e) => handleChange('statementOfConformityRequirements', e.target.value)}
                      className="input text-sm w-full h-20 resize-none"
                      placeholder="Enter specific requirements or specifications for the statement of conformity"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Item Details Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-green-600 text-sm">🔧</span>
                </span>
                Item Details <span className="text-red-500">*</span>
              </h3>
              <button
                type="button"
                onClick={addEquipment}
                className="flex items-center justify-center w-10 h-10 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                title="Add Item Row"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>

            {/* Spreadsheet-style Item Details Table */}
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase w-12 bg-gray-100">
                        No.
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Name
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Manufacturer
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[120px] bg-gray-100">
                        Model
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[120px] bg-gray-100">
                        Serial Number
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Calibration Point
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Calibration Methods
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Accessories
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[120px] bg-gray-100">
                        Location
                      </th>
                      <th className="border-r-2 border-b-2 border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase min-w-[150px] bg-gray-100">
                        Remark
                      </th>
                      <th className="border-b-2 border-gray-300 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase w-16 bg-gray-100">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {equipment.map((eq, index) => (
                      <tr key={index} className="hover:bg-blue-50 transition-colors">
                        <td className="border-r-2 border-b border-gray-300 px-2 py-1 text-sm text-gray-900 text-center font-medium bg-gray-50">
                          {index + 1}
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Item name"
                            value={eq.name}
                            onChange={(e) => handleEquipmentChange(index, 'name', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Manufacturer"
                            value={eq.manufacturer}
                            onChange={(e) => handleEquipmentChange(index, 'manufacturer', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Model"
                            value={eq.model}
                            onChange={(e) => handleEquipmentChange(index, 'model', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Serial number"
                            value={eq.serialNumber}
                            onChange={(e) => handleEquipmentChange(index, 'serialNumber', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Calibration point"
                            value={eq.calibrationPoint}
                            onChange={(e) => handleEquipmentChange(index, 'calibrationPoint', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Calibration methods"
                            value={eq.calibrationMethods}
                            onChange={(e) => handleEquipmentChange(index, 'calibrationMethods', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Accessories"
                            value={eq.accessories}
                            onChange={(e) => handleEquipmentChange(index, 'accessories', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Location"
                            value={eq.machineLocation}
                            onChange={(e) => handleEquipmentChange(index, 'machineLocation', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-r-2 border-b border-gray-300 p-0">
                          <textarea
                            placeholder="Remark"
                            value={eq.remark}
                            onChange={(e) => handleEquipmentChange(index, 'remark', e.target.value)}
                            rows={1}
                            className="w-full px-2 py-1.5 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none overflow-hidden"
                            style={{ minHeight: '32px', lineHeight: '1.5' }}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                        </td>
                        <td className="border-b border-gray-300 px-2 py-1 text-center align-middle">
                          {equipment.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEquipment(index)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-100 rounded px-2 py-1 font-bold text-lg transition-colors"
                              title="Delete row"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 Tip: Text will automatically wrap in cells. Scroll horizontally/vertically to see all data. Click the + button to add more equipment.
            </p>
          </div>

          {/* Work Authorization Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
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
                      <p className="text-sm text-gray-700 leading-relaxed">
                        "I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory's terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding."
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      By signing below, you acknowledge and agree to the above authorization statement.
                    </p>
                  </div>

                  {/* Remote Signing Link */}
                  {currentJob && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Remote Signing Link
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={handleGenerateSigningLink}
                          disabled={generatingLink}
                          title={`Send a temporary signing link to the customer (valid ${TOKEN_TTL_MS / 3600000} hours)`}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg border border-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingLink ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Generating…
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              Generate Signing Link
                            </>
                          )}
                        </button>
                        <span className="text-xs text-gray-400">valid {TOKEN_TTL_MS / 3600000} hours</span>
                      </div>

                      {signingLinkUrl && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs font-medium text-green-700 mb-1">Signing link ready — share with customer:</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={signingLinkUrl}
                              className="flex-1 text-xs bg-white border border-green-300 rounded px-2 py-1 text-gray-700 truncate focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCopySigningLink}
                              className="flex-shrink-0 px-2 py-1 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50 transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-xs text-green-600 mt-1">⏱ Link expires in {TOKEN_TTL_MS / 3600000} hours</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Customer Signature */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Customer Signature
                    </label>
                    <SignatureCanvas
                      value={customerSignature}
                      onChange={setCustomerSignature}
                      placeholder="Customer signature"
                      signerName={customerSignature?.signerName || form.customerContact}
                      onSignerNameChange={(name) => {
                        if (customerSignature) {
                          setCustomerSignature({
                            ...customerSignature,
                            signerName: name
                          });
                        } else {
                          // Create new signature with the name
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
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Items Condition on Receipt
                    </label>
                    <div className="space-y-2">
                      {[
                        'Acceptable',
                        'Damaged or altered',
                        'Improper storage/transportation conditions',
                        'Insufficient quantity',
                        'Other issues'
                      ].map((condition) => (
                        <label key={condition} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="itemsConditionOnReceipt"
                            value={condition}
                            checked={form.itemsConditionOnReceipt === condition}
                            onChange={(e) => handleChange('itemsConditionOnReceipt', e.target.value)}
                            className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{condition}</span>
                        </label>
                      ))}
                    </div>
                    
                    {/* Specification text input for non-acceptable conditions */}
                    {(form.itemsConditionOnReceipt !== 'Acceptable' && form.itemsConditionOnReceipt !== 'Insufficient quantity') && (
                      <div className="mt-3">
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          Specify details
                        </label>
                        <textarea
                          value={form.itemsConditionSpecification}
                          onChange={(e) => handleChange('itemsConditionSpecification', e.target.value)}
                          className="input text-sm w-full h-20 resize-none"
                          placeholder={`Please specify the ${form.itemsConditionOnReceipt.toLowerCase()}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Laboratory Capability Assessment */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Laboratory Capability Assessment
                    </label>
                    <div className="space-y-2">
                      {[
                        'Full capability',
                        'Partial capability',
                        'Lacks capability'
                      ].map((capability) => (
                        <label key={capability} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="laboratoryCapabilityAssessment"
                            value={capability}
                            checked={form.laboratoryCapabilityAssessment === capability}
                            onChange={(e) => handleChange('laboratoryCapabilityAssessment', e.target.value)}
                            className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{capability}</span>
                        </label>
                      ))}
                    </div>
                    
                    {/* Specification text input for non-full capability */}
                    {form.laboratoryCapabilityAssessment !== 'Full capability' && (
                      <div className="mt-3">
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          {form.laboratoryCapabilityAssessment === 'Partial capability' ? 'Specify limitations' : 'Specify lacking capabilities'}
                        </label>
                        <textarea
                          value={form.capabilitySpecification}
                          onChange={(e) => handleChange('capabilitySpecification', e.target.value)}
                          className="input text-sm w-full h-20 resize-none"
                          placeholder={`Please specify the ${form.laboratoryCapabilityAssessment === 'Partial capability' ? 'limitations' : 'lacking capabilities'}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Staff Signature */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Staff Signature
                    </label>
                    <SignatureCanvas
                      value={staffSignature}
                      onChange={setStaffSignature}
                      placeholder="Staff signature"
                      signerName={staffSignature?.signerName || form.assignedStaff}
                      onSignerNameChange={(name) => {
                        if (staffSignature) {
                          setStaffSignature({
                            ...staffSignature,
                            signerName: name
                          });
                        } else {
                          // Create new signature with the name
                          setStaffSignature({
                            signatureData: '',
                            signerName: name,
                            signedDate: new Date()
                          });
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
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
        </form>
      </div>
      
      {/* PDF Preview Modal */}
      {showPdfPreview && (
        <PdfPreviewModal
          isOpen={showPdfPreview}
          job={getJobForPreview()}
          settings={pdfSettings}
          onClose={() => setShowPdfPreview(false)}
          onDownload={() => {
            const jobForDownload = getJobForPreview();
            generateAndDownloadJobPDF(jobForDownload, pdfSettings);
          }}
        />
      )}
    </div>
  );
};
