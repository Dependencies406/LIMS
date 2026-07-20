import { useState, useEffect } from 'react';
import type { CmcSettings } from '../types';
import { cmcService, DEFAULT_CMC_SETTINGS } from '../services/cmcService';

export const useCmcSettings = () => {
  const [settings, setSettings] = useState<CmcSettings>(DEFAULT_CMC_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setSettings(await cmcService.get());
      } catch (err) {
        console.error('Error loading CMC settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateSettings = async (next: CmcSettings): Promise<void> => {
    await cmcService.set(next);
    setSettings(next);
  };

  const refreshSettings = async (): Promise<void> => {
    setLoading(true);
    try {
      setSettings(await cmcService.get());
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, updateSettings, refreshSettings };
};
