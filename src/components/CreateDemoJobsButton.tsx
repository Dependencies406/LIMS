import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { jobService } from '../services/jobService';
import type { JobInput } from '../services/jobService';

/**
 * Create demo jobs function
 */
async function createDemoJobs(userId: string): Promise<string[]> {
  const createdJobIds: string[] = [];

  // Demo Job 1: Pending Calibration Job
  const demoJob1: JobInput = {
    jobId: `JOB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-A001`,
    title: 'Pressure Gauge Calibration - Manufacturing Plant',
    status: 'Pending',
    customerCode: 'CUST-001',
    equipment: [
      {
        no: 1,
        name: 'Digital Pressure Gauge',
        manufacturer: 'Fluke',
        model: '700G',
        serialNumber: 'PG-2024-001',
        calibrationPoint: '0, 50, 100, 150, 200 psi',
        calibrationMethods: 'Comparison with Standard',
        accessories: 'Carrying case, calibration certificate',
        machineLocation: 'Production Line A',
        remark: 'Routine annual calibration',
      },
      {
        no: 2,
        name: 'Analog Pressure Gauge',
        manufacturer: 'Wika',
        model: '213.53',
        serialNumber: 'PG-2024-002',
        calibrationPoint: '0, 100, 200, 300, 400 psi',
        calibrationMethods: 'Comparison with Standard',
        accessories: 'Mounting bracket',
        machineLocation: 'Production Line B',
        remark: 'First time calibration',
      },
    ],
    receivedDate: new Date().toISOString().slice(0, 10),
    appointmentDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    comments: 'Customer requested expedited service. Equipment in good condition upon receipt.',
  };

  // Demo Job 2: In Progress Job
  const demoJob2: JobInput = {
    jobId: `JOB-${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')}-B002`,
    title: 'Temperature Sensor Calibration - Research Lab',
    status: 'In Progress',
    customerCode: 'CUST-002',
    equipment: [
      {
        no: 1,
        name: 'RTD Temperature Sensor',
        manufacturer: 'Omega Engineering',
        model: 'PR-11-2-100-1/8-6-E',
        serialNumber: 'TS-2024-015',
        calibrationPoint: '-20°C, 0°C, 25°C, 50°C, 100°C',
        calibrationMethods: 'Fixed Point Method',
        accessories: 'Protective sheath, extension cable',
        machineLocation: 'Laboratory Room 205',
        remark: 'High precision calibration required for research purposes',
      },
    ],
    receivedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointmentDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    comments: 'Customer needs high accuracy calibration. Sensor will be tested at multiple temperature points.',
    assignedStaff: userId,
  };

  // Demo Job 3: Completed Job
  const demoJob3: JobInput = {
    jobId: `JOB-${new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')}-C003`,
    title: 'Multimeter Calibration - Electrical Workshop',
    status: 'Completed',
    customerCode: 'CUST-003',
    equipment: [
      {
        no: 1,
        name: 'Digital Multimeter',
        manufacturer: 'Keysight Technologies',
        model: 'U1282A',
        serialNumber: 'DMM-2024-089',
        calibrationPoint: 'DC Voltage: 0V, 1V, 10V, 100V, 1000V | AC Voltage: 1V, 10V, 100V | Resistance: 100Ω, 1kΩ, 10kΩ, 100kΩ',
        calibrationMethods: 'Comparison with Calibrated Standards',
        accessories: 'Test leads, carrying case, user manual',
        machineLocation: 'Electrical Workshop - Bench 3',
        remark: 'Annual calibration completed successfully. All measurement points within specification.',
      },
      {
        no: 2,
        name: 'Clamp Meter',
        manufacturer: 'Fluke',
        model: '376 FC',
        serialNumber: 'CM-2024-042',
        calibrationPoint: 'AC Current: 10A, 50A, 100A, 200A, 400A',
        calibrationMethods: 'Comparison with Calibrated Standards',
        accessories: 'iFlex flexible current probe, carrying case',
        machineLocation: 'Electrical Workshop - Mobile Cart',
        remark: 'Calibration performed. Device functioning within tolerance.',
      },
    ],
    receivedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointmentDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    comments: 'Both instruments calibrated successfully. Certificates issued and delivered to customer.',
    assignedStaff: userId,
  };

  try {
    // Create Job 1
    const job1Id = await jobService.createJob(demoJob1, userId);
    createdJobIds.push(job1Id);

    // Create Job 2
    const job2Id = await jobService.createJob(demoJob2, userId);
    createdJobIds.push(job2Id);

    // Create Job 3
    const job3Id = await jobService.createJob(demoJob3, userId);
    createdJobIds.push(job3Id);

    return createdJobIds;
  } catch (error) {
    console.error('Error creating demo jobs:', error);
    throw error;
  }
}

/**
 * Component to create demo jobs
 * Can be added to Settings page or Jobs page for testing
 */
export const CreateDemoJobsButton: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { success, error: showError } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreateDemoJobs = async () => {
    if (!currentUser?.uid) {
      showError('You must be logged in to create demo jobs');
      return;
    }

    if (!isAdmin) {
      showError('Only administrators can create demo jobs');
      return;
    }

    const confirmed = window.confirm(
      'This will create 3 demo jobs:\n\n' +
      '1. Pending Calibration Job (2 equipment items)\n' +
      '2. In Progress Job (1 equipment item)\n' +
      '3. Completed Job (2 equipment items)\n\n' +
      'Continue?'
    );

    if (!confirmed) {
      return;
    }

    setCreating(true);
    try {
      const jobIds = await createDemoJobs(currentUser.uid);
      success(`Successfully created ${jobIds.length} demo jobs!`);
    } catch (err) {
      console.error('Error creating demo jobs:', err);
      showError(err instanceof Error ? err.message : 'Failed to create demo jobs');
    } finally {
      setCreating(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <button
      onClick={handleCreateDemoJobs}
      disabled={creating}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {creating ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Creating Demo Jobs...</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Demo Jobs</span>
        </>
      )}
    </button>
  );
};
