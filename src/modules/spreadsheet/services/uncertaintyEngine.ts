/**
 * Uncertainty Engine
 * ISO/IEC Guide 98-3 (GUM) compliant uncertainty calculations
 * 
 * This module provides Type A and Type B uncertainty calculations,
 * combined uncertainty, and expanded uncertainty following GUM methodology.
 * 
 * References:
 * - ISO/IEC Guide 98-3:2008 (GUM)
 * - ISO/IEC Guide 98-3:2008/Suppl.1:2008 (Monte Carlo)
 * - ISO/IEC Guide 98-3:2008/Suppl.2:2011 (Propagation)
 */

import type {
  TypeAUncertainty,
  TypeBUncertainty,
  DistributionType,
} from '../models/UncertaintyModel';
import {
  calculateMean,
  calculateStandardDeviation,
  calculateStandardUncertaintyOfMean,
  calculateDegreesOfFreedom,
  calculateEffectiveDegreesOfFreedom,
  getCoverageFactor,
  calculateRootSumOfSquares,
  calculateRootSumOfSquaresWithCorrelations,
} from '../utils/statsUtils';

/**
 * Type A uncertainty calculation result
 */
export interface TypeAResult {
  /** Mean of measurements */
  mean: number;
  /** Sample standard deviation */
  standardDeviation: number;
  /** Standard uncertainty of the mean */
  standardUncertainty: number;
  /** Degrees of freedom */
  degreesOfFreedom: number;
  /** Number of measurements */
  count: number;
}

/**
 * Type B uncertainty calculation parameters
 */
export interface TypeBParameters {
  /** Distribution type */
  distribution: DistributionType;
  /** Half-width (for rectangular/triangular) or standard deviation (for normal) */
  halfWidth?: number;
  /** Standard deviation (for normal distribution) */
  standardDeviation?: number;
  /** Coverage factor from certificate (for certificate uncertainty) */
  coverageFactor?: number;
  /** Expanded uncertainty from certificate */
  expandedUncertainty?: number;
  /** Resolution (for resolution uncertainty) */
  resolution?: number;
  /** Confidence level (for normal distribution) */
  confidenceLevel?: number;
}

/**
 * Type B uncertainty calculation result
 */
export interface TypeBResult {
  /** Standard uncertainty */
  standardUncertainty: number;
  /** Divisor used */
  divisor: number;
  /** Distribution type */
  distribution: DistributionType;
}

/**
 * Combined uncertainty calculation result
 */
export interface CombinedUncertaintyResult {
  /** Combined standard uncertainty */
  combinedUncertainty: number;
  /** Effective degrees of freedom */
  effectiveDegreesOfFreedom: number;
  /** Individual uncertainty contributions */
  contributions: number[];
}

/**
 * Expanded uncertainty calculation result
 */
export interface ExpandedUncertaintyResult {
  /** Expanded uncertainty */
  expandedUncertainty: number;
  /** Coverage factor used */
  coverageFactor: number;
  /** Confidence level */
  confidenceLevel: number;
  /** Combined standard uncertainty */
  combinedUncertainty: number;
}

/**
 * Calculate Type A uncertainty
 * GUM 4.2
 * 
 * Type A evaluation is based on statistical analysis of series of observations.
 * Standard uncertainty is the standard deviation of the mean.
 * 
 * @param values Array of measured values
 * @param name Optional name for the uncertainty component
 * @returns Type A uncertainty result
 */
export function calculateTypeA(
  values: number[],
  _name: string = 'Type A'
): TypeAResult {
  if (values.length < 2) {
    throw new Error('At least 2 measurements required for Type A uncertainty');
  }

  // Validate all values are finite
  for (const val of values) {
    if (!Number.isFinite(val)) {
      throw new Error(`Invalid measurement value: ${val}`);
    }
  }

  // Calculate mean
  const mean = calculateMean(values);

  // Calculate sample standard deviation
  const standardDeviation = calculateStandardDeviation(values);

  // Calculate standard uncertainty of the mean
  // GUM 4.2.3: u(x̄) = s(x) / √n
  const standardUncertainty = calculateStandardUncertaintyOfMean(values);

  // Calculate degrees of freedom
  // GUM G.3.1: ν = n - 1
  const degreesOfFreedom = calculateDegreesOfFreedom(values.length);

  return {
    mean,
    standardDeviation,
    standardUncertainty,
    degreesOfFreedom,
    count: values.length,
  };
}

