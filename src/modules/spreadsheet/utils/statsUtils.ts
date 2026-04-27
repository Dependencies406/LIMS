/**
 * Statistical Utilities
 * ISO/IEC Guide 98-3 (GUM) compliant statistical functions
 * 
 * This module provides precision-safe statistical calculations
 * for uncertainty analysis without any UI or database logic.
 */

/**
 * Calculate mean (average) of values
 * GUM 4.2.1
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate mean of empty array');
  }

  const sum = values.reduce((acc, val) => {
    if (!Number.isFinite(val)) {
      throw new Error(`Invalid value in array: ${val}`);
    }
    return acc + val;
  }, 0);

  return sum / values.length;
}

/**
 * Calculate sample standard deviation
 * GUM 4.2.2
 * Uses Bessel's correction (n-1) for sample standard deviation
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) {
    throw new Error('At least 2 values required for standard deviation');
  }

  const mean = calculateMean(values);
  const n = values.length;

  // Calculate sum of squared deviations
  const sumSquaredDeviations = values.reduce((acc, val) => {
    const deviation = val - mean;
    return acc + deviation * deviation;
  }, 0);

  // Sample standard deviation (Bessel's correction)
  const variance = sumSquaredDeviations / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate population standard deviation
 * GUM 4.2.2
 * Uses n (not n-1) for population standard deviation
 */
export function calculatePopulationStandardDeviation(values: number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate standard deviation of empty array');
  }

  const mean = calculateMean(values);
  const n = values.length;

  // Calculate sum of squared deviations
  const sumSquaredDeviations = values.reduce((acc, val) => {
    const deviation = val - mean;
    return acc + deviation * deviation;
  }, 0);

  // Population standard deviation
  const variance = sumSquaredDeviations / n;
  return Math.sqrt(variance);
}

/**
 * Calculate standard uncertainty of the mean (standard error)
 * GUM 4.2.3
 * u(x̄) = s(x) / √n
 */
export function calculateStandardUncertaintyOfMean(values: number[]): number {
  if (values.length < 2) {
    throw new Error('At least 2 values required for standard uncertainty of the mean');
  }

  const standardDeviation = calculateStandardDeviation(values);
  const n = values.length;
  const sqrtN = Math.sqrt(n);

  return standardDeviation / sqrtN;
}

/**
 * Calculate variance
 * GUM 4.2.2
 */
export function calculateVariance(values: number[]): number {
  const stdev = calculateStandardDeviation(values);
  return stdev * stdev;
}

/**
 * Calculate degrees of freedom for Type A uncertainty
 * GUM G.3.1
 * ν = n - 1 for sample standard deviation
 */
export function calculateDegreesOfFreedom(n: number): number {
  if (n < 2) {
    throw new Error('At least 2 measurements required for degrees of freedom');
  }
  return n - 1;
}

/**
 * Calculate effective degrees of freedom using Welch-Satterthwaite formula
 * GUM G.4
 * ν_eff = u_c^4 / Σ(u_i^4 / ν_i)
 */
export function calculateEffectiveDegreesOfFreedom(
  combinedUncertainty: number,
  uncertainties: number[],
  degreesOfFreedom: number[]
): number {
  if (uncertainties.length !== degreesOfFreedom.length) {
    throw new Error('Uncertainties and degrees of freedom arrays must have same length');
  }

  if (combinedUncertainty === 0) {
    // If combined uncertainty is zero, return infinity (large number)
    return Number.MAX_SAFE_INTEGER;
  }

  const uc4 = Math.pow(combinedUncertainty, 4);
  let denominator = 0;

  for (let i = 0; i < uncertainties.length; i++) {
    const ui = uncertainties[i];
    const vi = degreesOfFreedom[i];

    if (vi <= 0) {
      continue; // Skip infinite or invalid degrees of freedom
    }

    const ui4 = Math.pow(ui, 4);
    denominator += ui4 / vi;
  }

  if (denominator === 0) {
    // If denominator is zero, return infinity
    return Number.MAX_SAFE_INTEGER;
  }

  const veff = uc4 / denominator;

  // Round to nearest integer (GUM G.4.2)
  return Math.round(veff);
}

/**
 * Calculate coverage factor from t-distribution
 * GUM G.1.3.6
 * Simplified t-values for common confidence levels and degrees of freedom
 */
