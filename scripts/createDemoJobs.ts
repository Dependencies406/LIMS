/**
 * Script to create demo jobs for testing
 * 
 * Usage:
 * 1. Make sure you're logged in as an admin user
 * 2. Run this script from the browser console or create a page that calls it
 * 
 * Or import and call from a component:
 * import { createDemoJobs } from '../scripts/createDemoJobs';
 * await createDemoJobs(currentUser.uid);
 */

import { jobService } from '../services/jobService';
import type { JobInput, Equipment } from '../types';

/**
 * Create 3 demo jobs with realistic data
 * @param userId User ID of the user creating the jobs
 */
export async function createDemoJobs(userId: string): Promise<string[]> {
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
    scheduleDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 7 days from now
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
    scheduleDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 4 days from now
    comments: 'Customer needs high accuracy calibration. Sensor will be tested at multiple temperature points.',
    assignedStaff: userId, // Assign to current user
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
    scheduleDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    comments: 'Both instruments calibrated successfully. Certificates issued and delivered to customer.',
    assignedStaff: userId,
  };

  try {
    console.log('Creating demo jobs...');

    // Create Job 1
    const job1Id = await jobService.createJob(demoJob1, userId);
    createdJobIds.push(job1Id);
    console.log(`✅ Created Job 1: ${demoJob1.jobId} (ID: ${job1Id})`);

    // Create Job 2
    const job2Id = await jobService.createJob(demoJob2, userId);
    createdJobIds.push(job2Id);
    console.log(`✅ Created Job 2: ${demoJob2.jobId} (ID: ${job2Id})`);

    // Create Job 3
    const job3Id = await jobService.createJob(demoJob3, userId);
    createdJobIds.push(job3Id);
    console.log(`✅ Created Job 3: ${demoJob3.jobId} (ID: ${job3Id})`);

    console.log(`\n🎉 Successfully created ${createdJobIds.length} demo jobs!`);
    console.log('Job IDs:', createdJobIds);

    return createdJobIds;
  } catch (error) {
    console.error('❌ Error creating demo jobs:', error);
    throw error;
  }
}

/**
 * Create demo jobs from browser console
 * Usage: Call this function from browser console after importing
 */
export async function createDemoJobsFromConsole() {
  // This would need to be called from a component that has access to currentUser
  // For now, we'll create a helper that can be used in a component
  console.log('Please call createDemoJobs(userId) from a component with access to currentUser');
}
