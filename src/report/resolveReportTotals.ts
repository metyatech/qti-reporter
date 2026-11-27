import { parseExactDecimal, sumAndCapScores } from 'qti-xml-core';

import type { ParsedAssessmentItem } from '../qti/assessmentItem.js';
import type { ParsedAssessmentResult, ParsedItemResult } from '../qti/assessmentResult.js';

export interface ReportScoreItem {
  item: ParsedAssessmentItem;
  itemResult: ParsedItemResult;
  itemScore: number;
}

export function resolveReportTotals(
  assessmentResult: ParsedAssessmentResult,
  items: readonly ReportScoreItem[],
  scoreCap?: number
): { totalScore: number | string; totalMaxScore: number } {
  const rawTotalMaxScore = items.reduce((sum, entry) => sum + entry.item.itemMaxScore, 0);
  if (rawTotalMaxScore <= 0) {
    throw new Error('Invalid maximum score: total maximum score must be greater than zero');
  }

  if (scoreCap === undefined) {
    const totalScore =
      assessmentResult.testScore !== null
        ? assessmentResult.testScore
        : items.reduce((sum, entry) => sum + entry.itemScore, 0);
    return { totalScore, totalMaxScore: rawTotalMaxScore };
  }

  const storedScoreText =
    assessmentResult.testScoreText ??
    (assessmentResult.testScore === null ? null : String(assessmentResult.testScore));
  if (storedScoreText?.trim()) {
    const storedScore = parseExactDecimal(storedScoreText);
    if (!storedScore) {
      throw new Error('Invalid exact test SCORE for capped assessment');
    }
    return {
      totalScore: sumAndCapScores([storedScore], scoreCap),
      totalMaxScore: scoreCap,
    };
  }

  const scoreComponents = items.flatMap((entry) => {
    if (entry.item.rubricCriteria.length > 0) {
      return entry.item.rubricCriteria.flatMap((criterion) => {
        const met = entry.itemResult.rubricOutcomes.get(criterion.index);
        if (met === undefined) {
          throw new Error(
            `Missing rubric outcome RUBRIC_${criterion.index}_MET for item ${entry.item.identifier}`
          );
        }
        if (!met) {
          return [];
        }
        const points = parseExactDecimal(String(criterion.points));
        if (!points) {
          throw new Error(`Invalid rubric points for item ${entry.item.identifier}`);
        }
        return [points];
      });
    }

    const scoreText = entry.itemResult.scoreText?.trim()
      ? entry.itemResult.scoreText
      : entry.itemResult.score === null
        ? null
        : String(entry.itemResult.score);
    const score = scoreText === null ? null : parseExactDecimal(scoreText);
    if (!score) {
      throw new Error(`Invalid exact item SCORE for capped assessment: ${entry.item.identifier}`);
    }
    return [score];
  });

  return {
    totalScore: sumAndCapScores(scoreComponents, scoreCap),
    totalMaxScore: scoreCap,
  };
}
