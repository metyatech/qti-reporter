/**
 * Shared empty-value helpers used by both the HTML report and the CSV report.
 *
 * The reporter treats a candidate value as "no answer" only when the
 * string is the strictly-empty string. The parser already normalizes
 * CRLF/CR to LF, so `value.length === 0` is the single no-answer marker.
 * Whitespace-only values (spaces, tabs, newlines) and values with
 * leading/trailing whitespace are real answers and must be kept
 * verbatim — this helper never trims.
 *
 * Both the HTML report (`src/report/htmlReport.ts`) and the CSV report
 * (`src/report/csvReport.ts`) call into this module so the empty-value
 * rule is shared between the two outputs.
 */
export function isEmptyResponseValue(value: string): boolean {
  return value.length === 0;
}

export function dropEmptyResponseValues(values: readonly string[]): string[] {
  return values.filter((value) => !isEmptyResponseValue(value));
}
