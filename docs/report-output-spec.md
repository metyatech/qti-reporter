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
  per-item `SCORE`, rubric outcome variables
  (`RUBRIC_{index}_MET`), and per-`responseVariable` candidate
  responses.
- Question content from `qti-assessment-item`:
  prompt text, choices, correct responses, scorer rubrics, and
  modal feedback explanations. The reporter uses
  `qti-html-renderer` as the single source of truth for parsing
  these: the renderer's `interactions[]` (each with declaration
  identifier, declaration value index, cardinality, base type,
  correct response values, and the interaction's own choice list)
  drives every binding decision.
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

1. Question (retake body, no pre-filled response)
2. Scorer comment (when present)
3. Per-criterion correctness (scoring rubric criteria)
4. Candidate response (inner details, collapsed)
5. Answer & explanation (inner details, collapsed; emitted only when at least
   one of `qti-correct-response` or `qti-modal-feedback` exists)

Do not display any other fields beyond the five sections above.

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

### Per-interaction rendering

The candidate response inner details and the correct-answer inner details
are rendered **per interaction**, keyed by `data-interaction-id`. The
interactions list is sourced from the renderer's
`ParsedItemForReport.interactions`, and each interaction carries:

- `id` — the response-identifier on the interaction element
- `type` — `choice`, `text-entry`, `extended-text`, or `other`
- `declarationIdentifier` — the `qti-response-declaration` identifier that
  bound to this interaction (or `null` for unmatched / legacy paths)
- `declarationValueIndex` — 0-based position into the declaration's values
  for the legacy ordered `RESPONSE` distribution (or `null` for direct
  matches)
- `cardinality`, `baseType` — from the declaration, normalized
- `correctResponse` — the per-declaration values in document order
- `choices` — the interaction's own `qti-simple-choice` children
- `maxChoices` — parsed from `max-choices`, for choice interactions

The reporter renders one row per interaction. Each row carries the
interaction's `id` as `data-interaction-id` on the wrapping element so
consumers can target it from CSS or scripts.

### Submission-to-interaction binding rules

The interaction `id` is the renderer-emitted value of the
`response-identifier` attribute on the interaction element. The
interaction ID is part of the `responseVariable` lookup protocol — the
binding key for both the legacy ordered and direct-match rules below —
but it is **not** the canonical key for uniquely identifying an
interaction instance. The canonical key for distinguishing sibling
interactions in the same item is the `interactionIndex` — the 0-based
position of the interaction in `item.interactions`. Two interactions
in the same item can share the same `id` (e.g. duplicate
`response-identifier="RESPONSE"`, or two interactions with no
`response-identifier` at all), and the reporter never relies on the id
alone to disambiguate them. The `id` is still part of the binding
protocol: `resolveSubmittedValues` uses it as a lookup branch in both
the legacy ordered and direct-match rules below; it is just not the
sole scope key.

For each interaction, the reporter resolves the candidate's submitted
values from `itemResult.responses` using the rules in
`src/report/interactionResponses.ts` (shared by both the HTML and CSV
reports). The rules are selected by the renderer's
`declarationValueIndex`:

1. **Legacy ordered `RESPONSE` distribution** — when the renderer
   reports `declarationValueIndex !== null` (e.g. `RESPONSE_1`,
   `RESPONSE_2` in a pure cloze item with one ordered `RESPONSE`
   declaration):
   1. If a `responseVariable` exists with
      `responseIdentifier === interaction.id`, return its `values`
      array (the full array). The renderer has reported an explicit
      index, but when the interaction is also reachable through its
      own `id` the resolver honors the `id` match and returns the full
      `values` array.
   2. Else if a `responseVariable` exists with
      `responseIdentifier === interaction.declarationIdentifier`,
      return `[values[declarationValueIndex]]` — exactly one value at
      the index, NOT the full list. A renderer interaction whose
      `declarationValueIndex !== null` MUST NEVER receive the full
      multi-value list when the only match is by `declarationIdentifier`.
   3. Else `[]`.
2. **Direct match** — when `declarationValueIndex === null`:
   1. If a `responseVariable` exists with
      `responseIdentifier === interaction.declarationIdentifier`,
      return its `values` array (the full array). A
      `cardinality="multiple"` or `"ordered"` response is preserved as
      a multi-element array.
   2. Else if a `responseVariable` exists with
      `responseIdentifier === interaction.id`, return its `values`
      array.
   3. Else `[]`.

