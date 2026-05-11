/**
 * Equipment Section Components
 * Use these when building datasheet or certificate templates for a specific equipment.
 * "Preview PDF for this equipment" passes the selected equipment index so these fields resolve correctly.
 */

import type { ComponentDefinition } from './types';

const textDefaults = {
  type: 'text' as const,
  font: 'Helvetica',
  fontSize: 10,
};

export const equipmentSectionComponents: ComponentDefinition[] = [
  {
    type: 'text',
    name: 'Equipment Count',
    icon: '🔢',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      fontSize: 12,
      dataSource: { type: 'text', key: 'equipment.count' },
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
  {
    type: 'text',
    name: 'Calibration Date',
    icon: '📅',
    section: 'equipment',
    defaultProperties: {
      ...textDefaults,
      dataSource: { type: 'text', key: 'equipment.calibrationDate' },
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
];

export const equipmentSectionDataSources = [
  { key: 'equipment.count', label: 'Equipment Count', type: 'number' as const, category: 'Equipment' },
  { key: 'equipment.name', label: 'Equipment Name', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.manufacturer', label: 'Manufacturer', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.model', label: 'Model', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.serial', label: 'Serial Number', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.assetTag', label: 'Asset Tag / ID', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.location', label: 'Location', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.calibrationPoint', label: 'Calibration Point', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.calibrationMethods', label: 'Calibration Methods', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.accessories', label: 'Accessories', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.remark', label: 'Remark', type: 'text' as const, category: 'Equipment' },
  { key: 'equipment.calibrationDate', label: 'Calibration Date', type: 'date' as const, category: 'Equipment' },
  { key: 'certificate.number', label: 'Certificate Number', type: 'text' as const, category: 'Equipment' },
];
