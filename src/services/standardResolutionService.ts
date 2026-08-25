/**
 * standardResolutionService.ts
 *
 * ADR-014 D1/D3: resolves the composite `standard` cell key back into the live
 * pair it names — the equipment record and the conversion equation for the
 * calibrated range in use.
 *
 * This replaces `referenceStandardService.getStandardsByIds`, which fetched a
 * single retired `ReferenceStandard` document per id. A standard is now two
 * documents at two paths:
 *
 *     equipmentControl/{equipmentId}
 *     equipmentControl/{equipmentId}/conversionEquations/{equationId}
 *
 * Keys that cannot be resolved are simply absent from the returned map. The
 * commit path treats an absent key as a refusal to commit rather than
 * substituting a default — a row naming a standard nobody can fetch must not
 * quietly produce numbers.
 */

import type { ConversionEquation, EquipmentRecord } from '../types';
import { conversionEquationService } from './conversionEquationService';
import { equipmentControlService } from './equipmentControlService';
import { parseStandardKey } from './referenceStandardVariables';

export interface ResolvedStandard {
  equipment: EquipmentRecord;
  equation: ConversionEquation;
}

/**
 * Fetches the (equipment, equation) pair for each composite key.
 *
 * Equipment documents are fetched once each even when several keys share one
 * device — the common case, since a multi-range transducer is one equipment
 * record with several equations.
 */
export async function resolveStandardsByKeys(
  keys: string[],
): Promise<Record<string, ResolvedStandard>> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  const out: Record<string, ResolvedStandard> = {};

  // equipmentId -> record (or null when it does not exist), fetched at most once.
  const equipmentCache = new Map<string, EquipmentRecord | null>();
  // equipmentId -> its equations, fetched at most once.
  const equationsCache = new Map<string, ConversionEquation[]>();

  for (const key of unique) {
    const parsed = parseStandardKey(key);
    if (!parsed) continue;
    const { equipmentId, equationId } = parsed;

    if (!equipmentCache.has(equipmentId)) {
      equipmentCache.set(equipmentId, await equipmentControlService.getEquipmentById(equipmentId));
    }
    const equipment = equipmentCache.get(equipmentId);
    if (!equipment) continue;

    if (!equationsCache.has(equipmentId)) {
      equationsCache.set(equipmentId, await conversionEquationService.getAll(equipmentId));
    }
    const equation = equationsCache.get(equipmentId)!.find((e) => e.id === equationId);
    if (!equation) continue;

    out[key] = { equipment, equation };
  }

  return out;
}
