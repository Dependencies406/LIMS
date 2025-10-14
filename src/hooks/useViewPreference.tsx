import { useState, useEffect } from 'react';
import type { ViewType } from '../components/common/ViewToggle';

/**
 * Custom hook to manage view preference with localStorage persistence
 * @param key - localStorage key for storing the preference
 * @param defaultView - default view type if none is stored
 */
export const useViewPreference = (
  key: string,
  defaultView: ViewType = 'card'
): [ViewType, (view: ViewType) => void] => {
  const [view, setView] = useState<ViewType>(() => {
    // Try to get saved preference from localStorage
    const saved = localStorage.getItem(key);
    if (saved && ['list', 'card', 'grid'].includes(saved)) {
      return saved as ViewType;
    }
    return defaultView;
  });

  useEffect(() => {
    // Save preference to localStorage whenever it changes
    localStorage.setItem(key, view);
  }, [key, view]);

  return [view, setView];
};

