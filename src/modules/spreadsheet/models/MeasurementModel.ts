/**
 * Measurement Model
 * Core data structures for ISO/IEC 17025 compliant measurement data
 * 
 * This module defines data models for measurement values, corrections,
 * and traceability without any UI or database logic.
 */

/**
 * Measurement status
 */
export type MeasurementStatus = 'pending' | 'in-progress' | 'completed' | 'rejected' | 'corrected';

/**
 * Measurement type/category
 */
export type MeasurementType = 
  | 'mass' 
  | 'length' 
  | 'temperature' 
  | 'pressure' 
  | 'voltage' 
  | 'current' 
  | 'resistance' 
  | 'frequency' 
  | 'time' 
  | 'volume' 
  | 'flow' 
  | 'humidity' 
  | 'other';

/**
 * Statistical measure type
 */
export type StatisticalMeasure = 'mean' | 'median' | 'mode' | 'min' | 'max' | 'range' | 'stdev' | 'variance';

/**
 * Raw measurement value with metadata
 */
export interface RawMeasurementValue {
  /** Unique identifier for this raw value */
  id: string;
  /** Measured value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Timestamp when measurement was taken */
  timestamp: Date;
  /** Operator who performed measurement */
  operatorId: string;
  /** Instrument used for measurement */
  instrumentId: string;
  /** Reading number (sequence in series) */
  readingNumber: number;
  /** Environmental conditions at time of measurement */
  environmentalConditions?: EnvironmentalConditions;
  /** Whether this reading was rejected (outlier) */
  isRejected?: boolean;
  /** Reason for rejection (if applicable) */
  rejectionReason?: string;
  /** Notes or observations */
  notes?: string;
}

/**
 * Environmental conditions during measurement
 */
export interface EnvironmentalConditions {
  /** Temperature in degrees Celsius */
  temperature?: number;
  /** Relative humidity in percent */
  relativeHumidity?: number;
  /** Atmospheric pressure in hPa */
  atmosphericPressure?: number;
  /** Other environmental factors */
  other?: Record<string, number>;
  /** Timestamp of environmental reading */
  timestamp?: Date;
}

/**
 * Correction factor or adjustment
 */
export interface Correction {
  /** Correction identifier */
  id: string;
  /** Correction type */
  type: 'calibration' | 'environmental' | 'systematic' | 'drift' | 'other';
  /** Correction value */
  value: number;
  /** Unit of correction */
  unit: string;
  /** Source of correction (e.g., calibration certificate) */
  source: string;
  /** ISO 17025: Reference to calibration certificate or method */
  reference?: string;
  /** Uncertainty of correction */
  uncertainty?: number;
  /** Date when correction was applied */
  appliedAt: Date;
  /** User who applied correction */
  appliedBy: string;
  /** Description of correction */
  description?: string;
}

/**
 * Statistical analysis of measurements
 */
export interface StatisticalAnalysis {
  /** Number of measurements */
  count: number;
  /** Mean (average) value */
  mean: number;
  /** Median value */
  median?: number;
  /** Mode value */
  mode?: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Range (max - min) */
  range: number;
  /** Standard deviation */
  standardDeviation: number;
  /** Variance */
  variance: number;
  /** Standard error of the mean */
  standardError?: number;
  /** Coefficient of variation (relative standard deviation) */
  coefficientOfVariation?: number;
  /** Confidence interval (if applicable) */
  confidenceInterval?: {
    level: number; // e.g., 0.95 for 95%
    lower: number;
    upper: number;
  };
}

/**
 * Main Measurement model
 * Represents a complete measurement with ISO 17025 traceability
 */
export interface MeasurementModel {
  /** Unique measurement identifier */
  id: string;
  /** Measurement name or description */
  name: string;
  /** Measurement type */
  type: MeasurementType;
  /** Current status */
  status: MeasurementStatus;
  
  /** Raw measurement values */
  rawValues: RawMeasurementValue[];
  
  /** Corrected value (after applying corrections) */
  correctedValue?: number;
  
  /** Average value (statistical mean) */
  averageValue: number;
  
  /** Unit of measurement */
  unit: string;
  
  /** Instrument used for measurement */
  instrumentId: string;
  /** Instrument name (for display) */
  instrumentName?: string;
  /** Instrument serial number */
  instrumentSerialNumber?: string;
  /** ISO 17025: Calibration certificate reference */
  instrumentCalibrationRef?: string;
  /** Calibration due date */
  instrumentCalibrationDue?: Date;
  
