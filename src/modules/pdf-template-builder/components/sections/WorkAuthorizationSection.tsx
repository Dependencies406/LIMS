/**
 * Work Authorization Section Components
 */

import type { ComponentDefinition } from './types';

export const workAuthorizationSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Work Authorization Statement',
    icon: '📝',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.workAuthorizationStatement',
      },
    },
  },
  {
    type: 'image',
    name: 'Customer Signature',
    icon: '✍️',
    section: 'work-authorization',
    defaultProperties: {
      type: 'image',
      dataSource: {
        type: 'image',
        key: 'workAuthorization.customerSignature',
      },
      width: 200,
      height: 80,
      maintainAspect: true,
    },
  },
  {
    type: 'text',
    name: 'Items Condition',
    icon: '📦',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.itemsConditionOnReceipt',
      },
    },
  },
  {
    type: 'text',
    name: 'Laboratory Capability',
    icon: '🔬',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.laboratoryCapabilityAssessment',
      },
    },
  },
  {
    type: 'image',
    name: 'Staff Signature',
    icon: '✍️',
    section: 'work-authorization',
    defaultProperties: {
      type: 'image',
      dataSource: {
        type: 'image',
        key: 'workAuthorization.staffSignature',
      },
      width: 200,
      height: 80,
      maintainAspect: true,
    },
  },
  {
    type: 'image',
    name: 'Technical Reviewer Signature',
    icon: '✍️',
    section: 'work-authorization',
    defaultProperties: {
      type: 'image',
      dataSource: {
        type: 'image',
        key: 'workAuthorization.technicalReviewerSignature',
      },
      width: 200,
      height: 80,
      maintainAspect: true,
    },
  },
  {
    type: 'text',
    name: 'Customer Signature Date',
    icon: '📅',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.customerSignature.signedDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Staff Signature Date',
    icon: '📅',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.staffSignature.signedDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Technical Reviewer Signature Date',
    icon: '📅',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.technicalReviewerSignature.signedDate',
      },
    },
  },
  {
    type: 'text',
    name: 'Customer Signer Name',
    icon: '👤',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.customerSignature.signerName',
      },
    },
  },
  {
    type: 'text',
    name: 'Staff Signer Name',
    icon: '👤',
    section: 'work-authorization',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'workAuthorization.staffSignature.signerName',
      },
    },
  },
];

export const workAuthorizationSectionDataSources = [
  { key: 'workAuthorization.workAuthorizationStatement', label: 'Work Authorization Statement', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.customerSignature', label: 'Customer Signature (Image)', type: 'image', category: 'Authorization' },
  { key: 'workAuthorization.customerSignature.signedDate', label: 'Customer Signature Date', type: 'date', category: 'Authorization' },
  { key: 'workAuthorization.customerSignature.signerName', label: 'Customer Signer Name', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.itemsConditionOnReceipt', label: 'Items Condition', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.laboratoryCapabilityAssessment', label: 'Laboratory Capability', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.staffSignature', label: 'Staff Signature (Image)', type: 'image', category: 'Authorization' },
  { key: 'workAuthorization.staffSignature.signedDate', label: 'Staff Signature Date', type: 'date', category: 'Authorization' },
  { key: 'workAuthorization.staffSignature.signerName', label: 'Staff Signer Name', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.technicalReviewerSignature', label: 'Technical Reviewer Signature (Image)', type: 'image', category: 'Authorization' },
  { key: 'workAuthorization.technicalReviewerSignature.signedDate', label: 'Technical Reviewer Signature Date', type: 'date', category: 'Authorization' },
];
