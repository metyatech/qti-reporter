import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../cli.js';

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

function readCsvWithoutBom(csvPath: string): { buffer: Buffer; text: string } {
  const buffer = fs.readFileSync(csvPath);
  const bom = buffer.subarray(0, 3);
  assert.deepEqual(Array.from(bom), [0xef, 0xbb, 0xbf], 'CSV must start with UTF-8 BOM');
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  return { buffer, text };
}

function writePatchedResultXml(suffix: string, patched: string): string {
  // Copy the source fixture to a tmp file and replace the entire
  // itemResult block identified by the unique open tag (handled by the
  // caller via a single regex on the fixture). Keeping the rest of the
  // file identical to the original means every non-patched item is
  // parsed exactly the same as in the unmodified CSV run, so the new
  // assertions scope strictly to the patched item's CSV cells.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qti-reporter-csv-${suffix}-`));
  const file = path.join(dir, 'unification-result.xml');
  fs.writeFileSync(file, patched, 'utf8');
  return file;
}

function findRowByIdentifier(logicalRows: string[][], itemIdentifier: string): string[] {
  assert.ok(logicalRows.length >= 2, 'header + at least one data row expected');
  const dataRows = logicalRows.slice(1);
  const row = dataRows.find((cells) => cells[6] === itemIdentifier);
  assert.ok(row, `row for ${itemIdentifier} must exist`);
  return row;
}

