# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Correct-answer interaction index drift.** The previous `buildCorrectAnswerHtml` used the post-filter `index` when calling `renderCorrectAnswerSection`, so a choice interaction with no correct response caused the next interaction to render at the wrong index (and pick up the previous interaction's choice text/image). The fix preserves the original `interactionIndex` from `item.interactions` through the filter.

- **Empty candidate values are now treated as "no answer".** `<value></value>`, `<value />`, and `<value/>` in the result XML are now recognized uniformly; the parser records them as `""` and the HTML layer drops them. Whitespace-only and tab/newline-only values are kept verbatim (no `trim()`).

### Changed

- **Item-level JSDOM parse.** The candidate-response, correct-answer, and retry-question bodies for a single item now share a single `new JSDOM()` parse of the item's `questionHtml`. Choice render info, candidate response HTML, correct answer HTML, and the retry body are all derived from the same parsed root (the retry body mutates a `cloneNode(true)` copy). Descriptive items with no choice interaction and no cloze input do not parse JSDOM at all.

- **Duplicate and empty interaction IDs stay isolated.** Two interactions sharing a `response-identifier` (or both lacking one) still render as independent candidate-response and retry-question blocks, keyed by `interactionIndex`. The CSV dedupe key contract is unchanged.

- **Self-closing `<candidateResponse />` and `<candidateResponse/>`.** Both forms produce a `{ responseIdentifier, values: [] }` record, matching the explicit empty form.

- **Shared binding priority.** The HTML and CSV reports both call `resolveSubmittedValues` and `responseDedupeKey` from `src/report/interactionResponses.ts`. The interaction `id` is the per-interaction display label and a binding-lookup fallback (legacy ordered: id-first; direct match: id-after-declaration), but siblings are scoped by `interactionIndex`. `responseDedupeKey` itself is NOT `interactionIndex`-aware — the CSV key uses `<declarationIdentifier>|<declarationValueIndex>|<interaction.id>` for the legacy path, `declarationIdentifier` for direct match, and `interaction.id` (or `""`) for unmatched. The unmatched case intentionally collapses CSV cells when two interactions share an id; HTML keeps them separate.

## [1.2.0] - 2026-06-13

### Changed

- Unifies the reporter against `qti-html-renderer@^0.1.3` as the single
  source of truth for the question body, explanation body, and per-item
  `InteractionInfo` (declaration identifier, declaration value index,
  cardinality, base type, correct response values, and the interaction's
  own choices).
- Correct answer and candidate response are now rendered **per
  interaction**, keyed by `data-interaction-id`. Each interaction is
  resolved by the renderer's `InteractionInfo` through the
  legacy/direct-match rules in
  `src/report/interactionResponses.ts`. The reporter no longer applies
  the old "interaction-id first" rule; the binding is driven by
  `declarationValueIndex` and `declarationIdentifier`. The interaction
  `id` is treated as a display attribute (the `response-identifier`
  on the interaction element), not a unique key — the
  `interactionIndex` (0-based position in `item.interactions`) is the
  reporter's authoritative key for distinguishing siblings.
- The reporter no longer parses the source XML for `qti-response-declaration`
  or `qti-correct-response`; the previous `parseCorrectResponses`,
  `parseAssessmentItemForScoring`, and `applyReportCodeHighlighting` paths
  are removed.
- `ParsedItemResponse` is now `{ responseIdentifier, values: string[] }`;
  the previous `value` and `declarationValueIndex` fields are removed
  from the result side. Every `<value>` element is preserved in document
  order, so a `cardinality="multiple"` response is not collapsed to a
  single string. The renderer is the only authority for
  `declarationValueIndex`; the reporter reads it from
  `InteractionInfo` and uses it to pick the single value at that index
  for legacy ordered bindings.
- The explanation body is used verbatim from the renderer's
  `explanationHtml`. The reporter does not run a second highlighter
  pass on the explanation body. Code blocks and inline code keep the
  renderer-supplied `code-block`, `code-block-code`, `hljs`,
  `data-code-lang`, and `code-inline` classes.
