import fs from "node:fs";
import hljs from "highlight.js/lib/core";
import xmlLang from "highlight.js/lib/languages/xml";
import javascriptLang from "highlight.js/lib/languages/javascript";
import typescriptLang from "highlight.js/lib/languages/typescript";
import jsonLang from "highlight.js/lib/languages/json";
import cssLang from "highlight.js/lib/languages/css";
import sqlLang from "highlight.js/lib/languages/sql";
import bashLang from "highlight.js/lib/languages/bash";
import plaintextLang from "highlight.js/lib/languages/plaintext";

import {
  decodeXmlEntities,
  extractInnerXml,
  extractOpenTag,
  extractTagOpen,
  findFirstTagBlock,
  parseAttributes,
  stripTags,
} from "./xml";

hljs.registerLanguage("xml", xmlLang);
hljs.registerLanguage("html", xmlLang);
hljs.registerLanguage("javascript", javascriptLang);
hljs.registerLanguage("js", javascriptLang);
hljs.registerLanguage("typescript", typescriptLang);
hljs.registerLanguage("ts", typescriptLang);
hljs.registerLanguage("json", jsonLang);
hljs.registerLanguage("css", cssLang);
hljs.registerLanguage("sql", sqlLang);
hljs.registerLanguage("bash", bashLang);
hljs.registerLanguage("sh", bashLang);
hljs.registerLanguage("plaintext", plaintextLang);
hljs.registerLanguage("plain", plaintextLang);

const AUTO_DETECT_LANGUAGES = ["html", "xml", "ts", "js", "json", "css", "sql", "bash", "plain"];

export interface RubricCriterion {
  index: number;
  points: number;
  text: string;
}

export interface ChoiceOption {
  identifier: string;
  text: string;
}

export interface ParsedAssessmentItem {
  identifier: string;
  title: string;
  questionHtml: string;
  rubricCriteria: RubricCriterion[];
  itemMaxScore: number;
  choices: ChoiceOption[];
}

function parseCriterionText(rawText: string): { points: number; text: string } {
  const trimmed = rawText.trim();
  const match = trimmed.match(/^\[(\d+(?:\.\d+)?)\]\s*(.*)$/);
  if (!match) {
    return { points: 0, text: trimmed };
  }
  const points = Number.parseFloat(match[1]);
  const text = match[2].trim();
  return { points, text };
}

function extractRubricCriteria(itemBodyXml: string): RubricCriterion[] {
  const rubricBlockPattern = /<qti-rubric-block\b[^>]*view="scorer"[^>]*>[\s\S]*?<\/qti-rubric-block>/g;
  const rubricBlocks = itemBodyXml.match(rubricBlockPattern) ?? [];

  const criteria: RubricCriterion[] = [];
  rubricBlocks.forEach((block) => {
    const paragraphPattern = /<qti-p\b[^>]*>([\s\S]*?)<\/qti-p>/g;
    let paragraphMatch: RegExpExecArray | null = paragraphPattern.exec(block);
    while (paragraphMatch) {
      const rawText = stripTags(paragraphMatch[1]);
      const parsed = parseCriterionText(rawText);
      criteria.push({
        index: criteria.length + 1,
        points: parsed.points,
        text: parsed.text,
      });
      paragraphMatch = paragraphPattern.exec(block);
    }
  });

  return criteria;
}

function removeRubricBlocks(itemBodyXml: string): string {
  const rubricBlockPattern = /<qti-rubric-block\b[^>]*view="scorer"[^>]*>[\s\S]*?<\/qti-rubric-block>/g;
  return itemBodyXml.replace(rubricBlockPattern, "");
}