export function getCoverageFactor(
  degreesOfFreedom: number,
  confidenceLevel: number = 0.95
): number {
  // For infinite degrees of freedom, use normal distribution
  if (degreesOfFreedom >= 30) {
    if (confidenceLevel === 0.95) return 1.96;
    if (confidenceLevel === 0.99) return 2.58;
    if (confidenceLevel === 0.9973) return 3.00;
    // Approximate for other confidence levels
    return 2.0;
  }

  // t-distribution values for common cases
  // GUM Table G.2
  const tValues: Record<number, Record<number, number>> = {
    0.95: {
      1: 12.71,
      2: 4.30,
      3: 3.18,
      4: 2.78,
      5: 2.57,
      6: 2.45,
      7: 2.36,
      8: 2.31,
      9: 2.26,
      10: 2.23,
      15: 2.13,
      20: 2.09,
      25: 2.06,
      30: 2.04,
    },
    0.99: {
      1: 63.66,
      2: 9.92,
      3: 5.84,
      4: 4.60,
      5: 4.03,
      6: 3.71,
      7: 3.50,
      8: 3.36,
      9: 3.25,
      10: 3.17,
      15: 2.95,
      20: 2.85,
      25: 2.79,
      30: 2.75,
    },
    0.9973: {
      1: 235.8,
      2: 19.21,
      3: 9.22,
      4: 6.62,
      5: 5.51,
      6: 4.90,
      7: 4.53,
      8: 4.28,
      9: 4.09,
      10: 3.96,
      15: 3.61,
      20: 3.42,
      25: 3.31,
      30: 3.23,
    },
  };

  const levelValues = tValues[confidenceLevel];
  if (!levelValues) {
    // Default to k=2 for 95% if level not found
    return confidenceLevel >= 0.95 ? 2.0 : 1.96;
  }

  // Find closest degrees of freedom
  const keys = Object.keys(levelValues)
    .map(Number)
    .sort((a, b) => a - b);

  // If exact match
  if (levelValues[degreesOfFreedom] !== undefined) {
    return levelValues[degreesOfFreedom];
  }

  // Find closest value
  let closest = keys[0];
  for (const key of keys) {
    if (key <= degreesOfFreedom) {
      closest = key;
    } else {
      break;
    }
  }

  // Use closest value or interpolate for better accuracy
  const lower = closest;
  const upper = keys.find(k => k > degreesOfFreedom) || closest;

  if (upper === closest) {
    // Use lower bound
    return levelValues[lower];
  }

  // Linear interpolation
  const tLower = levelValues[lower];
  const tUpper = levelValues[upper];
  const ratio = (degreesOfFreedom - lower) / (upper - lower);
  return tLower + (tUpper - tLower) * ratio;
}

/**
 * Calculate root sum of squares (RSS)
 * GUM 5.1.2
 * u_c = √(Σ u_i²)
 */
export function calculateRootSumOfSquares(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sumOfSquares = values.reduce((acc, val) => {
    if (!Number.isFinite(val) || val < 0) {
      throw new Error(`Invalid value for RSS: ${val}`);
    }
    return acc + val * val;
  }, 0);

  return Math.sqrt(sumOfSquares);
}

/**
 * Calculate root sum of squares with correlations
 * GUM 5.1.2, F.2.2
 * u_c² = Σ u_i² + 2 Σ r(x_i, x_j) u_i u_j
 */
export function calculateRootSumOfSquaresWithCorrelations(
  uncertainties: number[],
  correlations?: Array<{ i: number; j: number; coefficient: number }>
): number {
  if (uncertainties.length === 0) {
    return 0;
  }

  // Sum of squares
  let sumOfSquares = 0;
  for (const u of uncertainties) {
    if (!Number.isFinite(u) || u < 0) {
      throw new Error(`Invalid uncertainty value: ${u}`);
    }
    sumOfSquares += u * u;
  }

  // Correlation terms
  if (correlations && correlations.length > 0) {
    for (const corr of correlations) {
      const i = corr.i;
      const j = corr.j;

      if (i < 0 || i >= uncertainties.length || j < 0 || j >= uncertainties.length) {
        throw new Error(`Invalid correlation indices: ${i}, ${j}`);
      }

      if (corr.coefficient < -1 || corr.coefficient > 1) {
        throw new Error(`Invalid correlation coefficient: ${corr.coefficient}`);
      }

      const ui = uncertainties[i];
      const uj = uncertainties[j];
      const correlationTerm = 2 * corr.coefficient * ui * uj;
      sumOfSquares += correlationTerm;
    }
  }

  return Math.sqrt(sumOfSquares);
}

/**
 * Round to significant figures
 * GUM 7.2.6
 */
export function roundToSignificantFigures(value: number, significantFigures: number): number {
  if (value === 0) return 0;
  if (!Number.isFinite(value)) return value;

  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, significantFigures - magnitude - 1);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate relative uncertainty
 * GUM 5.1.6
 * u_rel = u / |x|
 */
export function calculateRelativeUncertainty(
  uncertainty: number,
  value: number
): number {
  if (value === 0) {
    throw new Error('Cannot calculate relative uncertainty when value is zero');
  }
  return Math.abs(uncertainty / value);
}

/**
 * Calculate percentage uncertainty
 * GUM 5.1.6
 * u_percent = (u / |x|) × 100
 */
export function calculatePercentageUncertainty(
  uncertainty: number,
  value: number
): number {
  return calculateRelativeUncertainty(uncertainty, value) * 100;
}

