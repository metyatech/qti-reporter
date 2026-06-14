import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  parseAssessmentItem,
  type ParsedAssessmentItem,
  type InteractionInfo,
  type RubricCriterion,
} from '../qti/assessmentItem.js';
import { resolveExplanationAssets, resolveItemAssets } from '../qti/assetResolver.js';
import {
  parseAssessmentResult,
  ParsedAssessmentResult,
  ParsedItemResponse,
  ParsedItemResult,
} from '../qti/assessmentResult.js';
import { AssessmentTimeLimit, parseAssessmentTest } from '../qti/assessmentTest.js';
import { DEFAULT_STYLE_ELEMENT, EXTERNAL_STYLE_FILE_NAME } from './styles.js';
import { escapeHtml } from './htmlEscape.js';
import { resolveSubmittedValues } from './interactionResponses.js';
import { dropEmptyResponseValues } from './responseValues.js';

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

function sanitizeAttrSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

function perInteractionNamePrefix(itemIdentifier: string, index: number): string {
  return `qti-candidate-${sanitizeAttrSegment(itemIdentifier)}-${index}`;
}

interface ItemAnswerBodies {
  retryQuestionHtml: string;
  submittedAnswerHtml: string;
  correctAnswerHtml: string | null;
}

type ChoiceEntry = { interaction: InteractionInfo; interactionIndex: number };

function selectChoiceEntries(item: ParsedAssessmentItem): ChoiceEntry[] {
  return item.interactions
    .map((interaction, interactionIndex) => ({ interaction, interactionIndex }))
    .filter((entry) => entry.interaction.type === 'choice');
}

function buildChoiceRenderInfoFromRoot(
  root: Element,
  choiceEntries: ChoiceEntry[]
): ChoiceRenderInfo[] {
  const wrappers = Array.from(root.querySelectorAll('div.choice-interaction'));
  return choiceEntries.map((entry) => {
    const wrapper = wrappers.shift();
    const map = new Map<string, string>();
    if (wrapper) {
      const choices = Array.from(wrapper.querySelectorAll('simple-choice'));
      for (const choice of choices) {
        const identifier = choice.getAttribute('identifier');
        if (identifier) {
          map.set(identifier, choice.innerHTML);
        }
      }
    }
    return {
      interaction: entry.interaction,
      interactionIndex: entry.interactionIndex,
      choiceInnerHtmlByIdentifier: map,
    };
  });
}

/**
 * Parse the item's `questionHtml` with JSDOM exactly once. Returns the
 * document and the wrapping root `<div>`. This is the only place in this
 * file that constructs a JSDOM instance: every per-item consumer
 * (candidate-response, correct-answer, retry-question) reads from this
 * single parse. The retry builder mutates a `cloneNode(true)` of the
 * root so the shared parse is never disturbed.
 */
function parseQuestionHtmlForChoices(item: ParsedAssessmentItem): {
  dom: JSDOM;
  root: Element | null;
} {
  const dom = new JSDOM(`<div id="root">${item.questionHtml}</div>`);
  return { dom, root: dom.window.document.getElementById('root') };
}

/**
 * Build the retry-question, submitted-answer, and correct-answer bodies for a
 * single item. For choice items the item's `questionHtml` is parsed with
 * JSDOM exactly once; the same parsed root feeds the per-interaction choice
 * render info that the candidate-response and correct-answer bodies share,
 * and the retry body mutates a `cloneNode(true)` of that root so it never
 * disturbs the shared parse. Non-choice descriptive items take a no-DOM path.
 */
