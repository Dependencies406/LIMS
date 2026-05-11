/**
 * Job Information Section Components
 */

import type { ComponentDefinition } from './types';

export const jobInformationSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Request No.',
    icon: '🆔',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      bold: true,
      dataSource: {
        type: 'text',
        key: 'job.id',
      },
    },
  },
  {
    type: 'text',
    name: 'Job Title',
    icon: '📋',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 14,
      bold: true,
      dataSource: {
        type: 'text',
        key: 'job.title',
      },
    },
  },
  {
    type: 'text',
    name: 'Job Status',
    icon: '📊',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.status',
      },
    },
  },
  {
    type: 'text',
    name: 'Customer Name',
    icon: '👤',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.customer',
      },
    },
  },
  {
    type: 'text',
    name: 'Customer Address',
    icon: '📍',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'customer.address',
      },
    },
  },
  {
    type: 'text',
    name: 'Assigned Staff',
    icon: '👷',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.assignedStaff',
      },
    },
  },
  {
    type: 'text',
    name: 'Job Date',
    icon: '📅',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.date',
      },
    },
  },
  {
    type: 'text',
    name: 'Appointment Date',
    icon: '📅',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.appointmentDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Start Date',
    icon: '🗓️',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.startDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Completion Date',
    icon: '✅',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.completedDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Expected Finish Date',
    icon: '⏳',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.expectedFinishDate',
      },
    },
  },
  {
    type: 'text',
    name: 'PO Number',
    icon: '🧾',
    section: 'job-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'job.poNumber',
      },
    },
  },
  {
    type: 'documents-table',
    name: 'Documents Index Table',
    icon: '📑',
    section: 'job-information',
    description: 'Full Documents Index (document_index) as a table; paginates within the element height.',
    defaultProperties: {
      type: 'documents-table',
      dataSource: {
        type: 'documentIndex',
        key: 'documentIndex.list',
      },
    },
  },
];

export const jobInformationSectionDataSources = [
  { key: 'job.id', label: 'Request No.', type: 'text', category: 'Job' },
  { key: 'job.title', label: 'Job Title', type: 'text', category: 'Job' },
  { key: 'job.status', label: 'Job Status', type: 'text', category: 'Job' },
  { key: 'job.customer', label: 'Customer', type: 'text', category: 'Job' },
  { key: 'job.date', label: 'Job Date (Received)', type: 'date', category: 'Job' },
  { key: 'job.appointmentDate', label: 'Appointment Date', type: 'date', category: 'Job' },
  { key: 'job.startDate', label: 'Start Date', type: 'date', category: 'Job' },
  { key: 'job.completedDate', label: 'Completion Date', type: 'date', category: 'Job' },
  { key: 'job.expectedFinishDate', label: 'Expected Finish Date', type: 'date', category: 'Job' },
  { key: 'job.poNumber', label: 'PO Number', type: 'text', category: 'Job' },
  { key: 'job.assignedStaff', label: 'Assigned Staff', type: 'text', category: 'Job' },
  { key: 'customer.name', label: 'Customer Name', type: 'text', category: 'Customer' },
  { key: 'customer.address', label: 'Customer Address', type: 'text', category: 'Customer' },
  { key: 'customer.contact_person', label: 'Contact Person', type: 'text', category: 'Customer' },
  { key: 'customer.phone', label: 'Phone', type: 'text', category: 'Customer' },
  { key: 'customer.email', label: 'Email', type: 'text', category: 'Customer' },
  { key: 'documentIndex.list', label: 'Documents Index (full list)', type: 'text', category: 'Documents' },
];
