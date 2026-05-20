/**
 * Uncertainty Model
 * Core data structures for ISO/IEC 17025 compliant measurement uncertainty
 * 
 * This module defines data models for Type A and Type B uncertainty,
 * combined uncertainty, and expanded uncertainty calculations
 * without any UI or database logic.
 * 
 * Aligned with ISO/IEC Guide 98-3 (GUM) and ISO 17025 requirements.
 */

/**
 * Uncertainty status
 */
export type UncertaintyStatus = 'draft' | 'calculated' | 'verified' | 'approved';

/**
 * Type A uncertainty source
 * Statistical evaluation of series of observations
 */
export interface TypeAUncertainty {
  /** Unique identifier */
  id: string;
  /** Source name or description */
  name: string;
  /** Measured values used for calculation */
  values: number[];
  /** Number of measurements */
  count: number;
  /** Mean (average) of values */
  mean: number;
  /** Standard deviation */
  stdev: number;
  /** Standard uncertainty (standard deviation of the mean) */
  standardUncertainty: number;
  /** Degrees of freedom */
  degreesOfFreedom: number;
  /** ISO 17025: Measurement method used */
  method?: string;
  /** ISO 17025: Reference to procedure */
  procedureReference?: string;
  /** Notes */
  notes?: string;
}

/**
 * Probability distribution type for Type B uncertainty
 */
export type DistributionType = 
  | 'normal' 
  | 'rectangular' 
  | 'triangular' 
  | 'u-shaped' 
  | 'trapezoidal'
  | 'custom';

/**
 * Type B uncertainty source
 * Evaluation by means other than statistical analysis
 */
export interface TypeBUncertainty {
  /** Unique identifier */
  id: string;
  /** Source name or description */
  name: string;
  /** Source of uncertainty (e.g., "Calibration certificate", "Manufacturer specification") */
  source: string;
  /** Probability distribution type */
  distribution: DistributionType;
  /** Half-width of distribution (for rectangular/triangular) or standard deviation (for normal) */
  halfWidth?: number;
  /** Divisor for converting to standard uncertainty */
  divisor: number;
  /** Standard uncertainty (halfWidth / divisor) */
  standardUncertainty: number;
  /** ISO 17025: Reference to source document */
  reference?: string;
  /** ISO 17025: Certificate number or document ID */
  certificateNumber?: string;
  /** Confidence level (if applicable, e.g., 0.95 for 95%) */
  confidenceLevel?: number;
  /** Coverage factor from source (if applicable) */
  sourceCoverageFactor?: number;
  /** Notes */
  notes?: string;
}

/**
 * Correlation between uncertainty components
 */
export interface UncertaintyCorrelation {
  /** First uncertainty component ID */
  component1Id: string;
  /** Second uncertainty component ID */
  component2Id: string;
  /** Correlation coefficient (-1 to 1) */
  coefficient: number;
  /** Description of correlation */
  description?: string;
}

/**
 * Main Uncertainty model
 * Represents complete uncertainty analysis with ISO 17025 compliance
 */
export interface UncertaintyModel {
  /** Unique uncertainty identifier */
  id: string;
  /** Uncertainty name or description */
  name: string;
  /** Current status */
  status: UncertaintyStatus;
  
  /** Type A uncertainty components */
  typeA: TypeAUncertainty[];
  
  /** Type B uncertainty components */
  typeB: TypeBUncertainty[];
  
  /** Combined standard uncertainty */
  combinedUncertainty: number;
  
  /** Effective degrees of freedom (Welch-Satterthwaite formula) */
  effectiveDegreesOfFreedom?: number;
  
  /** Coverage factor (k) */
  coverageFactor: number;
  
  /** Expanded uncertainty (combinedUncertainty * coverageFactor) */
  expandedUncertainty: number;
  
  /** Confidence level (e.g., 0.95 for 95%) */
  confidenceLevel: number;
  
  /** Unit of measurement */
  unit: string;
  
  /** ISO 17025: Measurement method reference */
  methodReference?: string;
  
  /** ISO 17025: Procedure reference */
  procedureReference?: string;
  
  /** Correlations between components (if applicable) */
  correlations?: UncertaintyCorrelation[];
  
  /** Uncertainty budget (detailed breakdown) */
  uncertaintyBudget?: UncertaintyBudgetItem[];
  
  /** Notes or comments */
  notes?: string;
  
  /** Creation metadata */
  createdBy: string;
  createdAt: Date;
  
  /** Last modification metadata */
  updatedBy?: string;
  updatedAt?: Date;
  
