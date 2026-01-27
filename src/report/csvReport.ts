import fs from "node:fs";
import path from "node:path";

import { parseAssessmentItem, ParsedAssessmentItem } from "../qti/assessmentItem.js";
import { parseAssessmentResult, ParsedAssessmentResult, ParsedItemResult } from "../qti/assessmentResult.js";
import { parseAssessmentTest } from "../qti/assessmentTest.js";

export interface CsvReportInputPaths {
  assessmentTestPath: string;
  assessmentResultPath: string;
  outputRootDir: string;
}

export interface GeneratedCsvReport {
  candidateNumber: string;
  candidateName: string;
  testTitle: string;
  csvPath: string;
  rowCount: number;
  unusedItemResultIdentifiers: string[];
}

interface CsvItemModel {
  item: ParsedAssessmentItem;
  itemResult: ParsedItemResult;
  itemOrder: number;
  itemScore: number;
}

const CSV_FILE_NAME = "report.csv";

const CSV_HEADER = [
  "candidate_number",
  "candidate_name",
  "test_title",
  "total_score",
  "total_max_score",
  "item_order",
  "item_identifier",
  "item_title",
  "item_score",
  "item_max_score",
  "rubric_outcomes",
  "rubric_points",
  "response_values",
  "response_labels",
  "comment",
].join(",");

function escapeCsvField(value: string): string {
  const needsQuoting = /[",\n\r]/.test(value);
  if (!needsQuoting) {
    return value;
  }
  const escapedQuotes = value.replace(/"/g, "\"\"");
  return `"${escapedQuotes}"`;
}

function buildChoiceTextMap(item: ParsedAssessmentItem): Map<string, string> {
  const map = new Map<string, string>();
  item.choices.forEach((choice) => {
    map.set(choice.identifier, choice.text);
  });
  return map;
}

function formatResponseValues(responses: string[]): string {
  if (responses.length === 0) {
    return "";
  }
  return responses.join("\n");
}

function formatResponseLabels(item: ParsedAssessmentItem, responses: string[]): string {
  if (responses.length === 0) {
    return "";
  }
  const choiceTextMap = buildChoiceTextMap(item);
  const rendered = responses.map((response) => {
    const choiceText = choiceTextMap.get(response);
    if (!choiceText) {
      return response;
    }
    return `${response}: ${choiceText}`;
  });
  return rendered.join("\n");
}

function formatRubricOutcomes(item: ParsedAssessmentItem, itemResult: ParsedItemResult): string {
  if (item.rubricCriteria.length === 0) {
    return "";
  }
  return item.rubricCriteria
    .map((criterion) => {
      const outcome = itemResult.rubricOutcomes.get(criterion.index);
      if (outcome === undefined) {
        throw new Error(`Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`);
      }
      return `${criterion.index}:${outcome ? "true" : "false"}`;
    })
    .join(";");
}

function formatRubricPoints(item: ParsedAssessmentItem): string {
  if (item.rubricCriteria.length === 0) {
    return "";
  }
  return item.rubricCriteria.map((criterion) => `${criterion.index}:${criterion.points}`).join(";");
}

function computeItemScore(item: ParsedAssessmentItem, itemResult: ParsedItemResult): number {
  if (item.rubricCriteria.length > 0) {
    return item.rubricCriteria.reduce((sum, criterion) => {
      const met = itemResult.rubricOutcomes.get(criterion.index);
      if (met === undefined) {
        throw new Error(`Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`);
      }
      return met ? sum + criterion.points : sum;
    }, 0);
  }
  if (itemResult.score !== null) {
    return itemResult.score;
  }
  throw new Error(`Missing item score for ${item.identifier}`);
}

function computeTotalScore(assessmentResult: ParsedAssessmentResult, items: CsvItemModel[]): number {
  return items.reduce((sum, item) => sum + item.itemScore, 0);
}

function buildCsvRow(
  assessmentResult: ParsedAssessmentResult,
  totalScore: number,
  totalMaxScore: number,
  model: CsvItemModel,
): string {
  const responseValues = formatResponseValues(model.itemResult.responses);
  const responseLabels = formatResponseLabels(model.item, model.itemResult.responses);
  const rubricOutcomes = formatRubricOutcomes(model.item, model.itemResult);
  const rubricPoints = formatRubricPoints(model.item);
  const comment = model.itemResult.comment ?? "";

  const fields = [
    assessmentResult.candidateNumber,
    assessmentResult.candidateName,
    assessmentResult.testTitle,
    String(totalScore),
    String(totalMaxScore),
    String(model.itemOrder),
    model.item.identifier,
    model.item.title,
    String(model.itemScore),
    String(model.item.itemMaxScore),
    rubricOutcomes,
    rubricPoints,
    responseValues,
    responseLabels,
    comment,
  ];

  return fields.map((field) => escapeCsvField(field)).join(",");
}

function fileEndsWithLf(filePath: string): boolean {
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return false;
  }
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1);
    fs.readSync(fd, buffer, 0, 1, stats.size - 1);
    return buffer[0] === 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}

