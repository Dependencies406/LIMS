/**
 * Deduplicates concurrent PDF preview generation for the same logical request.
 *
 * React 18 StrictMode in development mounts, runs effects, unmounts, and remounts.
 * Component refs reset on remount, so "already rendering" guards in useEffect are not
 * sufficient — a second mount can start a second renderTemplate. This map survives
 * remounts until the shared promise settles.
 */
const inFlightPreviewGenerations = new Map<string, Promise<unknown>>();

export function buildPdfPreviewFlightKey(
  jobId: string,
  templateId: string | undefined,
  selectedEquipmentIndex: number | undefined,
  continueWithNA: boolean
): string {
  const tid = templateId ?? 'no-template-id';
  const eq = selectedEquipmentIndex === undefined ? 'all' : String(selectedEquipmentIndex);
  return `${jobId}|${tid}|${eq}|na:${continueWithNA ? '1' : '0'}`;
}

export function singleFlightPreviewGeneration<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightPreviewGenerations.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = factory().finally(() => {
    inFlightPreviewGenerations.delete(key);
  });
  inFlightPreviewGenerations.set(key, promise);
  return promise;
}
