/**
 * Service Information Section Components
 */

import type { ComponentDefinition } from './types';

export const serviceInformationSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Service Requested',
    icon: '🔧',
    section: 'service-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'service.serviceRequested',
      },
    },
  },
  {
    type: 'text',
    name: 'Statement of Conformity',
    icon: '✅',
    section: 'service-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'service.statementOfConformity',
      },
    },
  },
  {
    type: 'text',
    name: 'Decision Rule',
    icon: '📏',
    section: 'service-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'service.decisionRule',
      },
    },
  },
  {
    type: 'text',
    name: 'SoC reference PDF (URL)',
    icon: '🔗',
    section: 'service-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'service.statementOfConformityReferencePdfUrl',
      },
    },
  },
  {
    type: 'text',
    name: 'SoC reference PDF (file name)',
    icon: '📎',
    section: 'service-information',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'service.statementOfConformityReferencePdfName',
      },
    },
  },
];

export const serviceInformationSectionDataSources = [
  { key: 'service.serviceRequested', label: 'Service Requested', type: 'text', category: 'Service' },
  { key: 'service.statementOfConformity', label: 'Statement of Conformity', type: 'text', category: 'Service' },
  { key: 'service.statementOfConformityRequirements', label: 'Statement Requirements', type: 'text', category: 'Service' },
  { key: 'service.decisionRule', label: 'Decision Rule', type: 'text', category: 'Service' },
  { key: 'service.statementOfConformityReferencePdfUrl', label: 'SoC reference PDF URL', type: 'text', category: 'Service' },
  { key: 'service.statementOfConformityReferencePdfName', label: 'SoC reference PDF file name', type: 'text', category: 'Service' },
];
