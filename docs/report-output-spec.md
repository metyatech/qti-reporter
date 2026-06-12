# Reporter Output Formats

## Scope

This document defines the required output targets for qti-reporter.

## Required output targets

- HTML report per respondent (one report per `assessmentResult` input).
- CSV report aggregating all respondents processed in a single run.

## Available input data (for output composition)

The reporter can draw from the following inputs:

- Candidate/session metadata from `assessmentResult/context`:
  `sourcedId`, `sessionIdentifier` values (class, trainee, material metadata).
- Test-level variables from `assessmentResult/testResult`:
  `completionStatus`, `SCORE`, `duration`, `numAttempts`.
- Test-level time limit from `qti-assessment-test` or `qti-test-part`
  `qti-time-limits@max-time`, when present.
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

1. Test title
2. Candidate number
3. Candidate name
4. Total score / maximum score
5. Test time limit, when present
6. Items (one block per item)

### Field sourcing

- Test title: `qti-assessment-test@title`.
- Candidate number: `context/sessionIdentifier` with `sourceID=candidateId`.
  Use the `identifier` value as-is. `context/@sourcedId` is never parsed for a
  candidate number. If the `candidateId` sessionIdentifier is missing, treat as
  an error.
- Candidate name: `context/sessionIdentifier` with `sourceID=candidateName`.
- Test time limit: `qti-time-limits@max-time`, rendered as a test-level display
  value. Item `time-dependent` attributes are not displayed as time limits.

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

Each item block must include, in this order:

1. Question text
2. Scorer comment (when present)
3. Per-criterion correctness (scoring rubric criteria)
4. Candidate response

Do not display any other fields.

### Item result state

- Each item is classified by comparing the item score to the item maximum
  score:
  - `full`: `itemScore == itemMaxScore`
  - `partial`: `0 < itemScore < itemMaxScore`
  - `zero`: `itemScore == 0`
- The state is exposed on the `.item-block` element as
  `data-item-result="full|partial|zero"`.
- The closed `<summary>` row must convey the state without relying on color
  alone: a left color band (`border-left`), a status pill with both icon and
  text (`✓ 満点` / `▲ 要確認` / `✗ 0点`), and a score badge whose color tracks
  the state.

### Grading summary bar

- Directly after the header metadata, a grading summary bar reports counts:
  `要確認 N 問` (items that are `partial` or `zero`), `満点 M 問` (items that
  are `full`), and `全 X 問` (all items).

### Comment indicator

- When an item has a scorer comment, its `.item-block` carries
  `data-has-comment="true"` and the closed `<summary>` shows a
  `💬 コメントあり` flag (icon plus text).

### Summary layout

- The `<summary>` content order is: status pill, problem number + human-readable
  title (with a small, de-emphasized identifier), spacer, comment flag, score
  badge, toggle caret.
- The problem number is the 1-based position of the item in assessment-test
  order. The title is sourced from `qti-assessment-item@title`, falling back to
  the item identifier when absent.

### Interaction requirements

- Each item block is collapsible (toggle) and is collapsed by default (no
  `open` attribute is emitted).
- The toggle row must show: `item score / item maximum score`.
- Inside each item block, the candidate response section is also collapsible.

### Rendering guidance

