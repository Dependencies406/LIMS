import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { PdfSettings } from '../types';
import { DEFAULT_PDF_SETTINGS, PDF_SETTINGS_VERSION } from '../utils/constants';

interface PdfSettingsContextType {
  pdfSettings: PdfSettings;
  updatePdfSettings: (settings: Partial<PdfSettings>) => void;
  resetPdfSettings: () => void;
}

const PdfSettingsContext = createContext<PdfSettingsContextType | undefined>(undefined);

export const usePdfSettings = () => {
  const context = useContext(PdfSettingsContext);
  if (!context) {
    throw new Error('usePdfSettings must be used within a PdfSettingsProvider');
  }
  return context;
};

interface PdfSettingsProviderProps {
  children: ReactNode;
}

export const PdfSettingsProvider: React.FC<PdfSettingsProviderProps> = ({ children }) => {
  const [pdfSettings, setPdfSettings] = useState<PdfSettings>(DEFAULT_PDF_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('lims-pdf-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        
        // Check if settings need migration (version mismatch or missing version)
        const needsMigration = !parsed.version || parsed.version < PDF_SETTINGS_VERSION;
        
        if (needsMigration) {
          // Use defaults for new version and migrate what we can
          const migratedSettings = {
            ...DEFAULT_PDF_SETTINGS,
            // Preserve user's preferences where compatible
            pageSize: parsed.pageSize || DEFAULT_PDF_SETTINGS.pageSize,
            orientation: parsed.orientation || DEFAULT_PDF_SETTINGS.orientation,
            fontSize: { ...DEFAULT_PDF_SETTINGS.fontSize, ...(parsed.fontSize || {}) },
            margin: { ...DEFAULT_PDF_SETTINGS.margin, ...(parsed.margin || {}) },
            jobTableColumns: { ...DEFAULT_PDF_SETTINGS.jobTableColumns, ...(parsed.jobTableColumns || {}) },
            equipmentTableColumns: { ...DEFAULT_PDF_SETTINGS.equipmentTableColumns, ...(parsed.equipmentTableColumns || {}) },
            showLogo: parsed.showLogo ?? DEFAULT_PDF_SETTINGS.showLogo,
            showHeader: parsed.showHeader ?? DEFAULT_PDF_SETTINGS.showHeader,
            showFooter: parsed.showFooter ?? DEFAULT_PDF_SETTINGS.showFooter,
            showTableBorders: parsed.showTableBorders ?? DEFAULT_PDF_SETTINGS.showTableBorders,
          };
          
          // Save migrated settings
          localStorage.setItem('lims-pdf-settings', JSON.stringify(migratedSettings));
          setPdfSettings(migratedSettings);
        } else {
          // Deep merge to preserve nested objects
          const mergedSettings = {
            ...DEFAULT_PDF_SETTINGS,
            ...parsed,
            version: PDF_SETTINGS_VERSION,
            fontSize: { ...DEFAULT_PDF_SETTINGS.fontSize, ...(parsed.fontSize || {}) },
            margin: { ...DEFAULT_PDF_SETTINGS.margin, ...(parsed.margin || {}) },
            jobTableColumns: { ...DEFAULT_PDF_SETTINGS.jobTableColumns, ...(parsed.jobTableColumns || {}) },
            equipmentTableColumns: { ...DEFAULT_PDF_SETTINGS.equipmentTableColumns, ...(parsed.equipmentTableColumns || {}) },
            fieldVisibility: { ...DEFAULT_PDF_SETTINGS.fieldVisibility, ...(parsed.fieldVisibility || {}) },
            headerContent: { ...DEFAULT_PDF_SETTINGS.headerContent, ...(parsed.headerContent || {}) },
            footerContent: { ...DEFAULT_PDF_SETTINGS.footerContent, ...(parsed.footerContent || {}) }
          };
          
          setPdfSettings(mergedSettings);
        }
        setIsInitialized(true);
      } catch (error) {
        console.error('Error loading PDF settings:', error);
        setPdfSettings(DEFAULT_PDF_SETTINGS);
        setIsInitialized(true);
      }
    } else {
      setIsInitialized(true);
    }
  }, []);

  // Save settings to localStorage whenever they change (but skip initial mount)
  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    
    localStorage.setItem('lims-pdf-settings', JSON.stringify(pdfSettings));
  }, [pdfSettings, isInitialized]);

  const updatePdfSettings = (newSettings: Partial<PdfSettings>) => {
    setPdfSettings(prev => ({
      ...prev,
      ...newSettings,
      // Deep merge nested objects
      fontSize: newSettings.fontSize ? { ...prev.fontSize, ...newSettings.fontSize } : prev.fontSize,
      margin: newSettings.margin ? { ...prev.margin, ...newSettings.margin } : prev.margin,
      jobTableColumns: newSettings.jobTableColumns ? { ...prev.jobTableColumns, ...newSettings.jobTableColumns } : prev.jobTableColumns,
      equipmentTableColumns: newSettings.equipmentTableColumns ? { ...prev.equipmentTableColumns, ...newSettings.equipmentTableColumns } : prev.equipmentTableColumns,
      fieldVisibility: newSettings.fieldVisibility ? { ...prev.fieldVisibility, ...newSettings.fieldVisibility } : prev.fieldVisibility,
      headerContent: newSettings.headerContent ? { ...prev.headerContent, ...newSettings.headerContent } : prev.headerContent,
      footerContent: newSettings.footerContent ? { ...prev.footerContent, ...newSettings.footerContent } : prev.footerContent
    }));
  };

  const resetPdfSettings = () => {
    setPdfSettings(DEFAULT_PDF_SETTINGS);
    localStorage.setItem('lims-pdf-settings', JSON.stringify(DEFAULT_PDF_SETTINGS));
  };

  return (
    <PdfSettingsContext.Provider value={{
      pdfSettings,
      updatePdfSettings,
      resetPdfSettings
    }}>
      {children}
    </PdfSettingsContext.Provider>
  );
};
