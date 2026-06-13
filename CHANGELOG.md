# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The shared `src/report/interactionResponses.ts` resolver no longer
  applies the old "interaction-id first" rule. The selection is now driven
  by the renderer's `declarationValueIndex` and the interaction's
  `declarationIdentifier`:
  - When `declarationValueIndex !== null` (legacy ordered `RESPONSE`
    distribution): the resolver returns the `responseVariable` bound to
    `interaction.id` in full when one exists; otherwise the indexed value
    `[values[declarationValueIndex]]` from the `responseVariable` bound
    to `interaction.declarationIdentifier`; otherwise `[]`.
  - When `declarationValueIndex === null` (direct match): the resolver
    returns the `responseVariable` bound to `interaction.declarationIdentifier`
    in full; otherwise the `responseVariable` bound to `interaction.id`
    in full; otherwise `[]`.
    The returned `string[]` is always a fresh copy of the input `values`
    array — the reporter never mutates the parser's records.
- `responseDedupeKey` is now documented as an `interactionIndex`-aware
  key: the legacy-distribution case still uses
  `"<declarationIdentifier>|<declarationValueIndex>|<interaction.id>"`,
  the direct-match case collapses to `declarationIdentifier`, and the
  unmatched case falls back to `interaction.id` (or `''`). The
  interaction `id` is now explicitly treated as a **display attribute**,
  not a unique key — two interactions in the same item can share the
  same `id` (e.g. duplicate `response-identifier="RESPONSE"`), and the
  `interactionIndex` (0-based position in `item.interactions`) is the
  reporter's authoritative key for distinguishing such siblings.
- The per-item choice render info in `src/report/htmlReport.ts` is
  rebuilt as a single JSDOM parse keyed by `interactionIndex` (0-based
  position of the choice interaction in `item.interactions`). The result
  type is
  `Array<{ interaction, interactionIndex, choiceInnerHtmlByIdentifier: Map<string, string> }>`
  and is consumed by the candidate-response, correct-answer, and
  retry-question body builders. There is **no** global `simple-choice`
  fallback map anymore: choice inner HTML is resolved only by the
  wrapper for that `interactionIndex` or, when the wrapper is missing,
  by `interaction.choices[].text`. The previous `buildChoiceInnerHtmlMap`
  helper and the previous `Map<interactionId, Map<choiceIdentifier, innerHtml>>`
  keyed-by-id build are removed.
- The candidate-response radio/checkbox name is now
  `qti-candidate-<itemIdentifier>-<interactionIndex>-<interactionId>`
  and the retry-question radio/checkbox name is now
  `qti-retry-<itemIdentifier>-<interactionIndex>-<interactionId>`,
  with each segment sanitized by `replace(/[^A-Za-z0-9._-]/g, '-')`.
  This guarantees that two interactions in the same item, even when they
  share the same `id` (or have an empty `id`), never collapse into a
  single browser radio/checkbox group. The candidate and retry groups
  differ by the `qti-candidate-` vs `qti-retry-` prefix; the item
  identifier is part of the name, so the same `id` reused across two
  items never collides either.
- `formatDescriptiveResponse` in `src/report/htmlReport.ts` now flattens
  every `response.values` entry from `ParsedItemResponse[]` into a single
  string array. When the flattened length is zero, the section renders
  `<p class="response-empty">（無回答）</p>` and **never** an empty
  `<pre class="response-text response-pre">`. When at least one value
  exists, the values are joined with `\n` and rendered in the `<pre>`
  as before. Whitespace, indentation, tabs, and blank lines are
  preserved verbatim, and CRLF/CR is normalized to LF (the existing
  normalization is unchanged).
- `parseCandidateResponses` in `src/qti/assessmentResult.ts` now
  recognizes self-closing `<candidateResponse />` and
  `<candidateResponse/>` forms in addition to the explicit
  `<candidateResponse>...</candidateResponse>` form. Self-closing
  forms produce `{ responseIdentifier, values: [] }`. `responseVariable`
  blocks with **no** `<candidateResponse>` element at all are still
  skipped. The parser walks `responseVariable` blocks in document order
  so the per-interaction `responses` list is stable.
- `.gitignore` no longer lists `.omo/`; the file ends with a trailing
  newline.

### Added

- New `unification-duplicate-ids.qti.xml` fixture: two
  `qti-choice-interaction`s share `response-identifier="RESPONSE"` and
  the same internal choice identifiers, but carry different choice
  texts (Alpha/Beta in the first, Gamma/Delta in the second). The
  result registers a single `responseVariable` and a per-interaction
  rubric outcome, so the reporter must render each interaction
  independently and not collapse them.
- New `unification-empty-ids.qti.xml` fixture: two
  `qti-choice-interaction`s with no `response-identifier` attribute.
  The result omits the response so the candidate-response block
  renders `（無回答）` for each row and the retry-question block still
  produces two distinct radio names keyed by `interactionIndex`.
- New `unification-empty-candidate-response.qti.xml` fixture: a
  descriptive item (no interactions) with `<candidateResponse />` in
  the result. The reporter must render `（無回答）` and must NOT
  emit an empty `<pre class="response-text response-pre">`.
- `unification-test.qti.xml` and `unification-result.xml` now include
  the new fixture items with per-item `SCORE` and
  `RUBRIC_{index}_MET` outcomes.
- New direct unit tests in
  `src/test/interactionResponses.test.ts` covering all six
  `resolveSubmittedValues` rule branches (legacy with id match,
  legacy with declaration index, legacy with out-of-range index,
  direct with declaration, direct with id only, direct with both
  declaration and id) plus the immutability of the input `values`
  array and the `responseDedupeKey` key forms.
- New direct parser tests in
  `src/test/assessmentResult.test.ts` covering the
  `<candidateResponse />` and `<candidateResponse/>` self-closing
  forms, the "no `<candidateResponse>` element at all" skip case,
  and the document-order preservation of `responseVariable` blocks.
- New unification tests in `src/test/unification.test.ts` for the
  duplicate-id, empty-id, empty-candidate-response, and
  extended-text whitespace fixtures.

### Fixed

- Two choice interactions that share the same
  `response-identifier="RESPONSE"` no longer bleed text into each
  other. The previous global `simple-choice` fallback could surface
  Alpha/Beta for both rows when the second row's wrapper was missing
  from the renderer output; the new per-`interactionIndex` build
  scopes the choice inner HTML map to the wrapper that actually owns
  the choice identifiers.
- Two choice interactions that share the same `response-identifier`
  no longer collapse into a single browser radio group. The previous
  `qti-candidate-<itemIdentifier>-<index>-<interactionId>` and
  `qti-retry-<itemIdentifier>-<index>-<interactionId>` names used the
  same `<index>` for both rows in some multi-interaction paths; the
  new resolver always derives the index from `item.interactions`
  document order, so the two rows now have distinct names.
- The descriptive (no-interactions) candidate response no longer
  renders an empty `<pre class="response-text response-pre">` when
  every `responseVariable` is missing or self-closing. The reporter
  emits `（無回答）` instead.
- The CSV `response_values` and `response_labels` cells no longer
  carry `CHOICE_A` / `CHOICE_B` identifiers for choice items whose
  candidate response is empty; the cell is now empty (HTML-only
  `（無回答）`), matching the spec rule.

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
