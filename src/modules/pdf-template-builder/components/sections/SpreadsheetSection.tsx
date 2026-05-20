/**
 * Spreadsheet Section Components
 */

import type { ComponentDefinition } from './types';

export const spreadsheetSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Measurements Title',
    icon: '📝',
    section: 'spreadsheet',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 14,
      bold: true,
      dataSource: {
        type: 'text',
        key: 'measurements.title',
      },
    },
  },
  {
    type: 'text',
    name: 'Measurements Summary',
    icon: '📋',
    section: 'spreadsheet',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: {
        type: 'text',
        key: 'measurements.summary',
      },
    },
  },
  {
    type: 'text',
    name: 'Pass/Fail Status',
    icon: '✅',
    section: 'spreadsheet',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      bold: true,
      dataSource: {
        type: 'text',
        key: 'measurements.pass_fail',
      },
    },
  },
  {
    type: 'chart',
    name: 'Chart',
    icon: '📈',
    section: 'spreadsheet',
    description: 'Chart from measurements or spreadsheet data',
    defaultProperties: {
      type: 'chart',
      width: 300,
      height: 200,
      chartType: 'line',
      title: 'Chart',
      dataSource: {
        type: 'chart',
        key: 'measurements.data',
      },
    },
  },
  {
    type: 'treb-table',
    name: 'Spreadsheet Table',
    icon: '📊',
    section: 'spreadsheet',
    description: 'Table from @trebco/treb spreadsheet tab (select template & tab in properties)',
    defaultProperties: {
      type: 'treb-table',
      width: 300,
      fontSize: 10,
      borderWidth: 1,
      spreadsheetTemplateId: '',
      sourceTabId: '',
    },
  },
];

export const spreadsheetSectionDataSources = [
  { key: 'measurements.title', label: 'Measurements Title', type: 'text', category: 'Measurements' },
  { key: 'measurements.summary', label: 'Measurements Summary', type: 'text', category: 'Measurements' },
  { key: 'measurements.pass_fail', label: 'Pass/Fail Status', type: 'text', category: 'Measurements' },
];
