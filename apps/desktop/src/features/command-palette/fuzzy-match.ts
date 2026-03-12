import type { CommandPaletteCommand } from "./types";

export interface FuzzyMatchResult {
  match: boolean;
  score: number;
}

export function fuzzyMatch(query: string, text: string): FuzzyMatchResult {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  if (lowerQuery.length === 0) {
    return { match: true, score: 0 };
  }

  if (lowerText.includes(lowerQuery)) {
    const bonus = lowerQuery.length / lowerText.length;
    return { match: true, score: 100 + bonus * 50 };
  }

  let queryIndex = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIndex = -2;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] !== lowerQuery[queryIndex]) {
      consecutive = 0;
      continue;
    }

    queryIndex++;
    consecutive++;

    score += 1;

    if (consecutive > 1) {
      score += consecutive;
    }

    if (
      i === 0 ||
      lowerText[i - 1] === " " ||
      lowerText[i - 1] === "/" ||
      lowerText[i - 1] === "-"
    ) {
      score += 5;
    }

    if (i === prevMatchIndex + 1) {
      score += 2;
    }

    prevMatchIndex = i;
  }

  if (queryIndex < lowerQuery.length) {
    return { match: false, score: 0 };
  }

  return { match: true, score };
}

export function filterAndSort(
  query: string,
  commands: CommandPaletteCommand[],
): CommandPaletteCommand[] {
  if (query.trim().length === 0) {
    return commands;
  }

  const scored = commands
    .map((command) => {
      const labelResult = fuzzyMatch(query, command.label);
      const keywordResults = command.keywords.map((keyword) => fuzzyMatch(query, keyword));
      const bestKeyword = keywordResults.reduce(
        (best, result) => (result.score > best.score ? result : best),
        { match: false, score: 0 },
      );
      const bestScore = Math.max(labelResult.score, bestKeyword.score * 0.8);
      const isMatch = labelResult.match || bestKeyword.match;

      return { command, score: bestScore, isMatch };
    })
    .filter((entry) => entry.isMatch);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.command);
}