/**
 * Calculate Type B uncertainty
 * GUM 4.3
 * 
 * Type B evaluation is based on means other than statistical analysis.
 * Common distributions:
 * - Rectangular: u = a / √3
 * - Triangular: u = a / √6
 * - Normal: u = U / k
 * 
 * @param parameters Type B uncertainty parameters
 * @param name Optional name for the uncertainty component
 * @returns Type B uncertainty result
 */
export function calculateTypeB(
  parameters: TypeBParameters,
  _name: string = 'Type B'
): TypeBResult {
  const { distribution } = parameters;

  let standardUncertainty: number;
  let divisor: number;

  switch (distribution) {
    case 'rectangular': {
      // GUM 4.3.7: Rectangular distribution
      // u = a / √3
      // where a is the half-width
      if (parameters.halfWidth === undefined || parameters.halfWidth <= 0) {
        throw new Error('Half-width is required and must be positive for rectangular distribution');
      }
      divisor = Math.sqrt(3);
      standardUncertainty = parameters.halfWidth / divisor;
      break;
    }

    case 'triangular': {
      // GUM 4.3.9: Triangular distribution
      // u = a / √6
      if (parameters.halfWidth === undefined || parameters.halfWidth <= 0) {
        throw new Error('Half-width is required and must be positive for triangular distribution');
      }
      divisor = Math.sqrt(6);
      standardUncertainty = parameters.halfWidth / divisor;
      break;
    }

    case 'normal': {
      // GUM 4.3.5: Normal distribution
      // u = U / k (if expanded uncertainty given)
      // or u = σ (if standard deviation given)
      if (parameters.expandedUncertainty !== undefined && parameters.coverageFactor !== undefined) {
        // From certificate with expanded uncertainty
        if (parameters.expandedUncertainty <= 0) {
          throw new Error('Expanded uncertainty must be positive');
        }
        if (parameters.coverageFactor <= 0) {
          throw new Error('Coverage factor must be positive');
        }
        divisor = parameters.coverageFactor;
        standardUncertainty = parameters.expandedUncertainty / divisor;
      } else if (parameters.standardDeviation !== undefined) {
        // Direct standard deviation
        if (parameters.standardDeviation <= 0) {
          throw new Error('Standard deviation must be positive');
        }
        divisor = 1;
        standardUncertainty = parameters.standardDeviation;
      } else if (parameters.halfWidth !== undefined && parameters.confidenceLevel !== undefined) {
        // Half-width with confidence level (approximate normal)
        // For 95% confidence: k ≈ 2, so u ≈ a / 2
        if (parameters.halfWidth <= 0) {
          throw new Error('Half-width must be positive');
        }
        const k = parameters.confidenceLevel >= 0.95 ? 2.0 : 1.96;
        divisor = k;
        standardUncertainty = parameters.halfWidth / divisor;
      } else {
        throw new Error(
          'For normal distribution, provide either (expandedUncertainty + coverageFactor) or standardDeviation'
        );
      }
      break;
    }

    case 'u-shaped': {
      // GUM 4.3.8: U-shaped distribution
      // u = a / √2
      if (parameters.halfWidth === undefined || parameters.halfWidth <= 0) {
        throw new Error('Half-width is required and must be positive for U-shaped distribution');
      }
      divisor = Math.sqrt(2);
      standardUncertainty = parameters.halfWidth / divisor;
      break;
    }

    default: {
      // Certificate uncertainty (most common Type B)
      // GUM 4.3.5: u = U / k
      if (parameters.expandedUncertainty !== undefined && parameters.coverageFactor !== undefined) {
        if (parameters.expandedUncertainty <= 0) {
          throw new Error('Expanded uncertainty must be positive');
        }
        if (parameters.coverageFactor <= 0) {
          throw new Error('Coverage factor must be positive');
        }
        divisor = parameters.coverageFactor;
        standardUncertainty = parameters.expandedUncertainty / divisor;
      } else if (parameters.resolution !== undefined) {
        // Resolution uncertainty (rectangular distribution)
        // GUM F.2.2.1: u = resolution / (2√3)
        if (parameters.resolution <= 0) {
          throw new Error('Resolution must be positive');
        }
        divisor = 2 * Math.sqrt(3);
        standardUncertainty = parameters.resolution / divisor;
      } else {
        throw new Error(
          'Invalid Type B parameters. Provide either certificate uncertainty (expandedUncertainty + coverageFactor) or resolution'
        );
      }
      break;
    }
  }

  // Validate result
  if (!Number.isFinite(standardUncertainty) || standardUncertainty < 0) {
    throw new Error(`Invalid calculated standard uncertainty: ${standardUncertainty}`);
  }

  return {
    standardUncertainty,
    divisor,
    distribution,
  };
}

