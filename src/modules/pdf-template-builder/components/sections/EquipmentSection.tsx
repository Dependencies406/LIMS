/**
 * Equipment Section Components
 * Use these when building datasheet or certificate templates for a specific equipment.
 * "Preview PDF for this equipment" passes the selected equipment index so these fields resolve correctly.
 *
 * Fields are grouped into five categories:
 *   • Identity & Classification
 *   • Location & Ownership
 *   • Calibration Schedule
 *   • Operational Specifications
 *   • Administrative / Metadata
 */

import type { ComponentDefinition } from './types';

const textDefaults = {
  type: 'text' as const,
  font: 'Helvetica',
  fontSize: 10,
};

export const equipmentSectionComponents: ComponentDefinition[] = [

  // ─── Identity & Classification ───────────────────────────────────────────────

  {
    type: 'text',
    name: 'Equipment Count',
    icon: '🔢',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      fontSize: 12,
      dataSource: { type: 'number', key: 'equipment.count' },
    },
  },
  {
    type: 'text',
    name: 'Equipment ID',
    icon: '🆔',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.id' },
    },
  },
  {
    type: 'text',
    name: 'Equipment Name',
    icon: '📌',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.name' },
    },
  },
  {
    type: 'text',
    name: 'Category',
    icon: '📂',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.category' },
    },
  },
  {
    type: 'text',
    name: 'Manufacturer',
    icon: '🏭',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.manufacturer' },
    },
  },
  {
    type: 'text',
    name: 'Model',
    icon: '📐',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.model' },
    },
  },
  {
    type: 'text',
    name: 'Serial Number',
    icon: '🔖',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.serial' },
    },
  },
  {
    type: 'text',
    name: 'Asset Tag / ID',
    icon: '🏷️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.assetTag' },
    },
  },
  {
    type: 'text',
    name: 'Status',
    icon: '🚦',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.status' },
    },
  },

  // ─── Location & Ownership ────────────────────────────────────────────────────

  {
    type: 'text',
    name: 'Location',
    icon: '📍',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.location' },
    },
  },
  {
    type: 'text',
    name: 'Custodian Name',
    icon: '👤',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.custodianName' },
    },
  },

  // ─── Calibration Schedule ────────────────────────────────────────────────────

  {
    type: 'text',
    name: 'Calibration Point',
    icon: '🎯',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.calibrationPoint' },
    },
  },
  {
    type: 'text',
    name: 'Calibration Methods',
    icon: '📋',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.calibrationMethods' },
    },
  },
  {
    type: 'text',
    name: 'Calibration Procedure',
    icon: '📜',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.calibrationProcedure' },
    },
  },
  {
    type: 'text',
    name: 'Calibration Interval',
    icon: '🔁',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.calibrationInterval' },
    },
  },
  {
    type: 'text',
    name: 'Calibration Date',
    icon: '📅',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.calibrationDate' },
    },
  },
  {
    type: 'text',
    name: 'Last Calibration Date',
    icon: '📅',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.lastCalibrationDate' },
    },
  },
  {
    type: 'text',
    name: 'Next Calibration Due',
    icon: '⏰',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.nextCalibrationDate' },
    },
  },
  {
    type: 'checkbox',
    name: 'Requires Calibration',
    icon: '✅',
    section: 'equipment',
    defaultProperties: {
      dataSource: { type: 'boolean', key: 'equipment.requiresCalibration' },
    },
  },
  {
    type: 'checkbox',
    name: 'External Provider',
    icon: '🔗',
    section: 'equipment',
    defaultProperties: {
      dataSource: { type: 'boolean', key: 'equipment.externalProvider' },
    },
  },
  {
    type: 'text',
    name: 'Certificate Number',
    icon: '📄',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'certificate.number' },
    },
  },

  // ─── Operational Specifications ──────────────────────────────────────────────

  {
    type: 'text',
    name: 'Capacity',
    icon: '⚖️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.capacity' },
    },
  },
  {
    type: 'text',
    name: 'Usage Range',
    icon: '📊',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.usageRange' },
    },
  },
  {
    type: 'text',
    name: 'Usage Criteria',
    icon: '📋',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.usageCriteria' },
    },
  },
  {
    type: 'text',
    name: 'Usage Period Start',
    icon: '▶️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.usagePeriodStart' },
    },
  },
  {
    type: 'text',
    name: 'Usage Period End',
    icon: '⏹️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.usagePeriodEnd' },
    },
  },
  {
    type: 'text',
    name: 'Accessories',
    icon: '🔧',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.accessories' },
    },
  },
  {
    type: 'text',
    name: 'Remark',
    icon: '📝',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.remark' },
    },
  },

  // ─── Administrative / Metadata ───────────────────────────────────────────────

  {
    type: 'text',
    name: 'Registration Date',
    icon: '🗓️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'date', key: 'equipment.registrationDate' },
    },
  },
  {
    type: 'text',
    name: 'Notes',
    icon: '🗒️',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      fontSize: 9,
      dataSource: { type: 'text', key: 'equipment.notes' },
    },
  },
];

