import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { runCli } from '../cli.js';

interface CriterionFixture {
  points: string;
  met: boolean;
  examples?: string[];
}

interface ItemFixture {
  identifier: string;
  criteria: CriterionFixture[];
}

interface ScenarioFixture {
  cap?: string;
  duplicateCap?: boolean;
  testScore?: string;
  additionalTestScores?: string[];
  items: ItemFixture[];
}

function writeScenario(
  root: string,
  fixture: ScenarioFixture
): { outputDir: string; exitCode: number } {
  const itemRefs = fixture.items.map((item) => {
    const itemPath = path.join(root, `${item.identifier}.qti.xml`);
    const rubric = item.criteria
      .map((criterion) => {
        const examples = criterion.examples?.length
          ? `<ul class="scoring-examples">${criterion.examples
              .map((example) => `<li>${example}</li>`)
              .join('')}</ul>`
          : '';
        return `<p>[${criterion.points}] ${criterion.points} point criterion</p>${examples}`;
      })
      .join('');
    fs.writeFileSync(
      itemPath,
      `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="${item.identifier}" title="${item.identifier}"><qti-item-body><p>Question</p><qti-rubric-block view="scorer">${rubric}</qti-rubric-block></qti-item-body></qti-assessment-item>`,
      'utf8'
    );
    return `<qti-assessment-item-ref identifier="${item.identifier}" href="${itemPath}" />`;
  });
  const capDeclaration = (value: string): string =>
    `<qti-outcome-declaration identifier="SCORE_CAP" cardinality="single" base-type="float"><qti-default-value><qti-value>${value}</qti-value></qti-default-value></qti-outcome-declaration>`;
  const cap =
    fixture.cap !== undefined
      ? capDeclaration(fixture.cap) + (fixture.duplicateCap ? capDeclaration(fixture.cap) : '')
      : '';
  const assessmentTestPath = path.join(root, 'assessment-test.qti.xml');
  fs.writeFileSync(
    assessmentTestPath,
    `<qti-assessment-test xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="assessment-test" title="Score cap test">${cap}<qti-test-part identifier="part"><qti-assessment-section identifier="section">${itemRefs.join('')}</qti-assessment-section></qti-test-part></qti-assessment-test>`,
    'utf8'
  );
  const itemResults = fixture.items
    .map((item) => {
      const score = item.criteria.reduce((sum, criterion) => sum + Number(criterion.points), 0);
      const outcomes = item.criteria
        .map(
          (criterion, index) =>
            `<outcomeVariable identifier="RUBRIC_${index + 1}_MET" baseType="boolean" cardinality="single"><value>${criterion.met}</value></outcomeVariable>`
        )
        .join('');
      return `<itemResult identifier="${item.identifier}" sessionStatus="final"><outcomeVariable identifier="SCORE" baseType="float" cardinality="single"><value>${score}</value></outcomeVariable>${outcomes}</itemResult>`;
    })
    .join('');
  const candidateScores = [
    { candidateNumber: 'candidate-1', score: fixture.testScore },
    ...(fixture.additionalTestScores ?? []).map((score, index) => ({
      candidateNumber: `candidate-${index + 2}`,
      score,
    })),
  ];
  const assessmentResultPaths = candidateScores.map((candidate, index) => {
    const testScore =
      candidate.score !== undefined
        ? `<testResult identifier="assessment-test"><outcomeVariable identifier="SCORE" baseType="float" cardinality="single"><value>${candidate.score}</value></outcomeVariable></testResult>`
        : '';
    const resultPath = path.join(root, `assessment-result-${index + 1}.xml`);
    fs.writeFileSync(
      resultPath,
      `<assessmentResult xmlns="http://www.imsglobal.org/xsd/imsqti_result_v3p0"><context sourcedId="synthetic"><sessionIdentifier sourceID="candidateId" identifier="${candidate.candidateNumber}"/><sessionIdentifier sourceID="candidateName" identifier="Synthetic Candidate"/></context>${testScore}${itemResults}</assessmentResult>`,
      'utf8'
    );
    return resultPath;
  });
  const outputDir = path.join(root, 'output');
  const args = ['--assessment-test', assessmentTestPath, '--out-dir', outputDir];
  for (const assessmentResultPath of assessmentResultPaths) {
    args.splice(args.length - 2, 0, '--assessment-result', assessmentResultPath);
  }
  const exitCode = runCli(args);
  return { outputDir, exitCode };
}

