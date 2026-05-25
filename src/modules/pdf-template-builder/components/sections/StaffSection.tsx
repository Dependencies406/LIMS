/**
 * Staff Section â€” PDF Template Builder
 *
 * Provides drag-and-drop components and data source keys for staff personnel
 * record templates (training register, ID card, personnel profile, etc.).
 *
 * Data sources are resolved by staffPdfService which builds a context object
 * shaped as: { staff: {...}, training: { records: [...] }, company: {...} }
 *
 * The standard dot-notation resolver in pdfDataResolver handles all staff.*
 * and training.* keys without any changes to the resolver itself.
 */

import type { ComponentDefinition } from './types';
import { TRAINING_TABLE_DEFAULT_COLUMNS } from '../../types';

// â”€â”€â”€ Component definitions (drag from section panel onto canvas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const staffSectionComponents: ComponentDefinition[] = [
  // â”€â”€ Profile info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    type: 'text',
    name: 'Full Name',
    icon: 'ðŸ‘¤',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 14,
      bold: true,
      dataSource: { type: 'text', key: 'staff.name' },
    },
  },
  {
    type: 'text',
    name: 'First Name',
    icon: 'ðŸ‘¤',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: { type: 'text', key: 'staff.firstName' },
    },
  },
  {
    type: 'text',
    name: 'Last Name',
    icon: 'ðŸ‘¤',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: { type: 'text', key: 'staff.lastName' },
    },
  },
  {
    type: 'text',
    name: 'Email',
    icon: 'ðŸ“§',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: { type: 'text', key: 'staff.email' },
    },
  },
  {
    type: 'text',
    name: 'Position / Title',
    icon: 'ðŸ’¼',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 12,
      dataSource: { type: 'text', key: 'staff.position' },
    },
  },
  {
    type: 'text',
    name: 'Role',
    icon: 'ðŸ”‘',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: { type: 'text', key: 'staff.role' },
    },
  },
  {
    type: 'text',
    name: 'Status (Active / Inactive)',
    icon: 'ðŸŸ¢',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: { type: 'text', key: 'staff.status' },
    },
  },
  {
    type: 'text',
    name: 'Staff ID (UID)',
    icon: 'ðŸ†”',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: { type: 'text', key: 'staff.uid' },
    },
  },
  {
    type: 'text',
    name: 'Print Date',
    icon: 'ðŸ“…',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 10,
      dataSource: { type: 'text', key: 'staff.printDate' },
    },
  },
  // â”€â”€ Training summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    type: 'text',
    name: 'Training Record Count',
    icon: 'ðŸ”¢',
    section: 'staff',
    defaultProperties: {
      type: 'text',
      font: 'Helvetica',
      fontSize: 11,
      dataSource: { type: 'text', key: 'training.count' },
    },
  },
  // â”€â”€ Training records table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    type: 'training-table',
    name: 'Training Records Table',
    icon: 'ðŸ“‹',
    section: 'staff',
    description: 'Full training history as a table (LAB-FM-QP-03-005). Columns are configurable.',
    defaultProperties: {
      type: 'training-table',
      dataSource: { type: 'trainingRecords', key: 'training.records' },
      columns: TRAINING_TABLE_DEFAULT_COLUMNS.map((col, i) => ({
        id: col.id,
        label: col.label,
        visible: true,
        width: col.defaultWidth,
        align: 'left' as const,
        order: i,
      })),
      fontSize: 9,
      headerFontSize: 9,
      borderColor: '#000000',
      borderWidth: 0.5,
    },
  },
];

// â”€â”€â”€ Data sources (appear in the Data Source picker in the builder) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const staffSectionDataSources = [
  // Staff profile
  { key: 'staff.name',       label: 'Full Name',                  type: 'text' as const,  category: 'Staff' },
  { key: 'staff.firstName',  label: 'First Name',                 type: 'text' as const,  category: 'Staff' },
  { key: 'staff.lastName',   label: 'Last Name',                  type: 'text' as const,  category: 'Staff' },
  { key: 'staff.email',      label: 'Email',                      type: 'text' as const,  category: 'Staff' },
  { key: 'staff.position',   label: 'Position / Title',           type: 'text' as const,  category: 'Staff' },
  { key: 'staff.role',       label: 'Role',                       type: 'text' as const,  category: 'Staff' },
  { key: 'staff.status',     label: 'Status (Active / Inactive)', type: 'text' as const,  category: 'Staff' },
  { key: 'staff.uid',        label: 'Staff ID (UID)',             type: 'text' as const,  category: 'Staff' },
  { key: 'staff.printDate',  label: 'Print Date',                 type: 'text' as const,  category: 'Staff' },
  // Training summary
  { key: 'training.count',   label: 'Training Record Count',      type: 'number' as const, category: 'Staff Training' },
  // Training table (resolved by the training-table element, not a text field)
  { key: 'training.records', label: 'Training Records (table)',   type: 'text' as const,  category: 'Staff Training' },
];
