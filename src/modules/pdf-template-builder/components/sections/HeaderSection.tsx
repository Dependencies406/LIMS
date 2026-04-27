/**
 * Header Section Components
 * Components available for PDF header section
 */

import type { ComponentDefinition } from './types';

export const headerSectionComponents: ComponentDefinition[] = [
  {
    type: 'image',
    name: 'Company Logo',
    icon: '🖼️',
    section: 'header',
    defaultProperties: {
      type: 'image',
      dataSource: {
        type: 'image',
        key: 'company.logo',
      },
      width: 150,
      height: 40,
      maintainAspect: true,
      fitMode: 'contain',
    },
  },
  {
    type: 'text',
    name: 'Company Name',
    icon: '📝',
    section: 'header',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 16,
      bold: true,
      dataSource: {
        type: 'text',
        key: 'company.name',
      },
    },
  },
  {
    type: 'text',
    name: 'Company Address',
    icon: '📍',
    section: 'header',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'company.address',
      },
    },
  },
  {
    type: 'text',
    name: 'Company Phone',
    icon: '📞',
    section: 'header',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'company.phone',
      },
    },
  },
  {
    type: 'text',
    name: 'Company Email',
    icon: '📧',
    section: 'header',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: {
        type: 'text',
        key: 'company.email',
      },
    },
  },
  {
    type: 'text',
    name: 'Page Number (Header)',
    icon: '🔢',
    section: 'header',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 9,
      align: 'right',
      dataSource: {
        type: 'text',
        key: 'footer.page_number',
      },
    },
  },
];

export const headerSectionDataSources = [
  { key: 'company.name', label: 'Company Name', type: 'text', category: 'Company' },
  { key: 'company.address', label: 'Company Address', type: 'text', category: 'Company' },
  { key: 'company.phone', label: 'Company Phone', type: 'text', category: 'Company' },
  { key: 'company.email', label: 'Company Email', type: 'text', category: 'Company' },
  { key: 'company.logo', label: 'Company Logo', type: 'image', category: 'Company' },
  { key: 'footer.page_number', label: 'Page Number', type: 'number', category: 'Footer' },
];