function replaceInteractionPlaceholders(xml: string): string {
  const extendedTextPattern = /<qti-extended-text-interaction\b[^>]*\/>/g;
  const textEntryPattern = /<qti-text-entry-interaction\b[^>]*\/>/g;
  const choiceInteractionPattern = /<qti-choice-interaction\b[^>]*>/g;

  const withExtendedText = xml.replace(
    extendedTextPattern,
    '<div class="interaction-placeholder">[extended text response]</div>',
  );
  const withTextEntry = withExtendedText.replace(
    textEntryPattern,
    '<div class="interaction-placeholder">[text entry response]</div>',
  );
  return withTextEntry.replace(choiceInteractionPattern, '<div class="choice-interaction">');
}

function mergeClassNames(existing: string | undefined, additions: string[]): string {
  const tokens = new Set<string>();
  if (existing) {
    existing
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .forEach((token) => tokens.add(token));
  }
  additions.forEach((token) => tokens.add(token));
  return Array.from(tokens).join(" ");
}

function addOrUpdateAttribute(tagOpen: string, attributeName: string, attributeValue: string): string {
  const attributePattern = new RegExp(`\\s${attributeName}="[^"]*"`);
  if (attributePattern.test(tagOpen)) {
    return tagOpen.replace(attributePattern, ` ${attributeName}="${attributeValue}"`);
  }
  return tagOpen.replace(/^<([A-Za-z0-9-]+)/, `<$1 ${attributeName}="${attributeValue}"`);
}

function addClasses(tagOpen: string, classNames: string[]): string {
  const attributes = parseAttributes(tagOpen);
  const merged = mergeClassNames(attributes.class, classNames);
  return addOrUpdateAttribute(tagOpen, "class", merged);
}

function detectCodeLanguage(tagOpen: string): string | null {
  const attributes = parseAttributes(tagOpen);
  const fromDataLang =
    attributes["data-lang"] ?? attributes["data-language"] ?? attributes["data-code-lang"];
  if (fromDataLang) {
    return fromDataLang.trim();
  }
  const classAttr = attributes.class;
  if (!classAttr) {
    return null;
  }
  const classTokens = classAttr.split(/\s+/);
  for (const token of classTokens) {
    const languageMatch = token.match(/^(?:language|lang)-([A-Za-z0-9_-]+)$/);
    if (languageMatch) {
      return languageMatch[1];
    }
  }
  return null;
}

function normalizeLanguage(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === "xml") {
    return "html";
  }
  if (normalized === "plaintext") {
    return "plain";
  }
  return normalized;
}

function highlightCode(codeContent: string, explicitLanguage: string | null): { language: string; html: string } {
  const decoded = decodeXmlEntities(codeContent);
  const trimmed = decoded.trim();
  if (trimmed.length === 0) {
    return { language: "plain", html: "" };
  }

  if (explicitLanguage) {
    const normalizedExplicit = normalizeLanguage(explicitLanguage);
    if (normalizedExplicit !== "plain" && hljs.getLanguage(normalizedExplicit)) {
      const highlighted = hljs.highlight(trimmed, { language: normalizedExplicit, ignoreIllegals: true });
      return { language: normalizeLanguage(highlighted.language ?? normalizedExplicit), html: highlighted.value };
    }
  }

  const auto = hljs.highlightAuto(trimmed, AUTO_DETECT_LANGUAGES);
  const autoLanguage = auto.language ? normalizeLanguage(auto.language) : "plain";
  return { language: autoLanguage, html: auto.value };
}

function enhanceCodeBlocks(htmlFragment: string): string {
  const preCodePattern = /(<pre\b[^>]*>)(\s*)(<code\b[^>]*>)([\s\S]*?)(<\/code>)/g;
  return htmlFragment.replace(
    preCodePattern,
    (_match, preOpen, whitespace, codeOpen, codeContent, codeClose) => {
      const explicitLanguage = detectCodeLanguage(codeOpen);
      const highlighted = highlightCode(codeContent, explicitLanguage);
      const language = highlighted.language;

      const enhancedPre = addOrUpdateAttribute(addClasses(preOpen, ["code-block", "hljs"]), "data-code-lang", language);
      const enhancedCode = addOrUpdateAttribute(
        addClasses(codeOpen, ["code-block-code"]),
        "data-code-lang",
        language,
      );
      const content = highlighted.html.length > 0 ? highlighted.html : codeContent;
      return `${enhancedPre}${whitespace}${enhancedCode}${content}${codeClose}`;
    },
  );
}