- Present content in a readable layout suitable for on-screen review.
- Rendering style is up to the implementation, but must prioritize clarity.
- Inline code must remain inline in prose and choice labels. It must not be
  promoted into centered or standalone block-like layout by report CSS.

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
- Header selectors: `.report-header`, `.report-title`, `.report-subtitle`, `.meta-grid`, `.meta-row`, `.meta-label`, `.meta-value`
- Grading summary selectors: `.summary-bar`, `.summary-chip`, `.summary-count`
- Items section selectors: `.items-section`, `.item-block`, `.item-summary`, `.item-score`, `.item-id`, `.item-content`
- Item summary selectors: `.status-pill`, `.item-head`, `.item-title`, `.item-no`, `.item-spacer`, `.comment-flag`, `.toggle-caret`
- Score selectors: `.score-badge`, `.score-total`, `.score-value`, `.score-max`, `.score-separator`
- Section title selector: `.section-title`
- Response section selector: `.response-section`
- Question content selectors: `.question-section`, `.item-body`
- Cloze selector: `.cloze-input`
- Image selector: `.report-image`
- Code selectors: `.code-inline`, `.code-block`, `.code-block-code`
- Rubric selectors: `.rubric-section`, `.rubric-table`, `.criterion-text`, `.criterion-points`, `.criterion-status`
- Comment selectors: `.comment-section`, `.comment-content`, `.comment-text`, `.comment-pre`
- Candidate response selectors: `.candidate-response-block`, `.candidate-response-content`, `.response-text`, `.response-pre`, `.response-empty`
- Choice response selectors: `.choice-response-list`, `.choice-response-option`, `.choice-response-selected`, `.choice-response-marker`, `.choice-response-text`, `.choice-response-label`, `.choice-response-unmatched`
- Interaction placeholder selectors: `.interaction-placeholder`, `.choice-interaction`

### Styling data attributes

External CSS may also rely on the following data attributes:

- Report style mode: `data-qti-reporter-style="default"`, `data-qti-reporter-style="external"`
- Item identifier: `data-item-identifier="<itemIdentifier>"`
- Item result state: `data-item-result="full|partial|zero"`
- Comment presence: `data-has-comment="true"` (present only when the item has a
  scorer comment)
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
- For choice items, the candidate response section renders the available
  options as a choice list instead of a raw response identifier. Response values
  are sourced from `candidateResponse/value` identifiers such as `CHOICE_1` and
  matched to the corresponding `qti-simple-choice`. The selected option uses
  `.choice-response-selected`, a `●` marker, and the text label `学生の回答`.
  Unselected options use a `○` marker. Internal choice response identifiers such
  as `CHOICE_1` must not be shown as candidate-response text. Matched option
  content is rendered with the same report HTML semantics as the problem choice,
  including inline code markup. If a response identifier cannot be matched to an
  option, the selected row must show `選択肢本文を取得できません` instead of echoing
  the unmatched identifier.
- For cloze items (blank inputs), the candidate response section renders the
  question HTML with input fields filled with the candidate responses.
  Inputs use `.cloze-input` and `.qti-blank-input` and their `size` attribute
  expands based on the response length.

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

## CSV report format (aggregated across respondents)

### Purpose

- Provide a single, machine-readable export that aggregates all respondents.
- Ensure that one CSV contains enough information to analyze results without
  opening the HTML reports.

### Row granularity

- One row represents one respondent-item pair.
- A single respondent therefore produces `N` rows, where `N` is the number of
  items referenced by the assessment test.
- Item order is the canonical order from `qti-assessment-item-ref`.

### Output location and naming

- Output directory: the CLI `--out-dir` root directory.
- File name: `report.csv`
- Output path: `{outDir}/report.csv`
  - When multiple `assessmentResult` inputs are provided, rows are appended for
    each respondent in the order the inputs are processed.

### Append and overwrite rules

- If `report.csv` does not exist, create it and write the header row first.
- If `report.csv` already exists, append only data rows.
- The header row must appear exactly once at the top of the file.

### Encoding, delimiter, and line endings

- Encoding: UTF-8 with BOM.
- Delimiter: comma (`,`).
- Line endings: LF (`\n`).
- Quoting rules follow RFC 4180:
  - Fields containing commas, double quotes, or newlines must be wrapped in
    double quotes.
  - Double quotes inside a quoted field must be escaped by doubling them.

### Column definitions and ordering

Columns are ordered as follows.