The returned `string[]` is always a fresh copy of the input `values`
array — the reporter never mutates the parser's records. The renderer
(`qti-html-renderer`) is the only authority on
`declarationValueIndex`. The reporter does not invent a
`RESPONSE_N` numeric-suffix mapping on the result side, and it does not
re-parse the source XML for `qti-response-declaration` or
`qti-correct-response`.

`ParsedItemResponse` is the result-side record:

```ts
interface ParsedItemResponse {
  responseIdentifier: string;
  values: string[]; // every <value> in document order; never collapsed
}
```

The `declarationValueIndex` field that was previously on
`ParsedItemResponse` is gone — it was always a renderer-side concept.
The reporter reads it from `InteractionInfo.declarationValueIndex`
returned by the renderer.

`responseDedupeKey(interaction)` returns the per-interaction dedupe key
used by the CSV report. The form is selected by the renderer's
`declarationValueIndex`:

- If `declarationValueIndex !== null`:
  `'<declarationIdentifier>|<declarationValueIndex>|<interaction.id>'`
  (legacy ordered). Each legacy-distribution interaction gets its own
  CSV cell by virtue of the unique `declarationValueIndex` segment.
- Else if `declarationIdentifier`: `declarationIdentifier` (direct-match
  dedupe). Multiple interactions that share the same declaration
  identifier collapse to a single CSV cell — this is intentional, by
  design.
- Else: `interaction.id ?? ''` (the unmatched case, falling back to the
  empty string when the interaction has no `id` either). The unmatched
  case is INTENTIONALLY collapsed: two unmatched interactions with the
  same `id` share a CSV cell. The HTML report renders them as separate
  rows keyed by `interactionIndex`; the CSV does not. If the CSV must
  distinguish two unmatched interactions with the same id, the renderer
  must report a `declarationIdentifier`; otherwise the CSV is
  intentionally lossy for the unmatched case.

### Multi-value preservation

Each `<value>` element inside a `<candidateResponse>` is preserved as
its own record in the parser, so a `cardinality="multiple"` response
is never collapsed to a single string. In the HTML and CSV outputs,
multiple values for the same interaction are joined with `\n`.

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
- Candidate response selectors: `.candidate-response-block`, `.candidate-response-content`, `.candidate-response-per-interaction`, `.candidate-response-interaction`, `.response-interaction-label`, `.response-empty`, `.response-text`, `.response-pre`
- Choice response selectors: `.choice-response-list`, `.choice-response-option`, `.choice-response-selected`, `.choice-response-marker`, `.choice-response-text`, `.choice-response-label`, `.choice-response-unmatched`
- Interaction placeholder selectors: `.interaction-placeholder`, `.choice-interaction`
- Retry question body selector: `.retry-question-block`
- Retry choice wrapper selector: `.choice-retry`
- Read-only cloze input selector: `.cloze-input.cloze-input-readonly`
- Answer & explanation section selectors: `.answer-explanation-block`,
  `.correct-answer-block`, `.correct-answer-per-interaction`, `.correct-answer-interaction`
- Section data attributes: `data-answer-section="explanation"`,
  `data-answer-section="correct"`
- Interaction binding attribute: `data-interaction-id="<interaction id>"`
- Per-interaction candidate name attribute:
  `data-candidate-name="qti-candidate-<itemIdentifier>-<interactionIndex>"`

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
- Local images inside `qti-modal-feedback` / `qti-content-body` (the
  explanation body rendered inside `.answer-explanation-block`) are copied
  the same way as question images, into the same `assets/<itemIdentifier>/`
  directory, with the same `src` rewrite.
- Local images inside the question body (rendered as part of the
  retake / candidate-response bodies when they re-use the question body)
  are copied too, under the same `assets/<itemIdentifier>/` directory.

### Candidate response rendering

- Candidate responses are rendered per interaction, keyed by
  `data-interaction-id`. Each interaction block is a
  `.candidate-response-interaction` element.
