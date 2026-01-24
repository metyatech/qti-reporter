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
  `completionStatus`, `SCORE`, `duration`, `numAttempts`, and `TRACKLMS_*` values.
- Item-level variables from `assessmentResult/itemResult`:
  `RESPONSE`, per-item `SCORE`, item title variables, and `TRACKLMS_*` values.
- Question content from `qti-assessment-item`:
  prompt text, options, correct responses (if defined), and rubric blocks.

## TODO (HTML report format)
- Define required sections and ordering.
- Define whether correct answers are displayed.
- Define rendering rules for rich content (images, inline interactions).
- Define file naming conventions.

## TODO (CSV report format)
- Define row granularity (per respondent or per respondent-question).
- Define required columns and ordering.
- Define encoding for missing answers, skipped items, and optional questions.
- Define file naming conventions.
