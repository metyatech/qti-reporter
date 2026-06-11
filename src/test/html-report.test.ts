import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../cli.js';
import { generateHtmlReportFromFiles } from '../report/htmlReport.js';
import { applyResponsesToPromptHtmlSafely } from '../report/cloze.js';

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
  assert.ok(item7Html.includes('value="1"'), 'cloze input must include candidate response value');
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

test('inserts escaped values into self-closing cloze inputs', () => {
  const promptHtml =
    '<span><input class="qti-blank-input" type="text" /><input class="qti-blank-input" type="text" value="old"/></span>';
  const filled = applyResponsesToPromptHtmlSafely(promptHtml, ['a"b', 'c']);
  assert.match(filled, /<input\b[^>]*\bqti-blank-input\b[^>]*\bvalue="a&quot;b"[^>]*\/>/i);
  assert.match(filled, /<input\b[^>]*\bqti-blank-input\b[^>]*\bvalue="c"[^>]*\/>/i);
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
    /candidate number/i
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
  assert.ok(item2Html.includes('data-has-comment="true"'), 'commented item must carry data-has-comment');
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
  assert.match(
    html,
    /<span class="item-title"><span class="item-no">問1<\/span>Item 2<\/span>/
  );
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
