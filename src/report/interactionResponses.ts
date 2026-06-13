/**
 * Shared binding helpers between the HTML report and the CSV report.
 *
 * Both the HTML report and the CSV report resolve a renderer's
 * `InteractionInfo` to the candidate's submitted values. To keep the two
 * outputs consistent, the resolution rules live here in a single place. The
 * HTML and CSV layers MUST call into this module rather than re-implementing
 * the lookup against `ParsedItemResponse[]`.
 *
 * Authority model
 * ----------------
 * The renderer (`qti-html-renderer`) is the only authority on
 * `interaction.declarationValueIndex`. Result-side `responseVariable`
 * records are stored as `{ responseIdentifier, values: string[] }` — the
 * parser deliberately does NOT carry `declarationValueIndex` on the result
 * side, because the result cannot tell whether an interaction was bound by
 * the legacy ordered `RESPONSE` distribution or by a plain identifier match.
 * The reporter only reads `declarationValueIndex` from the renderer
 * `InteractionInfo` and applies it to the matching `responseVariable.values`
 * array when it is non-null.
 *
 * The reporter MUST NOT invent a `RESPONSE_N` numeric-suffix mapping on the
 * result side. If the renderer says `declarationValueIndex !== null`, the
 * reporter uses the index. Otherwise the reporter uses a direct match on
 * the interaction's `declarationIdentifier` (or `id` as a final fallback) and
 * returns the full `values` array for that `responseVariable`.
 *
 * Legacy ordered binding returns exactly one value at the
 * `declarationValueIndex` position. A renderer interaction whose
 * `declarationValueIndex !== null` MUST NEVER receive the full multi-value
 * list — it gets the single value at the index, or `[]` when the
 * `responseVariable` does not provide that index.
 */
import type { InteractionInfo } from '../qti/assessmentItem.js';
import type { ParsedItemResponse } from '../qti/assessmentResult.js';

/**
 * Compute the per-interaction dedupe key used by the CSV report to avoid
 * emitting the same `responseVariable`'s values twice when two interactions
 * in the same item share a `responseVariable` (for example two text-entry
 * interactions both bound to `RESPONSE`).
 *
 * - If the renderer reports `declarationValueIndex !== null`, the key is
 *   `"${declarationIdentifier}|${declarationValueIndex}|${interaction.id}"`
 *   so each legacy-distribution interaction gets its own cell.
 * - Otherwise, when `declarationIdentifier` is non-null, the key is the
 *   declaration identifier (direct-match dedupe).
 * - Otherwise (the interaction is unmatched), the key is the interaction's
 *   own `id` (or `''` when both are absent).
 */
export function responseDedupeKey(interaction: InteractionInfo): string {
  if (interaction.declarationValueIndex !== null) {
    const declaration = interaction.declarationIdentifier ?? '';
    return `${declaration}|${interaction.declarationValueIndex}|${interaction.id ?? ''}`;
  }
  if (interaction.declarationIdentifier) {
    return interaction.declarationIdentifier;
  }
  return interaction.id ?? '';
}

/**
 * Resolve a renderer's `InteractionInfo` to the candidate's submitted
 * `string[]` for that interaction.
 *
 * Resolution precedence:
 *
 * 1. **Interaction-id priority** — when the interaction has an `id` and a
 *    `responseVariable` with that exact `responseIdentifier` exists, return
 *    that response's `values` array verbatim. This wins over both the legacy
 *    path and the direct-match path because the interaction id is the most
 *    specific key the renderer exposes.
 * 2. **Legacy ordered `RESPONSE` distribution** — when the renderer reports
 *    `declarationValueIndex !== null`, look up the
 *    `responseVariable` by `declarationIdentifier` and return
 *    `[values[declarationValueIndex]]` (or `[]` when the index is out of
 *    range). The reporter MUST return a single value, NOT the full
 *    `values` array. The renderer is the only authority on when this
 *    legacy distribution applies — the reporter MUST NOT infer it from
 *    numeric-suffix parsing on the result side.
 * 3. **Direct match on `declarationIdentifier`** — when the renderer bound
 *    the interaction to a `responseVariable` by identifier, return that
 *    `responseVariable`'s `values` array in full. A `cardinality="multiple"`
 *    or `"ordered"` response is preserved as a multi-element array.
 * 4. **No match** — return `[]`.
 */
export function resolveSubmittedValues(
  responses: ParsedItemResponse[],
  interaction: InteractionInfo
): string[] {
  if (interaction.id) {
    const matchedById = responses.find((entry) => entry.responseIdentifier === interaction.id);
    if (matchedById) {
      return matchedById.values.slice();
    }
  }

  if (interaction.declarationValueIndex !== null) {
    const declarationId = interaction.declarationIdentifier;
    if (declarationId) {
      const matchedByDeclaration = responses.find(
        (entry) => entry.responseIdentifier === declarationId
      );
      if (matchedByDeclaration) {
        const index = interaction.declarationValueIndex;
        if (index >= 0 && index < matchedByDeclaration.values.length) {
          return [matchedByDeclaration.values[index]];
        }
      }
    }
    return [];
  }

  if (interaction.declarationIdentifier) {
    const matched = responses.find(
      (entry) => entry.responseIdentifier === interaction.declarationIdentifier
    );
    if (matched) {
      return matched.values.slice();
    }
  }

  return [];
}
