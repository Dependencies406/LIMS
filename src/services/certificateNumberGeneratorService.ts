/**
 * Certificate Number Generator Service
 * Generates certificate numbers using Firestore transactions for concurrency safety
 */

import {
  db,
  doc,
  getDoc,
  runTransaction,
  Timestamp
} from './firebase';
import { certificateNumberConfigService } from './certificateNumberConfigService';
import { getCompanyInfo } from './companyInfoService';
import type { CertificateNumberConfig } from '../types';

/**
 * Generate a formatted certificate number
 * Format: {COMPANY_ABBREVIATION}-{PREFIX}-{YEAR}{NUMBER} (e.g., SCS-UMT-26001)
 * Where:
 * - COMPANY_ABBREVIATION: Company abbreviation from company info (e.g., "SCS")
 * - PREFIX: User-configured prefix (e.g., "UMT")
 * - YEAR: Last 2 digits of current year (if includeYear is true)
 * - NUMBER: Running number with padding (e.g., 001, 002) - concatenated directly after year with no separator
 */
const formatCertificateNumber = (
  config: CertificateNumberConfig, 
  number: number, 
  companyAbbreviation?: string,
  year?: number
): string => {
  const parts: string[] = [];
  
  // Part 1: Company abbreviation (if available)
  if (companyAbbreviation) {
    parts.push(companyAbbreviation);
  }
  
  // Part 2: Category prefix (required)
  parts.push(config.prefix);
  
  // Part 3: Year + Number (concatenated without separator)
  if (config.includeYear) {
    const currentYear = year || new Date().getFullYear();
    const yearStr = String(currentYear).slice(-2); // Last 2 digits
    const paddedNumber = number.toString().padStart(config.numberPadding, '0');
    // Concatenate year and number directly (e.g., "26001")
    parts.push(yearStr + paddedNumber);
  } else {
    // If year is not included, just add the padded number
    const paddedNumber = number.toString().padStart(config.numberPadding, '0');
    parts.push(paddedNumber);
  }
  
  return parts.join(config.separator);
};

/**
 * Generate the next certificate number for a category
 * Uses Firestore transactions to ensure uniqueness and prevent race conditions
 * 
 * @param configId Certificate number configuration ID
 * @returns Generated certificate number (e.g., "EQ-000123")
 */
export const generateCertificateNumber = async (configId: string): Promise<string> => {
  try {
    const configRef = doc(db, 'certificate_number_configs', configId);

    // Use transaction to atomically read and increment
    const result = await runTransaction(db, async (transaction) => {
      const configDoc = await transaction.get(configRef);
      
      if (!configDoc.exists()) {
        throw new Error(`Certificate number configuration ${configId} not found`);
      }

      const configData = configDoc.data();
      const config: CertificateNumberConfig = {
        id: configDoc.id,
        name: configData.name || '',
        prefix: configData.prefix || '',
        separator: configData.separator || '-',
        includeYear: configData.includeYear !== false, // Default to true for backward compatibility
        numberPadding: configData.numberPadding || 3,
        currentNumber: configData.currentNumber || 0,
        resetPolicy: configData.resetPolicy || 'never',
        lastResetAt: configData.lastResetAt?.toDate() || undefined,
        isActive: configData.isActive !== false,
        createdAt: configData.createdAt?.toDate() || new Date(),
        updatedAt: configData.updatedAt?.toDate() || new Date(),
      };

      if (!config.isActive) {
        throw new Error(`Certificate number configuration "${config.name}" is not active`);
      }

      // Check for yearly reset if policy is set
      let currentNumber = config.currentNumber;
      const now = new Date();
      const currentYear = now.getFullYear();
      
      if (config.resetPolicy === 'yearly') {
        // Reset if year has changed
        if (!config.lastResetAt || config.lastResetAt.getFullYear() < currentYear) {
          currentNumber = 0;
        }
      }

      // Increment number
      const nextNumber = currentNumber + 1;

      // Update the configuration
      const shouldReset = config.resetPolicy === 'yearly' && currentNumber === 0;
      transaction.update(configRef, {
        currentNumber: nextNumber,
        updatedAt: Timestamp.now(),
        ...(shouldReset ? {
          lastResetAt: Timestamp.now(),
        } : {}),
      });

      return {
        config,
        number: nextNumber,
        year: currentYear,
      };
    });

    // Get company info for abbreviation
    let companyAbbreviation: string | undefined;
    try {
      const companyInfo = await getCompanyInfo();
      companyAbbreviation = companyInfo?.companyAbbreviation;
    } catch (error) {
      console.warn('Could not load company info for certificate number:', error);
      // Continue without abbreviation - will generate without company prefix
    }

    // Format and return the certificate number
    return formatCertificateNumber(result.config, result.number, companyAbbreviation, result.year);
  } catch (error: any) {
    console.error('Error generating certificate number:', error);
    if (error.message) {
      throw error;
    }
    throw new Error('Failed to generate certificate number');
  }
};

/**
 * Preview what the next certificate number would be (without incrementing)
 */
export const previewCertificateNumber = async (configId: string): Promise<string> => {
  try {
    const config = await certificateNumberConfigService.getConfigById(configId);
    
    if (!config) {
      throw new Error(`Certificate number configuration ${configId} not found`);
    }

    if (!config.isActive) {
      throw new Error(`Certificate number configuration "${config.name}" is not active`);
    }

    // Check for yearly reset
    let currentNumber = config.currentNumber;
    const currentYear = new Date().getFullYear();
    if (config.resetPolicy === 'yearly') {
      if (!config.lastResetAt || config.lastResetAt.getFullYear() < currentYear) {
        currentNumber = 0;
      }
    }

    const nextNumber = currentNumber + 1;
    
    // Get company info for abbreviation
    let companyAbbreviation: string | undefined;
    try {
      const companyInfo = await getCompanyInfo();
      companyAbbreviation = companyInfo?.companyAbbreviation;
    } catch (error) {
      console.warn('Could not load company info for certificate number preview:', error);
    }
    
    return formatCertificateNumber(config, nextNumber, companyAbbreviation, currentYear);
  } catch (error: any) {
    console.error('Error previewing certificate number:', error);
    if (error.message) {
      throw error;
    }
    throw new Error('Failed to preview certificate number');
  }
};

/**
 * Format a certificate number from a config object and number
 * Useful for formatting existing numbers
 */
export const formatCertificateNumberFromConfig = (
  config: CertificateNumberConfig,
  number: number,
  companyAbbreviation?: string,
  year?: number
): string => {
  return formatCertificateNumber(config, number, companyAbbreviation, year);
};

/**
 * Generate the next certificate number for an equipment by its name (from Certificate Number Manager).
 * Finds the active config where config.name === equipmentName, then runs existing number + 1.
 * Use after user confirmation.
 */
export const generateCertificateNumberForEquipment = async (equipmentName: string): Promise<string> => {
  const config = await certificateNumberConfigService.getConfigByEquipmentName(equipmentName);
  if (!config) {
    throw new Error(`No certificate number configuration found for equipment "${equipmentName}". Select an equipment name from the Certificate Number Manager (Settings).`);
  }
  return generateCertificateNumber(config.id);
};