function buildItemAnswerBodies(
  item: ParsedAssessmentItem,
  itemResult: ParsedItemResult
): ItemAnswerBodies {
  const choiceEntries = selectChoiceEntries(item);
  const hasClozeInputs = item.questionHtml.includes('qti-blank-input');
  const needsChoiceDom = choiceEntries.length > 0;
  const needsRetryDom = item.choices.length > 0 || hasClozeInputs;

  let choiceRenderInfo: ChoiceRenderInfo[] = [];
  let retryQuestionHtml: string;

  if (!needsChoiceDom && !needsRetryDom) {
    // Descriptive item (no choice interactions, no cloze inputs): the retry
    // body only needs the textarea transform, so no JSDOM parse happens.
    retryQuestionHtml = wrapRetryQuestionBody(stripExtendedTextForRetry(item.questionHtml));
  } else {
    const { dom, root } = parseQuestionHtmlForChoices(item);
    if (!root) {
      choiceRenderInfo = choiceEntries.map((entry) => ({
        interaction: entry.interaction,
        interactionIndex: entry.interactionIndex,
        choiceInnerHtmlByIdentifier: new Map<string, string>(),
      }));
      retryQuestionHtml = needsRetryDom
        ? wrapRetryQuestionBody(item.questionHtml)
        : wrapRetryQuestionBody(stripExtendedTextForRetry(item.questionHtml));
    } else {
      choiceRenderInfo = needsChoiceDom ? buildChoiceRenderInfoFromRoot(root, choiceEntries) : [];
      if (needsRetryDom) {
        const retryRoot = root.cloneNode(true) as Element;
        retryQuestionHtml = buildRetryQuestionFromRoot(dom, retryRoot, item, choiceRenderInfo);
      } else {
        retryQuestionHtml = wrapRetryQuestionBody(stripExtendedTextForRetry(item.questionHtml));
      }
    }
  }

  return {
    retryQuestionHtml,
    submittedAnswerHtml: buildSubmittedAnswerHtml(item, itemResult, choiceRenderInfo),
    correctAnswerHtml: buildCorrectAnswerHtml(item, choiceRenderInfo),
  };
}

interface ChoiceRenderInfo {
  interaction: InteractionInfo;
  interactionIndex: number;
  choiceInnerHtmlByIdentifier: Map<string, string>;
}

/**
 * Empty-value filtering is delegated to `./responseValues.js` — the shared
 * rule is `value.length === 0`. Whitespace-only values (spaces, tabs,
 * newlines) and values with leading/trailing whitespace are NOT considered
 * empty and are kept verbatim; the shared helper never trims.
 */

function resolveChoiceInnerHtml(
  choiceInnerHtmlByIdentifier: Map<string, string>,
  interaction: InteractionInfo,
  choiceIdentifier: string
): string | null {
  if (choiceInnerHtmlByIdentifier.has(choiceIdentifier)) {
    return choiceInnerHtmlByIdentifier.get(choiceIdentifier) ?? null;
  }
  return null;
}

function buildSubmittedAnswerHtml(
  item: ParsedAssessmentItem,
  itemResult: ParsedItemResult,
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  if (item.interactions.length === 0) {
    return formatDescriptiveResponse(itemResult.responses);
  }
  const rows = item.interactions
    .map((interaction, index) =>
      renderCandidateResponseSection(
        item,
        itemResult.responses,
        interaction,
        index,
        choiceRenderInfo
      )
    )
    .join('');
  return `<div class="candidate-response-per-interaction">${rows}</div>`;
}

function formatDescriptiveResponse(responses: ParsedItemResponse[]): string {
  const allValues = dropEmptyResponseValues(responses.flatMap((response) => response.values));
  if (allValues.length === 0) {
    return '<p class="response-empty">（無回答）</p>';
  }
  const joined = allValues.map((value) => escapeHtml(value)).join('\n');
  return `<pre class="response-text response-pre">${joined}</pre>`;
}

function renderCandidateResponseSection(
  item: ParsedAssessmentItem,
  responses: ParsedItemResponse[],
  interaction: InteractionInfo,
  index: number,
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  const idAttr = interaction.id ? ` data-interaction-id="${escapeHtml(interaction.id)}"` : '';
  const nameAttr = ` data-candidate-name="${escapeHtml(perInteractionNamePrefix(item.identifier, index))}"`;
  const submittedValues = resolveSubmittedValues(responses, interaction);

  if (interaction.type === 'choice') {
    return `<div class="candidate-response-interaction"${idAttr}${nameAttr}>${renderChoiceCandidateBody(item.identifier, index, interaction, submittedValues, choiceRenderInfo)}</div>`;
  }
  if (interaction.type === 'text-entry' || interaction.type === 'extended-text') {
    return `<div class="candidate-response-interaction"${idAttr}${nameAttr}>${renderTextCandidateBody(interaction, submittedValues)}</div>`;
  }
  return `<div class="candidate-response-interaction"${idAttr}${nameAttr}>${renderDescriptiveTextCandidateBody(submittedValues)}</div>`;
}

