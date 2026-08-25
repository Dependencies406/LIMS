/**
 * recordEnvironment.ts
 *
 * Pure logic behind the environment block (Task 2): exactly `roundCount`
 * built-in, non-deletable rounds of temperature/RH. A round only becomes
 * part of `CalibrationRecord.environment` once BOTH its fields are filled
 * with a valid number — this is what makes `environment.length === roundCount`
 * (already enforced server-side in `commitRecord`) mean "every round is
 * complete", without a separate completeness field to keep in sync.
 */

import type { RoundEnvironment } from '../types';
import { forceUnitToNewtons } from './forceUnits';
import type { CellValue } from '../modules/recorder/formula';

export interface EnvironmentRoundDraft {
  roundIndex: number;
  /** Raw text field content — kept as a string so a user can clear a field mid-edit. */
  temperatureC: string;
  relativeHumidity: string;
}

/** Seeds one draft per round (1..roundCount), pre-filling from any already-saved rounds. */
export function buildEnvironmentDrafts(roundCount: number, environment: RoundEnvironment[]): EnvironmentRoundDraft[] {
  const byRound = new Map(environment.map((round) => [round.roundIndex, round]));
  return Array.from({ length: roundCount }, (_, i) => {
    const roundIndex = i + 1;
    const existing = byRound.get(roundIndex);
    return {
      roundIndex,
      temperatureC: existing ? String(existing.temperatureC) : '',
      relativeHumidity: existing ? String(existing.relativeHumidity) : '',
    };
  });
}

function parseFiniteNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Derives the record's `environment` array from the current drafts — only rounds with both fields valid are included. */
export function buildEnvironmentFromDrafts(drafts: EnvironmentRoundDraft[]): RoundEnvironment[] {
  const result: RoundEnvironment[] = [];
  for (const draft of drafts) {
    const temperatureC = parseFiniteNumber(draft.temperatureC);
    const relativeHumidity = parseFiniteNumber(draft.relativeHumidity);
    if (temperatureC === null || relativeHumidity === null) continue;
    result.push({ roundIndex: draft.roundIndex, temperatureC, relativeHumidity });
  }
  return result;
}

/** Matches commitRecord's own gate — surfaced here so the UI can show the same "not ready" state before the user tries to commit. */
export function isEnvironmentComplete(environment: RoundEnvironment[], roundCount: number): boolean {
  return environment.length === roundCount;
}

/**
 * Builds the record-scoped scalar map evaluateMockup expects — the
 * `ENV_TEMP_R{n}` / `ENV_RH_R{n}` values plus `REPORT_TO_N`. Shared by
 * commit-time and live-recalculation evaluation so both go through one mapping.
 *
 * `REPORT_TO_N` lives here rather than in the row-scoped `STD_*` map because
 * the reporting unit is a property of the RECORD, not of the standard a
 * particular row selected (ADR-014 D5). Every row in a record reports in the
 * same unit; each row may use a different standard.
 *
 * It is `null` when the record has no reporting unit set, or when that unit is
 * not one the newton table knows — never a default of 1. Defaulting would
 * silently report newtons for a record meant to be in kN, which is the failure
 * class ADR-013 D5 exists to end.
 */
export function environmentToEnvMap(
  environment: RoundEnvironment[],
  reportUnit?: string | null,
): Record<string, CellValue> {
  const env: Record<string, CellValue> = {};
  for (const round of environment) {
    env[`ENV_TEMP_R${round.roundIndex}`] = round.temperatureC;
    env[`ENV_RH_R${round.roundIndex}`] = round.relativeHumidity;
  }
  env.REPORT_TO_N = forceUnitToNewtons(reportUnit);
  return env;
}