- For choice interactions, the response section renders a list of
  all available options as a `ul.choice-response-list` with
  `li.choice-response-option` rows. The selected option (when present)
  carries `.choice-response-selected`, a `●` marker, and the label
  `学生の回答`. Unselected options use a `○` marker. When no value was
  submitted for the interaction, the block renders `（無回答）` instead of
  the option list, even when the item overall has submitted values for
  other interactions. Internal choice response identifiers such as
  `CHOICE_A` must not be shown as candidate-response text. When a
  submitted identifier cannot be matched to any option, the row
  shows `選択肢本文を取得できません` instead of echoing the unmatched
  identifier. The radio or checkbox `name` is per interaction, in the
  form `qti-candidate-<itemIdentifier>-<interactionIndex>-<interactionId>`,
  where `<interactionIndex>` is the 0-based position of the interaction
  in `item.interactions` and each segment is sanitized with
  `replace(/[^A-Za-z0-9._-]/g, '-')`. The wrapping
  `.candidate-response-interaction` element carries both
  `data-interaction-id` and a `data-candidate-name` attribute in the
  form `qti-candidate-<itemIdentifier>-<interactionIndex>`. This
  guarantees that two interactions in the same item, the same `id`
  reused across two items, two interactions with an empty `id` and
  different `interactionIndex`, or any combination thereof, never
  share a browser radio/checkbox group. The candidate and retry groups
  differ by the `qti-candidate-` vs `qti-retry-` prefix.
- For text-entry interactions, the response section renders
  read-only `input.cloze-input.qti-blank-input.cloze-input-readonly`
  elements with the submitted value as the `value` attribute and a
  `size` that grows with the response length.
- For extended-text interactions, the response section renders a
  `<pre class="response-text response-pre">` with the submitted value.
  Whitespace, indentation, and blank lines are preserved verbatim
  (no `<br>` tags are inserted).
- For items that have no `interactions[]` (e.g. pure descriptive items
  with no interaction element), the response section flattens every
  `responseVariable.values` entry into a single string array. When
  the flattened length is zero, the section renders
  `<p class="response-empty">（無回答）</p>` and never an empty
  `<pre class="response-text response-pre">`. When at least one value
  exists, the values are joined with `\n` and rendered in the `<pre>`.
  Self-closing `<candidateResponse />` and `<candidateResponse/>`
  forms in the result XML produce the same `values: []` record as the
  explicit empty `<candidateResponse></candidateResponse>` form, so
  every empty-candidate path lands on the `（無回答）` rendering.
- The question body inside the 問題 section is editable for re-attempt: cloze
  inputs are not pre-filled with the candidate response, native radio inputs
  are not pre-checked, and descriptive items render an empty textarea. The
  submitted value is rendered only inside the 受験者の回答 inner details
  block.

### Retake body

The retake body inside the 問題 section is the renderer's
`questionHtml` with two reporter-driven rewrites:

- For each `<div class="choice-interaction" data-interaction-id="...">`
  wrapper, the reporter pairs it (in document order) with the choice
  interaction at the same `interactionIndex` in
  `item.interactions.filter(i => i.type === 'choice')`. The
  per-interaction `name` of the resulting native radio/checkbox
  inputs is
  `qti-retry-<itemIdentifier>-<interactionIndex>-<interactionId>`,
  with each segment sanitized by
  `replace(/[^A-Za-z0-9._-]/g, '-')`. The `<interactionId>` segment
  is empty when the wrapper has no `data-interaction-id`; the
  sanitized form ends with a trailing dash in that case, but the
  preceding `interactionIndex` keeps the names distinct. The
  `qti-candidate-` and `qti-retry-` prefixes guarantee the candidate
  and retry radio/checkbox groups never collide.
- For each cloze `<input class="qti-blank-input" ...>` the reporter
  removes the `readonly`, `disabled`, and `value` attributes and the
  `cloze-input-readonly` class so the input is editable in the retake
  body. Cloze inputs are not pre-filled with the candidate response.
- When the item has no choice interactions and no cloze inputs, the
  reporter appends an empty
  `<textarea class="retake-textarea" data-retry-textarea="true" aria-label="answer"></textarea>`
  to provide a response surface (or replaces the renderer's
  `qti-extended-text-interaction` placeholder span with that
  textarea). Descriptive-item candidate responses are rendered only
  inside the 受験者の回答 inner details block, never inside the
  retake body.

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

### Explanation body contract

