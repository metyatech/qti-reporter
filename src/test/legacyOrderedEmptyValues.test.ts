/**
 * Tests for the legacy ordered RESPONSE distribution with empty `<value/>`
 * entries at the head position (case A) and at the tail position (case B,
 * single empty value).
 *
 * Existing coverage (in `unification.test.ts`) handles the trailing-empty
 * case for a values array of length 3 (`["alpha", "beta", ""]`). The two
 * cases here are the symmetric forms:
 *
 *   Case A (head empty):    `["", "beta"]`
 *   Case B (tail empty):    `["alpha", ""]`
 *
 * Both items use the same legacy ordered RESPONSE binding as
 * `unification-legacy-ordered.qti.xml` (a single `cardinality="ordered"`
 * RESPONSE declaration distributed to two `RESPONSE_1` / `RESPONSE_2`
 * text-entry interactions via `declarationValueIndex`), so the binding
 * step MUST preserve the binding index even when the value at that
 * index is the empty string.
 *
 * The CSV layer drops strictly-empty values via the shared
 * `dropEmptyResponseValues` helper, so the response_values / response_labels
 * cells must surface exactly the non-empty values, with no leading or
 * trailing newlines and no empty line introduced by the dropped entry.
 *
 * The HTML layer calls the same `dropEmptyResponseValues` helper inside
 * `renderTextCandidateBody`, so the wrapper for an empty-only binding
 * falls into the `（無回答）` branch while the wrapper for a non-empty
 * binding still renders exactly one readonly cloze input.
 *
 * The shared binding layer (`resolveSubmittedValues`) MUST preserve the
 * binding index even when the value at that index is empty: the
 * resolver returns `[""]` for an empty binding at index 0, not `[]`.
 * That is the parser → binding contract the rest of the pipeline
 * relies on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { generateHtmlReportFromFiles } from '../report/htmlReport.js';
import { runCli } from '../cli.js';
import type { InteractionInfo } from '../qti/assessmentItem.js';
import type { ParsedItemResponse } from '../qti/assessmentResult.js';
import { resolveSubmittedValues } from '../report/interactionResponses.js';
import { parseAssessmentResult } from '../qti/assessmentResult.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRepoRootFromDist(): string {
  return path.resolve(__dirname, '..', '..');
}

function resolveFixturePath(fileName: string): string {
  return path.join(getRepoRootFromDist(), 'src', 'test', 'fixtures', fileName);
}

function createCleanOutputDir(dirName: string): string {
  const repoRoot = getRepoRootFromDist();
  const outputDir = path.join(repoRoot, 'tmp', dirName);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

/**
 * Build a self-contained assessment-test fixture inside a clean tmp dir
 * that references the two new legacy empty-value items. Using a runtime
 * test keeps the new permanent fixtures limited to the item and result
 * XML files (one per case) — no new permanent assessment-test file is
 * added. The `href` attributes are absolute paths so the test works
 * regardless of cwd.
 */