function renderDescriptiveTextCandidateBody(values: string[]): string {
  const kept = dropEmptyResponseValues(values);
  if (kept.length === 0) {
    return '<p class="response-empty">（無回答）</p>';
  }
  const joined = kept.map((value) => escapeHtml(value)).join('\n');
  return `<pre class="response-text response-pre">${joined}</pre>`;
}

function renderTextCandidateBody(interaction: InteractionInfo, values: string[]): string {
  const idLabel = interaction.id
    ? `<p class="response-interaction-label">${escapeHtml(interaction.id)}</p>`
    : '';
  const kept = dropEmptyResponseValues(values);
  if (kept.length === 0) {
    return `${idLabel}<p class="response-empty">（無回答）</p>`;
  }
  if (interaction.type === 'extended-text') {
    const escaped = kept.map((value) => escapeHtml(value)).join('\n');
    return `${idLabel}<pre class="response-text response-pre">${escaped}</pre>`;
  }
  // text-entry: render each value as a read-only cloze input so existing CSS
  // (`.cloze-input.qti-blank-input[readonly]`) and tests keep working.
  const inputs = kept
    .map((value) => {
      const escaped = escapeHtml(value);
      const size = Math.max(6, value.length);
      return `<input class="cloze-input qti-blank-input cloze-input-readonly" type="text" value="${escaped}" size="${size}" readonly data-interaction-id="${escapeHtml(interaction.id)}" />`;
    })
    .join('');
  return `${idLabel}${inputs}`;
}

function renderChoiceCandidateBody(
  itemIdentifier: string,
  index: number,
  interaction: InteractionInfo,
  submittedValues: string[],
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  // Drop strictly-empty values (`<value/>` / `<value></value>`) so an
  // empty-only submission falls into the `（無回答）` branch below, and
  // so any empty slot mixed with real choices does not produce a phantom
  // "選択肢本文を取得できません" unmatched row. Whitespace-only values
  // are kept verbatim (e.g. `" "` remains a real unmatched choice).
  const keptValues = dropEmptyResponseValues(submittedValues);
  const submittedSet = new Set(keptValues);
  const isMultiple = interaction.cardinality === 'multiple';
  const inputType = isMultiple ? 'checkbox' : 'radio';
  const name = `qti-candidate-${sanitizeAttrSegment(itemIdentifier)}-${index}-${sanitizeAttrSegment(interaction.id ?? '')}`;
  const renderInfo = choiceRenderInfo.find((entry) => entry.interactionIndex === index);
  const choiceInnerHtmlByIdentifier = renderInfo?.choiceInnerHtmlByIdentifier ?? new Map();

  const submittedLabel = interaction.id
    ? `<p class="response-interaction-label">${escapeHtml(interaction.id)}</p>`
    : '';
  if (keptValues.length === 0) {
    return `${submittedLabel}<p class="response-empty">（無回答）</p>`;
  }

  const rows = interaction.choices.map((choice) => {
    const isSelected = submittedSet.has(choice.identifier);
    const optionClasses = ['choice-response-option'];
    if (isSelected) optionClasses.push('choice-response-selected');
    const marker = isSelected ? '●' : '○';
    const labelTag = isSelected ? '<span class="choice-response-label">学生の回答</span>' : '';
    const labelInner =
      resolveChoiceInnerHtml(choiceInnerHtmlByIdentifier, interaction, choice.identifier) ??
      escapeHtml(choice.text);
    // Use the choice text as the radio/checkbox `value` so the internal
    // choice identifier never appears in the candidate-response body.
    const radioValue = choice.text.replace(/\s+/g, ' ').trim();
    return `<li class="${optionClasses.join(' ')}"><span class="choice-response-marker" aria-hidden="true">${marker}</span><span class="choice-response-text"><label><input type="${inputType}" name="${escapeHtml(name)}" value="${escapeHtml(radioValue)}"${isSelected ? ' checked' : ''} disabled>${labelInner}</label></span>${labelTag}</li>`;
  });

  const unmatched = keptValues
    .filter((value) => !interaction.choices.some((choice) => choice.identifier === value))
    .map(
      () =>
        '<li class="choice-response-option choice-response-selected choice-response-unmatched"><span class="choice-response-marker" aria-hidden="true">●</span><span class="choice-response-text">選択肢本文を取得できません</span><span class="choice-response-label">学生の回答</span></li>'
    );

  return `${submittedLabel}<ul class="choice-response-list">${[...rows, ...unmatched].join('')}</ul>`;
}

