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

function ensureMissingPath(fileName: string): string {
  const missingPath = path.join(getRepoRootFromDist(), 'tmp', fileName);
  fs.rmSync(missingPath, { force: true });
  return missingPath;
}

function createCleanOutputDir(dirName: string): string {
  const outputDir = path.join(getRepoRootFromDist(), 'tmp', dirName);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

test('reports missing assessment-test path with a clear error message', () => {
  const missingPath = ensureMissingPath('missing-assessment-test.xml');
  const errors: string[] = [];

  const exitCode = runCli(
    [
      '--assessment-test',
      missingPath,
      '--assessment-result',
      resolveFixturePath('assessment-result.xml'),
      '--out-dir',
      path.join(getRepoRootFromDist(), 'tmp', 'cli-missing-test'),
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Assessment test file not found/i);
  assert.ok(errors[0].includes(missingPath));
});

test('reports missing assessment-result path with a clear error message', () => {
  const missingPath = ensureMissingPath('missing-assessment-result.xml');
  const errors: string[] = [];

  const exitCode = runCli(
    [
      '--assessment-test',
      resolveFixturePath('assessment-test.qti.xml'),
      '--assessment-result',
      missingPath,
      '--out-dir',
      path.join(getRepoRootFromDist(), 'tmp', 'cli-missing-result'),
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Assessment result file not found/i);
  assert.ok(errors[0].includes(missingPath));
});

test('accepts caret-escaped Windows paths for assessment-result', () => {
  const repoRoot = getRepoRootFromDist();
  const fixturePath = resolveFixturePath('assessment-result.xml');
  const targetDir = path.join(repoRoot, 'tmp', 'cli caret (result)');
  const targetPath = path.join(targetDir, 'assessment result.xml');
  const outputRootDir = createCleanOutputDir('cli-caret');

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(fixturePath, targetPath);

  const escapedPath = `^${targetPath.replace(/[() ]/g, '^$&')}^`;
  const errors: string[] = [];

  const exitCode = runCli(
    [
      '--assessment-test',
      resolveFixturePath('assessment-test.qti.xml'),
      '--assessment-result',
      escapedPath,
      '--out-dir',
      outputRootDir,
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
});

test('accepts assessment-result directory inputs', () => {
  const repoRoot = getRepoRootFromDist();
  const outputRootDir = createCleanOutputDir('cli-result-dir');
  const resultDir = path.join(repoRoot, 'tmp', 'cli-result-dir-input');
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.mkdirSync(resultDir, { recursive: true });

  fs.copyFileSync(
    resolveFixturePath('assessment-result.xml'),
    path.join(resultDir, 'result-a.xml')
  );
  fs.copyFileSync(
    resolveFixturePath('assessment-result-2.xml'),
    path.join(resultDir, 'result-b.xml')
  );

  const exitCode = runCli(
    [
      '--assessment-test',
      resolveFixturePath('assessment-test.qti.xml'),
      '--assessment-result-dir',
      resultDir,
      '--out-dir',
      outputRootDir,
    ],
    {
      log: () => undefined,
      error: () => undefined,
    }
  );

  assert.equal(exitCode, 0);
  const csvPath = path.join(outputRootDir, 'report.csv');
  assert.equal(fs.existsSync(csvPath), true, 'report.csv must be created');
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  assert.ok(text.includes('0007'), 'first candidate must be included');
  assert.ok(text.includes('0008'), 'second candidate must be included');
});

test('defaults output directory to the assessment-result location', () => {
  const repoRoot = getRepoRootFromDist();
  const resultDir = path.join(repoRoot, 'tmp', 'cli-default-out');
  const outDir = path.join(repoRoot, 'out');
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.mkdirSync(resultDir, { recursive: true });
  fs.rmSync(outDir, { recursive: true, force: true });

  const resultPath = path.join(resultDir, 'assessment-result.xml');
  fs.copyFileSync(resolveFixturePath('assessment-result.xml'), resultPath);

  try {
    const exitCode = runCli(
      [
        '--assessment-test',
        resolveFixturePath('assessment-test.qti.xml'),
        '--assessment-result',
        resultPath,
      ],
      {
        log: () => undefined,
        error: () => undefined,
      }
    );

    assert.equal(exitCode, 0);
    const csvPath = path.join(resultDir, 'report.csv');
    assert.equal(
      fs.existsSync(csvPath),
      true,
      'report.csv must be created in the result directory'
    );
  } finally {
    fs.rmSync(resultDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('displays help message when --help or -h is provided', () => {
  const logs: string[] = [];
  const exitCode = runCli(['--help'], {
    log: (msg) => logs.push(msg),
    error: () => undefined,
  });

  assert.equal(exitCode, 0);
  assert.ok(logs.join('\n').includes('Usage: qti-reporter'));
  assert.ok(logs.join('\n').includes('--assessment-test'));

  const logsShort: string[] = [];
  assert.equal(
    runCli(['-h'], {
      log: (msg) => logsShort.push(msg),
      error: () => undefined,
    }),
    0
  );
  assert.ok(logsShort.join('\n').includes('Usage: qti-reporter'));
});

test('outputs version number when --version or -V is provided', () => {
  const logs: string[] = [];
  const exitCode = runCli(['--version'], {
    log: (msg) => logs.push(msg),
    error: () => undefined,
  });

  assert.equal(exitCode, 0);
  assert.match(logs[0], /^\d+\.\d+\.\d+/);

  const logsShort: string[] = [];
  assert.equal(
    runCli(['-V'], {
      log: (msg) => logsShort.push(msg),
      error: () => undefined,
    }),
    0
  );
  assert.match(logsShort[0], /^\d+\.\d+\.\d+/);
});

test('preserves shebang in the compiled CLI entrypoint', () => {
  const repoRoot = getRepoRootFromDist();
  const cliPath = path.join(repoRoot, 'dist', 'cli.js');
  assert.equal(fs.existsSync(cliPath), true, 'dist/cli.js must exist');

  const firstLine = fs.readFileSync(cliPath, 'utf8').split('\n')[0]?.trim();
  assert.equal(firstLine, '#!/usr/bin/env node');

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(packageJson.bin?.['qti-reporter'], 'dist/cli.js');
});
