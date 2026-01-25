# QTI Input Data Specification (Draft)

## Scope
This document defines the QTI input formats consumed by qti-reporter.
There are two input categories:

- Question data: QTI 3.0 assessment test (and referenced items).
- Response data: QTI 3.0 results reporting (candidate responses).

## Input 1: Question data (assessment test)

### Required structure
- Root element: `qti-assessment-test`
  - `identifier="assessment-test"` (fixed)
  - `title="Assessment Test"` (fixed)
- `qti-test-part`
  - `identifier="part-1"` (fixed)
  - `navigation-mode="linear"` (fixed)
  - `submission-mode="individual"` (fixed)
- `qti-assessment-section`
  - `identifier="section-1"` (fixed)
  - `title="Section 1"` (fixed)
  - `visible="true"` (fixed)
- `qti-assessment-item-ref` (one per item)
  - `identifier`: matches the item `identifier`
  - `href`: `<identifier>.qti.xml` (relative path)

Ordering:
- The order of `qti-assessment-item-ref` defines the canonical item order for
  reporting.

Resolution of referenced items:
- Each `qti-assessment-item-ref@href` is resolved relative to the
  `qti-assessment-test` file location.
- The referenced `qti-assessment-item` documents are required inputs, but are
  discovered via the assessment test rather than being passed directly.

### Referenced assessment items
Each referenced item must be a `qti-assessment-item` (QTI 3.0) with:

- `identifier`: matches the `qti-assessment-item-ref@identifier`.
- `title`: human-readable item title.
- `adaptive="false"`, `time-dependent="false"`.
- `qti-item-body` containing the prompt and interaction(s) as QTI flow content.
- `qti-response-declaration` aligned to the interaction(s) used.

### Question types

| Type                      | `qti-response-declaration`                       | Interaction                                                               | Correct response                             |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| Descriptive               | `base-type="string"`, `cardinality="single"`     | `qti-extended-text-interaction` with `response-identifier="RESPONSE"`     | Omitted                                      |
| Choice                    | `base-type="identifier"`, `cardinality="single"` | `qti-choice-interaction max-choices="1"` with `qti-simple-choice` entries | `qti-correct-response` contains `CHOICE_<n>` |
| Cloze (fill-in-the-blank) | `base-type="string"`, `cardinality="single"`     | `qti-text-entry-interaction`                                              | `qti-correct-response` contains the answer   |

### Explanation output
If item-level post-response feedback is provided, it is emitted using
`qti-modal-feedback` (outside `qti-item-body`).

Expected elements:
- `qti-outcome-declaration identifier="FEEDBACK"`
  - `cardinality="single"`, `base-type="identifier"`
- `qti-response-processing`
  - Sets `FEEDBACK` to `EXPLANATION`
- `qti-modal-feedback outcome-identifier="FEEDBACK" identifier="EXPLANATION"`
  - `show-hide="show"`
  - Contains a `qti-content-body` with the rendered explanation flow content

### Scoring rubric blocks
- Scoring rubrics may be represented using `qti-rubric-block view="scorer"`.

The internal structure of rubric content is not constrained by this document.

## Input 2: Response data (assessmentResult)

### Namespaces
- Default namespace: `http://www.imsglobal.org/xsd/imsqti_result_v3p0`
- XML Schema instance namespace: `http://www.w3.org/2001/XMLSchema-instance`
- Recommended `xsi:schemaLocation`:
  `http://www.imsglobal.org/xsd/imsqti_result_v3p0 http://www.imsglobal.org/xsd/imsqti_result_v3p0.xsd`

### Root element
The root element is `assessmentResult` in the QTI Results Reporting namespace.

Required attributes:
- `xmlns`
- `xmlns:xsi`
- `xsi:schemaLocation` (recommended)

### context
`context` provides identifiers for the session and learner.

- `@sourcedId` (required): unique candidate identifier (account).
  - Must contain at least one continuous digit sequence.
  - The first continuous digit sequence is used as the candidate number
    (leading zeros preserved).
- `sessionIdentifier` (0..n): repeated identifiers using common `sourceID` keys
  for class, candidate, and material metadata (for example `candidateName`,
  `candidateId`, `materialTitle`).
  - `sourceID=candidateName` is required (candidate display name).
  - `sourceID=materialTitle` is required (test title).

### testResult
Represents the assessment attempt.

Required attributes:
- `identifier`: test/material identifier.
- `datestamp`: attempt end time in ISO 8601.

Child elements:
- `responseVariable` (0..n)
- `outcomeVariable` (0..n)

### itemResult
Emitted per question.

Attributes:
- `identifier`: the assessment test item identifier
  (matches `qti-assessment-item-ref@identifier`)
- `sequenceIndex`: assessment test order index (optional)
- `datestamp`: attempt end time in ISO 8601.
- `sessionStatus`: `final`

Child elements:
- `responseVariable` (1..n)
- `outcomeVariable` (0..n)

### Standard variable usage
- `completionStatus` (outcomeVariable)
  - `baseType="identifier"`
  - Values: `completed`, `incomplete`, `not_attempted`, `unknown`
- `SCORE` (outcomeVariable)
  - `baseType="float"`
- `duration` (responseVariable)
  - `baseType="duration"`
  - Format: ISO 8601 duration (`PT{seconds}S`)
- `numAttempts` (responseVariable)
  - `baseType="integer"`

### ResponseVariable mapping by question type

1) Free-response (descriptive)
- `baseType="string"`, `cardinality="single"`
- `correctResponse` omitted.
- `candidateResponse`: free-text response.

2) Choice
- `baseType="identifier"`, `cardinality="single"`
- `correctResponse`: `CHOICE_{index}`
- `candidateResponse`: `CHOICE_{index}`

3) Fill-in-the-blank
- `baseType="string"`, `cardinality="ordered"`
- `correctResponse`: ordered values.
- `candidateResponse`: ordered values.

### Missing values
- Do not apply fallbacks.
- If an optional input field is empty, omit the corresponding attribute or variable.
- If a required attribute cannot be emitted, the input is considered invalid.

### Timestamp handling
- Output timestamps include a timezone offset.
- Timezone handling is defined by the producer of the results report.

## Linking results to items
`itemResult@identifier` is the assessment item identifier, so items are linked
by identifier equality:

- `itemResult@identifier` must match a `qti-assessment-item@identifier`
- The identifier should also appear in `qti-assessment-item-ref@identifier`

Ordering:
- Report display order follows the `qti-assessment-item-ref` order in the
  assessment test.

## TODO (needs confirmation)
- Confirm whether multiple `testResult` blocks are expected in one run.
- Confirm whether multiple `responseVariable` entries per item are supported.