function buildCorrectAnswerHtml(
  item: ParsedAssessmentItem,
  choiceRenderInfo: ChoiceRenderInfo[]
): string | null {
  const hasAnyCorrect = item.interactions.some(
    (interaction) => interaction.correctResponse.length > 0
  );
  if (!hasAnyCorrect) {
    return null;
  }
  // Preserve the original `interactionIndex` from `item.interactions` even
  // when we filter out interactions that have no correct response. The
  // post-filter index would otherwise shift the second interaction's
  // display index from 1 to 0 and pick up the previous interaction's
  // choice text/image.
  const rows = item.interactions
    .map((interaction, interactionIndex) => ({ interaction, interactionIndex }))
    .filter(({ interaction }) => interaction.correctResponse.length > 0)
    .map(({ interaction, interactionIndex }) =>
      renderCorrectAnswerSection(interaction, interactionIndex, item.identifier, choiceRenderInfo)
    )
    .join('');
  if (rows.length === 0) {
    return null;
  }
  return `<div class="correct-answer-per-interaction">${rows}</div>`;
}

function renderCorrectAnswerSection(
  interaction: InteractionInfo,
  index: number,
  itemIdentifier: string,
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  const idAttr = interaction.id ? ` data-interaction-id="${escapeHtml(interaction.id)}"` : '';
  const nameAttr = ` data-candidate-name="${escapeHtml(perInteractionNamePrefix(itemIdentifier, index))}"`;
  if (interaction.type === 'choice') {
    return `<div class="correct-answer-interaction"${idAttr}${nameAttr}>${renderChoiceCorrectBody(interaction, index, choiceRenderInfo)}</div>`;
  }
  return `<div class="correct-answer-interaction"${idAttr}${nameAttr}>${renderTextCorrectBody(interaction)}</div>`;
}

function renderTextCorrectBody(interaction: InteractionInfo): string {
  const label = interaction.id
    ? `<p class="response-interaction-label">${escapeHtml(interaction.id)}</p>`
    : '';
  // `correctResponse` is sourced from the renderer's `InteractionInfo`. It
  // is rarely empty in practice, but we apply the same drop-empties rule
  // as the candidate-response body for consistency. Strictly empty strings
  // are dropped; whitespace-only values (including tabs and newlines) and
  // values with leading/trailing whitespace are kept verbatim.
  const kept = dropEmptyResponseValues(interaction.correctResponse);
  if (kept.length === 0) {
    return `${label}<p class="response-empty">（正解情報なし）</p>`;
  }
  if (interaction.type === 'extended-text') {
    const joined = kept.map((value) => escapeHtml(value)).join('\n');
    return `${label}<pre class="response-text response-pre">${joined}</pre>`;
  }
  // text-entry: render each correct value as a read-only cloze input so the
  // existing styling and tests keep working.
  const inputs = kept
    .map((value) => {
      const escaped = escapeHtml(value);
      const size = Math.max(6, value.length);
      return `<input class="cloze-input qti-blank-input cloze-input-readonly" type="text" value="${escaped}" size="${size}" readonly data-interaction-id="${escapeHtml(interaction.id)}" />`;
    })
    .join('');
  return `${label}${inputs}`;
}

