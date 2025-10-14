import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCompanyInfo } from '../services/companyInfoService';
import type { CompanyInfo as CompanyInfoType } from '../types';

interface CompanyInfoContextType {
  companyInfo: CompanyInfoType | null;
  loading: boolean;
  error: string | null;
  refreshCompanyInfo: () => Promise<void>;
  updateCompanyInfo: (info: CompanyInfoType) => void;
}

const CompanyInfoContext = createContext<CompanyInfoContextType | undefined>(undefined);

interface CompanyInfoProviderProps {
  children: ReactNode;
}

export const CompanyInfoProvider: React.FC<CompanyInfoProviderProps> = ({ children }) => {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompanyInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const info = await getCompanyInfo();
      setCompanyInfo(info);
    } catch (err) {
      console.error('Error loading company info:', err);
      setError('Failed to load company information');
    } finally {
      setLoading(false);
    }
  };

  const refreshCompanyInfo = async () => {
    await loadCompanyInfo();
  };

  const updateCompanyInfo = (info: CompanyInfoType) => {
    setCompanyInfo(info);
  };

  // Load company info on mount
  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const value: CompanyInfoContextType = {
    companyInfo,
    loading,
    error,
    refreshCompanyInfo,
    updateCompanyInfo
  };

  return (
    <CompanyInfoContext.Provider value={value}>
      {children}
    </CompanyInfoContext.Provider>
  );
};

export const useCompanyInfo = (): CompanyInfoContextType => {
  const context = useContext(CompanyInfoContext);
  if (context === undefined) {
    throw new Error('useCompanyInfo must be used within a CompanyInfoProvider');
  }
  return context;
};
