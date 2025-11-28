/**
 * useDebouncedPreview Hook
 * Debounces a value for preview purposes (e.g., PDF preview generation)
 */

import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value
 * @param value Value to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced value
 */
export function useDebouncedPreview<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