function withScenario(fixture: ScenarioFixture, action: (outputDir: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-reporter-score-cap-'));
  try {
    const { outputDir, exitCode } = writeScenario(root, fixture);
    assert.equal(exitCode, 0, 'the synthetic assessment must generate reports successfully');
    action(outputDir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function rubricItem(identifier: string, points: string[], metCount = points.length): ItemFixture {
  return {
    identifier,
    criteria: points.map((value, index) => ({
      points: value,
      met: index < metCount,
    })),
  };
}

function readFirstReport(outputDir: string): { html: string; csvRows: string[][] } {
  const reportDir = path.join(outputDir, 'candidate-1 Synthetic Candidate');
  const htmlPath = path.join(reportDir, 'candidate-1 Synthetic Candidate Score cap test 結果.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const csv = fs.readFileSync(path.join(outputDir, 'report.csv'), 'utf8').replace(/^\uFEFF/, '');
  return { html, csvRows: csv.split('\n').map((line) => line.split(',')) };
}

function scoreFromHtml(html: string): { score: string; max: string } {
  const document = new JSDOM(html).window.document;
  return {
    score: document.querySelector('.score-total .score-value')?.textContent ?? '',
    max: document.querySelector('.score-total .score-max')?.textContent ?? '',
  };
}

test('caps only assessment totals and renders renderer criterion examples in their existing cells', () => {
  const points = Array.from({ length: 12 }, () => '10');
  const item = rubricItem('rubric-12', points);
  item.criteria[0]!.examples = ['alpha &amp; beta', '&lt;script&gt;alert(1)&lt;/script&gt;'];
  item.criteria[1]!.examples = ['second criterion example'];

  withScenario({ cap: '80', testScore: '100', items: [item] }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    const csvRow = csvRows[1] ?? [];
    const document = new JSDOM(html).window.document;
    const total = scoreFromHtml(html);
    assert.deepEqual(total, { score: '80', max: '80' });
    assert.equal(
      document.querySelectorAll('.score-cap-note').length,
      1,
      'the explanatory note must appear exactly once'
    );
    assert.equal(
      document.querySelector('.score-cap-note')?.textContent,
      '合計得点が80点を超えた場合は、評点を80点とします。'
    );
    assert.equal(csvRow[3], '80');
    assert.equal(csvRow[4], '80');
    assert.equal(csvRow[8], '120', 'the item score must not be capped');
    assert.equal(csvRow[9], '120');
    assert.equal(
      csvRow[10],
      Array.from({ length: 12 }, (_, index) => `${index + 1}:true`).join(';')
    );

    const rows = Array.from(document.querySelectorAll('.rubric-table tbody tr'));
    assert.equal(rows.length, 12, 'all rubric outcomes must remain present');
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-criterion-status')),
      Array.from({ length: 12 }, () => 'true')
    );
    assert.deepEqual(
      rows.map((row) => row.querySelector('.criterion-points')?.textContent),
      points
    );
    const firstCell = rows[0]?.querySelector('.criterion-text');
    assert.equal(firstCell?.querySelectorAll('ul li').length, 2);
    assert.equal(
      firstCell?.querySelector('ul')?.previousElementSibling?.textContent,
      '具体例（これらに限らない）'
    );
    assert.equal(firstCell?.querySelectorAll('script').length, 0);
    assert.equal(firstCell?.querySelectorAll('ul li')[1]?.textContent, '<script>alert(1)</script>');
    assert.equal(
      rows[1]?.querySelector('.criterion-text ul li')?.textContent,
      'second criterion example'
    );
    assert.equal(rows[2]?.querySelector('.criterion-text')?.querySelector('ul'), null);
    const itemScore = document.querySelector(
      'details[data-item-identifier="rubric-12"] .item-score'
    );
    assert.equal(itemScore?.querySelector('.score-value')?.textContent, '120');
    assert.equal(itemScore?.querySelector('.score-max')?.textContent, '120');
  });
});

test('caps fallback rubric totals exactly and keeps uncapped report behavior', () => {
  const twelve = rubricItem(
    'rubric-12',
    Array.from({ length: 12 }, () => '10')
  );
  withScenario({ cap: '80', items: [twelve] }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    const csvRow = csvRows[1] ?? [];
    assert.deepEqual(scoreFromHtml(html), { score: '80', max: '80' });
    assert.equal(csvRow[3], '80');
    assert.equal(csvRow[4], '80');
    assert.equal(csvRow[8], '120');
  });

  withScenario({ testScore: '100', items: [twelve] }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    const csvRow = csvRows[1] ?? [];
    assert.deepEqual(scoreFromHtml(html), { score: '100', max: '120' });
    assert.equal(new JSDOM(html).window.document.querySelectorAll('.score-cap-note').length, 0);
    assert.equal(csvRow[3], '100');
    assert.equal(csvRow[4], '120');
    assert.equal(csvRow[8], '120');
  });

  withScenario({ items: [rubricItem('uncapped-fallback', ['2', '1'], 2)] }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    assert.deepEqual(scoreFromHtml(html), { score: '3', max: '3' });
    assert.equal(new JSDOM(html).window.document.querySelectorAll('.score-cap-note').length, 0);
    assert.equal(csvRows[1]?.[3], '3');
    assert.equal(csvRows[1]?.[4], '3');
  });
});

