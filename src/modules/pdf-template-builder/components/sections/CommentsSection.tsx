/**
 * Comments Section Components
 */

import type { ComponentDefinition } from './types';

export const commentsSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Job Comments',
    icon: '💬',
    section: 'comments',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: {
        type: 'text',
        key: 'job.comments',
      },
    },
  },
  {
    type: 'rectangle',
    name: 'Comments Box',
    icon: '📦',
    section: 'comments',
    defaultProperties: {
      type: 'rectangle',
      width: 500,
      height: 100,
      fillColor: '#f9f9f9',
      strokeColor: '#cccccc',
      strokeWidth: 1,
    },
  },
];

export const commentsSectionDataSources = [
  { key: 'job.comments', label: 'Job Comments', type: 'text', category: 'Comments' },
];
