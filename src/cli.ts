#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateHtmlReportFromFiles } from './report/htmlReport.js';
import { generateCsvReportFromFiles } from './report/csvReport.js';

interface CliOptions {
  assessmentTestPath: string;
  assessmentResultPaths: string[];
  outputRootDir: string;
  styleCssPath?: string;
  showHelp?: boolean;
  showVersion?: boolean;
}

export interface CliLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

function parseCliOptions(argv: string[]): CliOptions {
  let assessmentTestPath: string | null = null;
  const assessmentResultPaths: string[] = [];
  const assessmentResultDirs: string[] = [];
  let outputRootDir: string | null = null;
  let styleCssPath: string | null = null;
  let showHelp = false;
  let showVersion = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }
    if (arg === "--version" || arg === "-V") {
      showVersion = true;
      continue;
    }
    if (arg === "--assessment-test") {
      if (!nextValue) {
        throw new Error("Missing value for --assessment-test");
      }
      assessmentTestPath = nextValue;
      index += 1;
      continue;
    }
    if (arg === "--assessment-result") {
      if (!nextValue) {
        throw new Error("Missing value for --assessment-result");
      }
      assessmentResultPaths.push(nextValue);
      index += 1;
      continue;
    }
    if (arg === "--assessment-result-dir") {
      if (!nextValue) {
        throw new Error("Missing value for --assessment-result-dir");
      }
      assessmentResultDirs.push(nextValue);
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      if (!nextValue) {
        throw new Error("Missing value for --out-dir");
      }
      outputRootDir = nextValue;
      index += 1;
      continue;
    }
    if (arg === "--style-css") {
      if (!nextValue) {
        throw new Error("Missing value for --style-css");
      }
      styleCssPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (showHelp || showVersion) {
    return {
      assessmentTestPath: "",
      outputRootDir: "",
      assessmentResultPaths: [],
      showHelp,
      showVersion,
    };
  }

  if (!assessmentTestPath) {
    throw new Error("--assessment-test is required");
  }
  if (assessmentResultPaths.length === 0 && assessmentResultDirs.length === 0) {
    throw new Error("--assessment-result is required");
  }

  const resolvedAssessmentTestPath = resolveCliPath(assessmentTestPath);
  const resolvedAssessmentResultPaths = assessmentResultPaths.map(resolveCliPath);
  const resolvedAssessmentResultDirs = assessmentResultDirs.map(resolveCliPath);
  const resolvedOutputRootDir = outputRootDir
    ? path.resolve(outputRootDir)
    : resolveDefaultOutputRootDir(resolvedAssessmentResultPaths, resolvedAssessmentResultDirs);
  const resolvedStyleCssPath = styleCssPath ? resolveCliPath(styleCssPath) : undefined;

  assertFileExists(resolvedAssessmentTestPath, "Assessment test");
  resolvedAssessmentResultPaths.forEach((resultPath) => {
    assertFileExists(resultPath, "Assessment result");
  });
  resolvedAssessmentResultDirs.forEach((dirPath) => {
    assertDirectoryExists(dirPath, "Assessment result directory");
  });
  if (resolvedStyleCssPath) {
    assertFileExists(resolvedStyleCssPath, "Style CSS");
  }

  const dirResults = resolvedAssessmentResultDirs.flatMap(readResultsFromDir);
  const combinedResults = [...resolvedAssessmentResultPaths, ...dirResults];
  const uniqueResults = Array.from(new Set(combinedResults));
  if (uniqueResults.length === 0) {
    throw new Error("No assessment result files found");
  }

  return {
    assessmentTestPath: resolvedAssessmentTestPath,
    outputRootDir: resolvedOutputRootDir,
    styleCssPath: resolvedStyleCssPath,
    assessmentResultPaths: uniqueResults,
  };
}

function printHelp(logger: CliLogger): void {
  logger.log(`Usage: qti-reporter [options]\n\nOptions:\n  --assessment-test <path>      Path to the assessment test XML file (required)\n  --assessment-result <path>    Path to an assessment result XML file (repeatable)\n  --assessment-result-dir <dir> Directory containing assessment result XML files\n  --out-dir <dir>               Output directory\n  --style-css <path>            Path to an external CSS file\n  -V, --version                 Output the version number\n  -h, --help                    Display help for command`);
}

function printVersion(logger: CliLogger): void {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  logger.log(packageJson.version);
}

function resolveDefaultOutputRootDir(
  assessmentResultPaths: string[],
  assessmentResultDirs: string[],
): string {
  const candidateDirs = new Set<string>();
  assessmentResultDirs.forEach((dirPath) => {
    candidateDirs.add(path.resolve(dirPath));
  });
  assessmentResultPaths.forEach((resultPath) => {
    candidateDirs.add(path.dirname(path.resolve(resultPath)));
  });

  if (candidateDirs.size === 1) {
    return Array.from(candidateDirs)[0];
  }
  throw new Error(
    "Multiple assessment result locations detected. Use --out-dir to choose an output directory.",
  );
}

function logUnusedData(
  report: ReturnType<typeof generateHtmlReportFromFiles>,
  logger: CliLogger,
): void {
  if (report.unusedItemResultIdentifiers.length === 0) {
    return;
  }
  logger.log(`Unused itemResult identifiers: ${report.unusedItemResultIdentifiers.join(", ")}`);
}

export function runCli(argv: string[], logger: CliLogger = console): number {
  try {
    const options = parseCliOptions(argv);
    if (options.showHelp) {
      printHelp(logger);
      return 0;
    }
    if (options.showVersion) {
      printVersion(logger);
      return 0;
    }
    for (const assessmentResultPath of options.assessmentResultPaths) {

      const htmlReport = generateHtmlReportFromFiles({
        ...options,
        assessmentResultPath,
      });
      const csvReport = generateCsvReportFromFiles({
        assessmentTestPath: options.assessmentTestPath,
        assessmentResultPath,
        outputRootDir: options.outputRootDir,
      });
      logger.log(`Generated HTML: ${htmlReport.outputFilePath}`);
      logger.log(`Generated CSV: ${csvReport.csvPath}`);
      logUnusedData(htmlReport, logger);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to generate reports: ${message}`);
    return 1;
  }
}

function assertFileExists(filePath: string, label: string): void {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`${label} must be a file: ${filePath}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${label} file not found: ${filePath}`);
    }
    throw error;
  }
}

function assertDirectoryExists(dirPath: string, label: string): void {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`${label} must be a directory: ${dirPath}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${label} not found: ${dirPath}`);
    }
    throw error;
  }
}

function readResultsFromDir(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function resolveCliPath(inputPath: string): string {
  const resolvedPath = path.resolve(inputPath);
  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }
  if (!inputPath.includes('^')) {
    return resolvedPath;
  }
  const unescapedPath = inputPath.replaceAll('^', '');
  const resolvedUnescapedPath = path.resolve(unescapedPath);
  return fs.existsSync(resolvedUnescapedPath) ? resolvedUnescapedPath : resolvedPath;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  process.exitCode = runCli(process.argv.slice(2));
}
