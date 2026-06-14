/**
 * Shared empty-value helpers used by both the HTML report and the CSV report.
 *
 * STAGE 3 of 3 — DISPLAY. This module is the THIRD and FINAL stage of
 * the three-stage empty-value contract documented in
 * `docs/report-output-spec.md` ("Empty value handling across parser,
 * binding, and display"). This stage is the ONLY stage that drops
 * empty values. Stages 1 (the parser in `qti/assessmentResult.ts`)
 * and 2 (the binding layer in `report/interactionResponses.ts`) keep
 * empty positions verbatim so the legacy ordered `RESPONSE`
 * distribution's index alignment survives the parser → binding handoff.
 *
 * Strict-empty rule:
 *   The reporter treats a candidate value as "no answer" only when
 *   the string is the strictly-empty string. The parser already
 *   normalizes CRLF/CR to LF, so `value.length === 0` is the single
 *   no-answer marker. This helper NEVER calls `trim()`; whitespace-
 *   only, tab-only, and newline-only values are real answers and
 *   must be kept verbatim.
 *
 * Both the HTML report (`src/report/htmlReport.ts`) and the CSV report
 * (`src/report/csvReport.ts`) call into this module so the empty-value
 * rule is shared between the two outputs. The HTML report additionally
 * renders `（無回答）` when an interaction's filtered submission is
 * empty; the CSV report excludes the empty value from the
 * `response_values` and `response_labels` cells, so the cells never
 * carry leading/trailing newlines or empty lines.
 */
export function isEmptyResponseValue(value: string): boolean {
  return value.length === 0;
}

export function dropEmptyResponseValues(values: readonly string[]): string[] {
  return values.filter((value) => !isEmptyResponseValue(value));
}
