import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  parseAssessmentItem,
  ParsedAssessmentItem,
  RubricCriterion,
} from '../qti/assessmentItem.js';
import { resolveItemAssets } from '../qti/assetResolver.js';
import {
  parseAssessmentResult,
  ParsedAssessmentResult,
  ParsedItemResult,
} from '../qti/assessmentResult.js';
import { AssessmentTimeLimit, parseAssessmentTest } from '../qti/assessmentTest.js';
import { DEFAULT_STYLE_ELEMENT, EXTERNAL_STYLE_FILE_NAME } from './styles.js';
import { applyResponsesToPromptHtmlSafely } from './cloze.js';
import { escapeHtml } from './htmlEscape.js';

export interface HtmlReportInputPaths {
  assessmentTestPath: string;
  assessmentResultPath: string;
  outputRootDir: string;
  styleCssPath?: string;
}

export type StyleMode = 'default' | 'external';

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
  unusedItemResultIdentifiers: string[];
}

type ItemResultState = 'full' | 'partial' | 'zero';

interface StatusPillDefinition {
  icon: string;
  label: string;
}

const STATUS_PILLS: Record<ItemResultState, StatusPillDefinition> = {
  full: { icon: '&#10004;', label: '満点' },
  partial: { icon: '&#9650;', label: '要確認' },
  zero: { icon: '&#10007;', label: '0点' },
};

const COMMENT_ICON = '&#128172;';
const TOGGLE_CARET_ICON = '&#9656;';

interface ItemReportModel {
  item: ParsedAssessmentItem;
  itemResult: ParsedItemResult;
  itemOrder: number;
  itemTitle: string;
  itemScore: number;
  itemMaxScore: number;
  itemResultState: ItemResultState;
  hasComment: boolean;
  rubricRows: RubricRowModel[];
  candidateResponseHtml: string;
  commentHtml: string | null;
}

function computeItemResultState(itemScore: number, itemMaxScore: number): ItemResultState {
  if (itemScore <= 0) {
    return 'zero';
  }
  if (itemScore >= itemMaxScore) {
    return 'full';
  }
  return 'partial';
}

function resolveItemTitle(item: ParsedAssessmentItem): string {
  const title = item.title?.trim();
  return title && title.length > 0 ? title : item.identifier;
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

function buildChoiceHtmlMap(item: ParsedAssessmentItem): Map<string, string> {
  const map = new Map<string, string>();
  const dom = new JSDOM(item.questionHtml);
  const choices = dom.window.document.querySelectorAll('simple-choice');
  choices.forEach((choice) => {
    const identifier = choice.getAttribute('identifier');
    if (identifier) {
      map.set(identifier, choice.innerHTML);
    }
  });
  return map;
}

function formatChoiceResponses(item: ParsedAssessmentItem, responses: string[]): string {
  const choiceHtmlMap = buildChoiceHtmlMap(item);
  const selectedChoices = new Set(responses);
  const choiceRows = item.choices.map((choice) => {
    const isSelected = selectedChoices.has(choice.identifier);
    const rowClass = isSelected
      ? 'choice-response-option choice-response-selected'
      : 'choice-response-option';
    const marker = isSelected ? '●' : '○';
    const selectedLabel = isSelected ? '<span class="choice-response-label">学生の回答</span>' : '';
    const choiceHtml = choiceHtmlMap.get(choice.identifier) ?? escapeHtml(choice.text);
    return `<li class="${rowClass}"><span class="choice-response-marker" aria-hidden="true">${marker}</span><span class="choice-response-text">${choiceHtml}</span>${selectedLabel}</li>`;
  });
  const unmatchedRows = responses
    .filter(
      (response) =>
        !choiceHtmlMap.has(response) && !item.choices.some((c) => c.identifier === response)
    )
    .map(
      () =>
        '<li class="choice-response-option choice-response-selected choice-response-unmatched"><span class="choice-response-marker" aria-hidden="true">●</span><span class="choice-response-text">選択肢本文を取得できません</span><span class="choice-response-label">学生の回答</span></li>'
    );
  return `<ul class="choice-response-list">${[...choiceRows, ...unmatchedRows].join('')}</ul>`;
}

function formatCandidateResponses(item: ParsedAssessmentItem, responses: string[]): string {
  if (responses.length === 0) {
    return '<p class="response-empty">（無回答）</p>';
  }
  if (item.choices.length > 0) {
    return formatChoiceResponses(item, responses);
  }
  const renderedResponses = responses.map((response) => {
    return escapeHtml(response);
  });
  const joined = renderedResponses.join('\n');
  return `<pre class="response-text response-pre">${joined}</pre>`;
}

function formatClozeResponses(item: ParsedAssessmentItem, responses: string[]): string {
  if (!item.questionHtml.includes('qti-blank-input')) {
    return formatCandidateResponses(item, responses);
  }
  const filled = applyResponsesToPromptHtmlSafely(item.questionHtml, responses);
  return `<div class="candidate-response-html">${filled}</div>`;
}

function formatItemComment(comment: string | null): string | null {
  if (!comment) {
    return null;
  }
  const escaped = escapeHtml(comment);
  return `<pre class="comment-text comment-pre">${escaped}</pre>`;
}

function formatSeconds(seconds: number): string {
  const parts: string[] = [];
  const wholeDays = Math.floor(seconds / 86400);
  const wholeHours = Math.floor((seconds % 86400) / 3600);
  const wholeMinutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (wholeDays > 0) {
    parts.push(`${wholeDays}日`);
  }
  if (wholeHours > 0) {
    parts.push(`${wholeHours}時間`);
  }
  if (wholeMinutes > 0) {
    parts.push(`${wholeMinutes}分`);
  }
  if (remainingSeconds > 0) {
    parts.push(`${Number(remainingSeconds.toFixed(3))}秒`);
  }
  return parts.length > 0 ? parts.join('') : '0秒';
}

function formatTimeLimit(maxTime: string): string {
  const trimmedMaxTime = maxTime.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmedMaxTime)) {
    return formatSeconds(Number(trimmedMaxTime));
  }

  const match = trimmedMaxTime.match(
    /^P(?=.)(?:(\d+(?:\.\d+)?)D)?(?:T(?=.)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!match) {
    return maxTime;
  }

  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  const totalSeconds =
    Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return formatSeconds(totalSeconds);
}

