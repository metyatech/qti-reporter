#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distTestDir = path.resolve(repoRoot, 'dist', 'test');
const discoverModuleUrl = new URL(`../dist/scripts/discoverTests.js`, import.meta.url).href;

if (!fs.existsSync(distTestDir)) {
  console.error(`error: ${distTestDir} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const { discoverTests } = await import(discoverModuleUrl);
const testFiles = discoverTests({
  distDir: distTestDir,
  excludeNames: ['suite.test.js'],
});

if (testFiles.length === 0) {
  console.error(`error: no test files discovered under ${distTestDir}.`);
  process.exit(1);
}

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, ['--test', testFile], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
