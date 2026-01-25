import path from "node:path";

import { generateHtmlReportFromFiles, HtmlReportInputPaths } from "./report/htmlReport";
import { generateCsvReportFromFiles } from "./report/csvReport";

interface CliOptions extends HtmlReportInputPaths {}

export interface CliLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

function parseCliOptions(argv: string[]): CliOptions {
  let assessmentTestPath: string | null = null;
  let assessmentResultPath: string | null = null;
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
      assessmentResultPath = nextValue;
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
  if (!assessmentResultPath) {
    throw new Error("--assessment-result is required");
  }

  const resolvedOutputRootDir = path.resolve(outputRootDir ?? "out");
  return {
    assessmentTestPath: path.resolve(assessmentTestPath),
    assessmentResultPath: path.resolve(assessmentResultPath),
    outputRootDir: resolvedOutputRootDir,
    styleCssPath: styleCssPath ? path.resolve(styleCssPath) : undefined,
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
    const htmlReport = generateHtmlReportFromFiles(options);
    const csvReport = generateCsvReportFromFiles(options);
    logger.log(`Generated HTML: ${htmlReport.outputFilePath}`);
    logger.log(`Generated CSV: ${csvReport.csvPath}`);
    logUnusedData(htmlReport, logger);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to generate HTML report: ${message}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}
