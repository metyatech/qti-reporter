import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../cli.js';
import { generateHtmlReportFromFiles } from '../report/htmlReport.js';

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

test('generates HTML report with required naming and ordering', () => {
  const outputRootDir = createCleanOutputDir('html-report');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });

  assert.equal(report.candidateNumber, '0007');
  assert.equal(report.candidateName, 'Yamada Taro');
  assert.equal(report.testTitle, 'Assessment Test');

  assert.equal(report.directoryName, '0007 Yamada Taro');
  assert.equal(report.fileName, '0007 Yamada Taro Assessment Test 結果.html');

  assert.equal(report.outputDirPath, path.join(outputRootDir, report.directoryName));
  assert.equal(report.outputFilePath, path.join(report.outputDirPath, report.fileName));
  assert.equal(fs.existsSync(report.outputFilePath), true);

  const html = report.html;

  assert.ok(html.includes('data-qti-reporter-style="default"'));
  assert.ok(!html.includes('data-qti-reporter-style="external"'));
  assert.ok(html.includes('score-total'));
  assert.ok(html.includes('meta-value'));
  assert.ok(report.unusedItemResultIdentifiers.includes('item-extra'));

  const titleIndex = html.indexOf('Assessment Test');
  const numberIndex = html.indexOf('0007');
  const nameIndex = html.indexOf('Yamada Taro');
  const totalScoreIndex = html.lastIndexOf('score-total');

  assert.ok(titleIndex >= 0, 'test title must be present');
  assert.ok(numberIndex > titleIndex, 'candidate number must appear after test title');
  assert.ok(nameIndex > numberIndex, 'candidate name must appear after candidate number');
  assert.ok(totalScoreIndex > nameIndex, 'total score must appear after candidate name');
});

test('renders item blocks in assessment-test order with rubric mapping', () => {
  const outputRootDir = createCleanOutputDir('html-order');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });

  const html = report.html;

  const item2Index = html.indexOf('data-item-identifier="item-2"');
  const item1Index = html.indexOf('data-item-identifier="item-1"');
  const item3Index = html.indexOf('data-item-identifier="item-3"');
  const item4Index = html.indexOf('data-item-identifier="item-4"');
  const item5Index = html.indexOf('data-item-identifier="item-5"');
  const item6Index = html.indexOf('data-item-identifier="item-6"');
  const item7Index = html.indexOf('data-item-identifier="item-7"');
  const item8Index = html.indexOf('data-item-identifier="item-8"');
  assert.ok(item2Index >= 0, 'item-2 block must exist');
  assert.ok(item1Index > item2Index, 'item order must follow assessment-test refs');
  assert.ok(item3Index > item1Index, 'item-3 must appear after item-1');
  assert.ok(item4Index > item3Index, 'item-4 must appear after item-3');
  assert.ok(item5Index > item4Index, 'item-5 must appear after item-4');
  assert.ok(item6Index > item5Index, 'item-6 must appear after item-5');
  assert.ok(item7Index > item6Index, 'item-7 must appear after item-6');
  assert.ok(item8Index > item7Index, 'item-8 must appear after item-7');

  assert.ok(html.includes('Mentions attraction between masses'));
  assert.ok(html.includes('Notes acceleration toward Earth'));
  assert.ok(html.includes('Uses clear wording'));
  assert.ok(html.includes('採点者コメント'));
  assert.ok(html.includes('表現をより簡潔にしてください'));
  assert.match(html, /class="[^"]*cloze-input/);
  assert.ok(html.includes('2回目以降にクリックしても「ON」のまま。'));
  assert.ok(html.includes('次のCSSの空欄を埋めなさい。'));
  assert.ok(html.includes('language-css'));
  assert.ok(!html.includes('</code><input'), 'cloze input must not split code tags');
  assert.ok(item7Index >= 0, 'item-7 block must exist');
  const item7Html = html.slice(item7Index);
  assert.ok(
    item7Html.includes('qti-blank-input'),
    'cloze input must include qti-blank-input class',
  );
  assert.ok(item7Html.includes('value="1"'), 'cloze input must include candidate response value');
  assert.ok(item7Html.includes('size="6"'), 'cloze input size must expand with content');
  assert.ok(
    !item7Html.includes('&lt;input class=cloze-input'),
    'escaped cloze inputs must be restored',
  );
  assert.ok(item8Index >= 0, 'item-8 block must exist');
  const item8Html = html.slice(item8Index);
  assert.ok(!item8Html.includes('</code><input'), 'multi-code cloze must not split code tags');
  assert.ok(
    !item8Html.includes('&lt;input class=cloze-input'),
    'multi-code cloze inputs must be restored',
  );
  assert.ok(item8Html.includes('data-code-lang="css"'), 'cloze CSS blocks should resolve language');

  assert.ok(html.includes('Select the correct sum'));
  assert.ok(html.includes('Avoid common mistake'));

  assert.ok(html.includes('data-criterion-status="true"'));
  assert.ok(html.includes('data-criterion-status="false"'));
  assert.match(html, /<p>Explain the meaning of gravity\.<\/p>/);
  assert.match(html, /<p>What is 1 \+ 1\?<\/p>/);
  assert.ok(!html.includes('extended text response'));
  assert.ok(!html.includes('text entry response'));
  assert.ok(html.includes('<pre'));
  assert.match(html, /class="[^"]*\bcode-block\b/);
  assert.match(html, /class="[^"]*\bcode-block-code\b/);
  assert.ok(html.includes('data-code-lang="ts"'));
  assert.ok(html.includes('data-code-lang="html"'));
  assert.match(html, /class="[^"]*\bscore-badge\b/);
  assert.ok(!html.includes('images/sample.svg'));
  assert.ok(
    html.includes(
      'Gravity is a force that attracts objects with mass toward each other,\nespecially toward Earth.',
    ),
  );
});

