import fs from "node:fs";

import {
  extractInnerXml,
  extractOpenTag,
  findFirstTagBlock,
  parseAttributes,
  stripTags,
  stripTagsPreserveWhitespace,
} from "./xml";

export interface ParsedItemResult {
  identifier: string;
  score: number | null;
  responses: string[];
  rubricOutcomes: Map<number, boolean>;
  comment: string | null;
}

export interface ParsedAssessmentResult {
  candidateNumber: string;
  candidateName: string;
  testTitle: string;
  testScore: number | null;
  itemResults: Map<string, ParsedItemResult>;
}

function extractCandidateNumber(sourcedId: string | undefined): string {
  if (!sourcedId) {
    throw new Error("Invalid assessment result: context sourcedId is required");
  }
  const match = sourcedId.match(/\d+/);
  if (!match) {
    throw new Error("Failed to extract candidate number from sourcedId");
  }
  return match[0];
}

function parseSessionIdentifiers(contextXml: string): Map<string, string> {
  const sessionIdentifierPattern = /<sessionIdentifier\b[^>]*(?:\/>|>[\s\S]*?<\/sessionIdentifier>)/g;
  const sessionIdentifierTags = contextXml.match(sessionIdentifierPattern) ?? [];
  const identifiers = new Map<string, string>();

  sessionIdentifierTags.forEach((tag) => {
    const openTag = tag.endsWith("/>") ? tag : extractOpenTag(tag);
    const attributes = parseAttributes(openTag);
    const sourceId = attributes.sourceID;
    const identifier = attributes.identifier;
    if (sourceId && identifier) {
      identifiers.set(sourceId, identifier);
    }
  });

  return identifiers;
}

function parseValueFromVariableBlock(blockXml: string): string | null {
  const valuePattern = /<value\b[^>]*>([\s\S]*?)<\/value>/g;
  const firstMatch = valuePattern.exec(blockXml);
  if (!firstMatch) {
    return null;
  }
  return stripTags(firstMatch[1]);
}