function writeCsv(csvPath: string, rows: string[]): void {
  const rowsText = rows.join("\n");
  const fileExists = fs.existsSync(csvPath);
  const hasContent = fileExists && fs.statSync(csvPath).size > 0;

  if (!hasContent) {
    const initialContent = rowsText.length > 0 ? `${CSV_HEADER}\n${rowsText}` : CSV_HEADER;
    fs.writeFileSync(csvPath, `\uFEFF${initialContent}`, "utf8");
    return;
  }

  if (rowsText.length === 0) {
    return;
  }

  const needsLeadingNewline = !fileEndsWithLf(csvPath);
  const prefix = needsLeadingNewline ? "\n" : "";
  fs.appendFileSync(csvPath, `${prefix}${rowsText}`, "utf8");
}

export function generateCsvReportFromFiles(paths: CsvReportInputPaths): GeneratedCsvReport {
  const assessmentTest = parseAssessmentTest(paths.assessmentTestPath);
  const assessmentResult = parseAssessmentResult(paths.assessmentResultPath);

  const assessmentItemIdentifiers = new Set(assessmentTest.itemRefs.map((itemRef) => itemRef.identifier));
  const unusedItemResultIdentifiers = Array.from(assessmentResult.itemResults.keys())
    .filter((identifier) => !assessmentItemIdentifiers.has(identifier))
    .sort();

  const items: CsvItemModel[] = assessmentTest.itemRefs.map((itemRef, index) => {
    const item = parseAssessmentItem(itemRef.itemPath, itemRef.identifier);
    const itemResult = assessmentResult.itemResults.get(item.identifier);
    if (!itemResult) {
      throw new Error(`Missing itemResult for ${item.identifier}`);
    }
    const itemScore = computeItemScore(item, itemResult);
    return {
      item,
      itemResult,
      itemOrder: index + 1,
      itemScore,
    };
  });

  const totalMaxScore = items.reduce((sum, item) => sum + item.item.itemMaxScore, 0);
  if (totalMaxScore <= 0) {
    throw new Error("Invalid maximum score: total maximum score must be greater than zero");
  }
  const totalScore = computeTotalScore(assessmentResult, items);

  const csvPath = path.join(paths.outputRootDir, CSV_FILE_NAME);
  fs.mkdirSync(paths.outputRootDir, { recursive: true });

  const rows = items.map((item) => buildCsvRow(assessmentResult, totalScore, totalMaxScore, item));
  writeCsv(csvPath, rows);

  return {
    candidateNumber: assessmentResult.candidateNumber,
    candidateName: assessmentResult.candidateName,
    testTitle: assessmentResult.testTitle,
    csvPath,
    rowCount: rows.length,
    unusedItemResultIdentifiers,
  };
}
