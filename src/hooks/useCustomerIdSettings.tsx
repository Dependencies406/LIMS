import { useState, useEffect } from 'react';
import type { CustomerIdSettings } from '../types';
import { loadCustomerIdSettings, saveCustomerIdSettings, DEFAULT_CUSTOMER_ID_SETTINGS } from '../services/customerIdService';

export const useCustomerIdSettings = () => {
  const [settings, setSettings] = useState<CustomerIdSettings>(DEFAULT_CUSTOMER_ID_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const loadedSettings = await loadCustomerIdSettings();
        setSettings(loadedSettings);
        setError(null);
      } catch (err) {
        console.error('Error loading customer ID settings:', err);
        setError('Failed to load customer ID settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Update settings
  const updateSettings = async (newSettings: CustomerIdSettings): Promise<void> => {
    try {
      await saveCustomerIdSettings(newSettings);
      setSettings(newSettings);
      setError(null);
    } catch (err) {
      console.error('Error updating customer ID settings:', err);
      setError('Failed to update customer ID settings');
      throw err;
    }
  };

  // Refresh settings from Firestore
  const refreshSettings = async (): Promise<void> => {
    try {
      setLoading(true);
      const loadedSettings = await loadCustomerIdSettings();
      setSettings(loadedSettings);
      setError(null);
    } catch (err) {
      console.error('Error refreshing customer ID settings:', err);
      setError('Failed to refresh customer ID settings');
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    loading,
    error,
    updateSettings,
    refreshSettings
  };
};
