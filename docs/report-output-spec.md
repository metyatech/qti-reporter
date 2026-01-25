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
  prompt text, options, correct responses (if defined), and rubric blocks.
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

## TODO (CSV report format)
- Define row granularity (per respondent or per respondent-question).
- Define required columns and ordering.
- Define encoding for missing answers, skipped items, and optional questions.
- Define file naming conventions.
