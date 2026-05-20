/**
 * Permission Discovery Service
 * Automatically scans the codebase for new features, actions, and processes
 * and suggests new permissions to add to the role management system
 */

import type { PermissionAction } from '../types';
import { ALL_PERMISSIONS } from './roleService';

/**
 * Pattern-based permission discovery
 * Scans code for common patterns that indicate user actions
 */
export interface DiscoveredPermission {
  action: string; // Can be a new permission not yet in PermissionAction type
  category: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  source: string; // File path or pattern that detected it
  suggested: boolean; // Whether this is a new permission not in the system
  codeSnippet?: string; // Code that triggered the discovery
}

/**
 * Permission annotations in code
 * Developers can annotate code with permission hints using comments:
 * 
 * @permission jobs.export - Export jobs to CSV
 * @permission customers.delete - Delete customer records
 */
export interface PermissionAnnotation {
  action: string;
  description: string;
  file: string;
  line: number;
  category?: string;
}

/**
 * Service for discovering new permissions from codebase
 */
export const permissionDiscoveryService = {
  /**
   * Scan codebase for permission annotations
   * Looks for @permission comments in code
   */
  async scanForAnnotations(): Promise<PermissionAnnotation[]> {
    const annotations: PermissionAnnotation[] = [];
    
    // In a real implementation, this would:
    // 1. Use a code parser (like TypeScript compiler API or Babel)
    // 2. Extract comments with @permission tags
    // 3. Return structured permission data
    
    // For now, we'll use a manual registry system
    // Developers can register permissions in their code
    const registered = permissionRegistry.getAll();
    registered.forEach(reg => {
      annotations.push({
        action: reg.action,
        description: reg.description,
        file: reg.file,
        line: reg.line,
        category: reg.category,
      });
    });
    
    return annotations;
  },

  /**
   * Discover permissions from route definitions
   * Scans App.tsx and route files for new routes/features
   */
  discoverFromRoutes(): DiscoveredPermission[] {
    const discovered: DiscoveredPermission[] = [];
    
    // Route patterns would be used in a real implementation to scan route files
    // and suggest permissions (e.g. /jobs, /customers, /documents, /settings).
    // In a real implementation, this would:
    // 1. Read route files
    // 2. Parse route definitions
    // 3. Match against patterns
    // 4. Return discovered permissions
    
    return discovered;
  },

  /**
   * Discover permissions from button/action handlers
   * Scans components for onClick handlers, form submissions, etc.
   */
  discoverFromActions(): DiscoveredPermission[] {
    const discovered: DiscoveredPermission[] = [];
    
    // Common action patterns:
    // - handleCreate, handleEdit, handleDelete
    // - onClick handlers with specific actions
    // - Form submissions
    
    // Example patterns to look for (would be used in a real implementation):
    // const actionPatterns = [
    //   { pattern: /handleCreate|onCreate|create[A-Z]/, action: 'create', category: 'General' },
    //   { pattern: /handleEdit|onEdit|edit[A-Z]/, action: 'edit', category: 'General' },
    //   { pattern: /handleDelete|onDelete|delete[A-Z]/, action: 'delete', category: 'General' },
    //   { pattern: /handleExport|onExport|export[A-Z]/, action: 'export', category: 'General' },
    //   { pattern: /handleImport|onImport|import[A-Z]/, action: 'import', category: 'General' },
    //   { pattern: /generatePdf|generatePDF|downloadPdf/, action: 'generatePdf', category: 'General' },
    // ];
    
    return discovered;
  },

  /**
   * Discover permissions from service methods
   * Scans service files for CRUD operations and other actions
   */
  discoverFromServices(): DiscoveredPermission[] {
    const discovered: DiscoveredPermission[] = [];
    
    // Service method patterns:
    // - create*, add*, new*
    // - update*, edit*, modify*
    // - delete*, remove*
    // - export*, generate*, download*
    // - import*, upload*
    
    // This would scan service files and extract method names
    // Then infer permissions based on naming patterns
    
    return discovered;
  },

  /**
   * Discover permissions from registered annotations
   */
  async discoverFromRegistry(): Promise<DiscoveredPermission[]> {
    const discovered: DiscoveredPermission[] = [];
    const registered = permissionRegistry.getAll();
    
    registered.forEach(reg => {
      discovered.push({
        action: reg.action,
        category: reg.category,
        description: reg.description,
        confidence: 'high',
        source: `${reg.file}:${reg.line}`,
        suggested: false,
      });
    });
    
    return discovered;
  },

  /**
   * Compare discovered permissions with existing permissions
   * Returns new permissions that aren't in the system yet
   */
  findNewPermissions(
    discovered: DiscoveredPermission[]
  ): DiscoveredPermission[] {
    const existingActions = new Set(ALL_PERMISSIONS.map(p => p.action));
    
    return discovered.map(perm => {
      // Check if this permission already exists
      const exists = existingActions.has(perm.action as PermissionAction);
      
      return {
        ...perm,
        suggested: !exists,
      };
    }).filter(perm => perm.suggested);
  },

  /**
   * Main discovery function
   * Scans all sources and returns discovered permissions
   */
  async discoverAll(): Promise<DiscoveredPermission[]> {
    const allDiscovered: DiscoveredPermission[] = [];
    
    // Scan from multiple sources
    allDiscovered.push(...this.discoverFromRoutes());
    allDiscovered.push(...this.discoverFromActions());
    allDiscovered.push(...this.discoverFromServices());
    allDiscovered.push(...await this.discoverFromRegistry());
    
    // Remove duplicates based on action
    const unique = new Map<string, DiscoveredPermission>();
    allDiscovered.forEach(perm => {
      if (!unique.has(perm.action)) {
        unique.set(perm.action, perm);
      } else {
        // Merge if we have higher confidence
        const existing = unique.get(perm.action)!;
        if (perm.confidence === 'high' && existing.confidence !== 'high') {
          unique.set(perm.action, perm);
        }
      }
    });
    
    return Array.from(unique.values());
  },

  /**
   * Get suggested permissions (new ones not in system)
   */
  async getSuggestedPermissions(): Promise<DiscoveredPermission[]> {
    const all = await this.discoverAll();
    return this.findNewPermissions(all);
  },

  /**
   * Scan for new features by analyzing code patterns
   * This is a more advanced discovery method
   */
  async scanForNewFeatures(): Promise<DiscoveredPermission[]> {
    // This would:
    // 1. Scan all component files
    // 2. Look for new routes, buttons, modals
    // 3. Analyze service methods
    // 4. Check for new API endpoints
    // 5. Return suggested permissions
    
    // For now, return registered permissions that aren't in the system
    const registered = await this.discoverFromRegistry();
    return this.findNewPermissions(registered);
  },
};

