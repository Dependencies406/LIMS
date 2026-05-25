import React, { useState, useEffect, useRef } from 'react';
import type { ServiceRequestInput, ServiceRequestEquipment, Customer, ServiceInformation } from '../types';
import { DuplicateIcon } from './common';
import { serviceRequestService } from '../services/serviceRequestService';
import { customerService } from '../services/customerService';
import { equipmentService } from '../services/equipmentService';
import { getManufacturerNames } from '../services/manufacturerListService';
import { getModelNames } from '../services/modelListService';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { getCalibrationMethodNames } from '../services/calibrationMethodListService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';

/** Same as Job modal: allowed types plus current value if not in manager list. */
function equipmentTypeSelectOptions(allowed: string[], currentName: string): string[] {
  const cur = currentName.trim();
  const set = new Set(allowed);
  if (cur && !set.has(cur)) set.add(cur);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function filterMasterListByQuery(names: string[], query: string, max = 25): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return names.filter((n) => n.toLowerCase().includes(q)).slice(0, max);
}

/** Public URL: staff complete these on the job after intake */
function stripStaffOnlyEquipmentFields(eq: ServiceRequestEquipment): ServiceRequestEquipment {
  return {
    ...eq,
    calibrationMethods: '',
    machineLocation: '',
    calibrationDate: '',
    certificateNumber: '',
    resolution: '',
    note: '',
  };
}

interface ServiceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hideCloseButton?: boolean; // For public standalone form
  standalone?: boolean; // Render without modal overlay for public page
}

