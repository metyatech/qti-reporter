# QTI Input Data Specification (Draft)

## Scope
This document defines the QTI input formats consumed by qti-reporter.
There are two input categories:

- Question data: QTI 3.0 assessment items (problem statements).
- Response data: QTI 3.0 results reporting (candidate responses).

The question items are based on the QTI mapping in the upstream authoring
specification.
The response data is based on the QTI 3.0 Results Reporting output
specification used by the upstream converter.

## Input 1: Question data (assessment item)

### Required structure
- Root element: `qti-assessment-item` (QTI 3.0).
  - `identifier`: derived from the source file name (without extension).
  - `title`: the `# <title>` heading.
  - `adaptive="false"`, `time-dependent="false"`.
- Child element: `qti-item-body`.
  - The prompt is emitted as `qti-p`.
  - Interactions vary by question type (below).
- `qti-response-declaration` is required and varies by question type.

### Inline images
Markdown images in the prompt/options/explanation are converted into `qti-img`
elements inside the surrounding QTI text container.

- `src`: the original image path.
- `alt`: the Markdown alt text (empty alt is allowed).
- `title`: emitted only when a Markdown image title is present.

### Question types

| Type | `qti-response-declaration` | Interaction | Correct response |
| --- | --- | --- | --- |
| Descriptive | `base-type="string"`, `cardinality="single"` | `qti-extended-text-interaction` with `response-identifier="RESPONSE"` | Omitted |
| Choice | `base-type="identifier"`, `cardinality="single"` | `qti-choice-interaction max-choices="1"` with `qti-simple-choice` entries | `qti-correct-response` contains `CHOICE_<n>` |
| Cloze (fill-in-the-blank) | `base-type="string"`, `cardinality="single"` | `qti-text-entry-interaction` inlined at each `{{...}}` placeholder | Correct answer is the text inside `{{...}}` |

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
- `sessionIdentifier` (0..n): repeated identifiers for class, trainee, and
  material metadata.

### testResult
Represents the assessment attempt.

Required attributes:
- `identifier`: test/material identifier (`id`).
- `datestamp`: attempt end time (`endAt`) in ISO 8601.

Child elements:
- `responseVariable` (0..n)
- `outcomeVariable` (0..n)

### itemResult
Emitted per question, based on question index `n` (starting at 1).

Attributes:
- `identifier`: `Q{n}`
- `sequenceIndex`: `n`
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
`itemResult@identifier` uses `Q{n}`, while assessment item identifiers are derived
from source file names. The reporter must accept a mapping definition that
declares how each `Q{n}` maps to an item identifier.

### Mapping definition (required input)
Provide a mapping definition as a separate input alongside the QTI files.
The definition is a list of entries with:

- `sequenceIndex` (integer): the `n` from `Q{n}`.
- `itemIdentifier` (string): the assessment item `identifier`.

Example (conceptual):

```
1 -> item-001
2 -> item-002
```

The concrete file format (JSON/YAML/CSV) is TODO.

## TODO (needs confirmation)
- Confirm whether multiple `testResult` blocks are expected in one run.
- Confirm whether multiple `responseVariable` entries per item are supported.
