import fs from 'node:fs';
import path from 'node:path';

import {
  parseAssessmentItem,
  ParsedAssessmentItem,
  InteractionInfo,
} from '../qti/assessmentItem.js';
import {
  parseAssessmentResult,
  ParsedAssessmentResult,
  ParsedItemResponse,
  ParsedItemResult,
} from '../qti/assessmentResult.js';
import { parseAssessmentTest } from '../qti/assessmentTest.js';

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
  resolvedResponses: ParsedItemResponse[];
}

const CSV_FILE_NAME = 'report.csv';

const CSV_HEADER = [
  'candidate_number',
  'candidate_name',
  'test_title',
  'total_score',
  'total_max_score',
  'item_order',
  'item_identifier',
  'item_title',
  'item_score',
  'item_max_score',
  'rubric_outcomes',
  'rubric_points',
  'response_values',
  'response_labels',
  'comment',
].join(',');

function escapeCsvField(value: string): string {
  const needsQuoting = /[",\n\r]/.test(value);
  if (!needsQuoting) {
    return value;
  }
  const escapedQuotes = value.replace(/"/g, '""');
  return `"${escapedQuotes}"`;
}

function getSubmittedValuesForInteraction(
  responses: ParsedItemResponse[],
  interaction: InteractionInfo
): string[] {
  const directId = interaction.declarationIdentifier;
  if (directId) {
    const matched = responses
      .filter((entry) => entry.responseIdentifier === directId)
      .map((entry) => entry.value);
    if (matched.length > 0) {
      return matched;
    }
  }
  // 2. Fallback: responseVariable identifier == interaction.id.
  if (interaction.id && interaction.id !== directId) {
    const matched = responses
      .filter((entry) => entry.responseIdentifier === interaction.id)
      .map((entry) => entry.value);
    if (matched.length > 0) {
      return matched;
    }
  }
  // 3. Legacy ordered RESPONSE distribution.
  if (directId === 'RESPONSE' && interaction.declarationValueIndex !== null) {
    const legacyId = `RESPONSE_${interaction.declarationValueIndex + 1}`;
    const matched = responses
      .filter((entry) => entry.responseIdentifier === legacyId)
      .map((entry) => entry.value);
    if (matched.length > 0) {
      return matched;
    }
  }
  return [];
}

function formatResponseValuesForItem(model: CsvItemModel): string {
  if (model.item.interactions.length === 0) {
    if (model.resolvedResponses.length === 0) {
      return '';
    }
    return model.resolvedResponses.map((entry) => entry.value).join('\n');
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const interaction of model.item.interactions) {
    // Two interactions may bind to the same responseVariable (e.g. two
    // text-entry interactions sharing `response-identifier="RESPONSE"`); emit
    // each responseVariable's values only once.
    const dedupeKey = interaction.declarationIdentifier ?? interaction.id;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const values = getSubmittedValuesForInteraction(model.resolvedResponses, interaction);
    if (values.length === 0) {
      continue;
    }
    if (values.length === 1) {
      lines.push(values[0]);
    } else {
      lines.push(values.join('\n'));
    }
  }
  return lines.join('\n');
}

function formatResponseLabelsForItem(model: CsvItemModel): string {
  if (model.item.interactions.length === 0) {
    if (model.resolvedResponses.length === 0) {
      return '';
    }
    return model.resolvedResponses.map((entry) => entry.value).join('\n');
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const interaction of model.item.interactions) {
    const dedupeKey = interaction.declarationIdentifier ?? interaction.id;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const values = getSubmittedValuesForInteraction(model.resolvedResponses, interaction);
    if (values.length === 0) {
      continue;
    }
    for (const value of values) {
      const matchedChoice = interaction.choices.find((choice) => choice.identifier === value);
      if (matchedChoice) {
        lines.push(`${value}: ${matchedChoice.text}`);
      } else {
        lines.push(value);
      }
    }
  }
  return lines.join('\n');
}

function formatRubricOutcomes(item: ParsedAssessmentItem, itemResult: ParsedItemResult): string {
  if (item.rubricCriteria.length === 0) {
    return '';
  }
  return item.rubricCriteria
    .map((criterion) => {
      const outcome = itemResult.rubricOutcomes.get(criterion.index);
      if (outcome === undefined) {
        throw new Error(
          `Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`
        );
      }
      return `${criterion.index}:${outcome ? 'true' : 'false'}`;
    })
    .join(';');
}

function formatRubricPoints(item: ParsedAssessmentItem): string {
  if (item.rubricCriteria.length === 0) {
    return '';
  }
  return item.rubricCriteria.map((criterion) => `${criterion.index}:${criterion.points}`).join(';');
}

function computeItemScore(item: ParsedAssessmentItem, itemResult: ParsedItemResult): number {
  if (item.rubricCriteria.length > 0) {
    return item.rubricCriteria.reduce((sum, criterion) => {
      const met = itemResult.rubricOutcomes.get(criterion.index);
      if (met === undefined) {
        throw new Error(
          `Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`
        );
      }
      return met ? sum + criterion.points : sum;
    }, 0);
  }
  if (itemResult.score !== null) {
    return itemResult.score;
  }
  throw new Error(`Missing item score for ${item.identifier}`);
}

function computeTotalScore(
  assessmentResult: ParsedAssessmentResult,
  items: CsvItemModel[]
): number {
  if (assessmentResult.testScore !== null) {
    return assessmentResult.testScore;
  }
  return items.reduce((sum, item) => sum + item.itemScore, 0);
}

function buildCsvRow(
  assessmentResult: ParsedAssessmentResult,
  testTitle: string,
  totalScore: number,
  totalMaxScore: number,
  model: CsvItemModel
): string {
  const responseValues = formatResponseValuesForItem(model);
  const responseLabels = formatResponseLabelsForItem(model);
  const rubricOutcomes = formatRubricOutcomes(model.item, model.itemResult);
  const rubricPoints = formatRubricPoints(model.item);
  const comment = model.itemResult.comment ?? '';

  const fields = [
    assessmentResult.candidateNumber,
    assessmentResult.candidateName,
    testTitle,
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

  return fields.map((field) => escapeCsvField(field)).join(',');
}

function fileEndsWithLf(filePath: string): boolean {
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return false;
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1);
    fs.readSync(fd, buffer, 0, 1, stats.size - 1);
    return buffer[0] === 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}

function writeCsv(csvPath: string, rows: string[]): void {
  const rowsText = rows.join('\n');
  const fileExists = fs.existsSync(csvPath);
  const hasContent = fileExists && fs.statSync(csvPath).size > 0;

  if (!hasContent) {
    const initialContent = rowsText.length > 0 ? `${CSV_HEADER}\n${rowsText}` : CSV_HEADER;
    fs.writeFileSync(csvPath, `\uFEFF${initialContent}`, 'utf8');
    return;
  }

  if (rowsText.length === 0) {
    return;
  }

  const needsLeadingNewline = !fileEndsWithLf(csvPath);
  const prefix = needsLeadingNewline ? '\n' : '';
  fs.appendFileSync(csvPath, `${prefix}${rowsText}`, 'utf8');
}

export function generateCsvReportFromFiles(paths: CsvReportInputPaths): GeneratedCsvReport {
  const assessmentTest = parseAssessmentTest(paths.assessmentTestPath);
  const assessmentResult = parseAssessmentResult(paths.assessmentResultPath);

  const assessmentItemIdentifiers = new Set(
    assessmentTest.itemRefs.map((itemRef) => itemRef.identifier)
  );
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
      resolvedResponses: itemResult.responses,
    };
  });

  const totalMaxScore = items.reduce((sum, item) => sum + item.item.itemMaxScore, 0);
  if (totalMaxScore <= 0) {
    throw new Error('Invalid maximum score: total maximum score must be greater than zero');
  }
  const totalScore = computeTotalScore(assessmentResult, items);

  const csvPath = path.join(paths.outputRootDir, CSV_FILE_NAME);
  fs.mkdirSync(paths.outputRootDir, { recursive: true });

  const rows = items.map((item) =>
    buildCsvRow(assessmentResult, assessmentTest.title, totalScore, totalMaxScore, item)
  );
  writeCsv(csvPath, rows);

  return {
    candidateNumber: assessmentResult.candidateNumber,
    candidateName: assessmentResult.candidateName,
    testTitle: assessmentTest.title,
    csvPath,
    rowCount: rows.length,
    unusedItemResultIdentifiers,
  };
}