export const ServiceRequestModal: React.FC<ServiceRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  hideCloseButton = false,
  standalone = false,
}) => {
  // Auth is optional - will be null for public access
  const { currentUser } = useAuth();
  const { success } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const defaultServiceInformation = (): ServiceInformation => ({
    serviceRequested: 'Calibration',
    statementOfConformity: 'Not required',
    statementOfConformityRequirements: '',
  });

  const [form, setForm] = useState<ServiceRequestInput>({
    customerCompanyName: '',
    address: '',
    contactName: '',
    email: '',
    phoneNumber: '',
    fax: '',
    customerReference: '',
    requestedCalibrationDate: '',
    generalRemarks: '',
    serviceInformation: defaultServiceInformation(),
    equipment: [{
      name: '',
      manufacturer: '',
      model: '',
      capacity: '',
      serialNumber: '',
      calibrationPoint: '',
      calibrationMethods: '',
      unit: '',
      resolution: '',
      assetTag: '',
      note: '',
      accessories: '',
      machineLocation: '',
      calibrationDate: '',
      certificateNumber: '',
    }],
  });

  const patchServiceInformation = (patch: Partial<ServiceInformation>) => {
    setForm((prev) => ({
      ...prev,
      serviceInformation: {
        ...defaultServiceInformation(),
        ...prev.serviceInformation,
        ...patch,
      },
    }));
  };

  // Auto-complete states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [certificateEquipmentTypeNames, setCertificateEquipmentTypeNames] = useState<string[]>([]);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [equipmentSuggestions, setEquipmentSuggestions] = useState<{
    manufacturer: string[];
    model: string[];
  }>({ manufacturer: [], model: [] });
  const [showEquipmentSuggestions, setShowEquipmentSuggestions] = useState<{
    manufacturer: boolean;
    model: boolean;
  }>({ manufacturer: false, model: false });
  const [calibrationMethodNames, setCalibrationMethodNames] = useState<string[]>([]);
  const [calibrationMethodSuggestRow, setCalibrationMethodSuggestRow] = useState<number | null>(null);

  const customerInputRef = useRef<HTMLInputElement>(null);

  // Single effect: stable deps [isOpen, standalone] (same length every render) for HMR / Fast Refresh.
  // Subscribes to certificate equipment types + loads customers / master lists when the form is open.
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeEquipmentNames =
      certificateNumberConfigService.subscribeToEquipmentNames(setCertificateEquipmentTypeNames);

    const loadData = async () => {
      try {
        const customersData = await customerService.getAllCustomers();
        setCustomers(customersData);

        if (standalone) {
          const [manufacturersData, modelsData] = await Promise.all([
            getManufacturerNames(),
            getModelNames(),
          ]);
          setManufacturers(manufacturersData);
          setModels(modelsData);
          setCalibrationMethodNames([]);
        } else {
          const [manufacturersData, modelsData, calibrationMethodsData] = await Promise.all([
            getManufacturerNames(),
            getModelNames(),
            getCalibrationMethodNames(),
          ]);
          setManufacturers(manufacturersData);
          setModels(modelsData);
          setCalibrationMethodNames(calibrationMethodsData);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };

    void loadData();

    return () => {
      unsubscribeEquipmentNames();
    };
  }, [isOpen, standalone]);

  // Handle customer company name input with auto-complete
  const handleCustomerCompanyNameChange = (value: string) => {
    setForm((prev) => {
      let nextCode = prev.customerCode || '';
      if (nextCode) {
        const linked = customers.find((x) => x.customerCode === nextCode);
        if (!linked || linked.name.trim() !== value.trim()) {
          nextCode = '';
        }
      }
      return { ...prev, customerCompanyName: value, ...(nextCode ? { customerCode: nextCode } : { customerCode: undefined }) };
    });

    if (value.trim().length > 0) {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(value.toLowerCase())
      );
      setCustomerSuggestions(filtered);
      setShowCustomerSuggestions(filtered.length > 0);
    } else {
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
    }
  };

  // Select customer from suggestions
  const handleSelectCustomer = (customer: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerCompanyName: customer.name,
      customerCode: customer.customerCode,
      address: customer.address || prev.address,
      contactName: customer.contact?.trim() ? customer.contact.trim() : prev.contactName,
      email: customer.email?.trim() ? customer.email.trim() : prev.email,
      phoneNumber: customer.phone?.trim() ? customer.phone.trim() : prev.phoneNumber,
    }));
    setShowCustomerSuggestions(false);
    setCustomerSuggestions([]);
  };

  // Handle equipment field changes with auto-complete
  const handleEquipmentChange = (
    index: number,
    field: keyof ServiceRequestEquipment,
    value: string
  ) => {
    setForm(prev => {
      const newEquipment = [...prev.equipment];
      newEquipment[index] = { ...newEquipment[index], [field]: value };
      return { ...prev, equipment: newEquipment };
    });

    // Auto-complete for manufacturer
    if (field === 'manufacturer' && value.trim().length > 0) {
      const filtered = manufacturers.filter(m =>
        m.toLowerCase().includes(value.toLowerCase())
      );
      setEquipmentSuggestions(prev => ({ ...prev, manufacturer: filtered }));
      setShowEquipmentSuggestions(prev => ({ ...prev, manufacturer: filtered.length > 0 }));
    }

    // Auto-complete for model
    if (field === 'model' && value.trim().length > 0) {
      const filtered = models.filter(m =>
        m.toLowerCase().includes(value.toLowerCase())
      );
      setEquipmentSuggestions(prev => ({ ...prev, model: filtered }));
      setShowEquipmentSuggestions(prev => ({ ...prev, model: filtered.length > 0 }));
    }

    // Check equipment by serial number
    if (field === 'serialNumber' && value.trim().length > 0) {
      checkEquipmentBySerialNumber(index, value.trim());
    }
  };

  // Check equipment by serial number
  const checkEquipmentBySerialNumber = async (index: number, serialNumber: string) => {
    try {
      const equipment = await equipmentService.getEquipmentBySerialNumber(serialNumber);
      if (equipment) {
        setForm((prev) => {
          const newEquipment = [...prev.equipment];
          const base = {
            ...newEquipment[index],
            name: equipment.name,
            manufacturer: equipment.manufacturer,
            model: equipment.model,
            capacity: equipment.capacity || '',
            calibrationPoint: equipment.calibrationPoint || '',
            serialNumber: equipment.serialNumber,
          };
          newEquipment[index] = standalone
            ? { ...base, note: '' }
            : { ...base, note: equipment.note || '' };
          return { ...prev, equipment: newEquipment };
        });
        success('Equipment information loaded from database');
      }
    } catch (err) {
      // Equipment not found, continue with manual entry
      console.log('Equipment not found by serial number');
    }
  };

  // Select suggestion
  const handleSelectSuggestion = (
    index: number,
    field: 'manufacturer' | 'model',
    value: string
  ) => {
    setForm(prev => {
      const newEquipment = [...prev.equipment];
      newEquipment[index] = { ...newEquipment[index], [field]: value };
      return { ...prev, equipment: newEquipment };
    });
    setShowEquipmentSuggestions(prev => ({ ...prev, [field]: false }));
    setEquipmentSuggestions(prev => ({ ...prev, [field]: [] }));
  };

  const applyCalibrationMethodsFromMaster = (index: number, value: string) => {
    setForm((prev) => {
      const next = [...prev.equipment];
      next[index] = { ...next[index], calibrationMethods: value };
      return { ...prev, equipment: next };
    });
    setCalibrationMethodSuggestRow(null);
  };

  const handleCalibrationMethodsFieldChange = (index: number, value: string) => {
    handleEquipmentChange(index, 'calibrationMethods', value);
    if (value.trim().length > 0) setCalibrationMethodSuggestRow(index);
    else setCalibrationMethodSuggestRow(null);
  };

  // Add equipment row
  const handleAddEquipment = () => {
    setForm(prev => ({
      ...prev,
      equipment: [
        ...prev.equipment,
        {
          name: '',
          manufacturer: '',
          model: '',
          capacity: '',
          serialNumber: '',
          calibrationPoint: '',
          calibrationMethods: '',
          unit: '',
          resolution: '',
          assetTag: '',
          note: '',
          accessories: '',
          machineLocation: '',
          calibrationDate: '',
          certificateNumber: '',
        },
      ],
    }));
  };

  // Remove equipment row
  const handleRemoveEquipment = (index: number) => {
    if (form.equipment.length > 1) {
      setForm(prev => ({
        ...prev,
        equipment: prev.equipment.filter((_, i) => i !== index),
      }));
    }
  };

  // Duplicate equipment row (all fields except certificateNumber)
  const handleDuplicateEquipment = (index: number) => {
    setForm(prev => {
      const source = prev.equipment[index];
      const duplicate: ServiceRequestEquipment = {
        name: source.name,
        manufacturer: source.manufacturer,
        model: source.model,
        capacity: source.capacity,
        serialNumber: source.serialNumber,
        calibrationPoint: source.calibrationPoint,
        note: source.note,
        calibrationMethods: source.calibrationMethods,
        unit: source.unit,
        resolution: source.resolution,
        assetTag: source.assetTag,
        accessories: source.accessories,
        machineLocation: source.machineLocation,
        calibrationDate: source.calibrationDate,
        // certificateNumber intentionally omitted
      };
      const newEquipment = [...prev.equipment];
      newEquipment.splice(index + 1, 0, duplicate);
      return { ...prev, equipment: newEquipment };
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!form.customerCompanyName || !form.address || !form.contactName || !form.email || !form.phoneNumber) {
      setError('Please fill in all required fields');
      return;
    }

    if (!form.equipment || form.equipment.length === 0) {
      setError('At least one equipment entry is required');
      return;
    }

    // Validate equipment
    const hasInvalidEquipment = form.equipment.some(
      eq => !eq.name || !eq.manufacturer || !eq.model || !eq.serialNumber
    );
    if (hasInvalidEquipment) {
      setError('Please fill in all required equipment fields (Name, Manufacturer, Model, Serial Number)');
      return;
    }

    setLoading(true);

    try {
      // Check if customer exists, if not create it
      const existingCustomer = customers.find(
        c => c.name.toLowerCase() === form.customerCompanyName.toLowerCase()
      );

      if (!existingCustomer) {
        // Create new customer
        try {
          const { getNextCustomerId, incrementCustomerIdSequence } = await import('../services/customerIdService');
          const customerId = await getNextCustomerId();
          await customerService.createCustomer({
            customerId,
            name: form.customerCompanyName,
            address: form.address,
          });
          // Increment customer ID sequence
          await incrementCustomerIdSequence();
          success('New customer created automatically');
        } catch (err) {
          console.error('Error creating customer:', err);
          // Continue with service request even if customer creation fails
        }
      }

      const equipmentForWrite = standalone
        ? form.equipment.map(stripStaffOnlyEquipmentFields)
        : form.equipment;

      // Store equipment by serial number
      for (const eq of equipmentForWrite) {
        if (eq.serialNumber) {
          try {
            await equipmentService.createOrUpdateEquipment({
              serialNumber: eq.serialNumber,
              name: eq.name,
              manufacturer: eq.manufacturer,
              model: eq.model,
              capacity: eq.capacity,
              calibrationPoint: eq.calibrationPoint,
              note: eq.note,
            });
          } catch (err) {
            console.error('Error storing equipment:', err);
            // Continue even if equipment storage fails
          }
        }
      }

      const requestPayload: ServiceRequestInput = standalone
        ? {
            ...form,
            equipment: equipmentForWrite,
            serviceInformation: {
              ...defaultServiceInformation(),
              ...form.serviceInformation,
              statementOfConformityRequirements: '',
            },
          }
        : form;

      // Create service request (allow without authentication for public access)
      await serviceRequestService.createServiceRequest(requestPayload, currentUser?.uid || undefined);

      success('Service request created successfully!');
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error creating service request:', err);
      setError(err.message || 'Failed to create service request. Please try again.');
      setLoading(false);
    }
  };

  // Reset form on close
  const handleClose = () => {
    setForm({
      customerCompanyName: '',
      address: '',
      contactName: '',
      email: '',
      phoneNumber: '',
      fax: '',
      customerReference: '',
      requestedCalibrationDate: '',
      generalRemarks: '',
      serviceInformation: defaultServiceInformation(),
      equipment: [{
        name: '',
        manufacturer: '',
        model: '',
        capacity: '',
        serialNumber: '',
        calibrationPoint: '',
        calibrationMethods: '',
        unit: '',
        resolution: '',
        assetTag: '',
        note: '',
        accessories: '',
        machineLocation: '',
        calibrationDate: '',
        certificateNumber: '',
      }],
    });
    setError('');
    setShowCustomerSuggestions(false);
    setShowEquipmentSuggestions({ manufacturer: false, model: false });
    setCalibrationMethodSuggestRow(null);
    onClose();
  };

  if (!isOpen) return null;

  // Render form content (shared between modal and standalone modes)
  const renderFormContent = () => (
    <>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Customer Service Request</h2>
        {!hideCloseButton && !standalone && (
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Customer Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Customer Information</h3>
            
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company / organization name <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-1">
                Type to search your customer directory (same field as the job form). Choosing a row links the customer code for conversion to a job.
              </p>
              <input
                ref={customerInputRef}
                type="text"
                value={form.customerCompanyName || ''}
                onChange={(e) => handleCustomerCompanyNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                onFocus={() => {
                  if (form.customerCompanyName && customerSuggestions.length > 0) {
                    setShowCustomerSuggestions(true);
                  }
                }}
                className="input w-full"
                required
                placeholder="Type to search existing customers..."
              />
              {form.customerCode ? (
                <p className="mt-1 text-xs text-gray-600">
                  Linked to customer code <span className="font-mono font-medium">{form.customerCode}</span>
                </p>
              ) : null}
              {showCustomerSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {customerSuggestions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur
                        handleSelectCustomer(customer);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">{customer.name}</div>
                      <div className="text-sm text-gray-500">{customer.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.address || ''}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                className="input w-full"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.contactName || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, contactName: e.target.value }))}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="input w-full"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phoneNumber || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fax</label>
                <input
                  type="tel"
                  value={form.fax || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, fax: e.target.value }))}
                  className="input w-full"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Request reference & dates */}
          <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50/80">
            <h3 className="text-lg font-semibold text-gray-900">Request details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer PO / reference
                </label>
                <p className="text-xs text-gray-500 mb-1">Maps to the job purchase order / reference field when converted</p>
                <input
                  type="text"
                  value={form.customerReference || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, customerReference: e.target.value }))}
                  className="input w-full"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Request calibration date
                </label>
                <p className="text-xs text-gray-500 mb-1">
                  Preferred date for calibration. When this request is converted to a job, it becomes the job schedule date.
                </p>
                <input
                  type="date"
                  value={form.requestedCalibrationDate || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, requestedCalibrationDate: e.target.value }))}
                  className="input w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">General remarks / special instructions</label>
              <textarea
                value={form.generalRemarks || ''}
                onChange={(e) => setForm(prev => ({ ...prev, generalRemarks: e.target.value }))}
                className="input w-full"
                rows={3}
                placeholder="Optional — site access, handling, turnaround, etc."
              />
            </div>
          </div>

          {/* Service information (aligned with job module Service tab) */}
          <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
            <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
            <p className="text-sm text-gray-600">Important information for both laboratory and customer (same options as when creating a job)</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Service Requested</label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="sr_serviceRequested"
                  checked={form.serviceInformation?.serviceRequested === 'Calibration'}
                  onChange={() => patchServiceInformation({ serviceRequested: 'Calibration' })}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="text-sm text-gray-700">Calibration</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Statement of Conformity</label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sr_soc"
                    checked={form.serviceInformation?.statementOfConformity === 'Required'}
                    onChange={() => patchServiceInformation({ statementOfConformity: 'Required' })}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Required</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sr_soc"
                    checked={form.serviceInformation?.statementOfConformity === 'Not required'}
                    onChange={() => patchServiceInformation({ statementOfConformity: 'Not required' })}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Not required</span>
                </label>
              </div>
              {form.serviceInformation?.statementOfConformity === 'Required' && standalone ? (
                <p className="mt-3 text-sm text-gray-600 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  Requirements and specifications for the statement of conformity will be recorded with laboratory staff after this request is converted to a job. Reference PDFs can be attached on the job record.
                </p>
              ) : null}
              {form.serviceInformation?.statementOfConformity === 'Required' && !standalone ? (
                <div className="mt-3 space-y-1">
                  <label className="text-xs text-gray-600 font-medium block">
                    Please specify requirements/specifications:
                  </label>
                  <textarea
                    value={form.serviceInformation?.statementOfConformityRequirements || ''}
                    onChange={(e) => patchServiceInformation({ statementOfConformityRequirements: e.target.value })}
                    className="input w-full h-20 resize-none"
                    placeholder="Enter specific requirements or specifications for the statement of conformity"
                  />
                  <p className="text-xs text-gray-500">
                    Reference PDFs can be attached after this request is converted to a job (in the job record).
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Equipment Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Equipment Information</h3>
              <button
                type="button"
                onClick={handleAddEquipment}
                className="btn btn-secondary text-sm"
              >
                + Add Equipment
              </button>
            </div>
            {standalone ? (
              <p className="text-sm text-gray-600 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                Calibration methods, location, dates, certificate numbers, resolution, and per-item technical notes are completed by laboratory staff after intake—not on this public form.
              </p>
            ) : null}

            {form.equipment.map((eq, index) => {
              const calibrationMethodMatches = filterMasterListByQuery(
                calibrationMethodNames,
                eq.calibrationMethods || ''
              );
              return (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-700">Equipment #{index + 1}</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDuplicateEquipment(index)}
                      className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                      title="Duplicate this item (without certificate number)"
                    >
                      <DuplicateIcon className="w-3.5 h-3.5" />
                      Duplicate
                    </button>
                    {form.equipment.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEquipment(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Equipment type (name) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-1">
                      {certificateEquipmentTypeNames.length > 0
                        ? 'Same types as Certificate Number Manager (matches the job form).'
                        : 'No types in Certificate Number Manager yet—enter a name, or add types under Settings.'}
                    </p>
                    {certificateEquipmentTypeNames.length > 0 ? (
                      <select
                        value={eq.name || ''}
                        onChange={(e) => handleEquipmentChange(index, 'name', e.target.value)}
                        className="input w-full"
                        required
                      >
                        <option value="">Select equipment type…</option>
                        {equipmentTypeSelectOptions(certificateEquipmentTypeNames, eq.name).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                            {certificateEquipmentTypeNames.includes(opt) ? '' : ' (not in manager)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={eq.name || ''}
                        onChange={(e) => handleEquipmentChange(index, 'name', e.target.value)}
                        className="input w-full"
                        required
                        placeholder="Equipment name or type"
                      />
                    )}
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Manufacturer <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={eq.manufacturer || ''}
                      onChange={(e) => handleEquipmentChange(index, 'manufacturer', e.target.value)}
                      onBlur={() => setTimeout(() => setShowEquipmentSuggestions(prev => ({ ...prev, manufacturer: false })), 200)}
                      onFocus={() => {
                        if (eq.manufacturer && equipmentSuggestions.manufacturer.length > 0) {
                          setShowEquipmentSuggestions(prev => ({ ...prev, manufacturer: true }));
                        }
                      }}
                      className="input w-full"
                      required
                      placeholder="Type to search..."
                    />
                    {showEquipmentSuggestions.manufacturer && equipmentSuggestions.manufacturer.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {equipmentSuggestions.manufacturer.map((m, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevent input blur
                              handleSelectSuggestion(index, 'manufacturer', m);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={eq.model || ''}
                      onChange={(e) => handleEquipmentChange(index, 'model', e.target.value)}
                      onBlur={() => setTimeout(() => setShowEquipmentSuggestions(prev => ({ ...prev, model: false })), 200)}
                      onFocus={() => {
                        if (eq.model && equipmentSuggestions.model.length > 0) {
                          setShowEquipmentSuggestions(prev => ({ ...prev, model: true }));
                        }
                      }}
                      className="input w-full"
                      required
                      placeholder="Type to search..."
                    />
                    {showEquipmentSuggestions.model && equipmentSuggestions.model.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {equipmentSuggestions.model.map((m, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevent input blur
                              handleSelectSuggestion(index, 'model', m);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Capacity
                    </label>
                    <input
                      type="text"
                      value={eq.capacity || ''}
                      onChange={(e) => handleEquipmentChange(index, 'capacity', e.target.value)}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serial number <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-1">Serial or ID number (same as job form)</p>
                    <input
                      type="text"
                      value={eq.serialNumber || ''}
                      onChange={(e) => handleEquipmentChange(index, 'serialNumber', e.target.value)}
                      className="input w-full"
                      required
                      placeholder="Enter serial number to auto-load equipment info"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Accessories</label>
                    <p className="text-xs text-gray-500 mb-1">Included accessories or parts (maps to job equipment)</p>
                    <textarea
                      value={eq.accessories || ''}
                      onChange={(e) => handleEquipmentChange(index, 'accessories', e.target.value)}
                      className="input w-full resize-y"
                      rows={2}
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Calibration point
                    </label>
                    <input
                      type="text"
                      value={eq.calibrationPoint || ''}
                      onChange={(e) => handleEquipmentChange(index, 'calibrationPoint', e.target.value)}
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <p className="text-xs text-gray-500 mb-1">e.g. V, °C, bar</p>
                    <input
                      type="text"
                      value={eq.unit || ''}
                      onChange={(e) => handleEquipmentChange(index, 'unit', e.target.value)}
                      className="input w-full"
                      placeholder="Optional"
                    />
                  </div>

                  {!standalone ? (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Calibration methods</label>
                        <p className="text-xs text-gray-500 mb-1">
                          Type to match the calibration method list in Settings, or enter any text (same behavior as the job form).
                        </p>
                        <div className="relative">
                          <input
                            type="text"
                            value={eq.calibrationMethods || ''}
                            onChange={(e) => handleCalibrationMethodsFieldChange(index, e.target.value)}
                            onFocus={() => {
                              if ((eq.calibrationMethods || '').trim().length > 0) {
                                setCalibrationMethodSuggestRow(index);
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setCalibrationMethodSuggestRow((cur) => (cur === index ? null : cur));
                              }, 200);
                            }}
                            autoComplete="off"
                            className="input w-full"
                            placeholder="Calibration methods"
                          />
                          {calibrationMethodSuggestRow === index &&
                          calibrationMethodMatches.length > 0 &&
                          (eq.calibrationMethods || '').trim().length > 0 ? (
                            <ul
                              className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                        <p className="text-xs text-gray-500 mb-1">Machine or site location</p>
                        <input
                          type="text"
                          value={eq.machineLocation || ''}
                          onChange={(e) => handleEquipmentChange(index, 'machineLocation', e.target.value)}
                          className="input w-full"
                          placeholder="Optional"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Calibration date</label>
                        <p className="text-xs text-gray-500 mb-1">If known (optional)</p>
                        <input
                          type="date"
                          value={eq.calibrationDate || ''}
                          onChange={(e) => handleEquipmentChange(index, 'calibrationDate', e.target.value)}
                          className="input w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Certificate number</label>
                        <p className="text-xs text-gray-500 mb-1">Optional; lab may assign on the job</p>
                        <input
                          type="text"
                          value={eq.certificateNumber || ''}
                          onChange={(e) => handleEquipmentChange(index, 'certificateNumber', e.target.value)}
                          className="input w-full font-mono"
                          placeholder="Optional"
                          autoComplete="off"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Resolution</label>
                        <input
                          type="text"
                          value={eq.resolution || ''}
                          onChange={(e) => handleEquipmentChange(index, 'resolution', e.target.value)}
                          className="input w-full"
                          placeholder="Optional"
                        />
                      </div>
                    </>
                  ) : null}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset / ID tag no.
                    </label>
                    <input
                      type="text"
                      value={eq.assetTag || ''}
                      onChange={(e) => handleEquipmentChange(index, 'assetTag', e.target.value)}
                      className="input w-full"
                      placeholder="Optional"
                    />
                  </div>

                  {!standalone ? (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Note
                      </label>
                      <textarea
                        value={eq.note || ''}
                        onChange={(e) => handleEquipmentChange(index, 'note', e.target.value)}
                        className="input w-full"
                        rows={2}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
            })}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
            {!standalone && (
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
    </>
  );

  // Standalone mode (for public page) - no overlay
  if (standalone) {
    return (
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-y-auto">
        {renderFormContent()}
      </div>
    );
  }

  // Modal mode (default) - with overlay
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
        {renderFormContent()}
      </div>
    </div>
  );
};