/**
 * Permission Registry
 * Manual registration system for developers to register permissions
 * This allows developers to explicitly mark permissions in their code
 */
export const permissionRegistry = {
  /**
   * Registered permissions from code annotations
   * This is populated by developers using register() calls
   */
  registeredPermissions: new Map<string, {
    action: string;
    category: string;
    description: string;
    file: string;
    line: number;
  }>(),

  /**
   * Register a permission from code
   * Call this in your code to register a permission
   * 
   * @example
   * // In your component or service file:
   * import { permissionRegistry } from '../services/permissionDiscoveryService';
   * 
   * // Register when component loads or action is defined
   * permissionRegistry.register('jobs.export', 'Jobs', 'Export jobs to CSV', __filename);
   * 
   * @example
   * // In a button handler:
   * const handleExport = () => {
   *   permissionRegistry.register('jobs.export', 'Jobs', 'Export jobs to CSV');
   *   // ... export logic
   * };
   */
  register(
    action: string,
    category: string,
    description: string,
    file: string = '',
    line: number = 0
  ): void {
    this.registeredPermissions.set(action, {
      action,
      category,
      description,
      file: file || (typeof window !== 'undefined' ? window.location.href : ''),
      line,
    });
  },

  /**
   * Get all registered permissions
   */
  getAll(): Array<{
    action: string;
    category: string;
    description: string;
    file: string;
    line: number;
  }> {
    return Array.from(this.registeredPermissions.values());
  },

  /**
   * Check if a permission is registered
   */
  isRegistered(action: string): boolean {
    return this.registeredPermissions.has(action);
  },

  /**
   * Clear all registered permissions (useful for testing)
   */
  clear(): void {
    this.registeredPermissions.clear();
  },
};

