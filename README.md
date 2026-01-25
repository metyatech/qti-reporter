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
Run the CLI with both the assessment test and the assessment result.
The `start` script builds the project before running the CLI.

```bash
npm start -- --assessment-test <path-to-assessment-test.qti.xml> --assessment-result <path-to-assessment-result.xml> --out-dir <output-directory> [--style-css <path-to-style.css>]
```

Arguments:
- `--assessment-test`: Path to the `qti-assessment-test` XML file.
- `--assessment-result`: Path to the `assessmentResult` XML file.
- `--out-dir`: Output root directory. If omitted, `out` is used.
- `--style-css`: Optional path to a CSS file. When omitted, the default style is embedded.

Styling behavior:
- Default: embeds `<style data-qti-reporter-style="default">...</style>`
- External: copies the specified CSS to `report-style.css` and links `<link rel="stylesheet" href="./report-style.css" data-qti-reporter-style="external" />`

The output is written as:
- Directory: `{candidateNumber} {candidateName}`
- File: `{candidateNumber} {candidateName} {testTitle} 結果.html`
- External style file (when `--style-css` is used): `report-style.css`
- Aggregated CSV (at the output root): `report.csv` (UTF-8 with BOM)

Example using the repository fixtures:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run
```

Example with external CSS:

```bash
npm start -- --assessment-test src/test/fixtures/assessment-test.qti.xml --assessment-result src/test/fixtures/assessment-result.xml --out-dir tmp/manual-run --style-css src/test/fixtures/custom-style.css
```

## Development Commands
- Build:

```bash
npm run build
```

- Test:

```bash
npm test
```

## Environment Variables
This project does not use environment variables.

## Deployment
No deployment pipeline is defined. Build and run the generated CLI:

```bash
npm run build
node dist/cli.js --assessment-test <path-to-assessment-test.qti.xml> --assessment-result <path-to-assessment-result.xml>
```
