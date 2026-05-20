/**
 * Section Registry
 *
 * A central registry for all PDF builder sections.
 * Sections self-register by calling registerSection() from their own files.
 * Adding a new section requires only:
 *   1. Create a new section file and call registerSection() inside it.
 *   2. Import that file in sections/index.ts so the call runs.
 *
 * No need to touch the sections array or any other file.
 */

import type { SectionDefinition } from './components/sections/types';

const _registry: Map<string, SectionDefinition> = new Map();
const _order: string[] = [];

/**
 * Register a section. If the section ID is already registered the definition
 * is replaced (upsert) so that Vite HMR reloads always see fresh data sources.
 */
export function registerSection(definition: SectionDefinition): void {
  if (!_registry.has(definition.id)) {
    _order.push(definition.id);
  }
  _registry.set(definition.id, definition); // always overwrite — safe for HMR
}

/**
 * Clear the entire registry (used by HMR so stale section definitions are
 * replaced when any section file changes).
 */
export function clearRegistry(): void {
  _registry.clear();
  _order.length = 0;
}

/**
 * Return all registered sections in registration order.
 */
export function getAllSections(): SectionDefinition[] {
  return _order.map((id) => _registry.get(id)!);
}

/**
 * Return a section by ID, or undefined if not found.
 */
export function getSectionById(id: string): SectionDefinition | undefined {
  return _registry.get(id);
}

/**
 * Return true if a section with the given ID is registered.
 */
export function isSectionRegistered(id: string): boolean {
  return _registry.has(id);
}

/**
 * Return all registered section IDs in registration order.
 */
export function getRegisteredSectionIds(): string[] {
  return [..._order];
}

// Vite HMR: clear the registry so the re-executing sections/index.ts
// re-registers all sections with the latest definitions.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    clearRegistry();
  });
}