function parseOutcomeVariableNumber(xml: string, identifier: string): number | null {
  const pattern = new RegExp(
    `<outcomeVariable\\b[^>]*identifier="${identifier}"[^>]*>[\\s\\S]*?<\\/outcomeVariable>`,
  );
  const match = xml.match(pattern);
  if (!match) {
    return null;
  }
  const rawValue = parseValueFromVariableBlock(match[0]);
  if (rawValue === null || rawValue === "") {
    return null;
  }
  const value = Number.parseFloat(rawValue);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid numeric outcomeVariable value for ${identifier}`);
  }
  return value;
}

function parseOutcomeVariableString(xml: string, identifier: string): string | null {
  const pattern = new RegExp(
    `<outcomeVariable\\b[^>]*identifier="${identifier}"[^>]*>[\\s\\S]*?<\\/outcomeVariable>`,
  );
  const match = xml.match(pattern);
  if (!match) {
    return null;
  }
  const valuePattern = /<value\b[^>]*>([\s\S]*?)<\/value>/;
  const valueMatch = match[0].match(valuePattern);
  if (!valueMatch) {
    return null;
  }
  const preserved = stripTagsPreserveWhitespace(valueMatch[1]).replace(/\r\n?/g, "\n").trim();
  return preserved.length > 0 ? preserved : null;
}

function parseCandidateResponses(itemXml: string): string[] {
  const responseVariablePattern = /<responseVariable\b[^>]*>[\s\S]*?<\/responseVariable>/g;
  const responseVariables = itemXml.match(responseVariablePattern) ?? [];

  for (const responseVariable of responseVariables) {
    const openTag = extractOpenTag(responseVariable);
    const attributes = parseAttributes(openTag);
    if (attributes.identifier !== "RESPONSE") {
      continue;
    }
    const candidateResponseMatch = responseVariable.match(
      /<candidateResponse\b[^>]*>([\s\S]*?)<\/candidateResponse>/,
    );
    if (!candidateResponseMatch) {
      return [];
    }
    const candidateResponseXml = candidateResponseMatch[1];
    const valuePattern = /<value\b[^>]*>([\s\S]*?)<\/value>/g;
    const responses: string[] = [];
    let valueMatch: RegExpExecArray | null = valuePattern.exec(candidateResponseXml);
    while (valueMatch) {
      const preserved = stripTagsPreserveWhitespace(valueMatch[1]).replace(/\r\n?/g, "\n");
      responses.push(preserved);
      valueMatch = valuePattern.exec(candidateResponseXml);
    }
    return responses;
  }

  return [];
}

function parseRubricOutcomes(itemXml: string): Map<number, boolean> {
  const rubricOutcomes = new Map<number, boolean>();
  const rubricPattern = /<outcomeVariable\b[^>]*identifier="RUBRIC_(\d+)_MET"[^>]*>[\s\S]*?<\/outcomeVariable>/g;
  let match: RegExpExecArray | null = rubricPattern.exec(itemXml);
  while (match) {
    const index = Number.parseInt(match[1], 10);
    const rawValue = parseValueFromVariableBlock(match[0]);
    if (rawValue === null) {
      throw new Error(`Invalid rubric outcome: RUBRIC_${index}_MET has no value`);
    }
    const normalized = rawValue.toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      throw new Error(`Invalid rubric outcome value for RUBRIC_${index}_MET: ${rawValue}`);
    }
    rubricOutcomes.set(index, normalized === "true");
    match = rubricPattern.exec(itemXml);
  }
  return rubricOutcomes;
}

function parseItemResults(xml: string): Map<string, ParsedItemResult> {
  const itemResultPattern = /<itemResult\b[^>]*>[\s\S]*?<\/itemResult>/g;
  const itemResultTags = xml.match(itemResultPattern) ?? [];
  const itemResults = new Map<string, ParsedItemResult>();

  itemResultTags.forEach((tag) => {
    const openTag = extractOpenTag(tag);
    const attributes = parseAttributes(openTag);
    const identifier = attributes.identifier;
    if (!identifier) {
      throw new Error("Invalid assessment result: itemResult identifier is required");
    }
    const score = parseOutcomeVariableNumber(tag, "SCORE");
    const responses = parseCandidateResponses(tag);
    const rubricOutcomes = parseRubricOutcomes(tag);
    const comment = parseOutcomeVariableString(tag, "COMMENT");

    itemResults.set(identifier, {
      identifier,
      score,
      responses,
      rubricOutcomes,
      comment,
    });
  });

  return itemResults;
}

export function parseAssessmentResult(assessmentResultPath: string): ParsedAssessmentResult {
  const xml = fs.readFileSync(assessmentResultPath, "utf8");

  const contextBlock = findFirstTagBlock(xml, "context");
  if (!contextBlock) {
    throw new Error("Invalid assessment result: context not found");
  }
  const contextOpenTag = extractOpenTag(contextBlock);
  const contextAttributes = parseAttributes(contextOpenTag);

  const candidateNumber = extractCandidateNumber(contextAttributes.sourcedId);
  const contextXml = extractInnerXml(contextBlock, "context");
  const sessionIdentifiers = parseSessionIdentifiers(contextXml);

  const candidateName = sessionIdentifiers.get("candidateName");
  if (!candidateName) {
    throw new Error("Invalid assessment result: candidateName sessionIdentifier is required");
  }
  const testTitle = sessionIdentifiers.get("materialTitle");
  if (!testTitle) {
    throw new Error("Invalid assessment result: materialTitle sessionIdentifier is required");
  }

  const testResultBlock = findFirstTagBlock(xml, "testResult");
  const testScore = testResultBlock ? parseOutcomeVariableNumber(testResultBlock, "SCORE") : null;

  const itemResults = parseItemResults(xml);

  return {
    candidateNumber,
    candidateName,
    testTitle,
    testScore,
    itemResults,
  };
}