/**
 * Calculate certificate uncertainty (convenience function)
 * GUM 4.3.5
 * 
 * @param expandedUncertainty Expanded uncertainty from certificate
 * @param coverageFactor Coverage factor (k) from certificate
 * @returns Type B uncertainty result
 */
export function calculateCertificateUncertainty(
  expandedUncertainty: number,
  coverageFactor: number
): TypeBResult {
  return calculateTypeB({
    distribution: 'normal',
    expandedUncertainty,
    coverageFactor,
  }, 'Certificate Uncertainty');
}

/**
 * Calculate resolution uncertainty (convenience function)
 * GUM F.2.2.1
 * 
 * @param resolution Resolution of instrument
 * @returns Type B uncertainty result
 */
export function calculateResolutionUncertainty(resolution: number): TypeBResult {
  return calculateTypeB({
    distribution: 'rectangular',
    halfWidth: resolution / 2, // Half-width is resolution/2
  }, 'Resolution Uncertainty');
}

/**
 * Calculate combined standard uncertainty
 * GUM 5.1.2
 * 
 * Combined uncertainty using root sum of squares (RSS):
 * u_c = √(Σ u_i²)
 * 
 * @param typeAComponents Type A uncertainty components
 * @param typeBComponents Type B uncertainty components
 * @param correlations Optional correlations between components
 * @returns Combined uncertainty result
 */
export function calculateCombinedUncertainty(
  typeAComponents: TypeAUncertainty[],
  typeBComponents: TypeBUncertainty[],
  correlations?: Array<{ component1Id: string; component2Id: string; coefficient: number }>
): CombinedUncertaintyResult {
  // Collect all standard uncertainties
  const uncertainties: number[] = [];
  const degreesOfFreedom: number[] = [];

  // Add Type A components
  for (const component of typeAComponents) {
    if (!Number.isFinite(component.standardUncertainty) || component.standardUncertainty < 0) {
      throw new Error(`Invalid Type A uncertainty: ${component.standardUncertainty}`);
    }
    uncertainties.push(component.standardUncertainty);
    degreesOfFreedom.push(component.degreesOfFreedom);
  }

  // Add Type B components (infinite degrees of freedom)
  for (const component of typeBComponents) {
    if (!Number.isFinite(component.standardUncertainty) || component.standardUncertainty < 0) {
      throw new Error(`Invalid Type B uncertainty: ${component.standardUncertainty}`);
    }
    uncertainties.push(component.standardUncertainty);
    degreesOfFreedom.push(Number.MAX_SAFE_INTEGER); // Type B has infinite degrees of freedom
  }

  if (uncertainties.length === 0) {
    return {
      combinedUncertainty: 0,
      effectiveDegreesOfFreedom: Number.MAX_SAFE_INTEGER,
      contributions: [],
    };
  }

  // Calculate combined uncertainty
  let combinedUncertainty: number;

  if (correlations && correlations.length > 0) {
    // With correlations
    const correlationArray = correlations.map(corr => {
      // Find indices of components
      let i = -1;
      let j = -1;

      // Search in Type A
      for (let idx = 0; idx < typeAComponents.length; idx++) {
        if (typeAComponents[idx].id === corr.component1Id) i = idx;
        if (typeAComponents[idx].id === corr.component2Id) j = idx;
      }

      // Search in Type B (offset by Type A length)
      if (i === -1 || j === -1) {
        for (let idx = 0; idx < typeBComponents.length; idx++) {
          if (typeBComponents[idx].id === corr.component1Id) i = typeAComponents.length + idx;
          if (typeBComponents[idx].id === corr.component2Id) j = typeAComponents.length + idx;
        }
      }

      if (i === -1 || j === -1) {
        throw new Error(`Correlation component not found: ${corr.component1Id} or ${corr.component2Id}`);
      }

      return { i, j, coefficient: corr.coefficient };
    });

    combinedUncertainty = calculateRootSumOfSquaresWithCorrelations(uncertainties, correlationArray);
  } else {
    // Without correlations (simple RSS)
    combinedUncertainty = calculateRootSumOfSquares(uncertainties);
  }

  // Calculate effective degrees of freedom (Welch-Satterthwaite)
  // GUM G.4
  const effectiveDegreesOfFreedom = calculateEffectiveDegreesOfFreedom(
    combinedUncertainty,
    uncertainties,
    degreesOfFreedom
  );

  return {
    combinedUncertainty,
    effectiveDegreesOfFreedom,
    contributions: [...uncertainties],
  };
}

