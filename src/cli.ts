import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateHtmlReportFromFiles } from "./report/htmlReport.js";
import { generateCsvReportFromFiles } from "./report/csvReport.js";

interface CliOptions {
  assessmentTestPath: string;
  assessmentResultPaths: string[];
  outputRootDir: string;
  styleCssPath?: string;
}

export interface CliLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

function parseCliOptions(argv: string[]): CliOptions {
  let assessmentTestPath: string | null = null;
  const assessmentResultPaths: string[] = [];
  let outputRootDir: string | null = null;
  let styleCssPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

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

  if (!assessmentTestPath) {
    throw new Error("--assessment-test is required");
  }
  if (assessmentResultPaths.length === 0) {
    throw new Error("--assessment-result is required");
  }

  const resolvedAssessmentTestPath = resolveCliPath(assessmentTestPath);
  const resolvedAssessmentResultPaths = assessmentResultPaths.map(resolveCliPath);
  const resolvedOutputRootDir = path.resolve(outputRootDir ?? "out");
  const resolvedStyleCssPath = styleCssPath ? resolveCliPath(styleCssPath) : undefined;

  assertFileExists(resolvedAssessmentTestPath, "Assessment test");
  resolvedAssessmentResultPaths.forEach((resultPath) => {
    assertFileExists(resultPath, "Assessment result");
  });
  if (resolvedStyleCssPath) {
    assertFileExists(resolvedStyleCssPath, "Style CSS");
  }

  return {
    assessmentTestPath: resolvedAssessmentTestPath,
    outputRootDir: resolvedOutputRootDir,
    styleCssPath: resolvedStyleCssPath,
    assessmentResultPaths: resolvedAssessmentResultPaths,
  };
}

function logUnusedData(report: ReturnType<typeof generateHtmlReportFromFiles>, logger: CliLogger): void {
  if (report.unusedItemResultIdentifiers.length === 0) {
    return;
  }
  logger.log(
    `Unused itemResult identifiers: ${report.unusedItemResultIdentifiers.join(", ")}`,
  );
}

export function runCli(argv: string[], logger: CliLogger = console): number {
  try {
    const options = parseCliOptions(argv);
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
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label} file not found: ${filePath}`);
    }
    throw error;
  }
}

function resolveCliPath(inputPath: string): string {
  const resolvedPath = path.resolve(inputPath);
  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }
  if (!inputPath.includes("^")) {
    return resolvedPath;
  }
  const unescapedPath = inputPath.replaceAll("^", "");
  const resolvedUnescapedPath = path.resolve(unescapedPath);
  return fs.existsSync(resolvedUnescapedPath) ? resolvedUnescapedPath : resolvedPath;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectRun) {
  process.exitCode = runCli(process.argv.slice(2));
}
