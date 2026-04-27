/**
 * Compression utilities for storing large JSON payloads (e.g. equipment spreadsheet data)
 * in smaller form to stay under Firestore's 1 MiB document limit.
 * Uses lz-string for browser-safe compress/decompress.
 */

import LZString from 'lz-string';

/**
 * Serialize an object to JSON and compress with LZString.
 * Returns a string suitable for storing in Firestore (encoded URI component form).
 */
export function compressJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decompress a string (from LZString) and parse as JSON.
 * If the string is not compressed (decompress returns null/undefined), parses as plain JSON
 * so that existing uncompressed data still loads.
 */
export function decompressJson<T = unknown>(str: string): T {
  if (str == null || typeof str !== 'string') {
    return undefined as T;
  }
  const decompressed = LZString.decompressFromEncodedURIComponent(str);
  const raw = decompressed != null ? decompressed : str;
  if (raw === '') return undefined as T;
  return JSON.parse(raw) as T;
}