test('uses exact capped source decimals and canonical exact rubric fallback sums', () => {
  const rubric = (a: string, b: string): ItemFixture => rubricItem('decimal-item', [a, b]);
  const storedTotals = [
    ['79.9999999999999999', '79.9999999999999999'],
    ['80.0000000000000001', '80'],
    ['8.1e1', '80'],
  ];
  for (const [source, expected] of storedTotals) {
    withScenario({ cap: '80', testScore: source, items: [rubric('40', '40')] }, (outputDir) => {
      const { html, csvRows } = readFirstReport(outputDir);
      const csvRow = csvRows[1] ?? [];
      assert.deepEqual(scoreFromHtml(html), { score: expected, max: '80' });
      assert.equal(csvRow[3], expected);
      assert.equal(csvRow[4], '80');
    });
  }

  for (const [points, metCount, expected] of [
    [['40.1', '30.2'], 2, '70.3'],
    [['40.1', '40.2'], 2, '80'],
    [['0.1', '0.2'], 2, '0.3'],
  ] as const) {
    const item = rubricItem('decimal-item', [...points], metCount);
    withScenario({ cap: '80', items: [item] }, (outputDir) => {
      const { html, csvRows } = readFirstReport(outputDir);
      const csvRow = csvRows[1] ?? [];
      assert.deepEqual(scoreFromHtml(html), { score: expected, max: '80' });
      assert.equal(csvRow[3], expected);
      assert.equal(csvRow[4], '80');
    });
  }
});

