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
];

export const workAuthorizationSectionDataSources = [
  { key: 'workAuthorization.workAuthorizationStatement', label: 'Work Authorization Statement', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.customerSignature', label: 'Customer Signature', type: 'image', category: 'Authorization' },
  { key: 'workAuthorization.itemsConditionOnReceipt', label: 'Items Condition', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.laboratoryCapabilityAssessment', label: 'Laboratory Capability', type: 'text', category: 'Authorization' },
  { key: 'workAuthorization.staffSignature', label: 'Staff Signature', type: 'image', category: 'Authorization' },
  { key: 'workAuthorization.technicalReviewerSignature', label: 'Technical Reviewer Signature', type: 'image', category: 'Authorization' },
];
