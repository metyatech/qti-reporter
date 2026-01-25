import path from "node:path";

import { generateHtmlReportFromFiles } from "./report/htmlReport";

interface CliOptions {
  assessmentTestPath: string;
  assessmentResultPath: string;
  outputRootDir: string;
  styleCssPath: string | undefined;
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

function main(): void {
  try {
    const options = parseCliOptions(process.argv.slice(2));
    const report = generateHtmlReportFromFiles(options);
    console.log(`Generated: ${report.outputFilePath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to generate HTML report: ${message}`);
    process.exitCode = 1;
  }
}

main();
