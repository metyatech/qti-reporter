# Reporter Output Formats (Draft)

## Scope
This document defines the required output targets for qti-reporter.
Detailed layouts and column definitions require confirmation.

## Required output targets
- HTML report per respondent (one report per `assessmentResult` input).
- CSV report aggregating all respondents.

## Available input data (for output composition)
The reporter can draw from the following inputs:

- Candidate/session metadata from `assessmentResult/context`:
  `sourcedId`, `sessionIdentifier` values (class, trainee, material metadata).
- Test-level variables from `assessmentResult/testResult`:
  `completionStatus`, `SCORE`, `duration`, `numAttempts`.
- Item-level variables from `assessmentResult/itemResult`:
  `RESPONSE`, per-item `SCORE`, rubric outcome variables
  (`RUBRIC_{index}_MET`).
- Question content from `qti-assessment-item`:
  prompt text, options, correct responses (if defined), scorer rubrics, and
  modal feedback explanations.
- Question ordering from `qti-assessment-test` (required input).

## HTML report format (per respondent)

### Required sections and ordering
Output must be arranged in the following order:

1) Test title
2) Candidate number
3) Candidate name
4) Total score / maximum score
5) Items (one block per item)

### Field sourcing
- Test title: `context/sessionIdentifier` with `sourceID=materialTitle`.
- Candidate number: extract the first continuous digit sequence from
  `context/@sourcedId`. Use the extracted string as-is (preserve leading zeros).
  If no digit sequence is present, treat as an error.
- Candidate name: `context/sessionIdentifier` with `sourceID=candidateName`.

### Item matching and order
- Items are matched by identifier equality:
  - `itemResult@identifier` == `qti-assessment-item@identifier`
- Display order follows the `qti-assessment-item-ref` order in the
  assessment test.

### Per-criterion correctness sourcing
- Use item-level rubric outcomes:
  - `itemResult/outcomeVariable@identifier = RUBRIC_{index}_MET`
  - `baseType=boolean`, value is `true/false`
- Map `{index}` to the scorer rubric criterion order in the corresponding
  `qti-rubric-block view="scorer"`.

### Item block content
Each item block must include:

- Question text
- Per-criterion correctness (scoring rubric criteria)
- Candidate response

Do not display any other fields.

### Interaction requirements
- Each item block is collapsible (toggle).
- The toggle label must show: `item score / item maximum score`.
- Inside each item block, the candidate response section is also collapsible.

### Rendering guidance
- Present content in a readable layout suitable for on-screen review.
- Rendering style is up to the implementation, but must prioritize clarity.

### Output path and naming
- Create a directory named: `{candidateNumber} {candidateName}`
- Save the HTML file as:
  `{candidateNumber} {candidateName} {testTitle} 結果.html`
  inside the directory above.
  - Example (conceptual):
    - Directory: `0001 Yamada Taro`
    - File: `0001 Yamada Taro Algebra Test 結果.html`

### Unused data reporting (standard output)
- If `assessmentResult/itemResult@identifier` exists but is not referenced by
  `qti-assessment-item-ref@identifier`, it is treated as unused data.
- Unused identifiers are reported to standard output as:
  `Unused itemResult identifiers: <id1>, <id2>, ...`

## HTML styling specification (problem + response)

### Style selection
- If no external style is specified, the report embeds the default style:
  `<style data-qti-reporter-style="default">...</style>`
- If an external style is specified, the tool copies it and links it:
  `<link rel="stylesheet" href="./report-style.css" data-qti-reporter-style="external" />`
- When external style is used, the default style is not embedded.

### External style input and output contract
- External style is provided via CLI option: `--style-css <path-to-css>`
- The specified CSS file must exist and must not be empty.
- The tool copies the CSS into the candidate output directory using the fixed
  file name: `report-style.css`
- The HTML file references the copied CSS using a relative path from the HTML:
  `./report-style.css`

### Styling DOM contract (stable selectors)
The following structure and class names are part of the styling contract and
must be treated as stable for external CSS.

- Root layout selectors: `body`, `.report-root`
- Header selectors: `.report-header`, `.report-title`, `.meta-grid`, `.meta-row`, `.meta-label`, `.meta-value`
- Items section selectors: `.items-section`, `.item-block`, `.item-summary`, `.item-score`, `.item-id`, `.item-content`
- Score selectors: `.score-badge`, `.score-total`, `.score-value`, `.score-max`, `.score-separator`
- Section title selector: `.section-title`
- Question content selectors: `.question-section`, `.item-body`
- Image selector: `.report-image`
- Code selectors: `.code-inline`, `.code-block`, `.code-block-code`
- Rubric selectors: `.rubric-section`, `.rubric-table`, `.criterion-text`, `.criterion-points`, `.criterion-status`
- Comment selectors: `.comment-section`, `.comment-content`, `.comment-text`, `.comment-pre`
- Candidate response selectors: `.candidate-response-block`, `.candidate-response-content`, `.response-text`, `.response-pre`, `.response-empty`
- Interaction placeholder selectors: `.interaction-placeholder`, `.choice-interaction`

### Styling data attributes
External CSS may also rely on the following data attributes:

- Report style mode: `data-qti-reporter-style="default"`, `data-qti-reporter-style="external"`
- Item identifier: `data-item-identifier="<itemIdentifier>"`
- Rubric row attributes: `data-criterion-index="<criterionIndex>"`, `data-criterion-status="true|false"`
- Code language attribute: `data-code-lang="<language>"`

### Image asset handling
- Local image paths in `img@src` are resolved relative to the referenced
  assessment item file.
- Local images are copied into the candidate output directory under:
  `assets/<itemIdentifier>/<fileName>`
- The HTML rewrites local image sources to output-relative paths:
  `./assets/<itemIdentifier>/<fileName>`
- External sources (`http`, `https`, `data`, absolute `/`) are not copied and
  are left unchanged.

### Candidate response rendering
- Candidate responses are rendered without collapsing whitespace.
- Line breaks in responses are preserved as entered.
- The default renderer uses a whitespace-preserving block:
  `<pre class="response-text response-pre">...</pre>`

### Item comment rendering
- When `itemResult/outcomeVariable identifier="COMMENT"` exists, it is rendered
  inside the item block as a dedicated section.
- Comment text preserves line breaks and whitespace.
- The default renderer uses:
  `<pre class="comment-text comment-pre">...</pre>`

### Code language inference (no JavaScript)
- If the language is explicitly specified on `code` (for example
  `class="language-ts"` or `data-lang="ts"`), that value is used when supported.
- If the explicit language is missing or is `plain`, the tool infers the
  language from the code content using server-side auto-detection.
- The generated markup includes highlight token classes (for example
  `hljs-keyword`, `hljs-string`) and requires only CSS at runtime.

## TODO (CSV report format)
- Define row granularity (per respondent or per respondent-question).
- Define required columns and ordering.
- Define encoding for missing answers, skipped items, and optional questions.
- Define file naming conventions.
