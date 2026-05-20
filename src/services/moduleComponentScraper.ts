/**
 * Module Component Scraper
 * Scans modules for available components and fields using import.meta.glob
 */

/**
 * Component field definition
 */
export interface ComponentField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'select' | 'textarea';
  label: string;
  required?: boolean;
  defaultValue?: any;
  options?: string[]; // For select type
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Component definition
 */
export interface ComponentDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  fields: ComponentField[];
  icon?: string;
}

/**
 * Scrape components from modules
 * Uses Vite's import.meta.glob to dynamically import components
 */
export async function scrapeComponents(): Promise<ComponentDefinition[]> {
  const components: ComponentDefinition[] = [];

  try {
    // Use Vite's import.meta.glob to find all component modules
    // This will scan src/components/builtin/**/*.tsx files
    const componentModules = import.meta.glob('../components/builtin/**/*.tsx', {
      eager: false,
    });

    for (const [path, moduleLoader] of Object.entries(componentModules)) {
      try {
        const module = await moduleLoader() as any;
        
        // Extract component metadata
        // Components should export a componentConfig object
        if (module.componentConfig) {
          components.push({
            id: module.componentConfig.id || path,
            name: module.componentConfig.name || 'Unnamed Component',
            description: module.componentConfig.description,
            category: module.componentConfig.category || 'general',
            fields: module.componentConfig.fields || [],
            icon: module.componentConfig.icon,
          });
        }
      } catch (error) {
        console.warn(`Failed to load component from ${path}:`, error);
      }
    }
  } catch (error) {
    console.error('Error scraping components:', error);
  }

  return components;
}

/**
 * Scrape fields from a specific component module
 */
export async function scrapeComponentFields(componentPath: string): Promise<ComponentField[]> {
  try {
    const module = await import(componentPath) as any;
    return module.componentConfig?.fields || [];
  } catch (error) {
    console.error(`Error scraping fields from ${componentPath}:`, error);
    return [];
  }
}

/**
 * Get available component categories
 */
export async function getComponentCategories(): Promise<string[]> {
  const components = await scrapeComponents();
  const categories = new Set(components.map(c => c.category));
  return Array.from(categories);
}

