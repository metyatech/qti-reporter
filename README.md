# qti-reporter

## Overview

qti-reporter generates human-readable HTML reports per respondent and an
aggregated CSV report from QTI 3.0 assessment items and results.

## Specifications

- Input QTI spec: `docs/input-qti-spec.md`
- Output report spec: `docs/report-output-spec.md`

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

Example using the repository fixtures:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run
```

Example with external CSS:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run --style-css src/test/fixtures/custom-style.css
```

## Scoring Behavior

The total score in the reports is determined as follows:

1. If the input `assessmentResult` XML contains a `testResult` block with a `SCORE` variable, that value is used as the total score.
2. If the `testResult` score is not available, the total score is computed as the sum of all individual item scores.

Note: When the `testResult` score is explicitly provided in the XML, it takes precedence even if it differs from the sum of item scores.

## Development Commands

- Build:

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

## Documentation

- [LICENSE](./LICENSE)
- [CHANGELOG](./CHANGELOG.md)
- [SECURITY](./SECURITY.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md)
