/**
 * PDF Module Registry - DEPRECATED
 * 
 * ⚠️ DEPRECATION NOTICE:
 * This module registry is deprecated. The old module-based PDF system has been
 * replaced with a template-based system. 
 * 
 * For new PDF generation, use:
 * - TemplateBasedPdfGenerator component
 * - pdfTemplateRenderer service
 * - pdfTemplateService for template management
 * 
 * This file is kept only for backward compatibility with:
 * - Form PDF modules (which use a separate module system for forms)
 * 
 * DO NOT USE THIS FOR JOB PDF GENERATION. Use PDF Template Builder instead.
 */

import type { PdfModule, ModuleConfiguration } from '../types/pdfModules';
import type { PdfSettings } from '../types';

// Module registry storage
const modules = new Map<string, PdfModule>();

/**
 * Register a PDF module
 * @deprecated Use PDF Template Builder instead
 */
export function registerModule(module: PdfModule): void {
  if (modules.has(module.id)) {
    console.warn(`Module ${module.id} is already registered. Overwriting...`);
  }
  modules.set(module.id, module);
}

/**
 * Get all registered modules
 * @deprecated Use PDF Template Builder instead
 */
export function getAllModules(): PdfModule[] {
  // Return empty array for job PDF modules (they've been removed)
  // Form PDF modules are registered separately
  return Array.from(modules.values()).filter(m => !m.id.startsWith('form-'));
}

/**
 * Get all modules including form modules
 */
export function getAllModulesIncludingForms(): PdfModule[] {
  return Array.from(modules.values());
}

/**
 * Get module by ID
 * @deprecated Use PDF Template Builder instead
 */
export function getModuleById(id: string): PdfModule | undefined {
  return modules.get(id);
}

/**
 * Get enabled modules in configured order
 * @deprecated Use PDF Template Builder instead
 */
export function getEnabledModulesInOrder(settings: PdfSettings, excludeFormModules: boolean = true): PdfModule[] {
  const config = getModuleConfiguration(settings);
  const enabledModules: PdfModule[] = [];
  
  // Get modules in the configured order
  for (const moduleId of config.moduleOrder) {
    // Skip form modules if excludeFormModules is true
    if (excludeFormModules && moduleId.startsWith('form-')) {
      continue;
    }
    const module = modules.get(moduleId);
    if (module && config.moduleVisibility[moduleId] !== false) {
      enabledModules.push(module);
    }
  }
  
  // Also include any registered modules that aren't in the order list but are enabled
  for (const module of modules.values()) {
    // Skip form modules if excludeFormModules is true
    if (excludeFormModules && module.id.startsWith('form-')) {
      continue;
    }
    if (!config.moduleOrder.includes(module.id)) {
      if (config.moduleVisibility[module.id] !== false) {
        enabledModules.push(module);
      }
    }
  }
  
  return enabledModules;
}

/**
 * Get module configuration from settings
 * Handles backward compatibility for settings without module config
 */
export function getModuleConfiguration(settings: PdfSettings): ModuleConfiguration {
  // If settings already have module configuration, use it
  if ('moduleVisibility' in settings && 'moduleOrder' in settings) {
    return {
      moduleVisibility: (settings as any).moduleVisibility || {},
      moduleOrder: (settings as any).moduleOrder || [],
      moduleGridPositions: (settings as any).moduleGridPositions || {},
      gridLayout: (settings as any).gridLayout || { columns: 1, gap: 20 },
      headerComponents: (settings as any).headerComponents,
      footerComponents: (settings as any).footerComponents,
    };
  }
  
  // Backward compatibility: create default configuration
  const defaultConfig: ModuleConfiguration = {
    moduleVisibility: {},
    moduleOrder: [],
    moduleGridPositions: {},
    gridLayout: { columns: 1, gap: 20 },
  };
  
  // Set all modules to enabled by default
  // IMPORTANT: Form modules (form-*) should NOT be enabled for job PDFs by default
  for (const module of modules.values()) {
    // Skip form modules when creating default config for job PDFs
    if (module.id.startsWith('form-')) {
      defaultConfig.moduleVisibility[module.id] = false;
      continue;
    }
    defaultConfig.moduleVisibility[module.id] = module.defaultEnabled;
    if (!defaultConfig.moduleOrder.includes(module.id)) {
      defaultConfig.moduleOrder.push(module.id);
    }
    // Set default grid positions (vertical stack)
    if (!defaultConfig.moduleGridPositions) {
      defaultConfig.moduleGridPositions = {};
    }
    if (module.defaultGridPosition) {
      defaultConfig.moduleGridPositions[module.id] = module.defaultGridPosition;
    } else {
      // Auto-assign positions based on order
      const orderIndex = defaultConfig.moduleOrder.indexOf(module.id);
      defaultConfig.moduleGridPositions[module.id] = {
        row: orderIndex + 1,
        column: 1,
        colSpan: 1,
      };
    }
  }
  
  // Sort by default order
  defaultConfig.moduleOrder.sort((a, b) => {
    const moduleA = modules.get(a);
    const moduleB = modules.get(b);
    if (!moduleA || !moduleB) return 0;
    return moduleA.defaultOrder - moduleB.defaultOrder;
  });
  
  return defaultConfig;
}

/**
 * Get default module order (array of module IDs)
 */
export function getDefaultModuleOrder(): string[] {
  return getAllModules()
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map(m => m.id);
}

/**
 * Validate module configuration
 */
export function validateModuleConfiguration(config: ModuleConfiguration): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check that all module IDs in order exist
  for (const moduleId of config.moduleOrder) {
    if (!modules.has(moduleId)) {
      errors.push(`Module "${moduleId}" in order list does not exist`);
    }
  }
  
  // Check that visibility settings reference valid modules
  for (const moduleId of Object.keys(config.moduleVisibility)) {
    if (!modules.has(moduleId)) {
      errors.push(`Module "${moduleId}" in visibility settings does not exist`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
