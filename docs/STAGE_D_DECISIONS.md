# STAGE D DECISIONS RECORD (owner, 2026-07-19) — binding for all sessions

- **D1:** Force conversion uses the app's existing
  `conversionEquationService.evaluate()` exactly as-is. The workbook's
  `c3·x` quirk is NOT replicated. Therefore app-computed forces ≠ workbook
  forces, and golden tests feed the workbook's STD-Force VALUES directly into
  the analysis functions (testing analysis math in isolation).
- **D2:** b = max − min over {q1, q2, q3} (NOT the workbook's q1 − q3).
  Golden `b` values and b-derived class values are recomputed in tests from
  the golden q columns; all other columns assert verbatim.
- **D3:** f0 formula stands as extracted: max residual (zero-row) force ÷ cal
  point × 100. Confirmed as the intended definition (usually 0 in practice).
- **D4:** u_res stays wired exactly as the workbook has it (a_F/a_Z from the
  f0 values, ÷2√3 each, RSS). Replicate.
- **D5:** u_cal/A/B/C are already standard uncertainties — RSS them raw, no
  ÷√3. Replicate.
- **D6:** Report-U = max(U, CMC), TRUNCATED (not rounded) to 2 significant
  figures, output as a formatted string. Replicate.
- **D7:** storage home for u_cal/A/B/C is fields on the ConversionEquation
  document (uCal/uA/uB/uC), edited in the existing equation form, snapshotted
  onto StandardSnapshot at save. Confirmed 2026-07-20 (Session 2 kickoff) —
  the equipment-constant feature was not adopted instead.