function renderChoiceCorrectBody(
  interaction: InteractionInfo,
  index: number,
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  const label = interaction.id
    ? `<p class="response-interaction-label">${escapeHtml(interaction.id)}</p>`
    : '';
  const correctIds = new Set(interaction.correctResponse);
  const renderInfo = choiceRenderInfo.find((entry) => entry.interactionIndex === index);
  const choiceInnerHtmlByIdentifier = renderInfo?.choiceInnerHtmlByIdentifier ?? new Map();
  const rows = interaction.choices
    .filter((choice) => correctIds.has(choice.identifier))
    .map((choice) => {
      const labelInner =
        resolveChoiceInnerHtml(choiceInnerHtmlByIdentifier, interaction, choice.identifier) ??
        escapeHtml(choice.text);
      return `<li class="choice-response-option choice-response-selected"><span class="choice-response-marker" aria-hidden="true">●</span><span class="choice-response-text">${labelInner}</span><span class="choice-response-label">正解</span></li>`;
    });
  if (rows.length === 0) {
    return `${label}<p class="response-empty">（正解情報なし）</p>`;
  }
  return `${label}<ul class="choice-response-list">${rows.join('')}</ul>`;
}

function buildRetryQuestionFromRoot(
  dom: JSDOM,
  root: Element,
  item: ParsedAssessmentItem,
  choiceRenderInfo: ChoiceRenderInfo[]
): string {
  const choiceWrappers = Array.from(root.querySelectorAll('.choice-interaction'));
  const choiceInteractionIter = choiceRenderInfo[Symbol.iterator]();
  choiceWrappers.forEach((wrapper) => {
    const interactionId = wrapper.getAttribute('data-interaction-id') ?? '';
    const next = choiceInteractionIter.next();
    const renderInfo = next.done ? null : next.value;
    const interactionIndex = renderInfo?.interactionIndex ?? -1;
    const fallbackIndex = renderInfo === null ? String(choiceWrappers.indexOf(wrapper)) : '';
    const indexSegment = interactionIndex >= 0 ? String(interactionIndex) : fallbackIndex || '0';
    const radioName = `qti-retry-${sanitizeAttrSegment(item.identifier)}-${indexSegment}-${sanitizeAttrSegment(interactionId)}`;
    const inputType = renderInfo?.interaction.cardinality === 'multiple' ? 'checkbox' : 'radio';
    const choices = Array.from(wrapper.querySelectorAll('simple-choice'));
    const list = dom.window.document.createElement('ul');
    list.className = 'choice-retry';
    list.setAttribute('data-retry-choice-list', `${item.identifier}:${interactionId}`);
    if (choices.length === 0) {
      wrapper.replaceWith(list);
      return;
    }
    choices.forEach((choice) => {
      const label = dom.window.document.createElement('label');
      const input = dom.window.document.createElement('input');
      input.type = inputType;
      input.name = radioName;
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
  if (!html.includes('qti-extended-placeholder') && !html.includes('qti-extended-text')) {
    return `${html}<textarea class="retake-textarea" data-retry-textarea="true" aria-label="answer"></textarea>`;
  }
  return html.replace(
    /<span\b[^>]*class="[^"]*\bqti-extended-placeholder\b[^"]*"[^>]*>[\s\S]*?<\/span>/g,
    '<textarea class="retake-textarea" data-retry-textarea="true" aria-label="answer"></textarea>'
  );
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
  // The renderer's `explanationHtml` already carries the report-style class
  // surface (code-block, code-block-code, hljs, data-code-lang, code-inline).
  // We resolve local image assets only; we never rehighlight the body.
  const resolved = resolveExplanationAssets(
    explanationHtml,
    itemPath,
    itemIdentifier,
    outputDirPath
  );
  return resolved.html;
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
    const resolvedItem: ParsedAssessmentItem = {
      ...parsedItem,
      questionHtml: resolvedAssets.html,
    };
    const answerBodies = buildItemAnswerBodies(resolvedItem, itemResult);
    const explanationHtml = buildExplanationHtml(
      parsedItem.explanationHtml,
      itemRef.itemPath,
      parsedItem.identifier,
      outputDirPath
    );
    return buildItemReportModel(
      resolvedItem,
      itemResult,
      itemIndex + 1,
      answerBodies.retryQuestionHtml,
      answerBodies.submittedAnswerHtml,
      answerBodies.correctAnswerHtml,
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
