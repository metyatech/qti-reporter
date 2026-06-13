# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-13

### Changed

- Unifies the reporter against `qti-html-renderer@^0.1.3` as the single
  source of truth for the question body, explanation body, and per-item
  `InteractionInfo` (declaration identifier, declaration value index,
  cardinality, base type, correct response values, and the interaction's
  own choices).
- Correct answer and candidate response are now rendered **per
  interaction**, keyed by `data-interaction-id`. Each interaction is
  resolved by the renderer's `InteractionInfo.declarationIdentifier`
  first, with a fallback to the interaction element's own response
  identifier, and a final legacy fallback that maps
  `RESPONSE_N -> RESPONSE_${declarationValueIndex + 1}` when the
  renderer reports the legacy ordered distribution.
- The reporter no longer parses the source XML for `qti-response-declaration`
  or `qti-correct-response`; the previous `parseCorrectResponses`,
  `parseAssessmentItemForScoring`, and `applyReportCodeHighlighting` paths
  are removed.
- The reporter no longer parses the result XML for `RESPONSE_N` numeric
  suffix names. `ParsedItemResponse` now records
  `{ responseIdentifier, value, declarationValueIndex }` and
  preserves every `<value>` element in document order, so a
  `cardinality="multiple"` response is not collapsed to a single
  string.
- The explanation body is used verbatim from the renderer's
  `explanationHtml`. The reporter does not run a second highlighter
  pass on the explanation body. Code blocks and inline code keep the
  renderer-supplied `code-block`, `code-block-code`, `hljs`,
  `data-code-lang`, and `code-inline` classes.
- The retake body for choice interactions is now grouped per
  interaction (radio for `cardinality=single`, checkbox for
  `cardinality=multiple`); the radio/checkbox name is per interaction
  (`qti-${item.identifier}-${interaction.id}`) and uses the choice
  text as the input value, so the internal choice identifier never
  appears in the retake body, even when two interactions share the
  same choice identifier.

### Added

- New `InteractionInfo` type re-export from
  `qti-html-renderer` is available to consumers of
  `src/qti/assessmentItem.ts`.
- New `unification-*.qti.xml` fixtures and a corresponding
  `unification-result.xml` covering: multiple choice interactions in
  the same item, single + multiple choice in the same item, two
  choice interactions that share an internal identifier, partial
  response where one interaction is unanswered, declaration order vs.
  body order mismatch, response-variable order mismatch, legacy
  ordered `RESPONSE` distribution, multiple text-entry interactions
  with distinct identifiers, extended-text whitespace preservation,
  multiple values for a `cardinality="multiple"` variable, local
  images in the correct-answer block and in the explanation body,
  and the omitted-section case.
- New JSDOM-backed tests in `src/test/unification.test.ts` and
  `src/test/html-report.test.ts` covering the per-interaction binding
  rules, the no-rehighlight contract, the asset-copying for the
  correct-answer and explanation bodies, and the per-interaction
  radio/checkbox grouping.
- New `（無回答）` label for a per-interaction candidate response row
  when no submitted value exists for that interaction, even when
  other interactions in the same item have submitted values.

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
