# QTI Input Data Specification (Draft)

## Scope
This document defines the QTI input formats consumed by qti-reporter.
There are two input categories:

- Question data: QTI 3.0 assessment test (and referenced items).
- Response data: QTI 3.0 results reporting (candidate responses).

The question data is based on the QTI mapping in the upstream authoring
specification.
The response data is based on the QTI 3.0 Results Reporting output
specification used by the upstream converter.

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

- `identifier`: derived from the source file name (without extension).
- `title`: the `# <title>` heading.
- `adaptive="false"`, `time-dependent="false"`.
- `qti-item-body` containing the prompt rendered as QTI flow content.
- `qti-response-declaration` appropriate for the item type.

### Inline images
Markdown images in the prompt/options/explanation are converted into `qti-img`
elements inside the surrounding QTI text container.

- `src`: the original image path.
- `alt`: the Markdown alt text (empty alt is allowed).
- `title`: emitted only when a Markdown image title is present.

### Question types

| Type                      | `qti-response-declaration`                       | Interaction                                                               | Correct response                             |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| Descriptive               | `base-type="string"`, `cardinality="single"`     | `qti-extended-text-interaction` with `response-identifier="RESPONSE"`     | Omitted                                      |
| Choice                    | `base-type="identifier"`, `cardinality="single"` | `qti-choice-interaction max-choices="1"` with `qti-simple-choice` entries | `qti-correct-response` contains `CHOICE_<n>` |
| Cloze (fill-in-the-blank) | `base-type="string"`, `cardinality="single"`     | `qti-text-entry-interaction` inlined at each `{{...}}` placeholder        | Correct answer is the text inside `{{...}}`  |

### Optional rubric blocks
- `## Explanation` maps to `qti-rubric-block view="candidate"` containing a `qti-p`.
- `## Scoring` maps to `qti-rubric-block view="scorer"` with one `qti-p` per criterion.

Scoring rubric line format:

```
[<points>] <criterion>
```

`<points>` is the numeric value from the Markdown list item, and `<criterion>`
is the criterion text.

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
- `identifier`: test/material identifier (`id`).
- `datestamp`: attempt end time (`endAt`) in ISO 8601.

Child elements:
- `responseVariable` (0..n)
- `outcomeVariable` (0..n)

### itemResult
Emitted per question.

Attributes:
- `identifier`: the assessment test item identifier
  (matches `qti-assessment-item-ref@identifier`)
- `sequenceIndex`: assessment test order index (optional)
- `datestamp`: attempt end time (`endAt`) in ISO 8601.
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
- Condition: no correct response is present in the source data.
- `baseType="string"`, `cardinality="single"`
- `correctResponse` omitted.
- `candidateResponse`: free-text response.

2) Choice
- Condition: correct answer and candidate answer are numeric indices.
- `baseType="identifier"`, `cardinality="single"`
- `correctResponse`: `CHOICE_{index}`
- `candidateResponse`: `CHOICE_{index}`

3) Fill-in-the-blank
- Condition: correct answer contains one or more `${...}` placeholders.
- `baseType="string"`, `cardinality="ordered"`
- `correctResponse`: values derived from `${...}` placeholders in order
  (if the placeholder content is wrapped in `/.../`, keep the `/.../` string).
- `candidateResponse`: values from the answer split by `;` in order.

### Missing values
- Do not apply fallbacks.
- If an optional source field is empty, omit the corresponding attribute or variable.
- If a required attribute cannot be emitted, the conversion is considered invalid.

### Timestamp handling
- Source timestamps are local time without timezone.
- Output timestamps include a timezone offset.
- Timezone is configurable (default: Asia/Tokyo in the source specification).

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
