import type { ComponentDefinition } from './types';
import { DOCUMENTS_TABLE_DEFAULT_COLUMNS } from '../../types';

export function createUniversalDocumentsTableComponent(sectionId: string): ComponentDefinition {
  return {
    type: 'documents-table',
    name: 'Documents Index Table',
    icon: '📑',
    section: sectionId,
    description: 'Full Documents Index (document_index) as a table; paginates within the element height.',
    defaultProperties: {
      type: 'documents-table',
      width: 500,
      height: 200,
      paginationMode: 'dynamic',
      repeatOnOverflowPages: true,
      dataSource: {
        type: 'documentIndex',
        key: 'documentIndex.list',
      },
      columns: DOCUMENTS_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
        id: def.id,
        label: def.label,
        visible: true,
        width: def.defaultWidth,
        align: 'left' as const,
        order: idx,
      })),
    },
  };
}

