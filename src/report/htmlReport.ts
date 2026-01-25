import fs from "node:fs";
import path from "node:path";

import { parseAssessmentItem, ParsedAssessmentItem, RubricCriterion } from "../qti/assessmentItem";
import { parseAssessmentResult, ParsedAssessmentResult, ParsedItemResult } from "../qti/assessmentResult";
import { parseAssessmentTest } from "../qti/assessmentTest";
import { DEFAULT_STYLE_ELEMENT, EXTERNAL_STYLE_FILE_NAME } from "./styles";

export interface HtmlReportInputPaths {
  assessmentTestPath: string;
  assessmentResultPath: string;
  outputRootDir: string;
  styleCssPath?: string;
}

export type StyleMode = "default" | "external";

export interface GeneratedHtmlReport {
  candidateNumber: string;
  candidateName: string;
  testTitle: string;
  directoryName: string;
  fileName: string;
  outputDirPath: string;
  outputFilePath: string;
  html: string;
  styleMode: StyleMode;
  externalStylePath: string | null;
}

interface ItemReportModel {
  item: ParsedAssessmentItem;
  itemResult: ParsedItemResult;
  itemScore: number;
  itemMaxScore: number;
  rubricRows: RubricRowModel[];
  candidateResponseHtml: string;
}

interface RubricRowModel {
  criterion: RubricCriterion;
  status: boolean;
}

