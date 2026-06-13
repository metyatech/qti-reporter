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
 *
 * Display id vs unique key
 * ------------------------
 * The interaction `id` is the renderer's `response-identifier` value. It is
 * the canonical key for distinguishing interactions in a single item, but
 * it is NOT guaranteed unique (two interactions can share the same id).
 * When sibling interactions share an id, the reporter scopes them by
 * `interactionIndex`. The binding layer (`resolveSubmittedValues`) does use
 * `interaction.id` as a lookup fallback in both the legacy ordered and
 * direct-match rules, so the id is part of the binding protocol — just not
 * the sole scope key.
 */
import type { InteractionInfo } from '../qti/assessmentItem.js';
import type { ParsedItemResponse } from '../qti/assessmentResult.js';

/**
 * Compute the per-interaction dedupe key used by the CSV report to avoid
 * emitting the same `responseVariable`'s values twice when two interactions
 * in the same item share a `responseVariable`.
 *
 * The key form is selected by the renderer's `declarationValueIndex`:
 *
 * - **Legacy ordered**: when `declarationValueIndex !== null`, the key is
 *   `"<declarationIdentifier>|<declarationValueIndex>|<interaction.id>"`.
 *   The unique `declarationValueIndex` segment gives each legacy-
 *   distribution interaction its own CSV cell.
 * - **Direct match**: when `declarationValueIndex === null` and
 *   `declarationIdentifier` is non-null, the key is the
 *   `declarationIdentifier` alone. Multiple interactions that share the
 *   same declaration identifier collapse to a single CSV cell — this is
 *   intentional, by design.
 * - **Unmatched**: when neither `declarationValueIndex` nor
 *   `declarationIdentifier` is available, the key is `interaction.id` (or
 *   `""` when both `id` and `declarationIdentifier` are absent). The
 *   unmatched case is INTENTIONALLY collapsed: two unmatched interactions
 *   with the same `id` share a CSV cell. The HTML report renders them as
 *   separate rows keyed by `interactionIndex`; the CSV does not. If the
 *   CSV must distinguish two unmatched interactions with the same `id`,
 *   the renderer must report a `declarationIdentifier`; otherwise the
 *   CSV is intentionally lossy for the unmatched case.
 *
 * This function is NOT `interactionIndex`-aware — it does not take an
 * `interactionIndex` parameter and does not embed one in the returned
 * key. Sibling interactions in the HTML report are differentiated by
 * `interactionIndex` in the radio/checkbox `name` and the
 * `data-candidate-name` attribute; the CSV key is selected purely from
 * the renderer's `InteractionInfo` and follows the rules above.
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
 * Locate a `responseVariable` whose `responseIdentifier` matches the
 * supplied key. The first match in document order wins; later duplicates
 * with the same identifier are ignored.
 */
function findResponse(
  responses: ParsedItemResponse[],
  responseIdentifier: string | null | undefined
): ParsedItemResponse | undefined {
  if (!responseIdentifier) {
    return undefined;
  }
  return responses.find((entry) => entry.responseIdentifier === responseIdentifier);
}

/**
 * Resolve a renderer's `InteractionInfo` to the candidate's submitted
 * `string[]` for that interaction.
 *
 * The interaction `id` is the renderer's `response-identifier` value. It is
 * the canonical key for distinguishing interactions in a single item, but
 * it is NOT guaranteed unique (two interactions can share the same id).
 * When sibling interactions share an id, the reporter scopes them by
 * `interactionIndex` (0-based position in `item.interactions`). The
 * binding layer (`resolveSubmittedValues`) DOES use `interaction.id` as a
 * lookup fallback in both the legacy ordered and direct-match rules, so
 * the id is part of the binding protocol — just not the sole scope key.
 *
 * The resolver picks the rules based on the renderer's
 * `declarationValueIndex`:
 *
 * 1. **Legacy ordered `RESPONSE` distribution** — when
 *    `declarationValueIndex !== null`:
 *    1. If a `responseVariable` exists with `responseIdentifier === interaction.id`,
 *       return its `values` array (full array). The legacy path is
 *       opt-in: the renderer must report the index, and the reporter must
 *       then return the indexed value from the declaration. When the
 *       interaction is also reachable through its own `id`, that `id`
 *       match wins and the full `values` array is returned.
 *    2. Else if a `responseVariable` exists with
 *       `responseIdentifier === interaction.declarationIdentifier`,
 *       return `[values[declarationValueIndex]]` — exactly one value, or
 *       `[]` if out of range.
 *    3. Else `[]`.
 * 2. **Direct match** — when `declarationValueIndex === null`:
 *    1. If a `responseVariable` exists with
 *       `responseIdentifier === interaction.declarationIdentifier`,
 *       return its `values` array.
 *    2. Else if a `responseVariable` exists with
 *       `responseIdentifier === interaction.id`, return its `values` array.
 *    3. Else `[]`.
 *
 * In every branch the returned array is a fresh copy (the input `values`
 * arrays on `ParsedItemResponse` are never mutated). A return value of
 * `[]` (never `undefined`) means "no candidate response for this
 * interaction" — renderers can treat that as the per-interaction
 * `（無回答）` slot.
 */
export function resolveSubmittedValues(
  responses: ParsedItemResponse[],
  interaction: InteractionInfo
): string[] {
  if (interaction.declarationValueIndex !== null) {
    const idMatch = findResponse(responses, interaction.id);
    if (idMatch) {
      return idMatch.values.slice();
    }
    const declarationMatch = findResponse(responses, interaction.declarationIdentifier);
    if (declarationMatch) {
      const index = interaction.declarationValueIndex;
      if (index >= 0 && index < declarationMatch.values.length) {
        return [declarationMatch.values[index]];
      }
    }
    return [];
  }

  const declarationMatch = findResponse(responses, interaction.declarationIdentifier);
  if (declarationMatch) {
    return declarationMatch.values.slice();
  }
  const idMatch = findResponse(responses, interaction.id);
  if (idMatch) {
    return idMatch.values.slice();
  }
  return [];
}