function writeEmptyValuesAssessmentTest(outputDir: string): string {
  const headItemPath = resolveFixturePath('unification-legacy-head-empty.qti.xml');
  const tailItemPath = resolveFixturePath('unification-legacy-tail-empty.qti.xml');
  const assessmentTestPath = path.join(outputDir, 'assessment-test.qti.xml');
  fs.writeFileSync(
    assessmentTestPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-test identifier="unification-legacy-empty" title="Unification Legacy Empty" xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0">
  <qti-test-part identifier="part-1" navigation-mode="linear" submission-mode="individual">
    <qti-assessment-section identifier="section-1" title="Section 1" visible="true">
      <qti-assessment-item-ref identifier="legacy-head-empty" href="${headItemPath}" />
      <qti-assessment-item-ref identifier="legacy-tail-empty" href="${tailItemPath}" />
    </qti-assessment-section>
  </qti-test-part>
</qti-assessment-test>
`
  );
  return assessmentTestPath;
}

function parseReport(html: string): Document {
  return new JSDOM(html).window.document;
}

function findItemBlock(doc: Document, identifier: string): Element | null {
  return doc.querySelector(`details.item-block[data-item-identifier="${identifier}"]`);
}

/**
 * Find the per-interaction wrapper inside a candidate-response block by
 * its `data-interaction-id` attribute.
 */
function findInteractionWrapper(
  doc: Document,
  itemIdentifier: string,
  interactionId: string
): Element | null {
  const block = findItemBlock(doc, itemIdentifier);
  if (!block) return null;
  return block.querySelector(
    `.candidate-response-interaction[data-interaction-id="${interactionId}"]`
  );
}

function makeInteraction(overrides: Partial<InteractionInfo>): InteractionInfo {
  return {
    id: '',
    type: 'choice',
    declarationIdentifier: null,
    declarationValueIndex: null,
    cardinality: 'single',
    baseType: 'identifier',
    correctResponse: [],
    choices: [],
    maxChoices: null,
    ...overrides,
  };
}

test('parser: legacy ordered empty-result produces ["", "beta"] for head-empty and ["alpha", ""] for tail-empty', () => {
  // The parser MUST preserve the empty value's position in the values
  // array, so the binding layer (and the HTML/CSV layer downstream) can
  // see which declarationValueIndex is empty.
  const resultPath = resolveFixturePath('unification-legacy-empty-result.xml');
  const parsed = parseAssessmentResult(resultPath);

  const headItem = parsed.itemResults.get('legacy-head-empty');
  assert.ok(headItem, 'legacy-head-empty itemResult must exist');
  assert.deepEqual(
    headItem?.responses[0]?.values,
    ['', 'beta'],
    `legacy-head-empty response must parse to ["", "beta"] (the leading <value/> must produce an empty string, not be dropped); got ${JSON.stringify(headItem?.responses[0]?.values)}`
  );

  const tailItem = parsed.itemResults.get('legacy-tail-empty');
  assert.ok(tailItem, 'legacy-tail-empty itemResult must exist');
  assert.deepEqual(
    tailItem?.responses[0]?.values,
    ['alpha', ''],
    `legacy-tail-empty response must parse to ["alpha", ""] (the trailing <value/> must produce an empty string, not be dropped); got ${JSON.stringify(tailItem?.responses[0]?.values)}`
  );
});

test('resolver: binding index is preserved pre-drop (parser → binding contract)', () => {
  // The binding layer (`resolveSubmittedValues`) returns exactly one
  // value at the `declarationValueIndex` position, including the empty
  // string `""`. The shared empty-value drop is applied later, in the
  // HTML/CSV layer, never in the binding layer. This test pins that
  // contract: the resolver must return `[""]` for an empty binding at
  // index 0, not `[]` (which would mean "no submission for this
  // interaction" and is wrong for the legacy ordered case).
  const responses: ParsedItemResponse[] = [
    { responseIdentifier: 'RESPONSE', values: ['', 'beta'] },
  ];

  // RESPONSE_1 → declarationValueIndex=0 → values[0] === "" → result: [""]
  const interaction0 = makeInteraction({
    id: 'RESPONSE_1',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 0,
  });
  const result0 = resolveSubmittedValues(responses, interaction0);
  assert.deepEqual(
    result0,
    [''],
    `resolver must return [""] (NOT [] for "no submission") when the value at declarationValueIndex=0 is the empty string; got ${JSON.stringify(result0)}`
  );

  // RESPONSE_2 → declarationValueIndex=1 → values[1] === "beta" → result: ["beta"]
  const interaction1 = makeInteraction({
    id: 'RESPONSE_2',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 1,
  });
  const result1 = resolveSubmittedValues(responses, interaction1);
  assert.deepEqual(
    result1,
    ['beta'],
    `resolver must return ["beta"] for declarationValueIndex=1; got ${JSON.stringify(result1)}`
  );

  // Symmetric case: tail-empty values: ["alpha", ""]
  const tailResponses: ParsedItemResponse[] = [
    { responseIdentifier: 'RESPONSE', values: ['alpha', ''] },
  ];
  const tailInteraction0 = makeInteraction({
    id: 'RESPONSE_1',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 0,
  });
  const tailResult0 = resolveSubmittedValues(tailResponses, tailInteraction0);
  assert.deepEqual(
    tailResult0,
    ['alpha'],
    `resolver must return ["alpha"] for declarationValueIndex=0 with tail-empty values; got ${JSON.stringify(tailResult0)}`
  );
  const tailInteraction1 = makeInteraction({
    id: 'RESPONSE_2',
    declarationIdentifier: 'RESPONSE',
    declarationValueIndex: 1,
  });
  const tailResult1 = resolveSubmittedValues(tailResponses, tailInteraction1);
  assert.deepEqual(
    tailResult1,
    [''],
    `resolver must return [""] (NOT [] for "no submission") for declarationValueIndex=1 with tail-empty values; got ${JSON.stringify(tailResult1)}`
  );
});

test('HTML: head-empty legacy item surfaces RESPONSE_1 as （無回答） and RESPONSE_2 as a single readonly cloze input with value="beta"', () => {
  // legacy-head-empty: parsed values are ["", "beta"]. RESPONSE_1
  // binds to index 0 (empty) → （無回答）; RESPONSE_2 binds to index 1
  // (beta) → exactly one readonly cloze input with value="beta".
  const outputRootDir = createCleanOutputDir('legacy-head-empty-html');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: writeEmptyValuesAssessmentTest(outputRootDir),
    assessmentResultPath: resolveFixturePath('unification-legacy-empty-result.xml'),
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const block = findItemBlock(doc, 'legacy-head-empty');
  assert.ok(block, 'legacy-head-empty block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');

  // RESPONSE_1 wrapper exists, contains （無回答）, and does NOT contain
  // "beta" or a readonly cloze input.
  const response1Wrapper = findInteractionWrapper(doc, 'legacy-head-empty', 'RESPONSE_1');
  assert.ok(response1Wrapper, 'RESPONSE_1 wrapper must exist');
  const response1Text = response1Wrapper?.textContent ?? '';
  assert.ok(
    response1Text.includes('（無回答）'),
    `RESPONSE_1 wrapper must contain （無回答） for the head-empty case; got: ${response1Text}`
  );
  assert.ok(
    !response1Text.includes('beta'),
    `RESPONSE_1 wrapper must NOT contain "beta" (only RESPONSE_2 binds to "beta"); got: ${response1Text}`
  );
  const response1ClozeInputs = response1Wrapper?.querySelectorAll(
    'input.cloze-input.qti-blank-input'
  );
  assert.equal(
    response1ClozeInputs?.length ?? 0,
    0,
    `RESPONSE_1 wrapper must contain NO readonly cloze inputs (its value is the dropped empty); got ${response1ClozeInputs?.length ?? 0}`
  );

  // RESPONSE_2 wrapper exists, has exactly one readonly cloze input
  // with value="beta", and does NOT contain （無回答）.
  const response2Wrapper = findInteractionWrapper(doc, 'legacy-head-empty', 'RESPONSE_2');
  assert.ok(response2Wrapper, 'RESPONSE_2 wrapper must exist');
  const response2Inputs = response2Wrapper?.querySelectorAll('input.cloze-input.qti-blank-input');
  assert.equal(
    response2Inputs?.length ?? 0,
    1,
    `RESPONSE_2 wrapper must contain exactly one readonly cloze input; got ${response2Inputs?.length ?? 0}`
  );
  assert.equal(
    response2Inputs?.[0]?.getAttribute('value'),
    'beta',
    `RESPONSE_2 cloze input value must be "beta"; got "${response2Inputs?.[0]?.getAttribute('value')}"`
  );
  assert.ok(
    response2Inputs?.[0]?.hasAttribute('readonly'),
    'RESPONSE_2 cloze input must carry the readonly attribute'
  );
  const response2Text = response2Wrapper?.textContent ?? '';
  assert.ok(
    !response2Text.includes('（無回答）'),
    `RESPONSE_2 wrapper must NOT contain （無回答） (it has a real value "beta"); got: ${response2Text}`
  );

  // Wrapper order: RESPONSE_1 first, RESPONSE_2 second.
  const wrappers = Array.from(block?.querySelectorAll('.candidate-response-interaction') ?? []);
  assert.equal(wrappers.length, 2, 'exactly two per-interaction wrappers expected');
  assert.equal(
    wrappers[0]?.getAttribute('data-interaction-id'),
    'RESPONSE_1',
    `first wrapper must be RESPONSE_1; got "${wrappers[0]?.getAttribute('data-interaction-id')}"`
  );
  assert.equal(
    wrappers[1]?.getAttribute('data-interaction-id'),
    'RESPONSE_2',
    `second wrapper must be RESPONSE_2; got "${wrappers[1]?.getAttribute('data-interaction-id')}"`
  );
});

test('HTML: tail-empty legacy item surfaces RESPONSE_1 as a single readonly cloze input with value="alpha" and RESPONSE_2 as （無回答）', () => {
  // legacy-tail-empty: parsed values are ["alpha", ""]. RESPONSE_1
  // binds to index 0 (alpha) → exactly one readonly cloze input with
  // value="alpha"; RESPONSE_2 binds to index 1 (empty) → （無回答）.
  const outputRootDir = createCleanOutputDir('legacy-tail-empty-html');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: writeEmptyValuesAssessmentTest(outputRootDir),
    assessmentResultPath: resolveFixturePath('unification-legacy-empty-result.xml'),
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const block = findItemBlock(doc, 'legacy-tail-empty');
  assert.ok(block, 'legacy-tail-empty block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');

  // RESPONSE_1 wrapper: one readonly cloze input with value="alpha",
  // no （無回答）.
  const response1Wrapper = findInteractionWrapper(doc, 'legacy-tail-empty', 'RESPONSE_1');
  assert.ok(response1Wrapper, 'RESPONSE_1 wrapper must exist');
  const response1Inputs = response1Wrapper?.querySelectorAll('input.cloze-input.qti-blank-input');
  assert.equal(
    response1Inputs?.length ?? 0,
    1,
    `RESPONSE_1 wrapper must contain exactly one readonly cloze input; got ${response1Inputs?.length ?? 0}`
  );
  assert.equal(
    response1Inputs?.[0]?.getAttribute('value'),
    'alpha',
    `RESPONSE_1 cloze input value must be "alpha"; got "${response1Inputs?.[0]?.getAttribute('value')}"`
  );
  const response1Text = response1Wrapper?.textContent ?? '';
  assert.ok(
    !response1Text.includes('（無回答）'),
    `RESPONSE_1 wrapper must NOT contain （無回答） (it has a real value "alpha"); got: ${response1Text}`
  );

  // RESPONSE_2 wrapper: contains （無回答）, does NOT contain "alpha" or
  // any readonly cloze input.
  const response2Wrapper = findInteractionWrapper(doc, 'legacy-tail-empty', 'RESPONSE_2');
  assert.ok(response2Wrapper, 'RESPONSE_2 wrapper must exist');
  const response2Text = response2Wrapper?.textContent ?? '';
  assert.ok(
    response2Text.includes('（無回答）'),
    `RESPONSE_2 wrapper must contain （無回答） for the tail-empty case; got: ${response2Text}`
  );
  assert.ok(
    !response2Text.includes('alpha'),
    `RESPONSE_2 wrapper must NOT contain "alpha" (only RESPONSE_1 binds to "alpha"); got: ${response2Text}`
  );
  const response2ClozeInputs = response2Wrapper?.querySelectorAll(
    'input.cloze-input.qti-blank-input'
  );
  assert.equal(
    response2ClozeInputs?.length ?? 0,
    0,
    `RESPONSE_2 wrapper must contain NO readonly cloze inputs (its value is the dropped empty); got ${response2ClozeInputs?.length ?? 0}`
  );

  // Wrapper order: RESPONSE_1 first, RESPONSE_2 second.
  const wrappers = Array.from(block?.querySelectorAll('.candidate-response-interaction') ?? []);
  assert.equal(wrappers.length, 2, 'exactly two per-interaction wrappers expected');
  assert.equal(
    wrappers[0]?.getAttribute('data-interaction-id'),
    'RESPONSE_1',
    `first wrapper must be RESPONSE_1; got "${wrappers[0]?.getAttribute('data-interaction-id')}"`
  );
  assert.equal(
    wrappers[1]?.getAttribute('data-interaction-id'),
    'RESPONSE_2',
    `second wrapper must be RESPONSE_2; got "${wrappers[1]?.getAttribute('data-interaction-id')}"`
  );
});

/**
 * Parse a CSV file into one entry per logical row. Quoted fields may
 * contain commas, newlines, and escaped quotes (""). Each entry is the
 * unquoted list of field values in the order they appear on the row.
 * The trailing line-ending newline (if any) is dropped.
 *
 * Re-implemented inline to avoid a cross-file dependency on
 * `csv-report.test.ts`. Kept in lockstep with that file's helper.
 */
function parseCsvLogicalRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentCells: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      currentCells.push(currentField);
      currentField = '';
      continue;
    }
    if (char === '\n') {
      currentCells.push(currentField);
      rows.push(currentCells);
      currentCells = [];
      currentField = '';
      continue;
    }
    if (char === '\r') {
      // Swallow CR — LF marks the row boundary.
      continue;
    }
    currentField += char;
  }
  if (currentField.length > 0 || currentCells.length > 0) {
    currentCells.push(currentField);
    rows.push(currentCells);
  }
  return rows;
}

function readCsvWithoutBom(csvPath: string): { buffer: Buffer; text: string } {
  const buffer = fs.readFileSync(csvPath);
  const bom = buffer.subarray(0, 3);
  assert.deepEqual(Array.from(bom), [0xef, 0xbb, 0xbf], 'CSV must start with UTF-8 BOM');
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return { buffer, text };
}

function runEmptyValuesCli(dirName: string): { csvPath: string; text: string } {
  const outputRootDir = createCleanOutputDir(dirName);
  const assessmentTestPath = writeEmptyValuesAssessmentTest(outputRootDir);

  const exitCode = runCli([
    '--assessment-test',
    assessmentTestPath,
    '--assessment-result',
    resolveFixturePath('unification-legacy-empty-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0, 'CLI must exit 0');

  const csvPath = path.join(outputRootDir, 'report.csv');
  assert.equal(fs.existsSync(csvPath), true, 'report.csv must be created at the output root');
  const { text } = readCsvWithoutBom(csvPath);
  return { csvPath, text };
}

function findRowByIdentifier(logicalRows: string[][], itemIdentifier: string): string[] {
  assert.ok(logicalRows.length >= 2, 'header + at least one data row expected');
  const dataRows = logicalRows.slice(1);
  const row = dataRows.find((cells) => cells[6] === itemIdentifier);
  assert.ok(row, `row for ${itemIdentifier} must exist`);
  return row;
}

test('CSV: head-empty legacy item keeps "beta" with no leading or trailing newlines, no empty line', () => {
  // legacy-head-empty: values [""", "beta"] (leading empty) — the
  // CSV layer drops the strictly-empty value, leaving "beta" as the
  // single cell value. There must be no leading newline, no trailing
  // newline, no empty line, and "beta" must appear exactly once.
  const { text } = runEmptyValuesCli('legacy-head-empty-csv');
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'legacy-head-empty');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    'beta',
    `legacy-head-empty response_values must equal "beta" (NOT "beta", no leading/trailing newline, no empty line); got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'beta',
    `legacy-head-empty response_labels must equal "beta"; got ${JSON.stringify(responseLabels)}`
  );

  // Universal empty-line / leading-newline invariants.
  assert.ok(
    !responseValues.startsWith('\n'),
    `response_values must not start with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseValues.endsWith('\n'),
    `response_values must not end with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseValues.includes('\n\n'),
    `response_values must not contain an empty line; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseLabels.startsWith('\n'),
    `response_labels must not start with a newline; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseLabels.endsWith('\n'),
    `response_labels must not end with a newline; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseLabels.includes('\n\n'),
    `response_labels must not contain an empty line; got ${JSON.stringify(responseLabels)}`
  );

  // "beta" appears exactly once in each cell.
  const betaCountValues = (responseValues.match(/\bbeta\b/g) ?? []).length;
  const betaCountLabels = (responseLabels.match(/\bbeta\b/g) ?? []).length;
  assert.equal(
    betaCountValues,
    1,
    `response_values must include "beta" exactly once; got "${responseValues}"`
  );
  assert.equal(
    betaCountLabels,
    1,
    `response_labels must include "beta" exactly once; got "${responseLabels}"`
  );

  // "alpha" must not appear in the row at all (the head-empty case has
  // no alpha value at any binding index).
  assert.ok(
    !responseValues.includes('alpha'),
    `legacy-head-empty response_values must not include "alpha" (no alpha binding); got "${responseValues}"`
  );
  assert.ok(
    !responseLabels.includes('alpha'),
    `legacy-head-empty response_labels must not include "alpha" (no alpha binding); got "${responseLabels}"`
  );
});

test('CSV: tail-empty legacy item keeps "alpha" with no leading or trailing newlines, no empty line', () => {
  // legacy-tail-empty: values ["alpha", ""] (trailing empty) — the
  // CSV layer drops the strictly-empty value, leaving "alpha" as the
  // single cell value. There must be no leading newline, no trailing
  // newline, no empty line, and "alpha" must appear exactly once.
  const { text } = runEmptyValuesCli('legacy-tail-empty-csv');
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'legacy-tail-empty');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    'alpha',
    `legacy-tail-empty response_values must equal "alpha" (NOT "alpha", no leading/trailing newline, no empty line); got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'alpha',
    `legacy-tail-empty response_labels must equal "alpha"; got ${JSON.stringify(responseLabels)}`
  );

  // Universal empty-line / leading-newline invariants.
  assert.ok(
    !responseValues.startsWith('\n'),
    `response_values must not start with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseValues.endsWith('\n'),
    `response_values must not end with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseValues.includes('\n\n'),
    `response_values must not contain an empty line; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseLabels.startsWith('\n'),
    `response_labels must not start with a newline; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseLabels.endsWith('\n'),
    `response_labels must not end with a newline; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseLabels.includes('\n\n'),
    `response_labels must not contain an empty line; got ${JSON.stringify(responseLabels)}`
  );

  // "alpha" appears exactly once in each cell.
  const alphaCountValues = (responseValues.match(/\balpha\b/g) ?? []).length;
  const alphaCountLabels = (responseLabels.match(/\balpha\b/g) ?? []).length;
  assert.equal(
    alphaCountValues,
    1,
    `response_values must include "alpha" exactly once; got "${responseValues}"`
  );
  assert.equal(
    alphaCountLabels,
    1,
    `response_labels must include "alpha" exactly once; got "${responseLabels}"`
  );

  // "beta" must not appear in the row at all (the tail-empty case has
  // no beta value at any binding index).
  assert.ok(
    !responseValues.includes('beta'),
    `legacy-tail-empty response_values must not include "beta" (no beta binding); got "${responseValues}"`
  );
  assert.ok(
    !responseLabels.includes('beta'),
    `legacy-tail-empty response_labels must not include "beta" (no beta binding); got "${responseLabels}"`
  );
});
