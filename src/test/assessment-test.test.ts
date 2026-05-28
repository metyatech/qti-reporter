import test from 'node:test';
import assert from 'node:assert/strict';
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
