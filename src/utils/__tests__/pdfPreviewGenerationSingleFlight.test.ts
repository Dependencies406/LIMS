import { describe, it, expect, vi } from 'vitest';
import { buildPdfPreviewFlightKey, singleFlightPreviewGeneration } from '../pdfPreviewGenerationSingleFlight';

describe('pdfPreviewGenerationSingleFlight', () => {
  it('shares one in-flight promise for the same key (simulates StrictMode double effect)', async () => {
    const factory = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('blob'), 5))
    );
    const key = buildPdfPreviewFlightKey('job-1', 'tpl-1', 0, false);
    const [a, b] = await Promise.all([
      singleFlightPreviewGeneration(key, factory),
      singleFlightPreviewGeneration(key, factory),
    ]);
    expect(a).toBe('blob');
    expect(b).toBe('blob');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('uses different keys for continueWithNA true vs false', async () => {
    const factoryFalse = vi.fn().mockResolvedValue('a');
    const factoryTrue = vi.fn().mockResolvedValue('b');
    const kFalse = buildPdfPreviewFlightKey('j', 't', undefined, false);
    const kTrue = buildPdfPreviewFlightKey('j', 't', undefined, true);
    const [x, y] = await Promise.all([
      singleFlightPreviewGeneration(kFalse, factoryFalse),
      singleFlightPreviewGeneration(kTrue, factoryTrue),
    ]);
    expect(x).toBe('a');
    expect(y).toBe('b');
    expect(factoryFalse).toHaveBeenCalledTimes(1);
    expect(factoryTrue).toHaveBeenCalledTimes(1);
  });
});
