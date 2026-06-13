import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  parseAssessmentItem,
  parseAssessmentItemForScoring,
  parseCorrectResponses,
  ParsedAssessmentItem,
  type RubricCriterion,
} from '../qti/assessmentItem.js';
import { resolveExplanationAssets, resolveItemAssets } from '../qti/assetResolver.js';
import {
  parseAssessmentResult,
  ParsedAssessmentResult,
  ParsedItemResult,
} from '../qti/assessmentResult.js';
import { AssessmentTimeLimit, parseAssessmentTest } from '../qti/assessmentTest.js';
import { DEFAULT_STYLE_ELEMENT, EXTERNAL_STYLE_FILE_NAME } from './styles.js';
import { applyResponsesToPromptHtmlReadonly } from './cloze.js';
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
  retryQuestionHtml: string;
  submittedAnswerHtml: string;
  correctAnswerHtml: string | null;
  explanationHtml: string | null;
  hasExplanation: boolean;
  commentHtml: string | null;
}

export function computeItemResultState(itemScore: number, itemMaxScore: number): ItemResultState {
  if (itemMaxScore <= 0) {
    throw new Error(`Invalid maximum score for item: ${itemMaxScore}`);
  }
  if (itemScore < 0 || itemScore > itemMaxScore) {
    throw new Error(`Invalid item score: ${itemScore}/${itemMaxScore}`);
  }
  if (itemScore === itemMaxScore) {
    return 'full';
  }
  if (itemScore === 0) {
    return 'zero';
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

function sanitizeAttrSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

function buildRetryQuestionHtml(item: ParsedAssessmentItem): string {
  if (!item.choices.length && !item.questionHtml.includes('qti-blank-input')) {
    // descriptive or other non-cloze/non-choice items: ensure extended-text
    // placeholders turn into an empty textarea for the retake case.
    return wrapRetryQuestionBody(stripExtendedTextForRetry(item.questionHtml));
  }
  const dom = new JSDOM(`<div id="root">${item.questionHtml}</div>`);
  const root = dom.window.document.getElementById('root');
  if (!root) {
    return wrapRetryQuestionBody(item.questionHtml);
  }
  // 1) Convert choice interaction to native radio list.
  const choiceWrappers = Array.from(root.querySelectorAll('.choice-interaction'));
  choiceWrappers.forEach((wrapper) => {
    const radioName = `qti-retry-${sanitizeAttrSegment(item.identifier)}-RESPONSE`;
    const choices = Array.from(wrapper.querySelectorAll('simple-choice'));
    const list = dom.window.document.createElement('ul');
    list.className = 'choice-retry';
    list.setAttribute('data-retry-choice-list', item.identifier);
    if (choices.length === 0) {
      wrapper.replaceWith(list);
      return;
    }
    choices.forEach((choice) => {
      const label = dom.window.document.createElement('label');
      const input = dom.window.document.createElement('input');
      input.type = 'radio';
      input.name = radioName;
      // Use the choice text as the radio's `value` so the internal choice
      // identifier never appears in the retake body (not as text, not as an
      // attribute). The visible text is rendered into a sibling span.
      input.value = (choice.textContent ?? '').trim();
      input.className = 'choice-retry-radio';
      const labelSpan = dom.window.document.createElement('span');
      labelSpan.className = 'choice-retry-text';
      labelSpan.innerHTML = choice.innerHTML;
      label.appendChild(input);
      label.appendChild(labelSpan);
      const li = dom.window.document.createElement('li');
      li.className = 'choice-retry-item';
      li.appendChild(label);
      list.appendChild(li);
    });
    wrapper.replaceWith(list);
  });

  // 2) Strip readonly/disabled/value from cloze inputs and rename the class
  // so external CSS can style retake vs read-only inputs independently.
  const clozeInputs = Array.from(root.querySelectorAll('input.qti-blank-input'));
  clozeInputs.forEach((input) => {
    input.removeAttribute('readonly');
    input.removeAttribute('disabled');
    input.removeAttribute('value');
    const classAttr = input.getAttribute('class') ?? '';
    const classes = new Set(classAttr.split(/\s+/).filter((token) => token.length > 0));
    classes.add('cloze-input');
    classes.add('qti-blank-input');
    classes.delete('cloze-input-readonly');
    input.setAttribute('class', Array.from(classes).join(' '));
  });

  return wrapRetryQuestionBody(root.innerHTML);
}

function wrapRetryQuestionBody(innerHtml: string): string {
  return `<div class="retry-question-block" data-retry-question="${'true'}">${innerHtml}</div>`;
}

function stripExtendedTextForRetry(html: string): string {
  // Replace any extended-text placeholder with an empty textarea so the retake
  // case is editable. The renderer does not emit a textarea by default for
  // `qti-extended-text-interaction` in the report path, so we keep the
  // container if no placeholder is present (i.e. descriptive item with no
  // existing response surface).
  if (!html.includes('qti-extended-placeholder') && !html.includes('qti-extended-text')) {
    // Add an empty textarea as the response surface.
    return `${html}<textarea class="retake-textarea" data-retry-textarea="true" aria-label="answer"></textarea>`;
  }
  return html.replace(
    /<span\b[^>]*class="[^"]*\bqti-extended-placeholder\b[^"]*"[^>]*>[\s\S]*?<\/span>/g,
    '<textarea class="retake-textarea" data-retry-textarea="true" aria-label="answer"></textarea>'
  );
}

function buildSubmittedAnswerHtml(item: ParsedAssessmentItem, responses: string[]): string {
  if (item.choices.length > 0) {
    return formatChoiceResponses(item, responses);
  }
  if (item.questionHtml.includes('qti-blank-input')) {
    const filled = applyResponsesToPromptHtmlReadonly(item.questionHtml, responses);
    return `<div class="candidate-response-html">${filled}</div>`;
  }
  return formatCandidateResponses(item, responses);
}

function buildCorrectAnswerHtml(
  item: ParsedAssessmentItem,
  correctResponses: ReturnType<typeof parseCorrectResponses>
): string | null {
  const choiceCorrect = correctResponses.find(
    (response) => response.interactionType === 'choice' && response.values.length > 0
  );
  const clozeCorrect = correctResponses.filter(
    (response) => response.interactionType === 'text' && response.values.length > 0
  );
  if (!choiceCorrect && clozeCorrect.length === 0) {
    return null;
  }

  if (item.choices.length > 0 && choiceCorrect) {
    const correctId = choiceCorrect.values[0];
    const matched = item.choices.find((c) => c.identifier === correctId);
    if (!matched) return null;
    // Render the choice text using the same choice-inner HTML as the
    // question body (with `code-inline` markup preserved), so the student
    // sees the same label as the original question.
    const choiceInnerHtml = lookupChoiceInnerHtml(item, correctId) ?? escapeHtml(matched.text);
    return `<div class="correct-answer-content"><span class="correct-answer-text">${choiceInnerHtml}</span></div>`;
  }

  if (item.questionHtml.includes('qti-blank-input') && clozeCorrect.length > 0) {
    const correctValues = clozeCorrect.flatMap((entry) => entry.values);
    if (correctValues.length === 0) return null;
    const filled = applyResponsesToPromptHtmlReadonly(item.questionHtml, correctValues);
    return `<div class="correct-answer-content">${filled}</div>`;
  }

  return null;
}

function lookupChoiceInnerHtml(item: ParsedAssessmentItem, identifier: string): string | null {
  try {
    const dom = new JSDOM(`<div id="root">${item.questionHtml}</div>`);
    const root = dom.window.document.getElementById('root');
    if (!root) return null;
    const choices = Array.from(root.querySelectorAll('simple-choice'));
    const match = choices.find((choice) => choice.getAttribute('identifier') === identifier);
    return match ? match.innerHTML : null;
  } catch {
    return null;
  }
}

function buildExplanationHtml(
  explanationHtml: string | null,
  itemPath: string,
  itemIdentifier: string,
  outputDirPath: string
): string | null {
  if (!explanationHtml) {
    return null;
  }
  const resolved = resolveExplanationAssets(
    explanationHtml,
    itemPath,
    itemIdentifier,
    outputDirPath
  );
  return applyReportCodeHighlighting(resolved.html);
}

function applyReportCodeHighlighting(html: string): string {
  // Mirror the report path's class injection for `<pre><code>` and inline
  // `<code>` blocks so the explanation body uses the same `.code-block`,
  // `.code-block-code`, `data-code-lang`, and `.code-inline` surface as the
  // question body. The hljs markup itself is produced by the scorer path's
  // `renderNodeForScoring`, which we re-emit verbatim.
  if (html.length === 0) {
    return html;
  }
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  if (!root) {
    return html;
  }

  const codeBlocks = Array.from(root.querySelectorAll('pre > code'));
  codeBlocks.forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    const codeOpen = code.outerHTML.match(/^<code\b[^>]*>/)?.[0] ?? '<code>';
    const codeClasses = (code.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0);
    if (!codeClasses.includes('code-block-code')) {
      codeClasses.push('code-block-code');
    }
    code.setAttribute('class', codeClasses.join(' '));

    const preClasses = (pre.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0);
    if (!preClasses.includes('code-block')) {
      preClasses.push('code-block');
    }
    if (!preClasses.includes('hljs')) {
      preClasses.push('hljs');
    }
    pre.setAttribute('class', preClasses.join(' '));

    const explicitLang = readLanguageFromOpenTag(codeOpen);
    const dataLang =
      code.getAttribute('data-code-lang') ?? pre.getAttribute('data-code-lang') ?? '';
    const language = (explicitLang ?? dataLang ?? 'plain').trim() || 'plain';
    if (!pre.getAttribute('data-code-lang')) {
      pre.setAttribute('data-code-lang', language);
    }
    if (!code.getAttribute('data-code-lang')) {
      code.setAttribute('data-code-lang', language);
    }
  });

  const inlineCodes = Array.from(root.querySelectorAll('code:not(pre code):not(.code-block-code)'));
  inlineCodes.forEach((code) => {
    const existing = (code.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0);
    if (!existing.includes('code-inline')) {
      existing.push('code-inline');
    }
    code.setAttribute('class', existing.join(' '));
  });

  return root.innerHTML;
}