/**
 * Calculate expanded uncertainty
 * GUM 6.2.1
 * 
 * Expanded uncertainty: U = k × u_c
 * where k is the coverage factor
 * 
 * @param combinedUncertainty Combined standard uncertainty
 * @param confidenceLevel Confidence level (default 0.95 for 95%)
 * @param effectiveDegreesOfFreedom Effective degrees of freedom
 * @param coverageFactor Optional explicit coverage factor (overrides calculation)
 * @returns Expanded uncertainty result
 */
export function calculateExpandedUncertainty(
  combinedUncertainty: number,
  confidenceLevel: number = 0.95,
  effectiveDegreesOfFreedom: number = Number.MAX_SAFE_INTEGER,
  coverageFactor?: number
): ExpandedUncertaintyResult {
  if (combinedUncertainty < 0 || !Number.isFinite(combinedUncertainty)) {
    throw new Error(`Invalid combined uncertainty: ${combinedUncertainty}`);
  }

  if (confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error(`Invalid confidence level: ${confidenceLevel}. Must be between 0 and 1`);
  }

  // Get coverage factor
  let k: number;
  if (coverageFactor !== undefined) {
    if (coverageFactor <= 0 || !Number.isFinite(coverageFactor)) {
      throw new Error(`Invalid coverage factor: ${coverageFactor}`);
    }
    k = coverageFactor;
  } else {
    // Calculate from t-distribution
    // Default k = 2 for 95% confidence (GUM 6.2.2)
    k = getCoverageFactor(effectiveDegreesOfFreedom, confidenceLevel);
  }

  // Calculate expanded uncertainty
  // GUM 6.2.1: U = k × u_c
  const expandedUncertainty = k * combinedUncertainty;

  // Validate result
  if (!Number.isFinite(expandedUncertainty) || expandedUncertainty < 0) {
    throw new Error(`Invalid expanded uncertainty: ${expandedUncertainty}`);
  }

  return {
    expandedUncertainty,
    coverageFactor: k,
    confidenceLevel,
    combinedUncertainty,
  };
}

/**
 * Calculate complete uncertainty analysis
 * Convenience function that combines all calculations
 * 
 * @param typeAComponents Type A uncertainty components
 * @param typeBComponents Type B uncertainty components
 * @param confidenceLevel Confidence level (default 0.95)
 * @param correlations Optional correlations
 * @returns Complete uncertainty analysis result
 */
export function calculateCompleteUncertainty(
  typeAComponents: TypeAUncertainty[],
  typeBComponents: TypeBUncertainty[],
  confidenceLevel: number = 0.95,
  correlations?: Array<{ component1Id: string; component2Id: string; coefficient: number }>
): {
  combined: CombinedUncertaintyResult;
  expanded: ExpandedUncertaintyResult;
} {
  const combined = calculateCombinedUncertainty(typeAComponents, typeBComponents, correlations);
  const expanded = calculateExpandedUncertainty(
    combined.combinedUncertainty,
    confidenceLevel,
    combined.effectiveDegreesOfFreedom
  );

  return {
    combined,
    expanded,
  };
}

