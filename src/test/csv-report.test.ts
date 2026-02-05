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