  /** Operator who performed measurement */
  operatorId: string;
  /** Operator name (for display) */
  operatorName?: string;
  
  /** Timestamp when measurement was completed */
  timestamp: Date;
  
  /** Corrections applied to raw values */
  corrections?: Correction[];
  
  /** Statistical analysis */
  statistics?: StatisticalAnalysis;
  
  /** ISO 17025: Measurement method reference */
  methodReference?: string;
  /** ISO 17025: Procedure reference */
  procedureReference?: string;
  
  /** Environmental conditions (if applicable) */
  environmentalConditions?: EnvironmentalConditions;
  
  /** ISO 17025: Traceability chain */
  traceability?: TraceabilityChain;
  
  /** Measurement uncertainty (reference to UncertaintyModel) */
  uncertaintyId?: string;
  
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
 * ISO 17025 traceability chain
 */
export interface TraceabilityChain {
  /** Measurement standard used */
  standard: {
    /** Standard identifier */
    id: string;
    /** Standard name */
    name: string;
    /** Standard type (e.g., NIST, primary standard) */
    type: string;
    /** Certificate number */
    certificateNumber?: string;
    /** Calibration date */
    calibrationDate?: Date;
    /** Calibration due date */
    calibrationDueDate?: Date;
  };
  /** Calibration hierarchy */
  calibrationHierarchy: CalibrationLink[];
  /** Measurement uncertainty at each level */
  uncertaintyAtLevel?: number[];
}

/**
 * Calibration link in traceability chain
 */
export interface CalibrationLink {
  /** Link identifier */
  id: string;
  /** Instrument or standard identifier */
  instrumentId: string;
  /** Instrument name */
  instrumentName: string;
  /** Calibration certificate reference */
  certificateRef: string;
  /** Calibration date */
  calibrationDate: Date;
  /** Calibration due date */
  calibrationDueDate: Date;
  /** Calibration laboratory */
  calibrationLab: string;
  /** Link to next level in chain */
  nextLevel?: string;
}

/**
 * Measurement series (multiple measurements over time)
 */
export interface MeasurementSeries {
  /** Series identifier */
  id: string;
  /** Series name */
  name: string;
  /** Measurements in series */
  measurements: MeasurementModel[];
  /** Series start date */
  startDate: Date;
  /** Series end date */
  endDate: Date;
  /** Trend analysis (if applicable) */
  trendAnalysis?: TrendAnalysis;
}

/**
 * Trend analysis for measurement series
 */
export interface TrendAnalysis {
  /** Trend direction */
  trend: 'increasing' | 'decreasing' | 'stable' | 'variable';
  /** Rate of change (per unit time) */
  rateOfChange?: number;
  /** Statistical significance */
  isSignificant?: boolean;
  /** Prediction interval (if applicable) */
  predictionInterval?: {
    level: number;
    lower: number;
    upper: number;
  };
}

/**
 * Helper function to calculate statistical measures
 */
export function calculateStatistics(values: number[]): StatisticalAnalysis {
  if (values.length === 0) {
    throw new Error('Cannot calculate statistics for empty array');
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;
  
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(count);
  const coefficientOfVariation = (standardDeviation / mean) * 100;
  
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];
  
  const min = sorted[0];
  const max = sorted[count - 1];
  const range = max - min;
  
  return {
    count,
    mean,
    median,
    min,
    max,
    range,
    standardDeviation,
    variance,
    standardError,
    coefficientOfVariation,
  };
}

/**
 * Helper function to apply corrections to raw value
 */
export function applyCorrections(
  rawValue: number,
  corrections: Correction[]
): number {
  return corrections.reduce((value, correction) => {
    // Assuming corrections are additive
    // Adjust based on your correction model
    return value + correction.value;
  }, rawValue);
}

/**
 * Helper function to create measurement from raw values
 */
export function createMeasurement(
  id: string,
  name: string,
  type: MeasurementType,
  rawValues: RawMeasurementValue[],
  unit: string,
  instrumentId: string,
  operatorId: string,
  createdBy: string
): MeasurementModel {
  const numericValues = rawValues
    .filter(v => !v.isRejected)
    .map(v => v.value);
  
  if (numericValues.length === 0) {
    throw new Error('No valid raw values provided');
  }
  
  const statistics = calculateStatistics(numericValues);
  const averageValue = statistics.mean;
  
  return {
    id,
    name,
    type,
    status: 'completed',
    rawValues,
    averageValue,
    unit,
    instrumentId,
    operatorId,
    timestamp: new Date(),
    statistics,
    createdBy,
    createdAt: new Date(),
  };
}


