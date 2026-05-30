import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssessmentTest } from '../qti/assessmentTest.js';

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

function writeAssessmentTestWithTimeLimit(dirName: string, timeLimitAttributes: string): string {
  const outputDir = createCleanOutputDir(dirName);
  const itemPath = resolveFixturePath('item-1.qti.xml');
  const assessmentTestPath = path.join(outputDir, 'assessment-test.qti.xml');
  fs.writeFileSync(
    assessmentTestPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-test identifier="assessment-test" title="Assessment Test" xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0">
  <qti-test-part identifier="part-1" navigation-mode="linear" submission-mode="individual">
    <qti-time-limits ${timeLimitAttributes} />
    <qti-assessment-section identifier="section-1" title="Section 1" visible="true">
      <qti-assessment-item-ref identifier="item-1" href="${itemPath}" />
    </qti-assessment-section>
  </qti-test-part>
</qti-assessment-test>
`
  );
  return assessmentTestPath;
}

test('parses new package assessment-test with testPart time limit', () => {
  const assessmentTest = parseAssessmentTest(
    resolveFixturePath('assessment-test-new-package.qti.xml')
  );

  assert.equal(assessmentTest.title, 'New Package Compatibility');
  assert.deepEqual(
    assessmentTest.itemRefs.map((itemRef) => itemRef.identifier),
    ['new-choice', 'new-cloze', 'new-descriptive']
  );
  assert.deepEqual(assessmentTest.timeLimit, {
    maxTime: 'PT45M',
  });
});

test('parses maxTime fallback on qti-time-limits', () => {
  const assessmentTest = parseAssessmentTest(
    writeAssessmentTestWithTimeLimit('assessment-test-max-time-fallback', 'maxTime="PT120S"')
  );

  assert.deepEqual(assessmentTest.timeLimit, {
    maxTime: 'PT120S',
  });
});