function enhanceInlineCode(htmlFragment: string): string {
  const codeOpenPattern = /<code\b[^>]*>/g;
  return htmlFragment.replace(codeOpenPattern, (codeOpen) => {
    const attributes = parseAttributes(codeOpen);
    const existingClasses = attributes.class ?? "";
    if (existingClasses.split(/\s+/).includes("code-block-code")) {
      return codeOpen;
    }
    const language = detectCodeLanguage(codeOpen);
    const enhancedCode = addClasses(codeOpen, ["code-inline"]);
    if (!language) {
      return enhancedCode;
    }
    return addOrUpdateAttribute(enhancedCode, "data-code-lang", normalizeLanguage(language));
  });
}

function convertQtiXmlToHtml(itemBodyXml: string): string {
  const withoutXmlns = itemBodyXml.replace(/\sxmlns="[^"]*"/g, "");
  const withPlaceholders = replaceInteractionPlaceholders(withoutXmlns);
  const withoutChoiceClose = withPlaceholders.replace(/<\/qti-choice-interaction>/g, "</div>");
  const renamedTags = withoutChoiceClose.replace(/<(\/?)qti-([A-Za-z0-9-]+)/g, "<$1$2");
  const withCodeBlocks = enhanceCodeBlocks(renamedTags);
  const withInlineCode = enhanceInlineCode(withCodeBlocks);
  return `<div class="item-body">${withInlineCode}</div>`;
}

function extractChoices(itemBodyXml: string): ChoiceOption[] {
  const choicePattern = /<qti-simple-choice\b[^>]*>[\s\S]*?<\/qti-simple-choice>/g;
  const choiceTags = itemBodyXml.match(choicePattern) ?? [];

  return choiceTags.map((tag) => {
    const openTag = extractOpenTag(tag);
    const attributes = parseAttributes(openTag);
    const identifier = attributes.identifier;
    if (!identifier) {
      throw new Error("Invalid assessment item: qti-simple-choice is missing identifier");
    }
    const innerXml = extractInnerXml(tag, "qti-simple-choice");
    const text = stripTags(innerXml);
    return { identifier, text };
  });
}

export function parseAssessmentItem(itemPath: string, expectedIdentifier: string): ParsedAssessmentItem {
  const xml = fs.readFileSync(itemPath, "utf8");

  const itemOpenTag = extractTagOpen(xml, "qti-assessment-item");
  if (!itemOpenTag) {
    throw new Error(`Invalid assessment item: qti-assessment-item not found in ${itemPath}`);
  }
  const itemAttributes = parseAttributes(itemOpenTag);
  const identifier = itemAttributes.identifier;
  const title = itemAttributes.title ?? expectedIdentifier;

  if (!identifier) {
    throw new Error(`Invalid assessment item: identifier missing in ${itemPath}`);
  }
  if (identifier !== expectedIdentifier) {
    throw new Error(
      `Assessment item identifier mismatch: expected ${expectedIdentifier} but found ${identifier}`,
    );
  }

  const itemBodyBlock = findFirstTagBlock(xml, "qti-item-body");
  if (!itemBodyBlock) {
    throw new Error(`Invalid assessment item: qti-item-body not found for ${identifier}`);
  }
  const itemBodyXml = extractInnerXml(itemBodyBlock, "qti-item-body");

  const rubricCriteria = extractRubricCriteria(itemBodyXml);
  const itemMaxScore = rubricCriteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const itemBodyWithoutRubric = removeRubricBlocks(itemBodyXml);

  const questionHtml = convertQtiXmlToHtml(itemBodyWithoutRubric);
  const choices = extractChoices(itemBodyXml);

  return {
    identifier,
    title,
    questionHtml,
    rubricCriteria,
    itemMaxScore,
    choices,
  };
}