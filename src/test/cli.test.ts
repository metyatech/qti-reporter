import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRepoRootFromDist(): string {
  return path.resolve(__dirname, "..", "..");
}

function resolveFixturePath(fileName: string): string {
  return path.join(getRepoRootFromDist(), "src", "test", "fixtures", fileName);
}

function ensureMissingPath(fileName: string): string {
  const missingPath = path.join(getRepoRootFromDist(), "tmp", fileName);
  fs.rmSync(missingPath, { force: true });
  return missingPath;
}

function createCleanOutputDir(dirName: string): string {
  const outputDir = path.join(getRepoRootFromDist(), "tmp", dirName);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

test("reports missing assessment-test path with a clear error message", () => {
  const missingPath = ensureMissingPath("missing-assessment-test.xml");
  const errors: string[] = [];

  const exitCode = runCli(
    [
      "--assessment-test",
      missingPath,
      "--assessment-result",
      resolveFixturePath("assessment-result.xml"),
      "--out-dir",
      path.join(getRepoRootFromDist(), "tmp", "cli-missing-test"),
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Assessment test file not found/i);
  assert.ok(errors[0].includes(missingPath));
});

test("reports missing assessment-result path with a clear error message", () => {
  const missingPath = ensureMissingPath("missing-assessment-result.xml");
  const errors: string[] = [];

  const exitCode = runCli(
    [
      "--assessment-test",
      resolveFixturePath("assessment-test.qti.xml"),
      "--assessment-result",
      missingPath,
      "--out-dir",
      path.join(getRepoRootFromDist(), "tmp", "cli-missing-result"),
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Assessment result file not found/i);
  assert.ok(errors[0].includes(missingPath));
});

test("accepts caret-escaped Windows paths for assessment-result", () => {
  const repoRoot = getRepoRootFromDist();
  const fixturePath = resolveFixturePath("assessment-result.xml");
  const targetDir = path.join(repoRoot, "tmp", "cli caret (result)");
  const targetPath = path.join(targetDir, "assessment result.xml");
  const outputRootDir = createCleanOutputDir("cli-caret");

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(fixturePath, targetPath);

  const escapedPath = `^${targetPath.replace(/[() ]/g, "^$&")}^`;
  const errors: string[] = [];

  const exitCode = runCli(
    [
      "--assessment-test",
      resolveFixturePath("assessment-test.qti.xml"),
      "--assessment-result",
      escapedPath,
      "--out-dir",
      outputRootDir,
    ],
    {
      log: () => undefined,
      error: (message: string) => errors.push(message),
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
});
