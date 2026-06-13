# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Total score computation now prefers `testScore` from the result XML over the sum of item scores. This is a breaking change for cases where the test-level score differs from the sum of item scores. To detect affected cases, compare `testScore` to the sum of item scores; if they differ, the total score output will no longer match the behavior of previous versions.

## [1.0.0] - 2026-02-05

### Added

- Initial release.