| Column name        | Type             | Required | Description / source                                                                                                                                                 |
| ------------------ | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate_number` | string           | required | `context/sessionIdentifier@identifier` where `sourceID=candidateId` (used as-is; `context@sourcedId` is never parsed). Missing value is an error.                    |
| `candidate_name`   | string           | required | `context/sessionIdentifier@identifier` where `sourceID=candidateName`.                                                                                               |
| `test_title`       | string           | required | `qti-assessment-test@title`.                                                                                                                                         |
| `total_score`      | number           | required | `testResult/outcomeVariable identifier="SCORE"` when present; otherwise the sum of item scores.                                                                      |
| `total_max_score`  | number           | required | Sum of per-item maximum scores derived from scorer rubrics.                                                                                                          |
| `item_order`       | number (integer) | required | 1-based index of the item in `qti-assessment-item-ref` order.                                                                                                        |
| `item_identifier`  | string           | required | `qti-assessment-item-ref@identifier`.                                                                                                                                |
| `item_title`       | string           | required | `qti-assessment-item@title`. Falls back to `item_identifier` if missing.                                                                                             |
| `item_score`       | number           | required | `itemResult/outcomeVariable identifier="SCORE"` when present; otherwise rubric-based computed score.                                                                 |
| `item_max_score`   | number           | required | Sum of rubric criterion points (`qti-rubric-block view="scorer"`).                                                                                                   |
| `rubric_outcomes`  | string           | required | Per-criterion achievement encoded as `index:true` or `index:false` pairs joined by `;` in criterion order (example: `1:true;2:false`).                               |
| `rubric_points`    | string           | required | Per-criterion points encoded as `index:points` pairs joined by `;` in criterion order (example: `1:2;2:1`).                                                          |
| `response_values`  | string           | required | Candidate responses from `responseVariable identifier="RESPONSE"`. Multiple values are joined by `\n` in assessment result order. Empty when no response is present. |
| `response_labels`  | string           | required | Response values rendered for readability. For choice items, each line is `CHOICE_ID: choice text`. For non-choice items, identical to `response_values`.             |
| `comment`          | string           | required | `itemResult/outcomeVariable identifier="COMMENT"` when present; otherwise empty.                                                                                     |

### Rubric encoding details

- Criterion order is the order of `qti-p` elements inside
  `qti-rubric-block view="scorer"`.
- Each criterion index is 1-based.
- `rubric_outcomes` uses `true` and `false` literals.
- If rubric criteria exist, every criterion must appear in both
  `rubric_outcomes` and `rubric_points`.
- Missing rubric outcomes are treated as an error (do not emit partial data).

### Response encoding details

- The exporter targets `responseVariable identifier="RESPONSE"`.
- Multiple `<value>` elements are supported and are emitted in order.
- Line breaks inside responses are preserved as LF (`\n`) within the CSV cell.
- If no candidate response exists, emit an empty string.
- The literal `（無回答）` is not used in CSV; it is HTML-only presentation.

### Score computation rules

- `item_max_score` is computed as the sum of rubric criterion points.
- `item_score` is sourced in the following order:
  - Use `itemResult/outcomeVariable identifier="SCORE"` when present.
  - Otherwise compute from rubric outcomes and rubric points.
  - If neither is possible, treat as an error.
- `total_score` is sourced in the following order:
  - Use `testResult/outcomeVariable identifier="SCORE"` when present.
  - Otherwise compute as the sum of `item_score`.
- If `testResult/outcomeVariable identifier="SCORE"` is present but differs from the sum of `item_score`, the reporter still uses the test-level score. Treat mismatches as an upstream data issue.

### Item coverage rules

- Items must be emitted strictly in assessment test order.
- If an assessment test item is missing a corresponding `itemResult`, treat as
  an error.
- `itemResult` entries that do not appear in the assessment test are considered
  unused data:
  - They are not emitted to CSV.
  - They must be reported to standard output in the same format as the HTML
    report: `Unused itemResult identifiers: <id1>, <id2>, ...`.

### Missing and invalid data handling

- Required fields must not be silently defaulted.
- If a required input is missing or invalid, the exporter must fail fast with a
  clear error message describing what to fix.