test('caps a multi-item fallback sum without changing item scores and honors stored test SCORE', () => {
  const items = [rubricItem('first-item', ['50']), rubricItem('second-item', ['70'])];

  withScenario({ cap: '80', items }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    assert.deepEqual(scoreFromHtml(html), { score: '80', max: '80' });
    assert.equal(csvRows[1]?.[3], '80');
    assert.equal(csvRows[1]?.[4], '80');
    assert.equal(csvRows[1]?.[8], '50');
    assert.equal(csvRows[1]?.[9], '50');
    assert.equal(csvRows[2]?.[8], '70');
    assert.equal(csvRows[2]?.[9], '70');
  });

  withScenario({ cap: '80', testScore: '60', items }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    assert.deepEqual(scoreFromHtml(html), { score: '60', max: '80' });
    assert.equal(csvRows[1]?.[3], '60');
    assert.equal(csvRows[2]?.[3], '60');
    assert.equal(csvRows[1]?.[8], '50');
    assert.equal(csvRows[2]?.[8], '70');
  });
});

test('caps each candidate total in HTML and the aggregated CSV', () => {
  const item = rubricItem('candidate-item', ['100']);
  withScenario(
    { cap: '80', testScore: '100', additionalTestScores: ['70'], items: [item] },
    (outputDir) => {
      const { csvRows } = readFirstReport(outputDir);
      assert.equal(csvRows[1]?.[0], 'candidate-1');
      assert.equal(csvRows[1]?.[3], '80');
      assert.equal(csvRows[1]?.[4], '80');
      assert.equal(csvRows[2]?.[0], 'candidate-2');
      assert.equal(csvRows[2]?.[3], '70');
      assert.equal(csvRows[2]?.[4], '80');

      for (const [candidateNumber, expected] of [
        ['candidate-1', '80'],
        ['candidate-2', '70'],
      ]) {
        const reportPath = path.join(
          outputDir,
          `${candidateNumber} Synthetic Candidate`,
          `${candidateNumber} Synthetic Candidate Score cap test 結果.html`
        );
        assert.deepEqual(scoreFromHtml(fs.readFileSync(reportPath, 'utf8')), {
          score: expected,
          max: '80',
        });
      }
    }
  );
});

test('clamps stored test scores at the cap boundary and falls back for empty SCORE', () => {
  const item = rubricItem('boundary-item', ['120']);
  for (const [source, expected] of [
    ['0', '0'],
    ['50', '50'],
    ['79', '79'],
    ['80', '80'],
    ['81', '80'],
    ['120', '80'],
  ]) {
    withScenario({ cap: '80', testScore: source, items: [item] }, (outputDir) => {
      const { html, csvRows } = readFirstReport(outputDir);
      assert.deepEqual(scoreFromHtml(html), { score: expected, max: '80' });
      assert.equal(csvRows[1]?.[3], expected);
      assert.equal(csvRows[1]?.[4], '80');
    });
  }

  withScenario({ cap: '80', testScore: '', items: [item] }, (outputDir) => {
    const { html, csvRows } = readFirstReport(outputDir);
    assert.deepEqual(scoreFromHtml(html), { score: '80', max: '80' });
    assert.equal(csvRows[1]?.[3], '80');
  });
});

test('rejects malformed SCORE_CAP before creating any output files', () => {
  for (const fixture of [
    { cap: '0' },
    { cap: '1.5' },
    { cap: '9007199254740992' },
    { cap: 'not-a-number' },
    { cap: '80', duplicateCap: true },
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-reporter-invalid-cap-'));
    try {
      const item = rubricItem('invalid-cap-item', ['10']);
      const { outputDir, exitCode } = writeScenario(root, { ...fixture, items: [item] });
      assert.notEqual(exitCode, 0, `invalid cap ${fixture.cap} must be rejected`);
      assert.equal(fs.existsSync(outputDir), false, 'validation must precede output creation');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('rejects malformed nonempty stored SCORE rather than accepting a numeric prefix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-reporter-invalid-score-'));
  try {
    const item = rubricItem('invalid-score-item', ['10']);
    const { outputDir, exitCode } = writeScenario(root, {
      cap: '80',
      testScore: '81invalid',
      items: [item],
    });
    assert.notEqual(exitCode, 0);
    assert.equal(fs.existsSync(path.join(outputDir, 'report.csv')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
