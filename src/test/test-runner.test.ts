import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTests } from '../scripts/discoverTests.js';
import { cleanDist } from '../scripts/cleanDist.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distTestDir = path.resolve(repoRoot, 'dist', 'test');

// Matches a concrete, hand-listed test-file path under src/test or dist/test,
// independent of surrounding quotes, using either POSIX `/` or Windows `\`.
const CONCRETE_TEST_PATH = /(?:src|dist)[\\/]+test[\\/]+\S+\.test\.(?:js|ts)\b/;

// --- discoverTests core behaviour ---

test('discoverTests finds all *.test.js in dist/test', () => {
  const files = discoverTests({ distDir: distTestDir });
  assert.ok(files.length > 0, 'expected to discover at least one test file');
  for (const file of files) {
    assert.ok(file.endsWith('.test.js'), `expected .test.js suffix, got ${file}`);
    assert.ok(file.startsWith(distTestDir), `expected file under dist/test, got ${file}`);
  }
});

test('discoverTests returns a sorted array', () => {
  const files = discoverTests({ distDir: distTestDir });
  const sorted = [...files].sort();
  assert.deepEqual(files, sorted, 'discoverTests output should be sorted');
});

test('discoverTests accepts a custom distDir and finds a dummy test file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-discover-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'dummy-discover.test.js'), '// dummy\n');
    fs.writeFileSync(path.join(tmpDir, 'helper.js'), '// not a test\n');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# notes\n');

    const basenames = discoverTests({ distDir: tmpDir }).map((f) => path.basename(f));
    assert.deepEqual(basenames, ['dummy-discover.test.js']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('discoverTests ignores files that are not .test.js', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-discover-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'real.test.js'), '// real\n');
    fs.writeFileSync(path.join(tmpDir, 'fixture.js'), '// fixture\n');
    fs.writeFileSync(path.join(tmpDir, 'real.test.ts'), '// not compiled\n');

    const basenames = discoverTests({ distDir: tmpDir }).map((f) => path.basename(f));
    assert.deepEqual(basenames, ['real.test.js']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('discoverTests honours custom excludeNames (generic helper option)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-discover-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.test.js'), '// a\n');
    fs.writeFileSync(path.join(tmpDir, 'b.test.js'), '// b\n');
    fs.writeFileSync(path.join(tmpDir, 'skip.test.js'), '// skip\n');

    const basenames = discoverTests({
      distDir: tmpDir,
      excludeNames: ['skip.test.js'],
    }).map((f) => path.basename(f));
    assert.deepEqual(basenames, ['a.test.js', 'b.test.js']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Required case A: clean-dist contract ---

test('cleanDist does not throw on a non-existent directory', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-clean-'));
  try {
    const missing = path.join(tmpRoot, 'never-existed');
    assert.doesNotThrow(() => cleanDist(missing));
    assert.ok(!fs.existsSync(missing), 'missing dir stays absent');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('cleanDist removes all files and subdirectories under the target', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-clean-'));
  try {
    const target = path.join(tmpRoot, 'dist');
    fs.mkdirSync(path.join(target, 'test'), { recursive: true });
    fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(target, 'cli.js'), '// cli\n');
    fs.writeFileSync(path.join(target, 'test', 'a.test.js'), '// a\n');
    fs.writeFileSync(path.join(target, 'scripts', 'discoverTests.js'), '// d\n');

    cleanDist(target);

    assert.ok(!fs.existsSync(target), 'the dist subtree should be fully removed');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('cleanDist does not remove files outside the target directory', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-clean-'));
  try {
    const target = path.join(tmpRoot, 'dist');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'inside.js'), '// inside\n');
    const sibling = path.join(tmpRoot, 'keep.js');
    fs.writeFileSync(sibling, '// keep\n');

    cleanDist(target);

    assert.ok(!fs.existsSync(target), 'target removed');
    assert.ok(fs.existsSync(sibling), 'sibling outside the target must survive');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// --- Required case B: a stale dist test artifact is not rediscovered ---

test('a clean rebuild drops stale test artifacts from discovery', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-stale-'));
  try {
    const distRoot = path.join(tmpRoot, 'dist');
    const distTest = path.join(distRoot, 'test');
    fs.mkdirSync(distTest, { recursive: true });
    // Previous build output, including a now-deleted source's artifact.
    fs.writeFileSync(path.join(distTest, 'current.test.js'), '// current\n');
    fs.writeFileSync(path.join(distTest, 'deleted-source.test.js'), '// deleted\n');
    fs.writeFileSync(path.join(distTest, 'helper.js'), '// helper\n');

    // clean wipes the whole dist subtree, then the "rebuild" only re-emits the
    // artifacts whose source still exists: current.test.js (and helper.js).
    cleanDist(distRoot);
    fs.mkdirSync(distTest, { recursive: true });
    fs.writeFileSync(path.join(distTest, 'current.test.js'), '// current\n');
    fs.writeFileSync(path.join(distTest, 'helper.js'), '// helper\n');

    const basenames = discoverTests({ distDir: distTest }).map((f) => path.basename(f));
    assert.deepEqual(basenames, ['current.test.js']);
    assert.ok(
      !basenames.includes('deleted-source.test.js'),
      'stale deleted-source.test.js must not be rediscovered'
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// --- Required case C + section 6: runner has no manual enumeration ---

test('run-tests.mjs does not special-case suite.test.js or use excludeNames', () => {
  const runnerSrc = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'run-tests.mjs'), 'utf8');
  assert.doesNotMatch(runnerSrc, /suite\.test\.js/, 'runner must not hard-code suite.test.js');
  assert.doesNotMatch(runnerSrc, /excludeNames/, 'runner must not pass excludeNames');
});

test('run-tests.mjs does not hand-list individual test files (quote-independent)', () => {
  const runnerSrc = fs.readFileSync(path.resolve(repoRoot, 'scripts', 'run-tests.mjs'), 'utf8');
  // No concrete src/test or dist/test test-file path, quoted or unquoted.
  assert.doesNotMatch(runnerSrc, CONCRETE_TEST_PATH);
  // No concrete test-file basenames either.
  for (const name of ['assessmentResult.test.js', 'csv-report.test.js', 'unification.test.js']) {
    assert.ok(!runnerSrc.includes(name), `runner must not name ${name}`);
  }
  // `node --test` must not be pointed at a hand-listed test path.
  assert.doesNotMatch(
    runnerSrc,
    /--test\s+\S*[\\/]+\S+\.test\.js/,
    'runner must not pass a concrete test path to node --test'
  );
});

// --- Section 5: package.json test script has no manual enumeration ---

test('package.json test script auto-discovers tests without hand-listing files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const testScript = pkg.scripts.test;
  assert.equal(testScript, 'npm run build && node scripts/run-tests.mjs');
  // Quote-independent guards (redundant with the exact match above, but they
  // document the invariant the exact string is protecting).
  assert.ok(
    testScript.includes('node scripts/run-tests.mjs'),
    `test script should delegate to scripts/run-tests.mjs, got: ${testScript}`
  );
  assert.doesNotMatch(
    testScript,
    CONCRETE_TEST_PATH,
    'test script must not list concrete src/test or dist/test files'
  );
  assert.doesNotMatch(
    testScript,
    /node\s+--test\b/,
    'test script must not call node --test directly'
  );
});
