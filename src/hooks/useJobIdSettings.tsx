import { useState, useEffect } from 'react';
import type { JobIdSettings } from '../types';
import { loadJobIdSettings, saveJobIdSettings, DEFAULT_JOB_ID_SETTINGS } from '../services/jobIdService';

export const useJobIdSettings = () => {
  const [settings, setSettings] = useState<JobIdSettings>(DEFAULT_JOB_ID_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const loadedSettings = await loadJobIdSettings();
        setSettings(loadedSettings);
        setError(null);
      } catch (err) {
        console.error('Error loading job ID settings:', err);
        setError('Failed to load job ID settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Update settings
  const updateSettings = async (newSettings: JobIdSettings): Promise<void> => {
    try {
      await saveJobIdSettings(newSettings);
      setSettings(newSettings);
      setError(null);
    } catch (err) {
      console.error('Error updating job ID settings:', err);
      setError('Failed to update job ID settings');
      throw err;
    }
  };

  // Refresh settings from Firestore
  const refreshSettings = async (): Promise<void> => {
    try {
      setLoading(true);
      const loadedSettings = await loadJobIdSettings();
      setSettings(loadedSettings);
      setError(null);
    } catch (err) {
      console.error('Error refreshing job ID settings:', err);
      setError('Failed to refresh job ID settings');
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

