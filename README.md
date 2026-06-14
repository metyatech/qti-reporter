# qti-reporter

## Overview

qti-reporter generates human-readable HTML reports per respondent and an
aggregated CSV report from QTI 3.0 assessment items and results.

qti-reporter does not read Markdown source files. When Markdown authoring is
used, `markdown-to-qti` must first generate a QTI package; qti-reporter then
reads the package `assessment-test.qti.xml`, referenced QTI item XML files, and
QTI assessmentResult XML files to produce the HTML reports and `report.csv`.
When the QTI package includes `qti-time-limits@max-time`, qti-reporter only
formats that QTI test-level time limit for display in the HTML report. It does
not parse Markdown time-limit notation and does not use time limits for scoring.

## Specifications

- Input QTI spec: `docs/input-qti-spec.md`
- Output report spec: `docs/report-output-spec.md`
  - See the [Empty value handling](docs/report-output-spec.md#empty-value-handling-across-parser-binding-and-display)
    section for the three-stage contract (parser keeps, binding keeps,
    display drops) used for empty `<value/>` elements.

## Renderer integration

qti-reporter uses `qti-html-renderer@^0.1.3` as the single source of truth
for item XML parsing. The reporter calls
`renderQtiItemForReport(xml, expectedIdentifier, options)` once per item
and reads `interactions[].correctResponse`, `interactions[].id`,
`interactions[].declarationIdentifier`, `interactions[].declarationValueIndex`,
`interactions[].cardinality`, `interactions[].baseType`,
`interactions[].choices`, and `explanationHtml` directly from the
returned `ParsedItemForReport`. The reporter does not re-parse
`qti-response-declaration` or `qti-correct-response` itself, and it does
not run any code highlighter on the explanation body — the renderer
already calls the supplied `codeHighlighter` for both the question body
and the explanation body, and the reporter only resolves local image
assets under `qti-modal-feedback` / `qti-content-body` and inside
`<qti-simple-choice>` choices.

`InteractionInfo.declarationValueIndex` is the renderer's authoritative
record of the legacy ordered `RESPONSE` distribution. The reporter is
the only consumer of that field; the result-side `ParsedItemResponse`
shape is `{ responseIdentifier, values: string[] }` and never carries
`declarationValueIndex`. The shared `src/report/interactionResponses.ts`
module centralises the binding rules (legacy ordered index and direct
match) and is called by both the HTML and CSV reports.

### Interaction `id` is a display attribute, not a unique key

`InteractionInfo.id` is the renderer-emitted value of the
`response-identifier` attribute on the interaction element. It is
displayed to the reader (as the per-interaction label, in
`data-interaction-id`, and in CSV `response_labels`). The interaction ID
is the `responseVariable` lookup protocol's binding key — both the
legacy ordered and direct-match rules in `resolveSubmittedValues` use
it as a lookup branch — but it is **not** the canonical key for
uniquely identifying an interaction instance. The canonical key for
distinguishing sibling interactions in the same item is the
`interactionIndex` — the 0-based position of the interaction in
`item.interactions`. Two `qti-choice-interaction` elements in the same
item can carry the same `id` (e.g. duplicate
`response-identifier="RESPONSE"`, or two interactions with no
`response-identifier` at all), and the reporter never relies on the id
alone to disambiguate them. The candidate-response and retry-question
radio/checkbox names are built as
`qti-candidate-<itemIdentifier>-<interactionIndex>-<interactionId>` /
`qti-retry-<itemIdentifier>-<interactionIndex>-<interactionId>` (each
segment sanitized with `replace(/[^A-Za-z0-9._-]/g, '-')`), so two
siblings in the same item never share a browser radio/checkbox group
even when their `id` is identical or empty.

## Setup

1. Install dependencies.

```bash
npm install
```

## Usage (HTML Per Respondent)

Run the CLI using `npx` or `npm start`.

```bash
npx qti-reporter --assessment-test <path-to-assessment-test.qti.xml> --assessment-result <path-to-assessment-result.xml> ...
```

Or using `npm start` (which builds the project first):

```bash
npm start -- --assessment-test <path-to-assessment-test.qti.xml> --assessment-result <path-to-assessment-result.xml> [--assessment-result <path-to-assessment-result.xml> ...] [--assessment-result-dir <dir>] --out-dir <output-directory> [--style-css <path-to-style.css>]
```

Arguments:

- `--assessment-test`: Path to the `qti-assessment-test` XML file.
- `--assessment-result`: Path to the `assessmentResult` XML file. Repeat this option to process multiple results in one run.
- `--assessment-result-dir`: Directory containing `assessmentResult` XML files. Files are discovered non-recursively and processed in filename order.
- `--out-dir`: Output root directory. If omitted, the directory of the assessment-result input is used (or the assessment-result directory when using `--assessment-result-dir`).
- `--style-css`: Optional path to a CSS file. When omitted, the default style is embedded.

Styling behavior:

- Default: embeds `<style data-qti-reporter-style="default">...</style>`
- External: copies the specified CSS to `report-style.css` and links `<link rel="stylesheet" href="./report-style.css" data-qti-reporter-style="external" />`

The output is written as:

- Directory: `{candidateNumber} {candidateName}`
- File: `{candidateNumber} {candidateName} {testTitle} 結果.html`
- External style file (when `--style-css` is used): `report-style.css`
- Aggregated CSV (at the output root): `report.csv` (UTF-8 with BOM). When multiple results are provided, rows are appended for all respondents.

`candidateNumber` is sourced from `context/sessionIdentifier` with
`sourceID="candidateId"`; qti-reporter uses that `identifier` value as-is and
never parses `context/@sourcedId` for a candidate number. A missing `candidateId`
session identifier is an error.

Example using the repository fixtures:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run
```

Example with external CSS:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run --style-css src/test/fixtures/custom-style.css
```

## Development Commands

- Build (always deletes `dist/` first, then compiles, so stale JavaScript from
  deleted or renamed sources never lingers in `dist/`):

```bash
npm run build
```

- Lint (TypeScript + ESLint):

```bash
npm run lint
```

- Format (Prettier):

```bash
npm run format
```

- Test:

```bash
npm test
```

- Verify (runs all checks):

```bash
npm run verify
```

## Environment Variables

This project does not use environment variables.

## Deployment

A CI pipeline is defined using GitHub Actions (`.github/workflows/ci.yml`) which runs lint, tests, and build on push to `main` and on pull requests.