export const equipmentSectionDataSources = [
  // Identity & Classification
  { key: 'equipment.count',              label: 'Equipment Count',        type: 'number'  as const, category: 'Equipment — Identity' },
  { key: 'equipment.id',                 label: 'Equipment ID',           type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.name',               label: 'Equipment Name',         type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.category',           label: 'Category',               type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.manufacturer',       label: 'Manufacturer',           type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.model',              label: 'Model',                  type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.serial',             label: 'Serial Number',          type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.assetTag',           label: 'Asset Tag / ID',         type: 'text'    as const, category: 'Equipment — Identity' },
  { key: 'equipment.status',             label: 'Status',                 type: 'text'    as const, category: 'Equipment — Identity' },

  // Location & Ownership
  { key: 'equipment.location',           label: 'Location',               type: 'text'    as const, category: 'Equipment — Location' },
  { key: 'equipment.custodianName',      label: 'Custodian Name',         type: 'text'    as const, category: 'Equipment — Location' },

  // Calibration Schedule
  { key: 'equipment.calibrationPoint',   label: 'Calibration Point',      type: 'text'    as const, category: 'Equipment — Calibration' },
  { key: 'equipment.calibrationMethods', label: 'Calibration Methods',    type: 'text'    as const, category: 'Equipment — Calibration' },
  { key: 'equipment.calibrationProcedure', label: 'Calibration Procedure', type: 'text'  as const, category: 'Equipment — Calibration' },
  { key: 'equipment.calibrationInterval', label: 'Calibration Interval',  type: 'text'   as const, category: 'Equipment — Calibration' },
  { key: 'equipment.calibrationDate',    label: 'Calibration Date',       type: 'date'    as const, category: 'Equipment — Calibration' },
  { key: 'equipment.lastCalibrationDate', label: 'Last Calibration Date', type: 'date'   as const, category: 'Equipment — Calibration' },
  { key: 'equipment.nextCalibrationDate', label: 'Next Calibration Due',  type: 'date'   as const, category: 'Equipment — Calibration' },
  { key: 'equipment.requiresCalibration', label: 'Requires Calibration',  type: 'boolean' as const, category: 'Equipment — Calibration' },
  { key: 'equipment.externalProvider',   label: 'External Provider',      type: 'boolean' as const, category: 'Equipment — Calibration' },
  { key: 'certificate.number',           label: 'Certificate Number',     type: 'text'    as const, category: 'Equipment — Calibration' },

  // Operational Specifications
  { key: 'equipment.capacity',           label: 'Capacity',               type: 'text'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.usageRange',         label: 'Usage Range',            type: 'text'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.usageCriteria',      label: 'Usage Criteria',         type: 'text'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.usagePeriodStart',   label: 'Usage Period Start',     type: 'date'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.usagePeriodEnd',     label: 'Usage Period End',       type: 'date'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.accessories',        label: 'Accessories',            type: 'text'    as const, category: 'Equipment — Specifications' },
  { key: 'equipment.remark',             label: 'Remark',                 type: 'text'    as const, category: 'Equipment — Specifications' },

  // Administrative
  { key: 'equipment.registrationDate',   label: 'Registration Date',      type: 'date'    as const, category: 'Equipment — Administrative' },
  { key: 'equipment.notes',              label: 'Notes',                  type: 'text'    as const, category: 'Equipment — Administrative' },
];
