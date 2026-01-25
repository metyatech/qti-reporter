import fs from "node:fs";

import {
  extractInnerXml,
  extractOpenTag,
  extractTagOpen,
  findFirstTagBlock,
  parseAttributes,
  stripTags,
} from "./xml";

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

function convertQtiXmlToHtml(itemBodyXml: string): string {
  const withoutXmlns = itemBodyXml.replace(/\sxmlns="[^"]*"/g, "");
  const withPlaceholders = replaceInteractionPlaceholders(withoutXmlns);
  const withoutChoiceClose = withPlaceholders.replace(/<\/qti-choice-interaction>/g, "</div>");
  const renamedTags = withoutChoiceClose.replace(
    /<(\/?)qti-([A-Za-z0-9-]+)/g,
    "<$1$2",
  );
  return `<div class="item-body">${renamedTags}</div>`;
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
