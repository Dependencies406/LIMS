/**
 * Parse calibration point string into array of numbers
 * @param input - String like "0, 10, 20.5, 100"
 * @returns Array of parsed numbers or null if invalid
 */
export function parseCalibrationPoints(input: string): number[] | null {
  if (!input || !input.trim()) {
    return null;
  }

  // Split by comma and trim whitespace
  const parts = input.split(',').map(p => p.trim()).filter(p => p.length > 0);
  
  if (parts.length === 0) {
    return null;
  }

  // Check for double commas or empty values
  if (input.includes(',,') || parts.some(p => p === '')) {
    return null;
  }

  // Parse each part as number
  const numbers: number[] = [];
  for (const part of parts) {
    // Allow only numbers (including decimals and scientific notation)
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(part)) {
      return null; // Invalid token found
    }
    
    const num = parseFloat(part);
    if (isNaN(num)) {
      return null;
    }
    numbers.push(num);
  }

  return numbers.length > 0 ? numbers : null;
}

/**
 * Validate calibration point input
 * @param input - String input
 * @returns Validation result with error message if invalid
 */
export function validateCalibrationPoints(input: string): { isValid: boolean; error?: string } {
  if (!input || !input.trim()) {
    return { isValid: false, error: 'At least one calibration point is required' };
  }

  const parsed = parseCalibrationPoints(input);
  if (!parsed) {
    return { isValid: false, error: 'Invalid format. Use numbers separated by commas (e.g., "0, 10, 20, 100")' };
  }

  if (parsed.length === 0) {
    return { isValid: false, error: 'At least one calibration point is required' };
  }

  return { isValid: true };
}
