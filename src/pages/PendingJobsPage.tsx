import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ServiceRequest } from '../types';
import { serviceRequestService } from '../services/serviceRequestService';
import { jobService } from '../services/jobService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { ServiceRequestModal } from '../components/ServiceRequestModal';

export const PendingJobsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false);
  const [convertingRequestId, setConvertingRequestId] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  // Load pending service requests
  useEffect(() => {
    const unsubscribe = serviceRequestService.subscribeToServiceRequests(
      (requests, err) => {
        if (err) {
          console.error('Error loading service requests:', err);
          showError('Failed to load service requests');
          setLoading(false);
        } else {
          // Filter to show only pending requests
          const pendingRequests = requests.filter(req => req.status === 'Pending');
          setServiceRequests(pendingRequests);
          setLoading(false);
        }
      },
      'Pending'
    );

    return unsubscribe;
  }, [showError]);

  // Handle convert to job
  const handleConvertToJob = async (request: ServiceRequest) => {
    if (!currentUser) {
      showError('You must be logged in to convert requests');
      return;
    }

    const company = request.customerCompanyName || request.customerName || 'Customer';
    if (!confirm(`Convert service request from ${company} to a job?`)) {
      return;
    }

    setConvertingRequestId(request.id);

    try {
      // Get proper job ID using jobIdService
      const { getNextJobId, incrementJobIdSequence } = await import('../services/jobIdService');
      const jobId = await getNextJobId();

      // Prefer code captured on the service request; else fall back to name match.
      // Trim everything to avoid whitespace mismatches that silently break linking.
      let customerCode = (request.customerCode || '').trim();
      if (!customerCode) {
        try {
          const { customerService } = await import('../services/customerService');
          const customers = await customerService.getAllCustomers();
          const requestName = (request.customerCompanyName || request.customerName || '').trim().toLowerCase();
          const customer = customers.find(
            c => c.name.trim().toLowerCase() === requestName
          );
          if (customer) {
            customerCode = (customer.customerCode || (customer as any).customerId || '').trim();
          }
        } catch (err) {
          console.error('Error finding customer:', err);
        }
      }

      const displayCompany = request.customerCompanyName || request.customerName || 'Customer';

      const commentParts = [
        request.generalRemarks,
        request.fax && `Fax: ${request.fax}`,
        `Converted from Service Request: ${request.id}`,
      ].filter(Boolean);

      // Create job from service request
      const poRef = (request.customerReference || '').trim();

      const jobData = {
        jobId: jobId,
        title: `Service Request - ${displayCompany}`,
        status: 'Pending' as const,
        customerCode: customerCode,
        customerName: displayCompany,
        customerAddress: request.address,
        customerContact: request.contactName,
        customerPhone: request.phoneNumber,
        customerEmail: request.email,
        ...(poRef ? { poNumber: poRef } : {}),
        ...(request.serviceInformation ? { serviceInformation: request.serviceInformation } : {}),
        equipment: (request.equipment || []).map((eq, index) => {
          const remarkParts = [
            eq.note,
            eq.assetTag && `Asset/ID: ${eq.assetTag}`,
            eq.capacity && `Capacity/range: ${eq.capacity}`,
          ].filter(Boolean);
          return {
            no: index + 1,
            name: eq.name,
            manufacturer: eq.manufacturer,
            model: eq.model,
            serialNumber: eq.serialNumber,
            calibrationPoint: eq.calibrationPoint || '',
            calibrationMethods: eq.calibrationMethods || '',
            accessories: (eq.accessories || '').trim(),
            machineLocation: (eq.machineLocation || '').trim(),
            remark: remarkParts.join(' — ') || '',
            ...(eq.unit ? { unit: eq.unit } : {}),
            ...(eq.resolution ? { resolution: eq.resolution } : {}),
            ...(eq.calibrationDate?.trim() ? { calibrationDate: eq.calibrationDate.trim() } : {}),
            ...(eq.certificateNumber?.trim() ? { certificateNumber: eq.certificateNumber.trim() } : {}),
          };
        }),
        startDate: '',
        appointmentDate:
          (request.requestedCalibrationDate || request.requestedCompletionDate || '').trim(),
        comments: commentParts.join('\n\n'),
      };

      // Create job
      const createdJobId = await jobService.createJob(jobData, currentUser.uid);
      
      // Increment job ID sequence
      await incrementJobIdSequence();

      // Mark service request as converted
      await serviceRequestService.convertToJob(request.id, createdJobId);

      success('Service request converted to job successfully!');
      
      // Navigate to job detail page
      navigate(`/jobs/${createdJobId}`);
    } catch (err: any) {
      console.error('Error converting service request to job:', err);
      showError(err.message || 'Failed to convert service request to job');
      setConvertingRequestId(null);
    }
  };

  // Handle cancel request
  const handleCancelRequest = async (request: ServiceRequest) => {
    if (!confirm(`Cancel service request from ${request.customerCompanyName || request.customerName || 'Customer'}?`)) {
      return;
    }

    try {
      await serviceRequestService.cancelServiceRequest(request.id);
      success('Service request cancelled');
    } catch (err: any) {
      console.error('Error cancelling service request:', err);
      showError(err.message || 'Failed to cancel service request');
    }
  };

  // Format date
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pending requests...</p>
          </div>
        </div>
      </div>
    );
  }

  // Copy public service request URL to clipboard
  const handleCopyPublicUrl = async () => {
    const publicUrl = `${window.location.origin}/request-service`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setUrlCopied(true);
      success('Public service request URL copied to clipboard!');
      // Reset button text after 2 seconds
      setTimeout(() => {
        setUrlCopied(false);
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = publicUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setUrlCopied(true);
        success('Public service request URL copied to clipboard!');
        // Reset button text after 2 seconds
        setTimeout(() => {
          setUrlCopied(false);
        }, 2000);
      } catch (fallbackErr) {
        showError('Failed to copy URL. Please copy manually: ' + publicUrl);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-end">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleCopyPublicUrl}
            className={`btn ${urlCopied ? 'btn-primary' : 'btn-secondary'} flex items-center space-x-2 transition-colors`}
            title="Copy public service request URL to share with customers"
          >
            {urlCopied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Public URL</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowServiceRequestModal(true)}
            className="btn btn-primary"
          >
            + New Service Request
          </button>
        </div>
      </div>

      {serviceRequests.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No pending requests</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new service request.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowServiceRequestModal(true)}
              className="btn btn-primary"
            >
              + New Service Request
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {serviceRequests.map((request) => (
            <div
              key={request.id}
              className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {request.customerCompanyName || request.customerName}
                    </h3>
                    <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                      Pending
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Contact</p>
                      <p className="text-sm font-medium text-gray-900">{request.contactName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="text-sm font-medium text-gray-900">{request.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="text-sm font-medium text-gray-900">
                        {request.phoneNumber || 'N/A'}
                      </p>
                    </div>
                    {request.fax && (
                      <div>
                        <p className="text-sm text-gray-500">Fax</p>
                        <p className="text-sm font-medium text-gray-900">{request.fax}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">Submitted</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(request.createdAt)}
                      </p>
                    </div>
                    {request.customerReference && (
                      <div>
                        <p className="text-sm text-gray-500">Reference / PO</p>
                        <p className="text-sm font-medium text-gray-900">{request.customerReference}</p>
                      </div>
                    )}
                    {(request.requestedCalibrationDate || request.requestedCompletionDate) && (
                      <div>
                        <p className="text-sm text-gray-500">Request calibration date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {request.requestedCalibrationDate || request.requestedCompletionDate}
                        </p>
                      </div>
                    )}
                  </div>

                  {request.serviceInformation && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                      <p className="text-gray-500 font-medium mb-1">Service preferences</p>
                      <p className="text-gray-800">
                        Statement of conformity: {request.serviceInformation.statementOfConformity}
                      </p>
                    </div>
                  )}

                  {request.generalRemarks && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-500 mb-1">Remarks</p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{request.generalRemarks}</p>
                    </div>
                  )}

                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Address</p>
                    <p className="text-sm text-gray-900">{request.address}</p>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Equipment ({(request.equipment || []).length})</p>
                    <div className="space-y-2">
                      {(request.equipment || []).map((eq, index) => (
                        <div
                          key={index}
                          className="bg-gray-50 rounded p-3 text-sm"
                        >
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div>
                              <span className="text-gray-500">Name:</span>{' '}
                              <span className="font-medium">{eq.name}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Manufacturer:</span>{' '}
                              <span className="font-medium">{eq.manufacturer}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Model:</span>{' '}
                              <span className="font-medium">{eq.model}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Serial:</span>{' '}
                              <span className="font-medium">{eq.serialNumber}</span>
                            </div>
                          </div>
                          {eq.capacity && (
                            <div className="mt-1">
                              <span className="text-gray-500">Capacity:</span>{' '}
                              <span className="font-medium">{eq.capacity}</span>
                            </div>
                          )}
                          {eq.calibrationPoint && (
                            <div className="mt-1">
                              <span className="text-gray-500">Calibration Point:</span>{' '}
                              <span className="font-medium">{eq.calibrationPoint}</span>
                            </div>
                          )}
                          {eq.calibrationMethods && (
                            <div className="mt-1">
                              <span className="text-gray-500">Method(s):</span>{' '}
                              <span className="font-medium">{eq.calibrationMethods}</span>
                            </div>
                          )}
                          {(eq.unit || eq.resolution) && (
                            <div className="mt-1">
                              <span className="text-gray-500">Unit / resolution:</span>{' '}
                              <span className="font-medium">
                                {[eq.unit, eq.resolution].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          )}
                          {eq.accessories && (
                            <div className="mt-1">
                              <span className="text-gray-500">Accessories:</span>{' '}
                              <span className="font-medium">{eq.accessories}</span>
                            </div>
                          )}
                          {eq.machineLocation && (
                            <div className="mt-1">
                              <span className="text-gray-500">Location:</span>{' '}
                              <span className="font-medium">{eq.machineLocation}</span>
                            </div>
                          )}
                          {eq.calibrationDate && (
                            <div className="mt-1">
                              <span className="text-gray-500">Last calibration date:</span>{' '}
                              <span className="font-medium">{eq.calibrationDate}</span>
                            </div>
                          )}
                          {eq.assetTag && (
                            <div className="mt-1">
                              <span className="text-gray-500">Asset / ID:</span>{' '}
                              <span className="font-medium">{eq.assetTag}</span>
                            </div>
                          )}
                          {eq.note && (
                            <div className="mt-1">
                              <span className="text-gray-500">Note:</span>{' '}
                              <span className="font-medium">{eq.note}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ml-6 flex flex-col space-y-2">
                  <button
                    onClick={() => handleConvertToJob(request)}
                    disabled={convertingRequestId === request.id}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    {convertingRequestId === request.id ? 'Converting...' : 'Convert to Job'}
                  </button>
                  <button
                    onClick={() => handleCancelRequest(request)}
                    className="btn btn-secondary whitespace-nowrap"
                  >
                    Cancel Request
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service Request Modal */}
      <ServiceRequestModal
        isOpen={showServiceRequestModal}
        onClose={() => setShowServiceRequestModal(false)}
        onSuccess={() => {
          setShowServiceRequestModal(false);
          // Service requests will be reloaded via subscription
        }}
      />
    </div>
  );
};
