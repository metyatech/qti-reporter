import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
