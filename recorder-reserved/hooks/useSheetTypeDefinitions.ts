import { useEffect, useState } from 'react';
import type { SheetTypeDefinition } from '../types';
import { sheetTypeDefinitionService } from '../services/sheetTypeDefinitionService';
import { FORCE_SHEET_TYPE } from '../modules/data-recorder/sheetLogic';

/** Lists every SheetTypeDefinition, ensuring the force-iso7500-1 seed exists first. */
export const useSheetTypeDefinitions = () => {
  const [definitions, setDefinitions] = useState<SheetTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      await sheetTypeDefinitionService.get(FORCE_SHEET_TYPE);
      setDefinitions(await sheetTypeDefinitionService.list());
    } catch (err) {
      console.error('Failed to load sheet type definitions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveDefinition = async (definition: SheetTypeDefinition) => {
    await sheetTypeDefinitionService.set(definition.id, definition);
    await load();
  };

  return { definitions, loading, saveDefinition, refresh: load };
};
