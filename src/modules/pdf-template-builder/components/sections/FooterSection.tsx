/**
 * Footer Section Components
 */

import type { ComponentDefinition } from './types';

export const footerSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Footer Text',
    icon: '📄',
    section: 'footer',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 9,
      align: 'center',
      dataSource: {
        type: 'text',
        key: 'footer.text',
      },
    },
  },
  {
    type: 'text',
    name: 'Page Number',
    icon: '🔢',
    section: 'footer',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 9,
      align: 'center',
      dataSource: {
        type: 'text',
        key: 'footer.page_number',
      },
    },
  },
  {
    type: 'text',
    name: 'Page X of Y',
    icon: '📑',
    section: 'footer',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 9,
      align: 'center',
      dataSource: {
        type: 'text',
        key: 'footer.page_number',
      },
    },
  },
  {
    type: 'line',
    name: 'Footer Separator',
    icon: '➖',
    section: 'footer',
    defaultProperties: {
      type: 'line',
      x1: 0,
      y1: 0,
      x2: 595, // A4 width
      y2: 0,
      color: '#cccccc',
      width: 1,
    },
  },
];

export const footerSectionDataSources = [
  { key: 'footer.text', label: 'Footer Text', type: 'text', category: 'Footer' },
  { key: 'footer.page_number', label: 'Page Number', type: 'number', category: 'Footer' },
  { key: 'footer.total_pages', label: 'Total Pages', type: 'number', category: 'Footer' },
];
