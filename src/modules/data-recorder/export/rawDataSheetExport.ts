/**
 * rawDataSheetExport.ts
 *
 * Pure serialize/parse for the Data Recorder's self-contained JSON export
 * format (design R4): the app itself writes and reads this file, and an
 * export → import round-trip must be lossless.
 *
 * File envelope:
 *   { format: 'lims-data-recorder', schemaVersion: 1, exportedAt, exportedByUid,
 *     recordCount, records: [ ...sheets with createdAt as ISO string ] }
 *
 * parseExport validates with zod but returns the ORIGINAL parsed objects
 * (not zod's output), so unknown/extra fields survive the round-trip.
 */

import { z } from 'zod';
import type { CalibrationRawDataSheet } from '../../../types';

export const EXPORT_FORMAT = 'lims-data-recorder';
export const EXPORT_SCHEMA_VERSION = 1;

// ─── Validation schema (structure check only — output is not used) ──────────

const cellSchema = z.object({
  uuc: z.number().nullable(),
  sig: z.number().nullable(),
  force: z.number().nullable(),
});

const rowSchema = z.object({
  calPoint: z.number(),
  standardEquipmentId: z.string().min(1),
  equationId: z.string().min(1),
  cells: z.object({ inc1: cellSchema, inc2: cellSchema, inc3: cellSchema, dec3: cellSchema }),
});

const recordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['original', 'amendment']),
  amends: z.union([z.string(), z.null()]),
  requestNo: z.string().min(1),
  calibrationDate: z.string().min(1),
  uuc: z.object({ equipmentName: z.string(), readingUnit: z.enum(['N', 'kN', 'kgf', 'gf']) }),
  direction: z.enum(['Tension', 'Compression']),
  standards: z.array(z.object({ equipmentId: z.string(), equationId: z.string() })),
  envStandard: z.object({ equipmentId: z.string(), code: z.string() }),
  env: z.array(z.object({ t: z.number(), h: z.number() })).length(3),
  rows: z.array(rowSchema),
  recordedByUid: z.string().min(1),
  recordedByName: z.string().min(1),
  createdAt: z.string().min(1),
  schemaVersion: z.number(),
});

const envelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string(),
  exportedByUid: z.string(),
  recordCount: z.number(),
  records: z.array(z.unknown()),
});

// ─── Public API ──────────────────────────────────────────────────────────────

/** Serialize sheets to the export file content (pretty-printed JSON). */
export function serializeExport(sheets: CalibrationRawDataSheet[], exportedByUid: string): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exportedByUid,
      recordCount: sheets.length,
      records: sheets.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    },
    null,
    2,
  );
}

/**
 * Parse and validate an export file. Returns the sheets with createdAt
 * revived to Date. Throws Error with a Thai, user-displayable message.
 */
export function parseExport(text: string): CalibrationRawDataSheet[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
  }

  const env = envelopeSchema.safeParse(data);
  if (!env.success) {
    const d = data as Record<string, unknown> | null;
    if (d && d.format !== EXPORT_FORMAT) {
      throw new Error('ไม่ใช่ไฟล์ส่งออกของโมดูลบันทึกข้อมูล (format ไม่ตรง)');
    }
    if (d && d.schemaVersion !== EXPORT_SCHEMA_VERSION) {
      throw new Error(`เวอร์ชันไฟล์ไม่รองรับ: ${String(d.schemaVersion)}`);
    }
    throw new Error('โครงสร้างไฟล์ไม่ถูกต้อง');
  }

  // Validate each record's structure, then return the ORIGINAL objects so
  // fields the validator doesn't know about are preserved losslessly.
  const rawRecords = (data as { records: Record<string, unknown>[] }).records;
  rawRecords.forEach((raw, i) => {
    const check = recordSchema.safeParse(raw);
    if (!check.success) {
      throw new Error(`พบชีตที่ข้อมูลไม่ครบในไฟล์ (รายการที่ ${i + 1}: ${String(raw?.id ?? 'ไม่มี id')})`);
    }
  });

  return rawRecords.map((raw) => ({
    ...(raw as unknown as CalibrationRawDataSheet),
    createdAt: new Date(raw.createdAt as string),
  }));
}
