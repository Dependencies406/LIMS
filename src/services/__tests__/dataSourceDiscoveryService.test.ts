import { describe, it, expect, vi } from 'vitest';

describe('DataSourceDiscovery', () => {
  it('tracks multiple sections for shared keys (e.g. footer.page_number)', async () => {
    vi.resetModules();
    const mod = await import('../dataSourceDiscoveryService');
    const discovery = mod.getDataSourceDiscovery();

    const sections = discovery.getSectionsForDataSource('footer.page_number');
    expect(sections).toEqual(expect.arrayContaining(['header', 'footer']));
    expect(sections.length).toBeGreaterThan(1);
  });

  it('does not let legacy definitions override section-declared keys', async () => {
    vi.resetModules();
    const mod = await import('../dataSourceDiscoveryService');
    const discovery = mod.getDataSourceDiscovery();

    // company.name is declared in Header section and also exists as legacy key.
    // We should keep the section-declared definition (description starts with "From ... section").
    const ds = discovery.getDataSource('company.name');
    expect(ds).toBeTruthy();
    expect(ds!.description).toMatch(/^From /);
  });
});