function readLanguageFromOpenTag(openTag: string): string | null {
  const dataMatch = openTag.match(/\bdata-(?:lang|language|code-lang)\s*=\s*"([^"]*)"/i);
  if (dataMatch) return dataMatch[1];
  const classMatch = openTag.match(/\bclass\s*=\s*"([^"]*)"/i);
  if (!classMatch) return null;
  const tokens = classMatch[1].split(/\s+/);
  for (const token of tokens) {
    const match = token.match(/^(?:language|lang)-([A-Za-z0-9_-]+)$/);
    if (match) return match[1];
  }
  return null;
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

function renderAnswerExplanationSection(model: ItemReportModel): string {
  const correctBlock = model.correctAnswerHtml
    ? `
          <details class="correct-answer-block" data-answer-section="correct">
            <summary>正解を表示</summary>
            <div class="correct-answer-content-wrapper">
              ${model.correctAnswerHtml}
            </div>
          </details>`
    : '';
  const explanationBlock = model.explanationHtml
    ? `
          <details class="answer-explanation-block" data-answer-section="explanation">
            <summary>解説を表示</summary>
            <div class="answer-explanation-content-wrapper">
              ${model.explanationHtml}
            </div>
          </details>`
    : '';
  if (!correctBlock && !explanationBlock) {
    return '';
  }
  return `
        <section class="answer-explanation-section">
          <h3 class="section-title">解答・解説</h3>
          ${correctBlock}${explanationBlock}
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
  const answerExplanationSectionHtml = renderAnswerExplanationSection(model);
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
          ${model.retryQuestionHtml}
        </section>
        ${commentSectionHtml}
        ${rubricHtml}
        <section class="response-section">
          <h3 class="section-title">受験者の回答</h3>
          <details class="candidate-response-block">
            <summary>受験者の回答を表示</summary>
            <div class="candidate-response-content">
              ${model.submittedAnswerHtml}
            </div>
          </details>
        </section>
        ${answerExplanationSectionHtml}
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
  itemOrder: number,
  retryQuestionHtml: string,
  submittedAnswerHtml: string,
  correctAnswerHtml: string | null,
  explanationHtml: string | null
): ItemReportModel {
  const itemMaxScore = item.itemMaxScore;
  const itemScore = computeItemScore(item, itemResult);
  const rubricRows = buildRubricRows(item, itemResult);
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
    retryQuestionHtml,
    submittedAnswerHtml,
    correctAnswerHtml,
    explanationHtml,
    hasExplanation: explanationHtml !== null,
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
    const parsedScoring = parseAssessmentItemForScoring(itemRef.itemPath);
    const correctResponses = parseCorrectResponses(itemRef.itemPath);
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
    // The retake body is the asset-resolved question body, stripped of any
    // pre-filled response and any readonly/disabled state on cloze inputs,
    // with choice items rendered as native radio inputs.
    const itemForRetry: ParsedAssessmentItem = {
      ...parsedItem,
      questionHtml: resolvedAssets.html,
    };
    const retryQuestionHtml = buildRetryQuestionHtml(itemForRetry);
    // The submitted-answer body lives inside the existing inner
    // `<details class="candidate-response-block">` and shows the actually
    // submitted value (read-only cloze inputs, choice text, or descriptive
    // text). It uses the asset-resolved HTML too, so question images resolve
    // identically to the retake body.
    const itemForSubmission: ParsedAssessmentItem = {
      ...parsedItem,
      questionHtml: resolvedAssets.html,
    };
    const submittedAnswerHtml = buildSubmittedAnswerHtml(itemForSubmission, itemResult.responses);
    const correctAnswerHtml = buildCorrectAnswerHtml(parsedItem, correctResponses);
    const explanationHtml = buildExplanationHtml(
      parsedScoring.candidateExplanationHtml,
      itemRef.itemPath,
      parsedItem.identifier,
      outputDirPath
    );
    return buildItemReportModel(
      { ...parsedItem, questionHtml: resolvedAssets.html },
      itemResult,
      itemIndex + 1,
      retryQuestionHtml,
      submittedAnswerHtml,
      correctAnswerHtml,
      explanationHtml
    );
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