function renderTimeLimitMetaRow(timeLimit: AssessmentTimeLimit | null): string {
  if (!timeLimit) {
    return '';
  }
  return `
          <div class="meta-row">
            <span class="meta-label">制限時間</span>
            <span class="meta-value">${escapeHtml(formatTimeLimit(timeLimit.maxTime))}</span>
          </div>`;
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

function buildRubricRows(
  item: ParsedAssessmentItem,
  itemResult: ParsedItemResult
): RubricRowModel[] {
  return item.rubricCriteria.map((criterion) => {
    const status = itemResult.rubricOutcomes.get(criterion.index);
    if (status === undefined) {
      throw new Error(
        `Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${item.identifier}`
      );
    }
    return { criterion, status };
  });
}

function renderRubricTable(rubricRows: RubricRowModel[]): string {
  if (rubricRows.length === 0) {
    return '';
  }
  const rowsHtml = rubricRows
    .map((row) => {
      const statusText = row.status ? 'true' : 'false';
      return `
        <tr data-criterion-index="${row.criterion.index}" data-criterion-status="${statusText}">
          <td class="criterion-text">${escapeHtml(row.criterion.text)}</td>
          <td class="criterion-points">${row.criterion.points}</td>
          <td class="criterion-status">${statusText}</td>
        </tr>`;
    })
    .join('');
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
  const pill = STATUS_PILLS[model.itemResultState];
  const statusPillHtml = `<span class="status-pill"><span class="ico" aria-hidden="true">${pill.icon}</span>${pill.label}</span>`;
  const commentFlagHtml = model.hasComment
    ? `<span class="comment-flag"><span class="ico" aria-hidden="true">${COMMENT_ICON}</span>コメントあり</span>`
    : '';
  const commentDataAttr = model.hasComment ? ' data-has-comment="true"' : '';
  const commentSectionHtml = model.commentHtml
    ? `
        <section class="comment-section">
          <h3 class="section-title">採点者コメント</h3>
          <div class="comment-content">
            ${model.commentHtml}
          </div>
        </section>`
    : '';
  return `
    <details class="item-block" data-item-result="${model.itemResultState}" data-item-identifier="${escapeHtml(
      model.item.identifier
    )}"${commentDataAttr}>
      <summary class="item-summary">
        ${statusPillHtml}
        <span class="item-head">
          <span class="item-title"><span class="item-no">問${model.itemOrder}</span>${escapeHtml(
            model.itemTitle
          )}</span>
          <span class="item-id">${escapeHtml(model.item.identifier)}</span>
        </span>
        <span class="item-spacer"></span>
        ${commentFlagHtml}
        <span class="item-score score-badge">
          <span class="score-value">${model.itemScore}</span>
          <span class="score-separator">/</span>
          <span class="score-max">${model.itemMaxScore}</span>
        </span>
        <span class="toggle-caret" aria-hidden="true">${TOGGLE_CARET_ICON}</span>
      </summary>
      <div class="item-content">
        <section class="question-section">
          <h3 class="section-title">問題</h3>
          ${model.item.questionHtml}
        </section>
        ${commentSectionHtml}
        ${rubricHtml}
        <section class="response-section">
          <h3 class="section-title">受験者の回答</h3>
          <details class="candidate-response-block">
            <summary>受験者の回答を表示</summary>
            <div class="candidate-response-content">
              ${model.candidateResponseHtml}
            </div>
          </details>
        </section>
      </div>
    </details>`;
}

function renderHtmlDocument(
  assessmentResult: ParsedAssessmentResult,
  testTitle: string,
  timeLimit: AssessmentTimeLimit | null,
  items: ItemReportModel[],
  totalScore: number,
  totalMaxScore: number,
  styleElement: string
): string {
  const itemsHtml = items.map((item) => renderItemBlock(item)).join('\n');
  const timeLimitMetaRow = renderTimeLimitMetaRow(timeLimit);
  const fullCount = items.filter((item) => item.itemResultState === 'full').length;
  const reviewCount = items.length - fullCount;
  const summaryBarHtml = `
        <div class="summary-bar">
          <span class="summary-chip review"><span class="ico" aria-hidden="true">&#9650;</span>要確認 <span class="summary-count">${reviewCount}</span> 問</span>
          <span class="summary-chip ok"><span class="ico" aria-hidden="true">&#10004;</span>満点 <span class="summary-count">${fullCount}</span> 問</span>
          <span class="summary-chip total">全 <span class="summary-count">${items.length}</span> 問</span>
        </div>`;
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(testTitle)} 結果</title>
    ${styleElement}
  </head>
  <body>
    <div class="report-root">
      <header class="report-header">
        <h1 class="report-title">${escapeHtml(testTitle)}</h1>
        <p class="report-subtitle">採点結果レポート</p>
        <div class="meta-grid">
          <div class="meta-row">
            <span class="meta-label">受験番号</span>
            <span class="meta-value">${escapeHtml(assessmentResult.candidateNumber)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">氏名</span>
            <span class="meta-value">${escapeHtml(assessmentResult.candidateName)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">合計得点</span>
            <span class="meta-value score-badge score-total">
              <span class="score-value">${totalScore}</span>
              <span class="score-separator">/</span>
              <span class="score-max">${totalMaxScore}</span>
            </span>
          </div>
          ${timeLimitMetaRow}
        </div>
        ${summaryBarHtml}
      </header>
      <main class="items-section">
        ${itemsHtml}
      </main>
    </div>
  </body>
</html>`;
}

function buildItemReportModel(
  item: ParsedAssessmentItem,
  itemResult: ParsedItemResult,
  itemOrder: number
): ItemReportModel {
  const itemMaxScore = item.itemMaxScore;
  const itemScore = computeItemScore(item, itemResult);
  const rubricRows = buildRubricRows(item, itemResult);
  const candidateResponseHtml = formatClozeResponses(item, itemResult.responses);
  const commentHtml = formatItemComment(itemResult.comment);
  return {
    item,
    itemResult,
    itemOrder,
    itemTitle: resolveItemTitle(item),
    itemScore,
    itemMaxScore,
    itemResultState: computeItemResultState(itemScore, itemMaxScore),
    hasComment: commentHtml !== null,
    rubricRows,
    candidateResponseHtml,
    commentHtml,
  };
}

function computeTotalScore(
  assessmentResult: ParsedAssessmentResult,
  items: ItemReportModel[]
): number {
  if (assessmentResult.testScore !== null) {
    return assessmentResult.testScore;
  }
  return items.reduce((sum, item) => sum + item.itemScore, 0);
}

function resolveStyle(styleCssPath: string | undefined, outputDirPath: string): ResolvedStyle {
  if (!styleCssPath) {
    return {
      styleMode: 'default',
      styleElement: DEFAULT_STYLE_ELEMENT,
      externalStylePath: null,
    };
  }

  if (!fs.existsSync(styleCssPath)) {
    throw new Error(`Style CSS file not found: ${styleCssPath}`);
  }
  const cssContent = fs.readFileSync(styleCssPath, 'utf8');
  if (cssContent.trim().length === 0) {
    throw new Error('Style CSS file is empty');
  }

  const externalStylePath = path.join(outputDirPath, EXTERNAL_STYLE_FILE_NAME);
  fs.writeFileSync(externalStylePath, cssContent, 'utf8');

  const styleElement = `<link rel="stylesheet" href="./${EXTERNAL_STYLE_FILE_NAME}" data-qti-reporter-style="external" />`;

  return {
    styleMode: 'external',
    styleElement,
    externalStylePath,
  };
}

export function generateHtmlReportFromFiles(paths: HtmlReportInputPaths): GeneratedHtmlReport {
  const assessmentTest = parseAssessmentTest(paths.assessmentTestPath);
  const assessmentResult = parseAssessmentResult(paths.assessmentResultPath);

  const assessmentItemIdentifiers = new Set(
    assessmentTest.itemRefs.map((itemRef) => itemRef.identifier)
  );
  const unusedItemResultIdentifiers = Array.from(assessmentResult.itemResults.keys())
    .filter((identifier) => !assessmentItemIdentifiers.has(identifier))
    .sort();

  const directoryName = `${assessmentResult.candidateNumber} ${assessmentResult.candidateName}`;
  const fileName = `${assessmentResult.candidateNumber} ${assessmentResult.candidateName} ${assessmentTest.title} 結果.html`;
  const outputDirPath = path.join(paths.outputRootDir, directoryName);
  const outputFilePath = path.join(outputDirPath, fileName);

  fs.mkdirSync(outputDirPath, { recursive: true });

  const items: ItemReportModel[] = assessmentTest.itemRefs.map((itemRef, itemIndex) => {
    const parsedItem = parseAssessmentItem(itemRef.itemPath, itemRef.identifier);
    const itemResult = assessmentResult.itemResults.get(parsedItem.identifier);
    if (!itemResult) {
      throw new Error(`Missing itemResult for ${parsedItem.identifier}`);
    }
    const resolvedAssets = resolveItemAssets(
      parsedItem.questionHtml,
      itemRef.itemPath,
      parsedItem.identifier,
      outputDirPath
    );
    const filledQuestionHtml = applyResponsesToPromptHtmlSafely(
      resolvedAssets.html,
      itemResult.responses
    );
    const item: ParsedAssessmentItem = {
      ...parsedItem,
      questionHtml: filledQuestionHtml,
    };
    return buildItemReportModel(item, itemResult, itemIndex + 1);
  });

  const totalScore = computeTotalScore(assessmentResult, items);
  const totalMaxScore = items.reduce((sum, item) => sum + item.itemMaxScore, 0);
  if (totalMaxScore <= 0) {
    throw new Error('Invalid maximum score: total maximum score must be greater than zero');
  }

  const resolvedStyle = resolveStyle(paths.styleCssPath, outputDirPath);
  const html = renderHtmlDocument(
    assessmentResult,
    assessmentTest.title,
    assessmentTest.timeLimit,
    items,
    totalScore,
    totalMaxScore,
    resolvedStyle.styleElement
  );

  fs.writeFileSync(outputFilePath, html, 'utf8');

  return {
    candidateNumber: assessmentResult.candidateNumber,
    candidateName: assessmentResult.candidateName,
    testTitle: assessmentTest.title,
    directoryName,
    fileName,
    outputDirPath,
    outputFilePath,
    html,
    styleMode: resolvedStyle.styleMode,
    externalStylePath: resolvedStyle.externalStylePath,
    unusedItemResultIdentifiers,
  };
}