test('copies image assets and rewrites img src to output-relative paths', () => {
  const outputRootDir = createCleanOutputDir('html-images');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });

  const expectedAssetPath = path.join(report.outputDirPath, 'assets', 'item-5', 'sample.svg');

  assert.equal(fs.existsSync(expectedAssetPath), true);
  assert.ok(report.html.includes('./assets/item-5/sample.svg'));
});

test('throws a clear error when candidate number cannot be extracted', () => {
  const repoRoot = getRepoRootFromDist();
  const outputRootDir = createCleanOutputDir('html-error');

  const invalidResultPath = path.join(repoRoot, 'tmp', 'invalid-result.xml');
  const invalidResultContent =
    '<?xml version="1.0" encoding="UTF-8"?><assessmentResult xmlns="http://www.imsglobal.org/xsd/imsqti_result_v3p0"><context sourcedId="no-digits"><sessionIdentifier sourceID="candidateName" identifier="No Digits" /></context></assessmentResult>';
  fs.writeFileSync(invalidResultPath, invalidResultContent, 'utf8');

  assert.throws(
    () =>
      generateHtmlReportFromFiles({
        assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
        assessmentResultPath: invalidResultPath,
        outputRootDir,
      }),
    /candidate number/i,
  );
});

test('uses external CSS when styleCssPath is provided', () => {
  const outputRootDir = createCleanOutputDir('html-style-external');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
    styleCssPath: resolveFixturePath('custom-style.css'),
  });

  assert.equal(report.styleMode, 'external');
  assert.ok(report.externalStylePath);
  assert.equal(fs.existsSync(report.externalStylePath ?? ''), true);

  const html = report.html;
  assert.ok(html.includes('data-qti-reporter-style="external"'));
  assert.ok(!html.includes('data-qti-reporter-style="default"'));
});

test('logs unused itemResult identifiers to standard output', () => {
  const outputRootDir = createCleanOutputDir('html-unused-log');
  const logs: string[] = [];
  const errors: string[] = [];

  const exitCode = runCli(
    [
      '--assessment-test',
      resolveFixturePath('assessment-test.qti.xml'),
      '--assessment-result',
      resolveFixturePath('assessment-result.xml'),
      '--out-dir',
      outputRootDir,
    ],
    {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
  assert.ok(logs.some((line) => line.includes('item-extra')));
});

test('uses item score sum for total score when test score is stale', () => {
  const outputRootDir = createCleanOutputDir('html-total-score');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result-score-mismatch.xml'),
    outputRootDir,
  });

  const match = report.html.match(/score-total[\s\S]*?<span class="score-value">(\d+)<\/span>/);
  assert.ok(match, 'total score block must be present');
  assert.equal(match?.[1], '10');
});