- The retake body for choice interactions is now grouped per
  interaction (radio for `cardinality=single`, checkbox for
  `cardinality=multiple`); the radio/checkbox name is
  `qti-retry-<itemIdentifier>-<interactionIndex>-<interactionId>`,
  with each segment sanitized by
  `replace(/[^A-Za-z0-9._-]/g, '-')`, and uses the choice text as
  the input value, so the internal choice identifier never appears
  in the retake body, even when two interactions share the same
  choice identifier.
- The candidate-response radio/checkbox name is now
  `qti-candidate-<itemIdentifier>-<interactionIndex>-<interactionId>`,
  with the 0-based `interactionIndex` of the interaction in the
  item's `interactions` list. The per-interaction wrapper also
  carries a `data-candidate-name="qti-candidate-<itemIdentifier>-<interactionIndex>"`
  attribute for stable CSS / scripting targeting. This guarantees
  that two interactions in the same item, the same `id` reused
  across two items, or any combination of an empty `id` and a
  distinct `interactionIndex`, never share a browser radio/checkbox
  group.
- The per-item choice render info is now a per-item array of
  `{ interaction, interactionIndex, choiceInnerHtmlByIdentifier: Map<string, string> }`
  produced from a single JSDOM parse of `item.questionHtml`. The
  reporter uses the wrapper for the current `interactionIndex` to
  resolve choice inner HTML and falls back to
  `interaction.choices[].text` when the wrapper is missing. The
  previous `Map<interactionId, Map<choiceIdentifier, innerHtml>>`
  build and the global `simple-choice` fallback are removed.
- The correct-answer body now uses the resolved item (with rewritten
  image sources) for the per-item choice render info, so local
  images inside `<qti-simple-choice>` are copied to
  `assets/<itemIdentifier>/<fileName>` and the `src` is rewritten to
  the output-relative path the same way question-body images are.

### Added

- New `InteractionInfo` type re-export from
  `qti-html-renderer` is available to consumers of
  `src/qti/assessmentItem.ts`.
- New shared module `src/report/interactionResponses.ts` exporting
  `resolveSubmittedValues(responses, interaction)` and
  `responseDedupeKey(interaction)`. Both the HTML and CSV reports call
  into this module; submission-to-interaction binding rules live here in
  one place.
- New `unification-*.qti.xml` fixtures and a corresponding
  `unification-result.xml` covering: multiple choice interactions in
  the same item, single + multiple choice in the same item, two
  choice interactions that share an internal identifier, partial
  response where one interaction is unanswered, declaration order vs.
  body order mismatch, response-variable order mismatch, legacy
  ordered `RESPONSE` distribution, multiple text-entry interactions
  with distinct identifiers, extended-text whitespace preservation,
  multiple values for a `cardinality="multiple"` variable, local
  images in the correct-answer block (in the question body and
  inside a `<qti-simple-choice>`) and in the explanation body,
  and the omitted-section case.
- New `unification-duplicate-ids.qti.xml` fixture (two
  `qti-choice-interaction`s sharing `response-identifier="RESPONSE"`
  with the same internal choice identifiers but different texts) and
  the matching per-item rubric outcomes / `SCORE` / candidate values
  in `unification-result.xml`.
- New `unification-empty-ids.qti.xml` fixture (two
  `qti-choice-interaction`s with no `response-identifier`).
- New `unification-empty-candidate-response.qti.xml` fixture (a
  descriptive item with a self-closing `<candidateResponse />`).
- New `new-shared-choices-across-items-{A,B}.qti.xml` fixture pair
  with two items in one section that both carry a choice interaction
  with `response-identifier="RESPONSE"`. A new test confirms the
  candidate-response and retry-question radio names are unique per
  item, even when both items share the same interaction id.
- New JSDOM-backed tests in `src/test/unification.test.ts`,
  `src/test/html-report.test.ts`, `src/test/csv-report.test.ts`,
  `src/test/interactionResponses.test.ts`, and
  `src/test/assessmentResult.test.ts` covering the per-interaction
  binding rules (legacy and direct), the no-rehighlight contract, the
  asset-copying for the correct-answer (with a `<qti-img>` inside a
  choice) and explanation bodies, the per-interaction radio/checkbox
  grouping, the cross-item name uniqueness, the legacy ordered CSV
  row layout, the duplicate-id, empty-id, and empty-candidate-response
  fixtures, and the immutability of the input `values` array in
  `resolveSubmittedValues`.
