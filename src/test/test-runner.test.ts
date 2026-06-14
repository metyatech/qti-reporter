import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTests } from '../scripts/discoverTests.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distTestDir = path.resolve(repoRoot, 'dist', 'test');

test('discoverTests finds all *.test.js in dist/test', () => {
  const files = discoverTests({ distDir: distTestDir });
  assert.ok(files.length > 0, 'expected to discover at least one test file');
  for (const file of files) {
    assert.ok(file.endsWith('.test.js'), `expected .test.js suffix, got ${file}`);
    assert.ok(file.startsWith(distTestDir), `expected file under dist/test, got ${file}`);
  }
});

test('discoverTests excludes suite.test.js', () => {
  const files = discoverTests({
    distDir: distTestDir,
    excludeNames: ['suite.test.js'],
  });
  for (const file of files) {
    assert.notEqual(path.basename(file), 'suite.test.js', 'suite.test.js should be excluded');
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

    const files = discoverTests({ distDir: tmpDir });
    const basenames = files.map((f) => path.basename(f));
    assert.ok(
      basenames.includes('dummy-discover.test.js'),
      `expected dummy-discover.test.js, got ${basenames.join(', ')}`
    );
    assert.ok(!basenames.includes('helper.js'), 'non-test .js files should be ignored');
    assert.ok(!basenames.includes('README.md'), 'non-.js files should be ignored');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('discoverTests honours custom excludeNames', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qti-discover-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'a.test.js'), '// a\n');
    fs.writeFileSync(path.join(tmpDir, 'b.test.js'), '// b\n');
    fs.writeFileSync(path.join(tmpDir, 'skip.test.js'), '// skip\n');

    const files = discoverTests({
      distDir: tmpDir,
      excludeNames: ['skip.test.js'],
    });
    const basenames = files.map((f) => path.basename(f));
    assert.deepEqual(basenames, ['a.test.js', 'b.test.js']);
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

    const files = discoverTests({ distDir: tmpDir });
    const basenames = files.map((f) => path.basename(f));
    assert.deepEqual(basenames, ['real.test.js']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scripts/run-tests.mjs does not hand-list *.test.js files', () => {
  const runnerPath = path.resolve(repoRoot, 'scripts', 'run-tests.mjs');
  const runnerSrc = fs.readFileSync(runnerPath, 'utf8');
  // Hard-coded test file lists look like `node --test dist/test/foo.test.js ...`
  // or an array of many `.test.js` paths. Exclude the legitimate single
  // `excludeNames: ['suite.test.js']` entry from the match set.
  const pattern = /['"][^'"]*\.test\.js['"]/g;
  const matches = runnerSrc.match(pattern) ?? [];
  const allowed = new Set(["'suite.test.js'"]);
  const suspicious = matches.filter((m) => !allowed.has(m));
  assert.strictEqual(
    suspicious.length,
    0,
    `runner should not contain hard-coded .test.js paths, found: ${suspicious.join(', ')}`
  );
});

test('package.json test script does not hand-list test files', () => {
  const pkgPath = path.resolve(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    scripts: Record<string, string>;
  };
  const testScript = pkg.scripts.test;
  assert.ok(typeof testScript === 'string', 'package.json should define a "test" script');
  assert.ok(
    testScript.includes('node scripts/run-tests.mjs'),
    `test script should delegate to scripts/run-tests.mjs, got: ${testScript}`
  );
  const pattern = /['"][^'"]*\.test\.js['"]/g;
  const matches = testScript.match(pattern) ?? [];
  assert.strictEqual(
    matches.length,
    0,
    `test script should not contain hard-coded .test.js paths, found: ${matches.join(', ')}`
  );
});