- The explanation body is rendered by `qti-html-renderer` and is
  used verbatim by the reporter. The reporter does not run any
  additional code-highlighter pass on the explanation body; the
  `code-block`, `code-block-code`, `hljs`, `data-code-lang`, and
  `code-inline` classes produced by the renderer are part of the
  stable contract.
- Only the image-asset rewrite step (`resolveExplanationAssets`) is
  applied to the explanation body before it is written into the report.

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

| Column name        | Type             | Required | Description / source                                                                                                                                                                                                                                           |
| ------------------ | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate_number` | string           | required | `context/sessionIdentifier@identifier` where `sourceID=candidateId` (used as-is; `context@sourcedId` is never parsed). Missing value is an error.                                                                                                              |
| `candidate_name`   | string           | required | `context/sessionIdentifier@identifier` where `sourceID=candidateName`.                                                                                                                                                                                         |
| `test_title`       | string           | required | `qti-assessment-test@title`.                                                                                                                                                                                                                                   |
| `total_score`      | number           | required | `testResult/outcomeVariable identifier="SCORE"` when present; otherwise the sum of item scores.                                                                                                                                                                |
| `total_max_score`  | number           | required | Sum of per-item maximum scores derived from scorer rubrics.                                                                                                                                                                                                    |
| `item_order`       | number (integer) | required | 1-based index of the item in `qti-assessment-item-ref` order.                                                                                                                                                                                                  |
| `item_identifier`  | string           | required | `qti-assessment-item-ref@identifier`.                                                                                                                                                                                                                          |
| `item_title`       | string           | required | `qti-assessment-item@title`. Falls back to `item_identifier` if missing.                                                                                                                                                                                       |
| `item_score`       | number           | required | `itemResult/outcomeVariable identifier="SCORE"` when present; otherwise rubric-based computed score.                                                                                                                                                           |
| `item_max_score`   | number           | required | Sum of rubric criterion points (`qti-rubric-block view="scorer"`).                                                                                                                                                                                             |
| `rubric_outcomes`  | string           | required | Per-criterion achievement encoded as `index:true` or `index:false` pairs joined by `;` in criterion order (example: `1:true;2:false`).                                                                                                                         |
| `rubric_points`    | string           | required | Per-criterion points encoded as `index:points` pairs joined by `;` in criterion order (example: `1:2;2:1`).                                                                                                                                                    |
| `response_values`  | string           | required | Per-interaction candidate responses sourced from the renderer's `interactions` and the result's `responseVariable`s (see binding rules above). Multiple values per interaction are joined with `\n` in interaction order. Empty when no responses are present. |
| `response_labels`  | string           | required | Per-interaction response values rendered for readability. For choice interactions, each line is `CHOICE_ID: choice text` (the choice text comes from the renderer's `interaction.choices`). For non-choice interactions, the line is the raw value.            |
| `comment`          | string           | required | `itemResult/outcomeVariable identifier="COMMENT"` when present; otherwise empty.                                                                                                                                                                               |

### Rubric encoding details

- Criterion order is the order of `qti-p` elements inside
  `qti-rubric-block view="scorer"`.
- Each criterion index is 1-based.
- `rubric_outcomes` uses `true` and `false` literals.
- If rubric criteria exist, every criterion must appear in both
  `rubric_outcomes` and `rubric_points`.
- Missing rubric outcomes are treated as an error (do not emit partial data).

### Response encoding details

- The exporter iterates the renderer's `interactions[]` and applies the
  per-interaction binding rules documented above. For each interaction
  that yields one or more values, the value(s) are joined with `\n` into
  a single CSV cell. Multiple interactions in the same item contribute
  their own cells, also joined with `\n`, preserving the renderer's
  interaction order.
- When the same interaction produces multiple submitted values
  (e.g. a `cardinality="multiple"` response), all values are joined
  with `\n` inside that interaction's cell.
- For the legacy ordered `RESPONSE` distribution, each interaction
  receives exactly one value at the renderer's `declarationValueIndex`
  position. A 2-blank legacy item therefore produces
  `alpha\nbeta` (one line per interaction), never a single collapsed
  value and never a duplicated value.
- Each interaction's value list is also deduped across interactions
  with `responseDedupeKey(interaction)`: a legacy interaction gets a
  unique key per index, a direct-match interaction dedupes by
  `declarationIdentifier`, and an unmatched interaction dedupes by its
  own `id`.
- If no candidate response exists for any interaction, the cell is empty.
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
