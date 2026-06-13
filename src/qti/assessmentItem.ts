import fs from 'node:fs';
import hljs from 'highlight.js/lib/core';
import xmlLang from 'highlight.js/lib/languages/xml';
import javascriptLang from 'highlight.js/lib/languages/javascript';
import typescriptLang from 'highlight.js/lib/languages/typescript';
import jsonLang from 'highlight.js/lib/languages/json';
import cssLang from 'highlight.js/lib/languages/css';
import sqlLang from 'highlight.js/lib/languages/sql';
import bashLang from 'highlight.js/lib/languages/bash';
import plaintextLang from 'highlight.js/lib/languages/plaintext';
import {
  renderQtiItemForReport,
  renderQtiItemForScoring,
  type ChoiceOption,
  type ParsedItemForReport,
  type ParsedItemForScoring,
  type RubricCriterion,
} from 'qti-html-renderer';

import { extractInnerXml, findFirstTagBlock, parseAttributes, stripTags } from './xml.js';

hljs.registerLanguage('xml', xmlLang);
hljs.registerLanguage('html', xmlLang);
hljs.registerLanguage('javascript', javascriptLang);
hljs.registerLanguage('js', javascriptLang);
hljs.registerLanguage('typescript', typescriptLang);
hljs.registerLanguage('ts', typescriptLang);
hljs.registerLanguage('json', jsonLang);
hljs.registerLanguage('css', cssLang);
hljs.registerLanguage('sql', sqlLang);
hljs.registerLanguage('bash', bashLang);
hljs.registerLanguage('sh', bashLang);
hljs.registerLanguage('plaintext', plaintextLang);
hljs.registerLanguage('plain', plaintextLang);

const AUTO_DETECT_LANGUAGES = ['html', 'xml', 'ts', 'js', 'json', 'css', 'sql', 'bash', 'plain'];

export type ParsedAssessmentItem = ParsedItemForReport;
export type { ChoiceOption, RubricCriterion };

function normalizeLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === 'xml') {
    return 'html';
  }
  if (normalized === 'plaintext') {
    return 'plain';
  }
  return normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripClozeInputs(html: string): string {
  return html.replace(/<input\b[^>]*>/gi, '');
}

