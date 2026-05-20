/**
 * Tab Migration Utilities
 * Handles migration from single-tab to multi-tab spreadsheet structure
 */

import type { TemplateSchema } from '../../../types/template';
import type { SpreadsheetModel, SpreadsheetTab } from '../models/SpreadsheetModel';
import { generateCellId } from '../models/SpreadsheetModel';

/**
 * Get default tab name for new templates/spreadsheets
 */
export function getDefaultTabName(): string {
  return 'Measurement';
}

/**
 * Migrate old template format (single tab) to new multi-tab format
 */
export function migrateTemplateToTabs(template: TemplateSchema): TemplateSchema {
  // If already has tabs, return as-is
  if (template.tabs && template.tabs.length > 0) {
    return template;
  }

  // Migrate old format
  const migratedTabs = [];
  
  if (template.columns && template.columns.length > 0) {
    // Create "Main" tab with existing columns
    // Handle both array and dict formats
    let columnsArray: any[] = [];
    let columnOrderArray: string[] = [];
    
    if (Array.isArray(template.columns)) {
      columnsArray = template.columns;
      columnOrderArray = (template as any).columnOrder || 
        template.columns.map((c: any) => c.id || c.header || c.columnValue);
    } else if (typeof template.columns === 'object') {
      // Desktop format: columns is a dictionary
      const columnsDict = template.columns as Record<string, any>;
      columnOrderArray = (template as any).columnOrder || Object.keys(columnsDict).sort();
      columnsArray = columnOrderArray.map((key: string) => ({
        ...columnsDict[key],
        id: key,
        header: columnsDict[key]?.header || key,
        columnValue: columnsDict[key]?.columnValue || key,
      }));
    }
    
    migratedTabs.push({
      id: `tab_${Date.now()}`,
      name: 'Main',
      order: 0,
      columns: columnsArray,
      columnOrder: columnOrderArray,
    });
  } else {
    // Empty template - create default "Measurement" tab
    migratedTabs.push({
      id: `tab_${Date.now()}`,
      name: getDefaultTabName(),
      order: 0,
      columns: [],
      columnOrder: [],
    });
  }

  return {
    ...template,
    tabs: migratedTabs,
    // Keep old columns for backward compatibility during transition
    columns: template.columns,
  };
}

/**
 * Migrate old spreadsheet format (single tab) to new multi-tab format
 */
export function migrateSpreadsheetToTabs(
  spreadsheet: SpreadsheetModel,
  template?: TemplateSchema
): SpreadsheetModel {
  // If already has tabs, return as-is
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    return spreadsheet;
  }

  // Determine default tab name
  let defaultTabName = 'Main';
  if (template) {
    const migratedTemplate = migrateTemplateToTabs(template);
    if (migratedTemplate.tabs && migratedTemplate.tabs.length > 0) {
      defaultTabName = migratedTemplate.tabs[0].name;
    }
  }
  
  const tabId = `tab_${Date.now()}`;
  
  // Migrate cells, columnDefinitions, and columnOrder to the default tab
  const defaultTab: SpreadsheetTab = {
    id: tabId,
    name: defaultTabName,
    order: 0,
    cells: spreadsheet.cells || new Map(),
    columnDefinitions: spreadsheet.columnDefinitions,
    columnOrder: spreadsheet.columnOrder,
    rowCount: spreadsheet.rowCount || 25,
    columnCount: spreadsheet.columnCount || 26,
  };

  const tabs = new Map<string, SpreadsheetTab>();
  tabs.set(tabId, defaultTab);

  return {
    ...spreadsheet,
    tabs,
    tabOrder: [tabId],
    // Keep old structure for backward compatibility
    cells: spreadsheet.cells,
    columnDefinitions: spreadsheet.columnDefinitions,
    columnOrder: spreadsheet.columnOrder,
  };
}

/**
 * Get active tab from spreadsheet
 */
export function getActiveTab(
  spreadsheet: SpreadsheetModel,
  tabId?: string
): SpreadsheetTab | null {
  if (!spreadsheet.tabs || spreadsheet.tabs.size === 0) {
    return null;
  }
  
  if (tabId && spreadsheet.tabs.has(tabId)) {
    return spreadsheet.tabs.get(tabId)!;
  }
  
  // Use first tab in tabOrder, or first tab in tabs map
  if (spreadsheet.tabOrder && spreadsheet.tabOrder.length > 0) {
    const firstTabId = spreadsheet.tabOrder[0];
    if (spreadsheet.tabs.has(firstTabId)) {
      return spreadsheet.tabs.get(firstTabId)!;
    }
  }
  
  // Fallback to first tab
  const firstTab = Array.from(spreadsheet.tabs.values())[0];
  return firstTab || null;
}

/**
 * Get tab by name
 */
export function getTabByName(
  spreadsheet: SpreadsheetModel,
  tabName: string
): SpreadsheetTab | null {
  if (!spreadsheet.tabs) {
    return null;
  }
  
  for (const tab of spreadsheet.tabs.values()) {
    if (tab.name === tabName) {
      return tab;
    }
  }
  
  return null;
}

/**
 * Get cells from spreadsheet (from active tab or fallback to cells property)
 */
export function getSpreadsheetCells(
  spreadsheet: SpreadsheetModel,
  tabId?: string
): Map<string, any> {
  // Try to get from active tab first
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    const activeTab = getActiveTab(spreadsheet, tabId);
    if (activeTab && activeTab.cells) {
      return activeTab.cells;
    }
  }
  
  // Fallback to legacy cells property
  return spreadsheet.cells || new Map();
}

/**
 * Get column definitions from spreadsheet (from active tab or fallback)
 */
export function getSpreadsheetColumnDefinitions(
  spreadsheet: SpreadsheetModel,
  tabId?: string
): Map<string, any> | undefined {
  // Try to get from active tab first
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    const activeTab = getActiveTab(spreadsheet, tabId);
    if (activeTab && activeTab.columnDefinitions) {
      return activeTab.columnDefinitions;
    }
  }
  
  // Fallback to legacy columnDefinitions property
  return spreadsheet.columnDefinitions;
}

/**
 * Get column order from spreadsheet (from active tab or fallback)
 */
export function getSpreadsheetColumnOrder(
  spreadsheet: SpreadsheetModel,
  tabId?: string
): string[] | undefined {
  // Try to get from active tab first
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    const activeTab = getActiveTab(spreadsheet, tabId);
    if (activeTab && activeTab.columnOrder) {
      return activeTab.columnOrder;
    }
  }
  
  // Fallback to legacy columnOrder property
  return spreadsheet.columnOrder;
}