- New `（無回答）` label for a per-interaction candidate response row
  when no submitted value exists for that interaction, even when
  other interactions in the same item have submitted values.
- New `<p class="response-empty">（無回答）</p>` for descriptive items
  whose every `responseVariable` is missing or self-closing, instead
  of an empty `<pre class="response-text response-pre">`.

### Fixed

- The legacy ordered `RESPONSE` distribution now produces a single
  cell per interaction in the CSV (alpha\nbeta for a 2-blank item),
  instead of duplicating or collapsing the values. The CSV cell is
  built from `response.values` (the array), with each value on its
  own line in the cell.
- Local images inside `<qti-simple-choice>` (not just the question
  body) are now copied to `assets/<itemIdentifier>/<fileName>` and
  the `src` is rewritten to the output-relative path, so the
  correct-answer body, the candidate-response body, and the
  retry-question body all see the resolved image.
- Two choice interactions that share the same
  `response-identifier` no longer render their choice texts on the
  wrong row (the old per-`interactionId` map could miss the wrapper
  for the second interaction and fall back to a global
  `simple-choice` scan). The new per-`interactionIndex` map and the
  removal of the global fallback lock each row to its own wrapper.

## [1.1.3] - 2026-05-30

### Added

- ESLint and Prettier configuration.
- Project metadata files (LICENSE, CHANGELOG, etc.).
- CI workflow for GitHub Actions.
- Editable retake question body inside `<div class="retry-question-block">`:
  cloze inputs are not pre-filled, choice items render as native radio
  inputs grouped per item, and descriptive items render an empty textarea.
  Internal choice identifiers (`CHOICE_A`/`CHOICE_B`) never appear in the
  retake body.
- New inner `<details class="correct-answer-block"
data-answer-section="correct">` that renders the choice text (not the
  internal id) for choice items, or the question body with ordered correct
  values written into read-only cloze inputs for cloze items, when
  `qti-correct-response` exists.
- New inner `<details class="answer-explanation-block"
data-answer-section="explanation">` that renders the explanation body from
  `qti-modal-feedback identifier="EXPLANATION"`. The explanation body is
  passed through the same code highlighter (hljs) the question body uses
  so code blocks and inline code are highlighted consistently.
- Local images inside `qti-modal-feedback` / `qti-content-body` are copied
  into `assets/<itemIdentifier>/<fileName>` and the `src` is rewritten to
  the output-relative path, the same way question images are.
- New `resolveExplanationAssets(html, itemPath, itemIdentifier, outputDirPath)`
  helper in `src/qti/assetResolver.ts`.
- New `applyResponsesToPromptHtmlReadonly` helper in `src/report/cloze.ts`
  for the read-only "submitted answer" and "correct answer" cloze bodies.
- New `parseCorrectResponses(itemPath)` helper in `src/qti/assessmentItem.ts`
  that extracts `qti-correct-response` values from item XML.
- New CSS rules for `.retry-question-block`, `.choice-retry`,
  `.cloze-input-readonly`, `.correct-answer-block`, and
  `.answer-explanation-block` (default style only; the external CSS contract
  is unaffected because the new class names are opt-in).
- New JSDOM-backed tests covering the retake body, candidate-response inner
  details, correct-answer inner details, answer-explanation inner details,
  section ordering, and the explanation image asset copy.
- New test fixtures: `new-package-with-explanation-test.qti.xml` (with three
  items, each carrying `qti-modal-feedback identifier="EXPLANATION"`) and
  `new-package-no-explanation-test.qti.xml` (with a single choice item that
  has neither `qti-correct-response` nor `qti-modal-feedback`).

### Changed

- The 問題 (question) section no longer pre-fills the candidate response.
  Submitted values now appear only inside the 受験者の回答 section.
- Pre-existing status pill text (`要確認` for partial credit) and the
  internal `partial` state name in `data-item-result` are preserved.
- All pre-existing class names and data attributes documented in
  `docs/report-output-spec.md` are preserved; the new sections are added as
  opt-in additions.
- Total score computation now prefers `testScore` from the result XML over the sum of item scores. This is a breaking change for cases where the test-level score differs from the sum of item scores. To detect affected cases, compare `testScore` to the sum of item scores; if they differ, the total score output will no longer match the behavior of previous versions.

## [1.0.0] - 2026-02-05

### Added

- Initial release.