  /** ISO 17025: Review and approval */
  reviewedBy?: string;
  reviewedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

/**
 * Uncertainty budget item
 * Detailed breakdown of uncertainty contributions
 */
export interface UncertaintyBudgetItem {
  /** Item identifier */
  id: string;
  /** Component name */
  name: string;
  /** Uncertainty type (A or B) */
  type: 'A' | 'B';
  /** Standard uncertainty value */
  standardUncertainty: number;
  /** Sensitivity coefficient (if applicable) */
  sensitivityCoefficient?: number;
  /** Contribution to combined uncertainty */
  contribution: number;
  /** Percentage contribution */
  percentageContribution: number;
  /** Reference to Type A or Type B component */
  componentId: string;
}

/**
 * Uncertainty calculation result
 */
export interface UncertaintyCalculationResult {
  /** Combined standard uncertainty */
  combinedUncertainty: number;
  /** Effective degrees of freedom */
  effectiveDegreesOfFreedom: number;
  /** Coverage factor */
  coverageFactor: number;
  /** Expanded uncertainty */
  expandedUncertainty: number;
  /** Uncertainty budget */
  budget: UncertaintyBudgetItem[];
  /** Calculation method used */
  method: 'simple' | 'welch-satterthwaite' | 'monte-carlo';
}

/**
 * Helper function to calculate standard uncertainty from Type A
 */
export function calculateTypeAUncertainty(
  values: number[],
  name: string = 'Type A'
): TypeAUncertainty {
  if (values.length < 2) {
    throw new Error('At least 2 values required for Type A uncertainty');
  }
  
  const count = values.length;
  const mean = values.reduce((sum, val) => sum + val, 0) / count;
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (count - 1);
  const stdev = Math.sqrt(variance);
  const standardUncertainty = stdev / Math.sqrt(count);
  const degreesOfFreedom = count - 1;
  
  return {
    id: `typea-${Date.now()}`,
    name,
    values,
    count,
    mean,
    stdev,
    standardUncertainty,
    degreesOfFreedom,
  };
}

/**
 * Helper function to calculate standard uncertainty from Type B
 */
export function calculateTypeBUncertainty(
  name: string,
  source: string,
  distribution: DistributionType,
  halfWidth: number,
  reference?: string
): TypeBUncertainty {
  let divisor: number;
  
  switch (distribution) {
    case 'normal':
      divisor = 1; // Already standard deviation
      break;
    case 'rectangular':
      divisor = Math.sqrt(3); // a / sqrt(3)
      break;
    case 'triangular':
      divisor = Math.sqrt(6); // a / sqrt(6)
      break;
    case 'u-shaped':
      divisor = Math.sqrt(2); // a / sqrt(2)
      break;
    case 'trapezoidal':
      divisor = Math.sqrt(6); // Approximate for symmetric trapezoidal
      break;
    default:
      divisor = Math.sqrt(3); // Default to rectangular
  }
  
  const standardUncertainty = halfWidth / divisor;
  
  return {
    id: `typeb-${Date.now()}`,
    name,
    source,
    distribution,
    halfWidth,
    divisor,
    standardUncertainty,
    reference,
  };
}

/**
 * Helper function to calculate combined uncertainty
 * Uses root sum of squares (RSS) method
 */
export function calculateCombinedUncertainty(
  typeAComponents: TypeAUncertainty[],
  typeBComponents: TypeBUncertainty[],
  correlations?: UncertaintyCorrelation[]
): number {
  // Sum of squares of standard uncertainties
  let sumOfSquares = 0;
  
  // Add Type A contributions
  for (const component of typeAComponents) {
    sumOfSquares += Math.pow(component.standardUncertainty, 2);
  }
  
  // Add Type B contributions
  for (const component of typeBComponents) {
    sumOfSquares += Math.pow(component.standardUncertainty, 2);
  }
  
  // Add correlation terms if provided
  if (correlations && correlations.length > 0) {
    for (const correlation of correlations) {
      const comp1 = [...typeAComponents, ...typeBComponents].find(c => c.id === correlation.component1Id);
      const comp2 = [...typeAComponents, ...typeBComponents].find(c => c.id === correlation.component2Id);
      
      if (comp1 && comp2) {
        const correlationTerm = 2 * correlation.coefficient * comp1.standardUncertainty * comp2.standardUncertainty;
        sumOfSquares += correlationTerm;
      }
    }
  }
  
  return Math.sqrt(sumOfSquares);
}

/**
 * Helper function to calculate effective degrees of freedom (Welch-Satterthwaite)
 */
export function calculateEffectiveDegreesOfFreedom(
  combinedUncertainty: number,
  typeAComponents: TypeAUncertainty[],
  _typeBComponents: TypeBUncertainty[]
): number {
  if (typeAComponents.length === 0) {
    // If no Type A components, return infinity (large number)
    return 1000;
  }
  
  let numerator = Math.pow(combinedUncertainty, 4);
  let denominator = 0;
  
  // Only Type A components contribute to degrees of freedom
  for (const component of typeAComponents) {
    const contribution = Math.pow(component.standardUncertainty, 4) / component.degreesOfFreedom;
    denominator += contribution;
  }
  
  if (denominator === 0) {
    return 1000; // Default to large number
  }
  
  return numerator / denominator;
}

/**
 * Helper function to get coverage factor from t-distribution
 * Simplified version - in practice, use proper t-distribution table
 */
export function getCoverageFactor(
  degreesOfFreedom: number,
  confidenceLevel: number = 0.95
): number {
  // Simplified t-distribution values for common cases
  // For production, use proper statistical library
  
  if (degreesOfFreedom >= 30) {
    // Approximate with normal distribution
    if (confidenceLevel === 0.95) return 1.96;
    if (confidenceLevel === 0.99) return 2.58;
    if (confidenceLevel === 0.9973) return 3.00;
  }
  
  // Simplified t-values for smaller degrees of freedom
  const tValues: Record<number, Record<number, number>> = {
    0.95: {
      1: 12.71,
      2: 4.30,
      3: 3.18,
      4: 2.78,
      5: 2.57,
      10: 2.23,
      20: 2.09,
      30: 2.04,
    },
    0.99: {
      1: 63.66,
      2: 9.92,
      3: 5.84,
      4: 4.60,
      5: 4.03,
      10: 3.17,
      20: 2.85,
      30: 2.75,
    },
  };
  
  const levelValues = tValues[confidenceLevel];
  if (!levelValues) {
    return 2.0; // Default
  }
  
  // Find closest degrees of freedom
  const keys = Object.keys(levelValues).map(Number).sort((a, b) => a - b);
  const closest = keys.reduce((prev, curr) => 
    Math.abs(curr - degreesOfFreedom) < Math.abs(prev - degreesOfFreedom) ? curr : prev
  );
  
  return levelValues[closest] || 2.0;
}

/**
 * Helper function to calculate uncertainty budget
 */
export function calculateUncertaintyBudget(
  combinedUncertainty: number,
  typeAComponents: TypeAUncertainty[],
  typeBComponents: TypeBUncertainty[]
): UncertaintyBudgetItem[] {
  const budget: UncertaintyBudgetItem[] = [];
  
  // Add Type A components
  for (const component of typeAComponents) {
    const contribution = Math.pow(component.standardUncertainty, 2);
    const percentage = (contribution / Math.pow(combinedUncertainty, 2)) * 100;
    
    budget.push({
      id: `budget-${component.id}`,
      name: component.name,
      type: 'A',
      standardUncertainty: component.standardUncertainty,
      contribution: Math.sqrt(contribution),
      percentageContribution: percentage,
      componentId: component.id,
    });
  }
  
  // Add Type B components
  for (const component of typeBComponents) {
    const contribution = Math.pow(component.standardUncertainty, 2);
    const percentage = (contribution / Math.pow(combinedUncertainty, 2)) * 100;
    
    budget.push({
      id: `budget-${component.id}`,
      name: component.name,
      type: 'B',
      standardUncertainty: component.standardUncertainty,
      contribution: Math.sqrt(contribution),
      percentageContribution: percentage,
      componentId: component.id,
    });
  }
  
  return budget;
}

/**
 * Helper function to create complete uncertainty model
 */
export function createUncertaintyModel(
  id: string,
  name: string,
  typeA: TypeAUncertainty[],
  typeB: TypeBUncertainty[],
  unit: string,
  confidenceLevel: number = 0.95,
  createdBy: string,
  correlations?: UncertaintyCorrelation[]
): UncertaintyModel {
  const combinedUncertainty = calculateCombinedUncertainty(typeA, typeB, correlations);
  const effectiveDegreesOfFreedom = calculateEffectiveDegreesOfFreedom(combinedUncertainty, typeA, typeB);
  const coverageFactor = getCoverageFactor(effectiveDegreesOfFreedom, confidenceLevel);
  const expandedUncertainty = combinedUncertainty * coverageFactor;
  const uncertaintyBudget = calculateUncertaintyBudget(combinedUncertainty, typeA, typeB);
  
  return {
    id,
    name,
    status: 'calculated',
    typeA,
    typeB,
    combinedUncertainty,
    effectiveDegreesOfFreedom,
    coverageFactor,
    expandedUncertainty,
    confidenceLevel,
    unit,
    correlations,
    uncertaintyBudget,
    createdBy,
    createdAt: new Date(),
  };
}