test('generates report.csv with UTF-8 BOM and deterministic rows', () => {
  const outputRootDir = createCleanOutputDir('csv-report');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('assessment-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  assert.equal(fs.existsSync(csvPath), true, 'report.csv must be created at the output root');

  const { text } = readCsvWithoutBom(csvPath);
  const expectedCsv = [
    'candidate_number,candidate_name,test_title,total_score,total_max_score,item_order,item_identifier,item_title,item_score,item_max_score,rubric_outcomes,rubric_points,response_values,response_labels,comment',
    '0007,Yamada Taro,Assessment Test,10,12,1,item-2,Item 2,3,4,1:true;2:true;3:false,1:2;2:1;3:1,"Gravity is a force that attracts objects with mass toward each other,\nespecially toward Earth.","Gravity is a force that attracts objects with mass toward each other,\nespecially toward Earth.",2点の観点は満たせていますが、表現をより簡潔にしてください。',
    '0007,Yamada Taro,Assessment Test,10,12,2,item-1,Item 1,1,2,1:true;2:false,1:1;2:1,CHOICE_2,CHOICE_2: 2,',
    '0007,Yamada Taro,Assessment Test,10,12,3,item-3,Item 3,1,1,1:true,1:1,6,6,',
    '0007,Yamada Taro,Assessment Test,10,12,4,item-4,Item 4,1,1,1:true,1:1,HTML,HTML,',
    '0007,Yamada Taro,Assessment Test,10,12,5,item-5,Item 5,1,1,1:true,1:1,Sample,Sample,',
    '0007,Yamada Taro,Assessment Test,10,12,6,item-6,Item 6,1,1,1:true,1:1,ON,ON,',
    '0007,Yamada Taro,Assessment Test,10,12,7,item-7,Item 7,1,1,1:true,1:1,1,1,',
    '0007,Yamada Taro,Assessment Test,10,12,8,item-8,Item 8,1,1,1:true,1:1,"0\n{","0\n{",',
  ].join('\n');

  assert.equal(text, expectedCsv);
});

test('generates report.csv for new QTI package fixture', () => {
  const outputRootDir = createCleanOutputDir('csv-new-package');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('assessment-test-new-package.qti.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result-new-package.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  const rows = text.split('\n');

  assert.equal(rows.length, 4);
  assert.ok(text.includes('0009,Sato Hanako,New Package Compatibility,3,3,1,new-choice'));
  assert.ok(text.includes('0009,Sato Hanako,New Package Compatibility,3,3,2,new-cloze'));
  assert.ok(text.includes('0009,Sato Hanako,New Package Compatibility,3,3,3,new-descriptive'));
});

test('appends rows without duplicating the header', () => {
  const outputRootDir = createCleanOutputDir('csv-append');

  const argv = [
    '--assessment-test',
    resolveFixturePath('assessment-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result.xml'),
    '--out-dir',
    outputRootDir,
  ];

  assert.equal(runCli(argv), 0);
  assert.equal(runCli(argv), 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  const header = text.split('\n')[0];
  const headerCount = text.split(header).length - 1;

  assert.equal(headerCount, 1, 'header must appear exactly once');
});

test('generates CSV for multiple assessment results in a single run', () => {
  const outputRootDir = createCleanOutputDir('csv-multi');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('assessment-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result-2.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  const header = text.split('\n')[0];
  const headerCount = text.split(header).length - 1;
  assert.equal(headerCount, 1, 'header must appear exactly once');
  assert.ok(text.includes('0007'), 'first candidate must be included');
  assert.ok(text.includes('0008'), 'second candidate must be included');
});

test('uses test score from result XML even when it differs from item sum', () => {
  const outputRootDir = createCleanOutputDir('csv-total-score');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('assessment-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('assessment-result-score-mismatch.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  const firstRow = text.split('\n')[1];
  const columns = firstRow.split(',');
  const totalScore = columns[3];
  assert.equal(totalScore, '0');
});

test('legacy ordered RESPONSE distribution emits one value per interaction in the CSV', () => {
  // legacy-ordered has a single RESPONSE declaration (cardinality=ordered,
  // base-type=string) and two text-entry interactions RESPONSE_1 /
  // RESPONSE_2. The renderer assigns declarationValueIndex=0 to RESPONSE_1
  // and declarationValueIndex=1 to RESPONSE_2. The CSV must surface each
  // value exactly once in document order — alpha first, beta second — and
  // must not collapse, duplicate, or reorder them.
  const outputRootDir = createCleanOutputDir('csv-legacy-ordered');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('unification-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  // The values cell for the legacy-ordered row is multi-line
  // (alpha\nbeta). Walk the file by quoting state to split logical rows
  // and pull out the response_values and response_labels cells for the
  // legacy-ordered item.
  const logicalRows = parseCsvLogicalRows(text);
  // Drop the header.
  assert.ok(logicalRows.length >= 2, 'header + at least one data row expected');
  const dataRows = logicalRows.slice(1);
  const legacyRow = dataRows.find((cells) => cells[6] === 'legacy-ordered');
  assert.ok(legacyRow, 'legacy-ordered row must exist');

  const legacyResponseValues = legacyRow[12];
  const legacyResponseLabels = legacyRow[13];
  assert.ok(legacyResponseValues, 'response_values cell must be found for legacy-ordered');
  assert.ok(legacyResponseLabels, 'response_labels cell must be found for legacy-ordered');

  // alpha and beta must each appear exactly once.
  const alphaCountValues = (legacyResponseValues.match(/\balpha\b/g) ?? []).length;
  const betaCountValues = (legacyResponseValues.match(/\bbeta\b/g) ?? []).length;
  assert.equal(
    alphaCountValues,
    1,
    `response_values must include alpha exactly once; got "${legacyResponseValues}"`
  );
  assert.equal(
    betaCountValues,
    1,
    `response_values must include beta exactly once; got "${legacyResponseValues}"`
  );
  // Order must be alpha before beta.
  const alphaIdxValues = legacyResponseValues.indexOf('alpha');
  const betaIdxValues = legacyResponseValues.indexOf('beta');
  assert.ok(
    alphaIdxValues >= 0 && betaIdxValues > alphaIdxValues,
    `response_values must keep alpha before beta; got "${legacyResponseValues}"`
  );

  const alphaCountLabels = (legacyResponseLabels.match(/\balpha\b/g) ?? []).length;
  const betaCountLabels = (legacyResponseLabels.match(/\bbeta\b/g) ?? []).length;
  assert.equal(
    alphaCountLabels,
    1,
    `response_labels must include alpha exactly once; got "${legacyResponseLabels}"`
  );
  assert.equal(
    betaCountLabels,
    1,
    `response_labels must include beta exactly once; got "${legacyResponseLabels}"`
  );
  const alphaIdxLabels = legacyResponseLabels.indexOf('alpha');
  const betaIdxLabels = legacyResponseLabels.indexOf('beta');
  assert.ok(
    alphaIdxLabels >= 0 && betaIdxLabels > alphaIdxLabels,
    `response_labels must keep alpha before beta; got "${legacyResponseLabels}"`
  );
});

test('distinct RESPONSE_1/RESPONSE_2 declarations emit one value per identifier in the CSV', () => {
  // legacy-distinct-vars has two separate RESPONSE_1 / RESPONSE_2 declarations
  // (cardinality=single each). Unlike legacy-ordered where the renderer
  // distributes from a single cardinality=ordered RESPONSE, here each
  // interaction binds directly to its own identifier. The CSV must still
  // surface alpha and beta exactly once each in document order, and must
  // NOT duplicate them. We verify this alongside legacy-ordered so both
  // paths produce identical response_values semantics.
  const outputRootDir = createCleanOutputDir('csv-legacy-distinct-vars');

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('unification-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);

  assert.equal(exitCode, 0);

  const csvPath = path.join(outputRootDir, 'report.csv');
  const { text } = readCsvWithoutBom(csvPath);
  const logicalRows = parseCsvLogicalRows(text);
  assert.ok(logicalRows.length >= 2, 'header + at least one data row expected');
  const dataRows = logicalRows.slice(1);

  // Check both legacy items produce the same semantics.
  const legacyItems = ['legacy-ordered', 'legacy-distinct-vars'];
  for (const itemId of legacyItems) {
    const row = dataRows.find((cells) => cells[6] === itemId);
    assert.ok(row, `${itemId} row must exist`);

    const responseValues = row[12];
    const responseLabels = row[13];
    assert.ok(responseValues, `response_values cell must be found for ${itemId}`);
    assert.ok(responseLabels, `response_labels cell must be found for ${itemId}`);

    // alpha and beta must each appear exactly once — no duplicates from
    // over-eager binding.
    const alphaCountValues = (responseValues.match(/\balpha\b/g) ?? []).length;
    const betaCountValues = (responseValues.match(/\bbeta\b/g) ?? []).length;
    assert.equal(
      alphaCountValues,
      1,
      `response_values for ${itemId} must include alpha exactly once; got "${responseValues}"`
    );
    assert.equal(
      betaCountValues,
      1,
      `response_values for ${itemId} must include beta exactly once; got "${responseValues}"`
    );
    // Order must be alpha before beta.
    const alphaIdxValues = responseValues.indexOf('alpha');
    const betaIdxValues = responseValues.indexOf('beta');
    assert.ok(
      alphaIdxValues >= 0 && betaIdxValues > alphaIdxValues,
      `response_values for ${itemId} must keep alpha before beta; got "${responseValues}"`
    );

    // Same checks for response_labels.
    const alphaCountLabels = (responseLabels.match(/\balpha\b/g) ?? []).length;
    const betaCountLabels = (responseLabels.match(/\bbeta\b/g) ?? []).length;
    assert.equal(
      alphaCountLabels,
      1,
      `response_labels for ${itemId} must include alpha exactly once; got "${responseLabels}"`
    );
    assert.equal(
      betaCountLabels,
      1,
      `response_labels for ${itemId} must include beta exactly once; got "${responseLabels}"`
    );
    const alphaIdxLabels = responseLabels.indexOf('alpha');
    const betaIdxLabels = responseLabels.indexOf('beta');
    assert.ok(
      alphaIdxLabels >= 0 && betaIdxLabels > alphaIdxLabels,
      `response_labels for ${itemId} must keep alpha before beta; got "${responseLabels}"`
    );
  }

  // Confirm legacy-distinct-vars uses direct binding (joined form
  // alpha\nbeta) and NOT the over-eager form alpha\nbeta\nalpha\nbeta.
  const distinctRow = dataRows.find((cells) => cells[6] === 'legacy-distinct-vars');
  const distinctValues = distinctRow?.[12] ?? '';
  assert.ok(
    !distinctValues.includes('alpha\nbeta\n'),
    `legacy-distinct-vars must not have duplicate values; got "${distinctValues}"`
  );
});

// The following block pins the CSV layer's empty-value handling to the
// shared `dropEmptyResponseValues` rule (length === 0 only, no trim).
// Each test patches the result XML in a tmp file so the original
// `src/test/fixtures/unification-result.xml` is never modified: the CLI
// is invoked with the original assessment-test fixture (so the items
// and item references are byte-identical) and a per-test patched
// result, and every assertion is scoped to the patched item's CSV row
// via `parseCsvLogicalRows`. Tests are intentionally kept small — one
// invariant per test — so a regression names a single failure mode.

/** Patch the multi-choice itemResult to `["", "CHOICE_C"]`. */
function patchMultiChoiceEmptyThenChoiceC(): string {
  const source = fs.readFileSync(resolveFixturePath('unification-result.xml'), 'utf8');
  const replacement = `<itemResult identifier="multi-choice" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
    <responseVariable identifier="RESPONSE" baseType="identifier" cardinality="multiple">
      <candidateResponse>
        <value/>
        <value>CHOICE_C</value>
      </candidateResponse>
    </responseVariable>
    <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
      <value>1</value>
    </outcomeVariable>
    <outcomeVariable identifier="RUBRIC_1_MET" baseType="boolean" cardinality="single">
      <value>true</value>
    </outcomeVariable>
  </itemResult>`;
  const target =
    /<itemResult identifier="multi-choice"[\s\S]*?<\/itemResult>\n {2}<itemResult identifier="collision-choice"/;
  const match = source.match(target);
  assert.ok(match, 'multi-choice block must be found in source fixture');
  return source.replace(match[0], `${replacement}\n  <itemResult identifier="collision-choice"`);
}

/** Patch the extended-text itemResult to `["", "line one\n  indented"]`. */
function patchExtendedTextEmptyThenAnswer(): string {
  const source = fs.readFileSync(resolveFixturePath('unification-result.xml'), 'utf8');
  const replacement = `<itemResult identifier="extended-text" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
    <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
      <candidateResponse>
        <value/>
        <value>line one
  indented</value>
      </candidateResponse>
    </responseVariable>
    <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
      <value>1</value>
    </outcomeVariable>
    <outcomeVariable identifier="RUBRIC_1_MET" baseType="boolean" cardinality="single">
      <value>true</value>
    </outcomeVariable>
  </itemResult>`;
  // Anchor: the original block has a single `<candidateResponse>` with
  // the multi-line whitespace payload. Replace the block that ends
  // right before the `<itemResult identifier="image-correct"`.
  const target =
    /<itemResult identifier="extended-text"[\s\S]*?<\/itemResult>\n {2}<itemResult identifier="image-correct"/;
  const match = source.match(target);
  assert.ok(match, 'extended-text block must be found in source fixture');
  return source.replace(match[0], `${replacement}\n  <itemResult identifier="image-correct"`);
}

/** Patch the multiple-values itemResult to `["", "CHOICE_A", "CHOICE_B"]`. */
function patchMultipleValuesEmptyLeading(): string {
  const source = fs.readFileSync(resolveFixturePath('unification-result.xml'), 'utf8');
  const replacement = `<itemResult identifier="multiple-values" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
    <responseVariable identifier="RESPONSE" baseType="identifier" cardinality="multiple">
      <candidateResponse>
        <value/>
        <value>CHOICE_A</value>
        <value>CHOICE_B</value>
      </candidateResponse>
    </responseVariable>
    <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
      <value>1</value>
    </outcomeVariable>
    <outcomeVariable identifier="RUBRIC_1_MET" baseType="boolean" cardinality="single">
      <value>true</value>
    </outcomeVariable>
  </itemResult>`;
  // Anchor: the original block precedes `<itemResult identifier="duplicate-ids"`.
  const target =
    /<itemResult identifier="multiple-values"[\s\S]*?<\/itemResult>\n {2}<itemResult identifier="duplicate-ids"/;
  const match = source.match(target);
  assert.ok(match, 'multiple-values block must be found in source fixture');
  return source.replace(match[0], `${replacement}\n  <itemResult identifier="duplicate-ids"`);
}

/** Patch the extended-text itemResult to a single `<value/>`. */
function patchExtendedTextEmptyOnly(): string {
  const source = fs.readFileSync(resolveFixturePath('unification-result.xml'), 'utf8');
  const replacement = `<itemResult identifier="extended-text" datestamp="2026-06-13T00:00:00+09:00" sessionStatus="final">
    <responseVariable identifier="RESPONSE" baseType="string" cardinality="single">
      <candidateResponse>
        <value/>
      </candidateResponse>
    </responseVariable>
    <outcomeVariable identifier="SCORE" baseType="float" cardinality="single">
      <value>0</value>
    </outcomeVariable>
    <outcomeVariable identifier="RUBRIC_1_MET" baseType="boolean" cardinality="single">
      <value>false</value>
    </outcomeVariable>
  </itemResult>`;
  const target =
    /<itemResult identifier="extended-text"[\s\S]*?<\/itemResult>\n {2}<itemResult identifier="image-correct"/;
  const match = source.match(target);
  assert.ok(match, 'extended-text block must be found in source fixture');
  return source.replace(match[0], `${replacement}\n  <itemResult identifier="image-correct"`);
}

test('descriptive item with values: [""] produces an empty response_values/response_labels cell', () => {
  // The `extended-text` item is a descriptive item (no interaction);
  // its responseVariable has cardinality="single", so a single
  // `<value/>` parses to `values: [""]`. With the shared
  // `dropEmptyResponseValues` helper, an all-empty values list must
  // collapse to the empty cell — never an empty line in a multi-line
  // value.
  const outputRootDir = createCleanOutputDir('csv-empty-only');
  const resultPath = writePatchedResultXml('empty-only', patchExtendedTextEmptyOnly());

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resultPath,
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'extended-text');

  // Column 12 is response_values, column 13 is response_labels.
  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    '',
    `response_values must be empty for descriptive [""]; got "${responseValues}"`
  );
  assert.equal(
    responseLabels,
    '',
    `response_labels must be empty for descriptive [""]; got "${responseLabels}"`
  );
});

test('descriptive item with values: ["", "answer"] drops the empty and keeps "answer" with no leading newline', () => {
  // The shared helper drops strictly-empty values. A leading empty
  // entry in a multi-value descriptive response must NOT produce a
  // leading newline in the CSV cell.
  const outputRootDir = createCleanOutputDir('csv-descriptive-empty-then-answer');
  const resultPath = writePatchedResultXml(
    'descriptive-empty-then-answer',
    patchExtendedTextEmptyThenAnswer()
  );

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resultPath,
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'extended-text');

  const responseValues = row[12];
  const responseLabels = row[13];
  // Multi-line answer must keep its inner whitespace AND keep its
  // leading whitespace line ("  indented") verbatim — the CSV
  // exporter never trims.
  assert.equal(
    responseValues,
    'line one\n  indented',
    `response_values must equal "line one\\n  indented" with no leading newline; got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'line one\n  indented',
    `response_labels must equal "line one\\n  indented" with no leading newline; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseValues.startsWith('\n'),
    `response_values must not start with a newline; got ${JSON.stringify(responseValues)}`
  );
});

test('choice item with values: ["", "CHOICE_C"] keeps only CHOICE_C with the matching label', () => {
  // The multi-choice fixture's RESPONSE is cardinality="multiple" with
  // `<value/>` then `<value>CHOICE_C</value>`. The label cell uses
  // CHOICE_C's text from the item XML ("Third").
  const outputRootDir = createCleanOutputDir('csv-choice-empty-then-choic-c');
  const resultPath = writePatchedResultXml(
    'choice-empty-then-choic-c',
    patchMultiChoiceEmptyThenChoiceC()
  );

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resultPath,
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'multi-choice');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    'CHOICE_C',
    `response_values must be the single real choice; got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'CHOICE_C: Third',
    `response_labels must use the choice identifier and label text; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseValues.startsWith('\n'),
    `response_values must not start with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseLabels.startsWith('\n'),
    `response_labels must not start with a newline; got ${JSON.stringify(responseLabels)}`
  );
});

test('multiple choice item with values: ["", "CHOICE_A", "CHOICE_B"] keeps both real choices in document order', () => {
  // `multiple-values` is cardinality="multiple"; a leading empty must
  // not shift the surviving values to the right or drop them.
  const outputRootDir = createCleanOutputDir('csv-multiple-empty-leading');
  const resultPath = writePatchedResultXml(
    'multiple-empty-leading',
    patchMultipleValuesEmptyLeading()
  );

  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resultPath,
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'multiple-values');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    'CHOICE_A\nCHOICE_B',
    `response_values must keep both real choices; got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'CHOICE_A: Alpha\nCHOICE_B: Beta',
    `response_labels must use the choice identifier and label text; got ${JSON.stringify(responseLabels)}`
  );
  assert.ok(
    !responseValues.startsWith('\n'),
    `response_values must not start with a newline; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    !responseLabels.startsWith('\n'),
    `response_labels must not start with a newline; got ${JSON.stringify(responseLabels)}`
  );
});

test('CSV cell never starts with a leading newline and never contains an empty line from a dropped empty value', () => {
  // Re-runs the four patched-scenario cases above and asserts the
  // universal invariants: the response_values and response_labels
  // cells must neither start with "\n" nor contain "\n\n" (which
  // would only appear if an empty value were joined in).
  const scenarios: Array<{ dir: string; suffix: string; patch: () => string; itemId: string }> = [
    {
      dir: 'csv-no-leading-newline-descriptive',
      suffix: 'no-leading-newline-descriptive',
      patch: patchExtendedTextEmptyThenAnswer,
      itemId: 'extended-text',
    },
    {
      dir: 'csv-no-leading-newline-choice',
      suffix: 'no-leading-newline-choice',
      patch: patchMultiChoiceEmptyThenChoiceC,
      itemId: 'multi-choice',
    },
    {
      dir: 'csv-no-leading-newline-multiple',
      suffix: 'no-leading-newline-multiple',
      patch: patchMultipleValuesEmptyLeading,
      itemId: 'multiple-values',
    },
    {
      dir: 'csv-no-leading-newline-empty-only',
      suffix: 'no-leading-newline-empty-only',
      patch: patchExtendedTextEmptyOnly,
      itemId: 'extended-text',
    },
  ];

  for (const scenario of scenarios) {
    const outputRootDir = createCleanOutputDir(scenario.dir);
    const resultPath = writePatchedResultXml(scenario.suffix, scenario.patch());
    const exitCode = runCli([
      '--assessment-test',
      resolveFixturePath('unification-test.qti.xml'),
      '--assessment-result',
      resultPath,
      '--out-dir',
      outputRootDir,
    ]);
    assert.equal(exitCode, 0);

    const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
    const logicalRows = parseCsvLogicalRows(text);
    const row = findRowByIdentifier(logicalRows, scenario.itemId);

    const responseValues = row[12];
    const responseLabels = row[13];
    assert.ok(
      !responseValues.startsWith('\n'),
      `${scenario.itemId} response_values must not start with newline; got ${JSON.stringify(responseValues)}`
    );
    assert.ok(
      !responseLabels.startsWith('\n'),
      `${scenario.itemId} response_labels must not start with newline; got ${JSON.stringify(responseLabels)}`
    );
    assert.ok(
      !responseValues.includes('\n\n'),
      `${scenario.itemId} response_values must not contain an empty line; got ${JSON.stringify(responseValues)}`
    );
    assert.ok(
      !responseLabels.includes('\n\n'),
      `${scenario.itemId} response_labels must not contain an empty line; got ${JSON.stringify(responseLabels)}`
    );
  }
});

test('descriptive item whitespace-only values (spaces, tabs, blank lines) are preserved verbatim in CSV cells', () => {
  // The original (unpatched) `extended-text` row already covers
  // whitespace preservation in the whole-CSV snapshot test at the top
  // of the file. This test scopes a tighter assertion to that one
  // item: the cell must start with `line one`, contain the two-space
  // indent, the tab, AND a blank line (`\n\n`). The shared helper
  // never trims; whitespace-only values are real answers and must
  // remain intact.
  const outputRootDir = createCleanOutputDir('csv-whitespace-preserved');
  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('unification-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'extended-text');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.ok(
    responseValues.startsWith('line one'),
    `extended-text cell must start with "line one"; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    responseValues.includes('  indented'),
    `extended-text cell must preserve two-space indent; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    responseValues.includes('\ttabbed'),
    `extended-text cell must preserve tab; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    responseValues.includes('\n\n'),
    `extended-text cell must preserve blank line; got ${JSON.stringify(responseValues)}`
  );
  assert.ok(
    responseValues.endsWith('blank line above'),
    `extended-text cell must end with the trailing line; got ${JSON.stringify(responseValues)}`
  );
  // response_labels mirrors response_values for descriptive items.
  assert.equal(
    responseLabels,
    responseValues,
    'response_labels must mirror response_values verbatim for descriptive items'
  );
});

test('legacy-ordered with trailing <value/> keeps alpha before beta in the CSV row', () => {
  // The `legacy-ordered` block in `unification-result.xml` already
  // carries a trailing `<value/>` (added by D10). After the CSV layer
  // drops the empty, the response_values and response_labels cells
  // must surface exactly `alpha\nbeta` — alpha first, beta second,
  // with no leading newline from the dropped empty.
  const outputRootDir = createCleanOutputDir('csv-legacy-ordered-trailing-empty');
  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('unification-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'legacy-ordered');

  const responseValues = row[12];
  const responseLabels = row[13];
  assert.equal(
    responseValues,
    'alpha\nbeta',
    `legacy-ordered response_values must be "alpha\\nbeta" with no trailing empty line; got ${JSON.stringify(responseValues)}`
  );
  assert.equal(
    responseLabels,
    'alpha\nbeta',
    `legacy-ordered response_labels must be "alpha\\nbeta" with no trailing empty line; got ${JSON.stringify(responseLabels)}`
  );

  // Order must be alpha before beta.
  const alphaIdx = responseValues.indexOf('alpha');
  const betaIdx = responseValues.indexOf('beta');
  assert.ok(
    alphaIdx >= 0 && betaIdx > alphaIdx,
    `legacy-ordered response_values must keep alpha before beta; got ${JSON.stringify(responseValues)}`
  );
});

test('legacy-ordered CSV row equals the alpha/beta snapshot in both response_values and response_labels', () => {
  // Tight snapshot assertion that pins the post-D10 / D11 row shape.
  // The trailing `<value/>` in the result XML must NOT show up as
  // an extra empty line in either CSV cell.
  const outputRootDir = createCleanOutputDir('csv-legacy-ordered-snapshot');
  const exitCode = runCli([
    '--assessment-test',
    resolveFixturePath('unification-test.qti.xml'),
    '--assessment-result',
    resolveFixturePath('unification-result.xml'),
    '--out-dir',
    outputRootDir,
  ]);
  assert.equal(exitCode, 0);

  const { text } = readCsvWithoutBom(path.join(outputRootDir, 'report.csv'));
  const logicalRows = parseCsvLogicalRows(text);
  const row = findRowByIdentifier(logicalRows, 'legacy-ordered');

  // Whole-row snapshot for the legacy-ordered CSV row, header-relative
  // column indices preserved as in the rest of the file.
  assert.deepEqual(row.slice(0, 12), [
    'unification-001',
    'Unification Tester',
    'Unification Test',
    '8',
    '23',
    '6',
    'legacy-ordered',
    'Legacy Ordered RESPONSE Distribution',
    '1',
    '1',
    '1:true',
    '1:1',
  ]);
  assert.equal(row[14], '', 'comment cell must be empty');
});

/**
 * Parse a CSV file into one entry per logical row. Quoted fields may
 * contain commas, newlines, and escaped quotes (""). Each entry is the
 * unquoted list of field values in the order they appear on the row.
 * The trailing line-ending newline (if any) is dropped.
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