interface ResolvedStyle {
  styleMode: StyleMode;
  styleElement: string;
  externalStylePath: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildChoiceTextMap(item: ParsedAssessmentItem): Map<string, string> {
  const map = new Map<string, string>();
  item.choices.forEach((choice) => {
    map.set(choice.identifier, choice.text);
  });
  return map;
}

function formatCandidateResponses(item: ParsedAssessmentItem, responses: string[]): string {
  if (responses.length === 0) {
    return "<p class=\"response-empty\">（無回答）</p>";
  }
  const choiceTextMap = buildChoiceTextMap(item);
  const renderedResponses = responses.map((response) => {
    const choiceText = choiceTextMap.get(response);
    if (choiceText) {
      return `${escapeHtml(response)}: ${escapeHtml(choiceText)}`;
    }
    return escapeHtml(response);
  });
  const joined = renderedResponses.join("<br />");
  return `<p class=\"response-text\">${joined}</p>`;
}

function computeItemScore(item: ParsedAssessmentItem, itemResult: ParsedItemResult): number {
  if (itemResult.score !== null) {
    return itemResult.score;
  }
  if (itemResult.rubricOutcomes.size > 0) {
    return item.rubricCriteria.reduce((sum, criterion) => {
      const met = itemResult.rubricOutcomes.get(criterion.index);
      if (met === undefined) {
        throw new Error(
          `Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`,
        );
      }
      return met ? sum + criterion.points : sum;
    }, 0);
  }
  throw new Error(`Missing item score for ${item.identifier}`);
}

function buildRubricRows(item: ParsedAssessmentItem, itemResult: ParsedItemResult): RubricRowModel[] {
  return item.rubricCriteria.map((criterion) => {
    const status = itemResult.rubricOutcomes.get(criterion.index);
    if (status === undefined) {
      throw new Error(`Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`);
    }
    return { criterion, status };
  });
}

function renderRubricTable(rubricRows: RubricRowModel[]): string {
  if (rubricRows.length === 0) {
    return "";
  }
  const rowsHtml = rubricRows
    .map((row) => {
      const statusText = row.status ? "true" : "false";
      return `
        <tr data-criterion-index="${row.criterion.index}" data-criterion-status="${statusText}">
          <td class="criterion-text">${escapeHtml(row.criterion.text)}</td>
          <td class="criterion-points">${row.criterion.points}</td>
          <td class="criterion-status">${statusText}</td>
        </tr>`;
    })
    .join("");
  return `
    <section class="rubric-section">
      <h3 class="section-title">観点別の達成状況</h3>
      <table class="rubric-table">
        <thead>
          <tr>
            <th>観点</th>
            <th>配点</th>
            <th>達成</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
      </table>
    </section>`;
}

function renderItemBlock(model: ItemReportModel): string {
  const rubricHtml = renderRubricTable(model.rubricRows);
  return `
    <details class="item-block" data-item-identifier="${escapeHtml(model.item.identifier)}">
      <summary class="item-summary">
        <span class="item-score">${model.itemScore} / ${model.itemMaxScore}</span>
        <span class="item-id">${escapeHtml(model.item.identifier)}</span>
      </summary>
      <div class="item-content">
        <section class="question-section">
          <h3 class="section-title">問題</h3>
          ${model.item.questionHtml}
        </section>
        ${rubricHtml}
        <details class="candidate-response-block">
          <summary>受験者の回答</summary>
          <div class="candidate-response-content">
            ${model.candidateResponseHtml}
          </div>
        </details>
      </div>
    </details>`;
}

function renderHtmlDocument(
  assessmentResult: ParsedAssessmentResult,
  items: ItemReportModel[],
  totalScore: number,
  totalMaxScore: number,
  styleElement: string,
): string {
  const itemsHtml = items.map((item) => renderItemBlock(item)).join("\n");
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(assessmentResult.testTitle)} 結果</title>
    ${styleElement}
  </head>
  <body>
    <div class="report-root">
      <header class="report-header">
        <h1 class="report-title">${escapeHtml(assessmentResult.testTitle)}</h1>
        <div class="meta-grid">
          <div class="meta-row"><span class="meta-label">受験番号</span>${escapeHtml(assessmentResult.candidateNumber)}</div>
          <div class="meta-row"><span class="meta-label">氏名</span>${escapeHtml(assessmentResult.candidateName)}</div>
          <div class="meta-row"><span class="meta-label">合計得点</span>${totalScore} / ${totalMaxScore}</div>
        </div>
      </header>
      <main class="items-section">
        ${itemsHtml}
      </main>
    </div>
  </body>
</html>`;
}

function buildItemReportModel(item: ParsedAssessmentItem, itemResult: ParsedItemResult): ItemReportModel {
  const itemMaxScore = item.itemMaxScore;
  const itemScore = computeItemScore(item, itemResult);
  const rubricRows = buildRubricRows(item, itemResult);
  const candidateResponseHtml = formatCandidateResponses(item, itemResult.responses);
  return {
    item,
    itemResult,
    itemScore,
    itemMaxScore,
    rubricRows,
    candidateResponseHtml,
  };
}

function computeTotalScore(assessmentResult: ParsedAssessmentResult, items: ItemReportModel[]): number {
  if (assessmentResult.testScore !== null) {
    return assessmentResult.testScore;
  }
  return items.reduce((sum, item) => sum + item.itemScore, 0);
}

function resolveStyle(styleCssPath: string | undefined, outputDirPath: string): ResolvedStyle {
  if (!styleCssPath) {
    return {
      styleMode: "default",
      styleElement: DEFAULT_STYLE_ELEMENT,
      externalStylePath: null,
    };
  }

  if (!fs.existsSync(styleCssPath)) {
    throw new Error(`Style CSS file not found: ${styleCssPath}`);
  }
  const cssContent = fs.readFileSync(styleCssPath, "utf8");
  if (cssContent.trim().length === 0) {
    throw new Error("Style CSS file is empty");
  }

  const externalStylePath = path.join(outputDirPath, EXTERNAL_STYLE_FILE_NAME);
  fs.writeFileSync(externalStylePath, cssContent, "utf8");

  const styleElement = `<link rel="stylesheet" href="./${EXTERNAL_STYLE_FILE_NAME}" data-qti-reporter-style="external" />`;

  return {
    styleMode: "external",
    styleElement,
    externalStylePath,
  };
}

export function generateHtmlReportFromFiles(paths: HtmlReportInputPaths): GeneratedHtmlReport {
  const assessmentTest = parseAssessmentTest(paths.assessmentTestPath);
  const assessmentResult = parseAssessmentResult(paths.assessmentResultPath);

  const items: ItemReportModel[] = assessmentTest.itemRefs.map((itemRef) => {
    const item = parseAssessmentItem(itemRef.itemPath, itemRef.identifier);
    const itemResult = assessmentResult.itemResults.get(item.identifier);
    if (!itemResult) {
      throw new Error(`Missing itemResult for ${item.identifier}`);
    }
    return buildItemReportModel(item, itemResult);
  });

  const totalScore = computeTotalScore(assessmentResult, items);
  const totalMaxScore = items.reduce((sum, item) => sum + item.itemMaxScore, 0);
  if (totalMaxScore <= 0) {
    throw new Error("Invalid maximum score: total maximum score must be greater than zero");
  }

  const directoryName = `${assessmentResult.candidateNumber} ${assessmentResult.candidateName}`;
  const fileName = `${assessmentResult.candidateNumber} ${assessmentResult.candidateName} ${assessmentResult.testTitle} 結果.html`;
  const outputDirPath = path.join(paths.outputRootDir, directoryName);
  const outputFilePath = path.join(outputDirPath, fileName);

  fs.mkdirSync(outputDirPath, { recursive: true });

  const resolvedStyle = resolveStyle(paths.styleCssPath, outputDirPath);
  const html = renderHtmlDocument(assessmentResult, items, totalScore, totalMaxScore, resolvedStyle.styleElement);

  fs.writeFileSync(outputFilePath, html, "utf8");

  return {
    candidateNumber: assessmentResult.candidateNumber,
    candidateName: assessmentResult.candidateName,
    testTitle: assessmentResult.testTitle,
    directoryName,
    fileName,
    outputDirPath,
    outputFilePath,
    html,
    styleMode: resolvedStyle.styleMode,
    externalStylePath: resolvedStyle.externalStylePath,
  };
}
