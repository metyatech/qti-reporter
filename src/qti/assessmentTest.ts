import fs from 'node:fs';
import path from 'node:path';

import { extractOpenTag, parseAttributes } from './xml.js';

export interface AssessmentItemRef {
  identifier: string;
  href: string;
  itemPath: string;
}

export interface ParsedAssessmentTest {
  assessmentTestPath: string;
  baseDir: string;
  title: string;
  itemRefs: AssessmentItemRef[];
}

export function parseAssessmentTest(assessmentTestPath: string): ParsedAssessmentTest {
  const xml = fs.readFileSync(assessmentTestPath, 'utf8');
  const baseDir = path.dirname(assessmentTestPath);

  const assessmentTestTagMatch = xml.match(/<qti-assessment-test\b[^>]*>/);
  if (!assessmentTestTagMatch) {
    throw new Error('Invalid assessment test: qti-assessment-test not found');
  }
  const assessmentTestAttributes = parseAttributes(assessmentTestTagMatch[0]);
  const title = assessmentTestAttributes.title;
  if (!title) {
    throw new Error('Invalid assessment test: qti-assessment-test is missing title');
  }

  const itemRefPattern =
    /<qti-assessment-item-ref\b[^>]*(?:\/>|>[\s\S]*?<\/qti-assessment-item-ref>)/g;
  const itemRefTags = xml.match(itemRefPattern) ?? [];

  const itemRefs: AssessmentItemRef[] = itemRefTags.map((tag) => {
    const openTag = tag.endsWith('/>') ? tag : extractOpenTag(tag);
    const attributes = parseAttributes(openTag);
    const identifier = attributes.identifier;
    const href = attributes.href;

    if (!identifier) {
      throw new Error('Invalid assessment test: qti-assessment-item-ref is missing identifier');
    }
    if (!href) {
      throw new Error(`Invalid assessment test: item-ref ${identifier} is missing href`);
    }

    const itemPath = path.resolve(baseDir, href);
    return { identifier, href, itemPath };
  });

  if (itemRefs.length === 0) {
    throw new Error('Invalid assessment test: no qti-assessment-item-ref elements found');
  }

  return {
    assessmentTestPath,
    baseDir,
    title,
    itemRefs,
  };
}