function looksLikeCss(source: string): boolean {
  const hasSelector = /(^|[\s,{])([.#][\w-]+|[a-zA-Z][\w-]*)\s*\{/.test(source);
  const hasProperty = /[a-zA-Z-]+\s*:\s*[^;]+;/.test(source);
  return hasSelector && hasProperty;
}

function inferLanguageForCloze(decodedContent: string, explicitLanguage: string | null): string {
  if (explicitLanguage && hljs.getLanguage(explicitLanguage)) {
    return explicitLanguage;
  }
  const trimmed = stripClozeInputs(decodedContent).trim();
  if (trimmed.length === 0) {
    return explicitLanguage ?? 'plain';
  }
  const auto = hljs.highlightAuto(trimmed, AUTO_DETECT_LANGUAGES);
  const autoLanguage = auto.language ? normalizeLanguage(auto.language) : 'plain';
  if (autoLanguage === 'plain' && looksLikeCss(trimmed)) {
    return 'css';
  }
  return autoLanguage;
}

function highlightClozeCode(codeContent: string, language: string): string {
  const segments = codeContent.split(/(<input\b[^>]*>)/gi);
  return segments
    .map((segment) => {
      if (segment.toLowerCase().startsWith('<input')) {
        return segment;
      }
      if (segment.trim().length === 0) {
        return escapeHtml(segment);
      }
      if (language !== 'plain' && hljs.getLanguage(language)) {
        return hljs.highlight(segment, { language, ignoreIllegals: true }).value;
      }
      return escapeHtml(segment);
    })
    .join('');
}

function highlightCode(
  codeContent: string,
  explicitLanguage: string | null
): { language: string; html: string } {
  const normalizedExplicit = explicitLanguage ? normalizeLanguage(explicitLanguage) : null;
  const decodedNumeric = codeContent.replace(/&#39;/g, "'").replace(/&#x27;/gi, "'");
  if (codeContent.includes('cloze-input')) {
    const language = inferLanguageForCloze(decodedNumeric, normalizedExplicit);
    const html = highlightClozeCode(decodedNumeric, language);
    return { language, html };
  }

  const trimmed = decodedNumeric.trim();
  if (trimmed.length === 0) {
    return { language: 'plain', html: '' };
  }

  if (
    normalizedExplicit &&
    normalizedExplicit !== 'plain' &&
    hljs.getLanguage(normalizedExplicit)
  ) {
    const highlighted = hljs.highlight(trimmed, {
      language: normalizedExplicit,
      ignoreIllegals: true,
    });
    return {
      language: normalizeLanguage(highlighted.language ?? normalizedExplicit),
      html: highlighted.value,
    };
  }

  const auto = hljs.highlightAuto(trimmed, AUTO_DETECT_LANGUAGES);
  const autoLanguage = auto.language ? normalizeLanguage(auto.language) : 'plain';
  return { language: autoLanguage, html: auto.value };
}

export function parseAssessmentItem(
  itemPath: string,
  expectedIdentifier: string
): ParsedAssessmentItem {
  const xml = fs.readFileSync(itemPath, 'utf8');
  return renderQtiItemForReport(xml, expectedIdentifier, {
    clozeInputHtml:
      '<input class="cloze-input qti-blank-input" type="text" size="6" readonly aria-label="blank">',
    codeHighlighter: highlightCode,
  });
}

export type ParsedAssessmentItemForScoring = ParsedItemForScoring;

export function parseAssessmentItemForScoring(itemPath: string): ParsedAssessmentItemForScoring {
  const xml = fs.readFileSync(itemPath, 'utf8');
  return renderQtiItemForScoring(xml);
}

export interface CorrectResponse {
  responseIdentifier: string;
  values: string[];
  interactionType: 'choice' | 'text' | 'other';
}

/**
 * Extract `qti-correct-response` blocks from a QTI 3.0 item XML. The published
 * `qti-html-renderer@^0.1.2` does not yet expose the `interactions` field on
 * `ParsedItemForScoring`, so the reporter uses a small, focused XML parse to
 * recover the per-response correct values for the new "correct answer" inner
 * details block. This parse is intentionally limited to
 * `qti-response-declaration`/`qti-correct-response`; the rest of the
 * explanation / modal-feedback parsing stays inside the renderer.
 */
export function parseCorrectResponses(itemPath: string): CorrectResponse[] {
  const xml = fs.readFileSync(itemPath, 'utf8');
  const responseDeclPattern =
    /<qti-response-declaration\b[^>]*(?:\/>|>[\s\S]*?<\/qti-response-declaration>)/g;
  const responseDecls = xml.match(responseDeclPattern) ?? [];
  const results: CorrectResponse[] = [];

  for (const decl of responseDecls) {
    const openTag = decl.endsWith('/>')
      ? decl
      : decl.match(/^<qti-response-declaration\b[^>]*>/)?.[0];
    if (!openTag) continue;
    const attributes = parseAttributes(openTag);
    const responseId = attributes.identifier;
    if (!responseId) continue;
    const baseType = (attributes['base-type'] ?? attributes.baseType ?? '').toLowerCase();
    const correctBlock = findFirstTagBlock(decl, 'qti-correct-response');
    if (!correctBlock) continue;
    const inner = extractInnerXml(correctBlock, 'qti-correct-response');
    const valuePattern = /<qti-value\b[^>]*>([\s\S]*?)<\/qti-value>/g;
    const values: string[] = [];
    let match: RegExpExecArray | null = valuePattern.exec(inner);
    while (match) {
      const text = stripTags(match[1]).trim();
      if (text.length > 0) values.push(text);
      match = valuePattern.exec(inner);
    }
    if (values.length === 0) continue;
    const interactionType: CorrectResponse['interactionType'] =
      baseType === 'identifier' ? 'choice' : baseType === 'string' ? 'text' : 'other';
    results.push({ responseIdentifier: responseId, values, interactionType });
  }

  return results;
}
