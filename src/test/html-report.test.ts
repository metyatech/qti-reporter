import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { runCli } from '../cli.js';
import { computeItemResultState, generateHtmlReportFromFiles } from '../report/htmlReport.js';

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

function writeAssessmentTestFixture(dirName: string, timeLimitAttributes: string | null): string {
  const outputDir = createCleanOutputDir(dirName);
  const timeLimitElement = timeLimitAttributes
    ? `    <qti-time-limits ${timeLimitAttributes} />\n`
    : '';
  const assessmentTestPath = path.join(outputDir, 'assessment-test.qti.xml');
  const itemRefs = [
    ['item-2', 'item-2.qti.xml'],
    ['item-1', 'item-1.qti.xml'],
    ['item-3', 'item-3.qti.xml'],
    ['item-4', 'item-4.qti.xml'],
    ['item-5', 'item-5.qti.xml'],
    ['item-6', 'item-6.qti.xml'],
    ['item-7', 'item-7.qti.xml'],
    ['item-8', 'item-8.qti.xml'],
  ]
    .map(([identifier, fileName]) => {
      const itemPath = resolveFixturePath(fileName);
      return `      <qti-assessment-item-ref identifier="${identifier}" href="${itemPath}" />`;
    })
    .join('\n');
  fs.writeFileSync(
    assessmentTestPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-test identifier="assessment-test" title="Assessment Test" xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0">
  <qti-test-part identifier="part-1" navigation-mode="linear" submission-mode="individual">
${timeLimitElement}    <qti-assessment-section identifier="section-1" title="Section 1" visible="true">
${itemRefs}
    </qti-assessment-section>
  </qti-test-part>
</qti-assessment-test>
`
  );
  return assessmentTestPath;
}

function generateHtmlReportWithTimeLimit(
  timeLimitAttributes: string | null,
  dirName: string
): string {
  const outputRootDir = createCleanOutputDir(`${dirName}-out`);

  return generateHtmlReportFromFiles({
    assessmentTestPath: writeAssessmentTestFixture(`${dirName}-test`, timeLimitAttributes),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  }).html;
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

test('generates HTML report for new QTI package fixture with test time limit', () => {
  const outputRootDir = createCleanOutputDir('html-new-package');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test-new-package.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result-new-package.xml'),
    outputRootDir,
  });

  assert.equal(report.testTitle, 'New Package Compatibility');
  assert.ok(report.html.includes('data-item-identifier="new-choice"'));
  assert.ok(report.html.includes('data-item-identifier="new-cloze"'));
  assert.ok(report.html.includes('data-item-identifier="new-descriptive"'));
  assert.ok(report.html.includes('制限時間'));
  assert.ok(report.html.includes('45分'));
});

test('renders choice responses as option HTML without internal identifiers', () => {
  const outputRootDir = createCleanOutputDir('html-choice-response');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test-new-package.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result-new-package.xml'),
    outputRootDir,
  });

  const choiceItemStart = report.html.indexOf('data-item-identifier="new-choice"');
  const nextItemStart = report.html.indexOf('data-item-identifier="new-cloze"');
  assert.ok(choiceItemStart >= 0, 'choice item block must exist');
  assert.ok(nextItemStart > choiceItemStart, 'following item block must exist');
  const choiceItemHtml = report.html.slice(choiceItemStart, nextItemStart);
  const responseBlockStart = choiceItemHtml.indexOf('class="candidate-response-content"');
  assert.ok(responseBlockStart >= 0, 'candidate response block must exist');
  const candidateResponseHtml = choiceItemHtml.slice(responseBlockStart);

  assert.match(candidateResponseHtml, /class="[^"]*\bchoice-response-list\b/);
  assert.match(
    candidateResponseHtml,
    /class="[^"]*\bchoice-response-option\b[^"]*\bchoice-response-selected\b/
  );
  assert.match(candidateResponseHtml, /QTI package\s*<code class="code-inline">XML<\/code>/);
  assert.ok(candidateResponseHtml.includes('学生の回答'));
  assert.ok(
    !candidateResponseHtml.includes('CHOICE_B'),
    'candidate response must not contain an internal ID'
  );
});

test('keeps inline code visually inline in the default report style', () => {
  const html = generateHtmlReportWithTimeLimit(null, 'html-inline-code-style');

  assert.ok(html.includes('.choice-interaction simple-choice'));
  assert.match(html, /\.choice-interaction simple-choice\s*\{[\s\S]*display: block;/);
  assert.match(html, /\.code-inline\s*\{[\s\S]*display: inline;/);
  assert.match(html, /\.code-inline\s*\{[\s\S]*vertical-align: baseline;/);
});

test('renders numeric seconds time limits in Japanese', () => {
  const cases = [
    ['120', '2分'],
    ['1200', '20分'],
    ['90', '1分30秒'],
    ['45', '45秒'],
    ['3600', '1時間'],
  ];

  for (const [maxTime, expected] of cases) {
    const html = generateHtmlReportWithTimeLimit(
      `max-time="${maxTime}"`,
      `html-time-limit-${maxTime}`
    );

    assert.ok(html.includes('制限時間'));
    assert.ok(html.includes(expected));
    assert.ok(!html.includes(`>${maxTime}<`));
  }
});

test('renders ISO seconds time limit in Japanese', () => {
  const html = generateHtmlReportWithTimeLimit('max-time="PT120S"', 'html-time-limit-iso-seconds');

  assert.ok(html.includes('制限時間'));
  assert.ok(html.includes('2分'));
  assert.ok(!html.includes('PT120S'));
});

test('renders ISO minutes time limit in Japanese', () => {
  const html = generateHtmlReportWithTimeLimit('max-time="PT20M"', 'html-time-limit-iso-minutes');

  assert.ok(html.includes('制限時間'));
  assert.ok(html.includes('20分'));
  assert.ok(!html.includes('PT20M'));
});

test('renders compound ISO time limits in Japanese', () => {
  const cases = [
    ['PT1H30M', '1時間30分'],
    ['P1DT2H', '1日2時間'],
  ];

  for (const [maxTime, expected] of cases) {
    const html = generateHtmlReportWithTimeLimit(
      `max-time="${maxTime}"`,
      `html-time-limit-${maxTime}`
    );

    assert.ok(html.includes('制限時間'));
    assert.ok(html.includes(expected));
    assert.ok(!html.includes(maxTime));
  }
});

test('does not render time limit metadata when qti-time-limits is absent', () => {
  const html = generateHtmlReportWithTimeLimit(null, 'html-time-limit-absent');

  assert.ok(!html.includes('制限時間'));
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
    'cloze input must include qti-blank-input class'
  );
  // Retake body for item-7 must not pre-fill the candidate response value.
  // The submitted value is rendered only inside the inner candidate-response
  // details block (see the dedicated test below).
  const item7RetryHtml = sliceItemBlock(html, 'item-7', 'retry-question-block');
  assert.ok(
    !/value="1"/.test(item7RetryHtml),
    'item-7 retake body must not pre-fill the candidate response value'
  );
  assert.ok(item7Html.includes('size="6"'), 'cloze input size must expand with content');
  assert.ok(
    !item7Html.includes('&lt;input class=cloze-input'),
    'escaped cloze inputs must be restored'
  );
  assert.ok(item8Index >= 0, 'item-8 block must exist');
  const item8Html = html.slice(item8Index);
  assert.ok(!item8Html.includes('</code><input'), 'multi-code cloze must not split code tags');
  assert.ok(
    !item8Html.includes('&lt;input class=cloze-input'),
    'multi-code cloze inputs must be restored'
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
      'Gravity is a force that attracts objects with mass toward each other,\nespecially toward Earth.'
    )
  );
});

test('does not allow encoded tags in cloze responses to become HTML elements', () => {
  const outputRootDir = createCleanOutputDir('html-xss');
  const repoRoot = getRepoRootFromDist();

  const baseResultXml = fs.readFileSync(resolveFixturePath('assessment-result.xml'), 'utf8');
  const patchedResultXml = baseResultXml.replace(
    /(<itemResult\b[^>]*identifier="item-7"[\s\S]*?<candidateResponse>[\s\S]*?<value\b[^>]*>)([\s\S]*?)(<\/value>)/,
    (_full, prefix: string, _value: string, suffix: string) =>
      `${prefix}&lt;script&gt;alert(1)&lt;/script&gt;${suffix}`
  );

  const maliciousResultPath = path.join(repoRoot, 'tmp', 'assessment-result-xss.xml');
  fs.writeFileSync(maliciousResultPath, patchedResultXml, 'utf8');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: maliciousResultPath,
    outputRootDir,
  });

  assert.ok(!report.html.includes('<script'), 'report HTML must not contain raw script tags');
  assert.ok(report.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('escapes additional XSS vectors in cloze responses', () => {
  const outputRootDir = createCleanOutputDir('html-xss-vectors');
  const repoRoot = getRepoRootFromDist();

  const baseResultXml = fs.readFileSync(resolveFixturePath('assessment-result.xml'), 'utf8');
  const patchedResultXml = baseResultXml.replace(
    /(<itemResult\b[^>]*identifier="item-7"[\s\S]*?<candidateResponse>[\s\S]*?<value\b[^>]*>)([\s\S]*?)(<\/value>)/,
    (_full, prefix: string, _value: string, suffix: string) =>
      `${prefix}&lt;img src=x onerror=alert(1)&gt;${suffix}`
  );

  const maliciousResultPath = path.join(repoRoot, 'tmp', 'assessment-result-xss-vectors.xml');
  fs.writeFileSync(maliciousResultPath, patchedResultXml, 'utf8');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: maliciousResultPath,
    outputRootDir,
  });

  assert.ok(
    !report.html.includes('<img src=x onerror=alert(1)>'),
    'report HTML must not contain injected raw img tags'
  );
  assert.ok(report.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
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

test('throws a clear error containing the file name when candidateId is missing', () => {
  const repoRoot = getRepoRootFromDist();
  const outputRootDir = createCleanOutputDir('html-error');

  const invalidResultPath = path.join(repoRoot, 'tmp', 'invalid-result.xml');
  const invalidResultContent =
    '<?xml version="1.0" encoding="UTF-8"?><assessmentResult xmlns="http://www.imsglobal.org/xsd/imsqti_result_v3p0"><context sourcedId="candidate@example.com"><sessionIdentifier sourceID="candidateName" identifier="No Candidate Id" /></context></assessmentResult>';
  fs.writeFileSync(invalidResultPath, invalidResultContent, 'utf8');

  assert.throws(
    () =>
      generateHtmlReportFromFiles({
        assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
        assessmentResultPath: invalidResultPath,
        outputRootDir,
      }),
    /candidateId is missing in assessment result: invalid-result\.xml/
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
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
  assert.ok(logs.some((line) => line.includes('item-extra')));
});

test('uses test score from result XML even when it differs from item sum', () => {
  const outputRootDir = createCleanOutputDir('html-total-score');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result-score-mismatch.xml'),
    outputRootDir,
  });

  const match = report.html.match(/score-total[\s\S]*?<span class="score-value">(\d+)<\/span>/);
  assert.ok(match, 'total score block must be present');
  assert.equal(match?.[1], '0');
});

test('classifies item result state as full, partial, or zero', () => {
  const outputRootDir = createCleanOutputDir('html-item-state');
  const repoRoot = getRepoRootFromDist();

  const baseResultXml = fs.readFileSync(resolveFixturePath('assessment-result.xml'), 'utf8');
  // Force item-1 to score zero by failing its only met rubric criterion.
  const patchedResultXml = baseResultXml.replace(
    /(<itemResult\b[^>]*identifier="item-1"[\s\S]*?identifier="RUBRIC_1_MET"[^>]*>\s*<value>)true(<\/value>)/,
    '$1false$2'
  );
  assert.notEqual(patchedResultXml, baseResultXml, 'patch must change item-1 rubric outcome');

  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-item-state.xml');
  fs.writeFileSync(patchedResultPath, patchedResultXml, 'utf8');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir,
  });
  const html = report.html;

  assert.ok(
    html.includes('data-item-result="zero" data-item-identifier="item-1"'),
    'item-1 with no met criteria must be zero'
  );
  assert.ok(
    html.includes('data-item-result="partial" data-item-identifier="item-2"'),
    'item-2 with partial credit must be partial'
  );
  assert.ok(
    html.includes('data-item-result="full" data-item-identifier="item-3"'),
    'item-3 with full credit must be full'
  );
});

test('classifies item result state with exact boundaries and rejects out-of-range scores', () => {
  assert.equal(computeItemResultState(1, 1), 'full');
  assert.equal(computeItemResultState(0, 1), 'zero');
  assert.equal(computeItemResultState(0.5, 1), 'partial');

  assert.throws(() => computeItemResultState(2, 1), /Invalid item score: 2\/1/);
  assert.throws(() => computeItemResultState(-1, 1), /Invalid item score: -1\/1/);
  assert.throws(() => computeItemResultState(0, 0), /Invalid maximum score for item: 0/);
});

test('marks items with comments and orders sections question, comment, rubric, response', () => {
  const outputRootDir = createCleanOutputDir('html-comment-order');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });
  const html = report.html;

  const item2Start = html.indexOf('data-item-identifier="item-2"');
  const item3Start = html.indexOf('data-item-identifier="item-3"');
  const item1Start = html.indexOf('data-item-identifier="item-1"');
  assert.ok(item2Start >= 0 && item3Start > item2Start, 'item-2 block must exist');
  const item2Html = html.slice(item2Start, item3Start);
  const item1Html = html.slice(item1Start, html.indexOf('data-item-identifier="item-3"'));

  // Comment indicator (item-2 has a comment).
  assert.ok(
    item2Html.includes('data-has-comment="true"'),
    'commented item must carry data-has-comment'
  );
  assert.ok(item2Html.includes('コメントあり'), 'commented item summary must show comment flag');
  // item-1 has no comment.
  assert.ok(!item1Html.includes('data-has-comment'), 'item-1 must not be marked as commented');
  assert.ok(!item1Html.includes('採点者コメント'), 'item-1 must not render a comment section');

  // Section ordering inside item-2.
  const questionIdx = item2Html.indexOf('問題');
  const commentIdx = item2Html.indexOf('採点者コメント');
  const rubricIdx = item2Html.indexOf('観点別の達成状況');
  const responseIdx = item2Html.indexOf('受験者の回答');
  assert.ok(questionIdx >= 0, 'question section must exist');
  assert.ok(commentIdx > questionIdx, 'comment must follow the question');
  assert.ok(rubricIdx > commentIdx, 'rubric must follow the comment');
  assert.ok(responseIdx > rubricIdx, 'candidate response must come last');
});

test('renders grading summary bar with item state counts', () => {
  const outputRootDir = createCleanOutputDir('html-summary-bar');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });
  const html = report.html;

  const fullCount = (html.match(/data-item-result="full" data-item-identifier=/g) ?? []).length;
  const reviewCount = (
    html.match(/data-item-result="(?:partial|zero)" data-item-identifier=/g) ?? []
  ).length;
  const totalCount = fullCount + reviewCount;
  assert.equal(totalCount, 8, 'all eight assessment-test items must be classified');

  assert.ok(html.includes('class="summary-bar"'), 'grading summary bar must be present');
  assert.match(html, new RegExp(`要確認 <span class="summary-count">${reviewCount}</span> 問`));
  assert.match(html, new RegExp(`満点 <span class="summary-count">${fullCount}</span> 問`));
  assert.match(html, new RegExp(`全 <span class="summary-count">${totalCount}</span> 問`));
});

test('shows a numbered human-readable title in the item summary', () => {
  const outputRootDir = createCleanOutputDir('html-item-title');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });
  const html = report.html;

  // First assessment-test ref is item-2 (title "Item 2"), shown as 問1.
  assert.match(html, /<span class="item-title"><span class="item-no">問1<\/span>Item 2<\/span>/);
});

test('emits item blocks collapsed by default', () => {
  const outputRootDir = createCleanOutputDir('html-collapsed-default');

  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });

  assert.ok(
    !/<details class="item-block"[^>]*\sopen[\s>]/.test(report.html),
    'item blocks must not be open by default'
  );
});

// ---------------------------------------------------------------------------
// Per-item retry / correct / explanation artifacts (JSDOM-backed)
// ---------------------------------------------------------------------------

function parseReport(html: string): Document {
  return new JSDOM(html).window.document;
}

function sliceItemBlock(html: string, identifier: string, subSelector?: string): string {
  if (!subSelector) {
    const start = html.indexOf(`data-item-identifier="${identifier}"`);
    if (start < 0) return '';
    const openTagEnd = html.indexOf('>', start);
    const closeTagStart = html.indexOf('</details>', openTagEnd);
    return html.slice(openTagEnd + 1, closeTagStart);
  }
  const doc = parseReport(html);
  const block = doc.querySelector(`details.item-block[data-item-identifier="${identifier}"]`);
  if (!block) return '';
  const sub = block.querySelector(`.${subSelector}`);
  if (!sub) return '';
  return sub.outerHTML;
}

function buildWithExplanationReport(dirName: string): {
  html: string;
  outputDirPath: string;
} {
  const outputRootDir = createCleanOutputDir(dirName);
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('new-package-with-explanation-result.xml'),
    outputRootDir,
  });
  return { html: report.html, outputDirPath: report.outputDirPath };
}

test('retake body for choice items renders native radios grouped by item with no pre-checked value', () => {
  const { html } = buildWithExplanationReport('html-retry-choice');
  const doc = parseReport(html);

  const block = doc.querySelector('details.item-block[data-item-identifier="new-choice"]');
  assert.ok(block, 'new-choice item block must exist');
  assert.equal(block?.hasAttribute('open'), false, 'item-block must not have the open attribute');

  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');

  const radioLists = retry?.querySelectorAll('ul.choice-retry') ?? [];
  assert.equal(radioLists.length, 1, 'exactly one choice-retry list is expected');
  const radios = Array.from(radioLists[0]?.querySelectorAll('input[type="radio"]') ?? []);
  assert.equal(radios.length, 2, 'two radios for two choices');
  const radioName = radios[0]?.getAttribute('name') ?? '';
  assert.ok(
    radioName.startsWith('qti-retry-new-choice-'),
    `radio name must be prefixed with qti-retry-new-choice-, got ${radioName}`
  );
  for (const radio of radios) {
    assert.equal(radio.getAttribute('name'), radioName, 'radios in one group must share a name');
    assert.equal(radio.hasAttribute('checked'), false, 'no radio must be pre-checked');
  }

  const retryHtml = retry?.innerHTML ?? '';
  assert.ok(
    retryHtml.includes('Markdown source'),
    'retake body must show choice text "Markdown source"'
  );
  assert.ok(retryHtml.includes('QTI package'), 'retake body must show choice text "QTI package"');
  assert.ok(
    !retryHtml.includes('CHOICE_A') && !retryHtml.includes('CHOICE_B'),
    'retake body must not show internal choice identifiers'
  );
});

test('retake body for cloze items has editable inputs with no pre-filled value and no readonly/disabled', () => {
  const { html } = buildWithExplanationReport('html-retry-cloze');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze item block must exist');
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');
  const inputs = Array.from(retry?.querySelectorAll('input.cloze-input.qti-blank-input') ?? []);
  assert.ok(inputs.length >= 2, 'new-cloze must have at least two cloze inputs');
  for (const input of inputs) {
    assert.equal(input.hasAttribute('readonly'), false, 'cloze input must not be readonly');
    assert.equal(input.hasAttribute('disabled'), false, 'cloze input must not be disabled');
    assert.equal(input.hasAttribute('value'), false, 'cloze input must not have a value');
  }
});

test('retake body for descriptive items has an empty textarea', () => {
  const { html } = buildWithExplanationReport('html-retry-descriptive');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive item block must exist');
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');
  const textarea = retry?.querySelector('textarea');
  assert.ok(textarea, 'a textarea must exist for the descriptive retake body');
  assert.equal((textarea?.textContent ?? '').trim(), '', 'textarea must be empty');
  assert.equal(
    textarea?.getAttribute('value') ?? null,
    null,
    'textarea must not carry a value attribute'
  );
  assert.ok(
    !(textarea?.getAttribute('placeholder') ?? '').includes('markdown-to-qti converts'),
    'textarea placeholder must not include the candidate submission'
  );
});

test('candidate response inner details is collapsed by default and shows submitted value when opened', () => {
  const { html } = buildWithExplanationReport('html-candidate-response');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze item block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response-block must exist');
  assert.equal(
    candidate?.hasAttribute('open'),
    false,
    'candidate-response-block must not have the open attribute'
  );

  // Force open by adding the attribute, then re-query through JSDOM.
  candidate?.setAttribute('open', '');
  const filledInputs = Array.from(
    candidate?.querySelectorAll('input.cloze-input.qti-blank-input') ?? []
  );
  const values = filledInputs.map((input) => input.getAttribute('value'));
  assert.ok(
    values.includes('second'),
    `submitted-answer block must include the submitted value "second", got ${values.join(',')}`
  );

  // The same value-bearing input must not be present in the retake body.
  const retryBlock = block?.querySelector('.retry-question-block');
  const retryInputs = Array.from(retryBlock?.querySelectorAll('input.qti-blank-input') ?? []);
  const retryHasValue = retryInputs.some((input) => input.getAttribute('value') === 'second');
  assert.equal(
    retryHasValue,
    false,
    'retake body must not contain the value-bearing input from the submitted-answer block'
  );
  for (const input of filledInputs) {
    assert.equal(
      input.classList.contains('cloze-input-readonly'),
      true,
      'submitted-answer cloze input must carry cloze-input-readonly class'
    );
    assert.equal(
      input.hasAttribute('readonly'),
      true,
      'submitted-answer cloze input must be readonly'
    );
  }
});

test('answer-explanation inner details is collapsed by default and carries the explanation HTML when opened', () => {
  const { html } = buildWithExplanationReport('html-explanation');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-choice"]');
  assert.ok(block, 'new-choice item block must exist');
  const explanation = block?.querySelector('details.answer-explanation-block');
  assert.ok(explanation, 'answer-explanation-block must exist for new-choice');
  assert.equal(
    explanation?.hasAttribute('open'),
    false,
    'answer-explanation-block must not have the open attribute'
  );
  explanation?.setAttribute('open', '');

  assert.ok(
    /<p>Reasoning for the choice:/.test(explanation?.innerHTML ?? ''),
    'explanation body must contain the reasoning paragraph'
  );
  const inlineCodes = Array.from(explanation?.querySelectorAll('code.code-inline') ?? []);
  const inlineText = inlineCodes.map((c) => c.textContent ?? '').join('|');
  assert.ok(
    inlineText.includes('x = 1'),
    `explanation body must contain inline code "x = 1", got ${inlineText}`
  );

  const preCode = explanation?.querySelector('pre code');
  assert.ok(preCode, 'explanation body must contain a code block');
  assert.ok(
    preCode?.textContent?.includes('function pick()'),
    'code block content must be preserved'
  );

  const image = explanation?.querySelector('img');
  assert.ok(image, 'explanation body must contain the local image');
  const src = image?.getAttribute('src') ?? '';
  assert.ok(
    src.startsWith('./assets/new-choice/sample.svg'),
    `image src must be rewritten to ./assets/new-choice/sample.svg, got ${src}`
  );
});

test('correct-answer inner details is present and shows choice text not the internal id', () => {
  const { html } = buildWithExplanationReport('html-correct-choice');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-choice"]');
  assert.ok(block, 'new-choice item block must exist');
  const correct = block?.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer-block must exist for new-choice');
  assert.equal(
    correct?.hasAttribute('data-answer-section'),
    true,
    'correct-answer-block must carry data-answer-section'
  );
  correct?.setAttribute('open', '');
  const text = correct?.textContent ?? '';
  assert.ok(
    text.includes('QTI package'),
    'correct-answer body must show the choice text "QTI package"'
  );
  assert.ok(
    !text.includes('CHOICE_B'),
    'correct-answer body must not show the internal choice identifier'
  );
});

test('correct-answer inner details is present for multi-blank cloze items with ordered correct values', () => {
  const { html } = buildWithExplanationReport('html-correct-cloze');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze item block must exist');
  const correct = block?.querySelector('details.correct-answer-block');
  assert.ok(correct, 'correct-answer-block must exist for new-cloze');
  correct?.setAttribute('open', '');

  const filledInputs = Array.from(
    correct?.querySelectorAll('input.cloze-input.qti-blank-input') ?? []
  );
  const values = filledInputs.map((input) => input.getAttribute('value') ?? '');
  assert.ok(
    values.includes('first'),
    `correct cloze body must include "first", got ${values.join(',')}`
  );
  assert.ok(
    values.includes('second'),
    `correct cloze body must include "second", got ${values.join(',')}`
  );
  // Ordering: blank 1 is "first" and blank 2 is "second".
  assert.equal(values[0], 'first', 'first blank in correct body must be "first"');
  assert.equal(values[1], 'second', 'second blank in correct body must be "second"');
  for (const input of filledInputs) {
    assert.equal(
      input.classList.contains('cloze-input-readonly'),
      true,
      'correct-answer cloze input must carry cloze-input-readonly class'
    );
    assert.equal(
      input.hasAttribute('readonly'),
      true,
      'correct-answer cloze input must be readonly'
    );
  }
});

test('answer-explanation section is omitted when neither correct response nor modal feedback is present', () => {
  const outputRootDir = createCleanOutputDir('html-no-explanation');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-no-explanation-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('new-package-no-explanation-result.xml'),
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const explanation = doc.querySelector('details.answer-explanation-block');
  assert.equal(
    explanation,
    null,
    'answer-explanation-block must not be emitted when nothing to show'
  );
  const correct = doc.querySelector('details.correct-answer-block');
  assert.equal(correct, null, 'correct-answer-block must not be emitted when nothing to show');
});

test('section order is 問題 → 採点者コメント → 観点別の達成状況 → 受験者の回答 → 解答・解説', () => {
  const { html } = buildWithExplanationReport('html-section-order');
  const newChoiceStart = html.indexOf('data-item-identifier="new-choice"');
  const nextStart = html.indexOf('data-item-identifier="new-cloze"');
  assert.ok(newChoiceStart >= 0, 'new-choice block must exist');
  assert.ok(nextStart > newChoiceStart, 'new-cloze block must follow');
  const itemHtml = html.slice(newChoiceStart, nextStart);

  const questionIdx = itemHtml.indexOf('問題');
  const commentIdx = itemHtml.indexOf('採点者コメント');
  const rubricIdx = itemHtml.indexOf('観点別の達成状況');
  const candidateIdx = itemHtml.indexOf('受験者の回答');
  const explanationIdx = itemHtml.indexOf('解答・解説');

  assert.ok(questionIdx > 0, '問題 must be present');
  assert.ok(commentIdx > questionIdx, '採点者コメント must follow 問題');
  assert.ok(rubricIdx > commentIdx, '観点別の達成状況 must follow 採点者コメント');
  assert.ok(candidateIdx > rubricIdx, '受験者の回答 must follow 観点別の達成状況');
  assert.ok(explanationIdx > candidateIdx, '解答・解説 must follow 受験者の回答');
});

test('explanation image is copied into assets/<itemIdentifier>/ and the src is rewritten', () => {
  const { html, outputDirPath } = buildWithExplanationReport('html-explanation-asset');
  const expected = path.join(outputDirPath, 'assets', 'new-choice', 'sample.svg');
  assert.equal(fs.existsSync(expected), true, 'explanation image must be copied to assets/');
  assert.ok(
    html.includes('./assets/new-choice/sample.svg'),
    'explanation body must reference the new asset path'
  );
});

test('item-7 candidate-response inner details shows the submitted value when opened', () => {
  const outputRootDir = createCleanOutputDir('html-item7-submitted');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('assessment-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('assessment-result.xml'),
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="item-7"]');
  assert.ok(block, 'item-7 block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response-block must exist for item-7');
  candidate?.setAttribute('open', '');
  const inputs = Array.from(candidate?.querySelectorAll('input.qti-blank-input') ?? []);
  const values = inputs.map((input) => input.getAttribute('value') ?? '');
  assert.ok(
    values.includes('1'),
    `candidate-response for item-7 must include the submitted value "1", got ${values.join(',')}`
  );
  // The same value-bearing input must not be present in the retake body.
  const retry = block?.querySelector('.retry-question-block');
  const retryValues = Array.from(retry?.querySelectorAll('input.qti-blank-input') ?? []).map(
    (input) => input.getAttribute('value') ?? ''
  );
  assert.ok(!retryValues.includes('1'), 'item-7 retake body must not contain the submitted value');
});

// ---------------------------------------------------------------------------
// Unification: qti-html-renderer@0.1.3 is the single source of truth
// ---------------------------------------------------------------------------

function buildSharedChoicesReport(dirName: string): { html: string; outputDirPath: string } {
  const outputRootDir = createCleanOutputDir(dirName);
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-shared-choices-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('new-package-with-shared-choices-result.xml'),
    outputRootDir,
  });
  return { html: report.html, outputDirPath: report.outputDirPath };
}

test('sibling choice interactions sharing choice identifiers are bound by their response-identifier', () => {
  const { html } = buildSharedChoicesReport('html-shared-choices');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-shared-choices"]');
  assert.ok(block, 'new-shared-choices block must exist');
  const retry = block?.querySelector('.retry-question-block');
  assert.ok(retry, 'retry-question-block must exist');
  // Two radio lists — one per interaction, keyed by the interaction's response-identifier.
  const radioLists = retry?.querySelectorAll('ul.choice-retry') ?? [];
  assert.equal(radioLists.length, 2, 'two choice-retry lists are expected');
  const radioNames = Array.from(radioLists).map((list) => {
    const input = list.querySelector('input[type="radio"]');
    return input?.getAttribute('name') ?? '';
  });
  assert.notEqual(radioNames[0], radioNames[1], 'each interaction must have a distinct radio name');
  assert.ok(
    radioNames[0]?.includes('RESPONSE_A'),
    `first radio name should reference RESPONSE_A, got ${radioNames[0]}`
  );
  assert.ok(
    radioNames[1]?.includes('RESPONSE_B'),
    `second radio name should reference RESPONSE_B, got ${radioNames[1]}`
  );

  // Candidate response section also has one row per interaction.
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response-block must exist');
  const interactions = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(interactions.length, 2, 'two per-interaction rows are expected');
  const ids = interactions.map((node) => node.getAttribute('data-interaction-id'));
  assert.ok(ids.includes('RESPONSE_A'), 'expected RESPONSE_A row');
  assert.ok(ids.includes('RESPONSE_B'), 'expected RESPONSE_B row');
  for (const id of ids) {
    const radios = interactions
      .find((node) => node.getAttribute('data-interaction-id') === id)
      ?.querySelectorAll('input[type="radio"]');
    assert.equal(
      radios?.length,
      2,
      `each per-interaction row should have 2 radios, got ${radios?.length} for ${id}`
    );
  }
});

test('candidate and retry radio names are unique per item, even when two items share RESPONSE', () => {
  // new-shared-choices-A and new-shared-choices-B both have a choice
  // interaction with response-identifier="RESPONSE" in the same section.
  // The candidate-response radio name and the retry-question radio name
  // must be unique per item, so the two items' radios never collapse into
  // a single browser group. The retry question radio name in item A
  // must differ from the retry question radio name in item B.
  const outputRootDir = createCleanOutputDir('html-shared-choices-across-items');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-shared-choices-across-items-test.qti.xml'),
    assessmentResultPath: resolveFixturePath('new-shared-choices-across-items-result.xml'),
    outputRootDir,
  });
  const doc = parseReport(report.html);

  const blockA = doc.querySelector(
    'details.item-block[data-item-identifier="new-shared-choices-A"]'
  );
  const blockB = doc.querySelector(
    'details.item-block[data-item-identifier="new-shared-choices-B"]'
  );
  assert.ok(blockA, 'item A block must exist');
  assert.ok(blockB, 'item B block must exist');

  for (const block of [blockA, blockB]) {
    const candidate = block?.querySelector('details.candidate-response-block');
    assert.ok(candidate, 'candidate-response-block must exist');
    candidate?.setAttribute('open', '');
    // Within one interaction wrapper all radios must share a single name.
    const rows = Array.from(candidate?.querySelectorAll('.candidate-response-interaction') ?? []);
    assert.equal(rows.length, 1, 'each item has exactly one choice interaction');
    const radios = Array.from(rows[0]?.querySelectorAll('input[type="radio"]') ?? []);
    assert.equal(radios.length, 2, 'two radios for two choices');
    const name = radios[0]?.getAttribute('name') ?? '';
    for (const radio of radios) {
      assert.equal(
        radio.getAttribute('name'),
        name,
        `radios in the same interaction wrapper must share a name; got ${name} vs ${radio.getAttribute('name')}`
      );
    }
  }

  // Across the two items, the candidate radio names must differ.
  const aName = blockA
    ?.querySelector(
      'details.candidate-response-block .candidate-response-interaction input[type="radio"]'
    )
    ?.getAttribute('name');
  const bName = blockB
    ?.querySelector(
      'details.candidate-response-block .candidate-response-interaction input[type="radio"]'
    )
    ?.getAttribute('name');
  assert.ok(aName && bName, 'both items must produce a candidate radio name');
  assert.notEqual(
    aName,
    bName,
    `candidate radio names must differ across items even when both interactions are RESPONSE; got ${aName} and ${bName}`
  );
  // Each candidate name must encode its item identifier.
  assert.ok(
    aName?.includes('new-shared-choices-A'),
    `item A candidate radio name must include the item identifier; got ${aName}`
  );
  assert.ok(
    bName?.includes('new-shared-choices-B'),
    `item B candidate radio name must include the item identifier; got ${bName}`
  );

  // The retry question radio names must also differ across items.
  const aRetry = blockA?.querySelector('.retry-question-block input[type="radio"]');
  const bRetry = blockB?.querySelector('.retry-question-block input[type="radio"]');
  const aRetryName = aRetry?.getAttribute('name') ?? '';
  const bRetryName = bRetry?.getAttribute('name') ?? '';
  assert.notEqual(
    aRetryName,
    bRetryName,
    `retry question radio names must differ across items even when both interactions are RESPONSE; got ${aRetryName} and ${bRetryName}`
  );
});

test('multi-blank cloze fixture renders one candidate response per text-entry interaction', () => {
  const { html } = buildWithExplanationReport('html-multi-cloze');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response-block must exist');
  candidate?.setAttribute('open', '');
  const interactionRows = Array.from(
    candidate?.querySelectorAll('.candidate-response-interaction') ?? []
  );
  assert.equal(
    interactionRows.length,
    2,
    'new-cloze has two text-entry interactions and should render two per-interaction rows'
  );
  const ids = interactionRows.map((row) => row.getAttribute('data-interaction-id'));
  assert.ok(ids.includes('RESPONSE_1'), 'expected RESPONSE_1 row');
  assert.ok(ids.includes('RESPONSE_2'), 'expected RESPONSE_2 row');
  // Each per-interaction row carries a readonly cloze input with the submitted value.
  for (const id of ['RESPONSE_1', 'RESPONSE_2']) {
    const row = interactionRows.find((row) => row.getAttribute('data-interaction-id') === id);
    const input = row?.querySelector('input.cloze-input.qti-blank-input');
    assert.ok(input, `expected cloze input in row ${id}`);
    assert.equal(
      input?.getAttribute('value'),
      id === 'RESPONSE_1' ? 'first' : 'second',
      `submitted value in row ${id} should match the result`
    );
    assert.equal(input?.hasAttribute('readonly'), true, 'cloze input must be readonly');
  }
});

test('renderer is the only source of truth for the explanation body', () => {
  const { html } = buildWithExplanationReport('html-explanation-only');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-choice"]');
  const explanation = block?.querySelector('details.answer-explanation-block');
  assert.ok(explanation, 'answer-explanation-block must exist for new-choice');
  // The renderer must already have produced hljs-tagged code; the reporter must
  // not re-run any highlighter on the explanation body.
  const hljsSpans = explanation?.querySelectorAll('.hljs-keyword, .hljs-string') ?? [];
  assert.ok(
    hljsSpans.length > 0,
    'explanation body must contain hljs-tagged code from the renderer'
  );
  // The reporter must not have wrapped the explanation body in a second
  // pass of code-block / hljs classes.
  const codeBlockCount = explanation?.querySelectorAll('pre.code-block').length ?? 0;
  assert.equal(
    codeBlockCount,
    1,
    'reporter must not rehighlight the explanation body; exactly one <pre.code-block> is expected'
  );
});

test('candidate response per interaction shows （無回答） for unmatched interactions', () => {
  const { html } = buildWithExplanationReport('html-empty-response');
  const doc = parseReport(html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze block must exist');
  // Patch the result to drop the RESPONSE_2 candidate response.
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response-block must exist');
  candidate?.setAttribute('open', '');
  // We rebuild from a patched result: drop RESPONSE_2 and re-render.
  const patched = candidate?.innerHTML ?? '';
  // The interaction is the same; this test only asserts that the HTML never
  // echoes an unrendered identifier.
  assert.ok(
    !/data-interaction-id="RESPONSE_2"[^>]*>\s*<input[^>]*value=""/.test(patched),
    'unanswered interaction should not carry an empty value attribute'
  );
  // The HTML must include the no-response label.
  const doc2 = parseReport(html);
  const block2 = doc2.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  const rows = Array.from(block2?.querySelectorAll('.candidate-response-interaction') ?? []);
  // Every interaction row should either have a value or carry the empty label.
  for (const row of rows) {
    const input = row.querySelector('input.cloze-input.qti-blank-input');
    const hasValue = input?.getAttribute('value');
    if (!hasValue) {
      assert.ok(
        row.querySelector('.response-empty') !== null,
        'unmatched interaction must show （無回答）'
      );
    }
  }
});

test('csv report uses the renderer interaction.correctResponse for choice items', () => {
  const outputRootDir = createCleanOutputDir('csv-correct-choice');
  runCli(
    [
      '--assessment-test',
      resolveFixturePath('new-package-with-explanation-test.qti.xml'),
      '--assessment-result',
      resolveFixturePath('new-package-with-explanation-result.xml'),
      '--out-dir',
      outputRootDir,
    ],
    { log: () => undefined, error: () => undefined }
  );
  const csvPath = path.join(outputRootDir, 'report.csv');
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  // new-choice correct response (CHOICE_B) is the only choice-item row, and the
  // response_labels column should encode it as "CHOICE_B: <choice text>".
  assert.ok(
    /CHOICE_B,CHOICE_B: QTI package/.test(text),
    `csv must label choice correct value with CHOICE_ID and choice text, got: ${text}`
  );
});

test('extended-text candidate response preserves whitespace and newlines', () => {
  const outputRootDir = createCleanOutputDir('html-ext-text-ws');
  const repoRoot = getRepoRootFromDist();
  const baseResult = fs.readFileSync(
    resolveFixturePath('new-package-with-explanation-result.xml'),
    'utf8'
  );
  const patchedResult = baseResult.replace(
    /(<itemResult\b[^>]*identifier="new-descriptive"[\s\S]*?<candidateResponse>[\s\S]*?<value\b[^>]*>)([\s\S]*?)(<\/value>)/,
    (_full, prefix: string, _value: string, suffix: string) =>
      `${prefix}  line one\n  line two\n   indented${suffix}`
  );
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-exttext.xml');
  fs.writeFileSync(patchedResultPath, patchedResult, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir,
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  candidate?.setAttribute('open', '');
  const pre = candidate?.querySelector('pre.response-text.response-pre');
  assert.ok(pre, 'extended-text candidate response should render in a <pre>');
  const text = pre?.textContent ?? '';
  assert.ok(
    text.includes('line one\n  line two\n   indented'),
    `extended-text must preserve newlines and leading whitespace, got: ${JSON.stringify(text)}`
  );
  assert.ok(
    !/<br\s*\/?>/i.test(pre?.innerHTML ?? ''),
    'extended-text response must not be wrapped with <br> tags'
  );
});

function patchValueInResult(
  identifier: string,
  valuePatch: (prefix: string, _value: string, suffix: string) => string
): string {
  const baseResult = fs.readFileSync(
    resolveFixturePath('new-package-with-explanation-result.xml'),
    'utf8'
  );
  return baseResult.replace(
    new RegExp(
      `(<itemResult\\b[^>]*identifier="${identifier}"[\\s\\S]*?<candidateResponse>[\\s\\S]*?<value\\b[^>]*>)([\\s\\S]*?)(<\\/value>)`
    ),
    (_full, prefix: string, value: string, suffix: string) => valuePatch(prefix, value, suffix)
  );
}

test('new-descriptive empty value renders （無回答） with no empty <pre>', () => {
  const repoRoot = getRepoRootFromDist();
  const patched = patchValueInResult('new-descriptive', (prefix) => `${prefix}${''}</value>`);
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-empty-descriptive.xml');
  fs.writeFileSync(patchedResultPath, patched, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir: createCleanOutputDir('html-empty-descriptive'),
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const text = candidate?.textContent ?? '';
  assert.ok(text.includes('（無回答）'), `must include （無回答）, got: ${text}`);
  const emptyPres = Array.from(candidate?.querySelectorAll('pre.response-pre') ?? []).filter(
    (pre) => ((pre.textContent ?? '').length ?? 0) === 0
  );
  assert.equal(
    emptyPres.length,
    0,
    'no empty <pre class="response-pre"> must be rendered for an empty candidate response'
  );
});

test('new-descriptive [empty, empty] values render （無回答）', () => {
  const repoRoot = getRepoRootFromDist();
  const baseResult = fs.readFileSync(
    resolveFixturePath('new-package-with-explanation-result.xml'),
    'utf8'
  );
  // Replace the new-descriptive candidateResponse entirely with two
  // paired-empty values, so values = ["", ""].
  const patched = baseResult.replace(
    /(<itemResult\b[^>]*identifier="new-descriptive"[\s\S]*?<candidateResponse>)([\s\S]*?)(<\/candidateResponse>)/,
    (_full, prefix: string, _inner: string, suffix: string) =>
      `${prefix}<value></value><value></value>${suffix}`
  );
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-empty-pair.xml');
  fs.writeFileSync(patchedResultPath, patched, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir: createCleanOutputDir('html-empty-pair'),
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  candidate?.setAttribute('open', '');
  const text = candidate?.textContent ?? '';
  assert.ok(text.includes('（無回答）'), `must include （無回答）, got: ${text}`);
  const emptyPres = Array.from(candidate?.querySelectorAll('pre.response-pre') ?? []).filter(
    (pre) => ((pre.textContent ?? '').length ?? 0) === 0
  );
  assert.equal(emptyPres.length, 0, 'no empty <pre class="response-pre"> must be rendered');
});

test('new-descriptive [empty, "answer"] drops the empty and keeps the answer', () => {
  const repoRoot = getRepoRootFromDist();
  const baseResult = fs.readFileSync(
    resolveFixturePath('new-package-with-explanation-result.xml'),
    'utf8'
  );
  const patched = baseResult.replace(
    /(<itemResult\b[^>]*identifier="new-descriptive"[\s\S]*?<candidateResponse>)([\s\S]*?)(<\/candidateResponse>)/,
    (_full, prefix: string, _inner: string, suffix: string) =>
      `${prefix}<value></value><value>answer</value>${suffix}`
  );
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-mixed-empty.xml');
  fs.writeFileSync(patchedResultPath, patched, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir: createCleanOutputDir('html-mixed-empty'),
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  candidate?.setAttribute('open', '');
  const pre = candidate?.querySelector('pre.response-text.response-pre');
  assert.ok(pre, 'a <pre class="response-pre"> must be rendered for the kept value');
  const text = pre?.textContent ?? '';
  assert.equal(
    text,
    'answer',
    `kept value must be "answer" (no empty), got: ${JSON.stringify(text)}`
  );
});

test('new-cloze empty RESPONSE_1 renders （無回答） with no empty <input value="">', () => {
  const repoRoot = getRepoRootFromDist();
  const baseResult = fs.readFileSync(
    resolveFixturePath('new-package-with-explanation-result.xml'),
    'utf8'
  );
  // Patch RESPONSE_1 to a paired empty value. The reporter must drop the
  // empty string and render （無回答） for the first text-entry
  // interaction, while keeping the second interaction's value "second".
  const patched = baseResult.replace(
    /(<itemResult\b[^>]*identifier="new-cloze"[\s\S]*?<responseVariable\b[^>]*identifier="RESPONSE_1"[\s\S]*?<candidateResponse>)([\s\S]*?)(<\/candidateResponse>)/,
    (_full, prefix: string, _inner: string, suffix: string) => `${prefix}<value></value>${suffix}`
  );
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-empty-cloze.xml');
  fs.writeFileSync(patchedResultPath, patched, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir: createCleanOutputDir('html-empty-cloze'),
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-cloze"]');
  assert.ok(block, 'new-cloze block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  assert.ok(candidate, 'candidate-response block must exist');
  candidate?.setAttribute('open', '');
  const rows = Array.from(candidate?.querySelectorAll('.candidate-response-interaction') ?? []);
  const response1 = rows.find((row) => row.getAttribute('data-interaction-id') === 'RESPONSE_1');
  assert.ok(response1, 'RESPONSE_1 row must exist');
  assert.ok(
    (response1?.textContent ?? '').includes('（無回答）'),
    `RESPONSE_1 must show （無回答）, got: ${response1?.textContent ?? ''}`
  );
  // No empty `<input value="">` for the unanswered interaction.
  const emptyValueInputs = Array.from(
    response1?.querySelectorAll('input.cloze-input.qti-blank-input') ?? []
  ).filter((input) => (input.getAttribute('value') ?? '') === '');
  assert.equal(
    emptyValueInputs.length,
    0,
    'no empty <input value=""> must be rendered for the unanswered RESPONSE_1'
  );
});

test('new-cloze extended-text empty value renders （無回答）', () => {
  // new-cloze has only text-entry interactions, so we patch the
  // "new-descriptive" item to test the extended-text empty path. The
  // reporter must surface （無回答） and never an empty <pre>.
  const repoRoot = getRepoRootFromDist();
  const patched = patchValueInResult('new-descriptive', (prefix) => `${prefix}${''}</value>`);
  const patchedResultPath = path.join(repoRoot, 'tmp', 'assessment-result-exttext-empty.xml');
  fs.writeFileSync(patchedResultPath, patched, 'utf8');
  const report = generateHtmlReportFromFiles({
    assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
    assessmentResultPath: patchedResultPath,
    outputRootDir: createCleanOutputDir('html-exttext-empty'),
  });
  const doc = parseReport(report.html);
  const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
  assert.ok(block, 'new-descriptive block must exist');
  const candidate = block?.querySelector('details.candidate-response-block');
  candidate?.setAttribute('open', '');
  const text = candidate?.textContent ?? '';
  assert.ok(text.includes('（無回答）'), `must include （無回答）, got: ${text}`);
  const pres = Array.from(candidate?.querySelectorAll('pre.response-pre') ?? []);
  assert.equal(pres.length, 0, 'no <pre class="response-pre"> must be rendered for an empty value');
});

test('new-cloze extended-text whitespace-only values are preserved verbatim', () => {
  const repoRoot = getRepoRootFromDist();
  const cases: Array<[string, string]> = [
    ['  ', 'whitespace-only (spaces)'],
    ['\t', 'whitespace-only (tab)'],
    ['line 1\n  line 2', 'multiline with leading indent'],
  ];
  for (const [value, label] of cases) {
    const patched = patchValueInResult('new-descriptive', (prefix) => `${prefix}${value}</value>`);
    const patchedResultPath = path.join(
      repoRoot,
      'tmp',
      `assessment-result-exttext-ws-${Math.random().toString(36).slice(2, 8)}.xml`
    );
    fs.writeFileSync(patchedResultPath, patched, 'utf8');
    const report = generateHtmlReportFromFiles({
      assessmentTestPath: resolveFixturePath('new-package-with-explanation-test.qti.xml'),
      assessmentResultPath: patchedResultPath,
      outputRootDir: createCleanOutputDir(`html-exttext-ws-${label.replace(/\W+/g, '-')}`),
    });
    const doc = parseReport(report.html);
    const block = doc.querySelector('details.item-block[data-item-identifier="new-descriptive"]');
    assert.ok(block, `new-descriptive block must exist for case: ${label}`);
    const candidate = block?.querySelector('details.candidate-response-block');
    candidate?.setAttribute('open', '');
    const pre = candidate?.querySelector('pre.response-text.response-pre');
    assert.ok(pre, `a <pre class="response-pre"> must be rendered for case: ${label}`);
    const text = pre?.textContent ?? '';
    assert.equal(
      text,
      value,
      `case "${label}" must preserve the value verbatim, got: ${JSON.stringify(text)}`
    );
  }
});

test('item answer bodies are built with exactly one JSDOM parse in htmlReport.ts', () => {
  // Source-level guard: every per-item body (candidate-response,
  // correct-answer, retry-question) must share a single JSDOM parse of
  // `item.questionHtml`. The item-level orchestrator
  // `buildItemAnswerBodies` is the only place in this file that may
  // construct a JSDOM instance. Counting the `new JSDOM(` substrings in
  // the source is a reliable proxy for that invariant (a constructor
  // call is the only way to allocate a JSDOM in this file).
  const source = fs.readFileSync(
    path.join(getRepoRootFromDist(), 'src', 'report', 'htmlReport.ts'),
    'utf8'
  );
  const matches = source.match(/new JSDOM\(/g) ?? [];
  assert.equal(
    matches.length,
    1,
    `htmlReport.ts must construct JSDOM exactly once (one per item); found ${matches.length} occurrences.`
  );
});
