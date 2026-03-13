interface SearchablePaletteItem {
  keywords: string[];
  label: string;
  priority?: number;
}

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

export function filterAndSort<T extends SearchablePaletteItem>(query: string, items: T[]): T[] {
  if (query.trim().length === 0) {
    return [...items].sort(
      (left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0) || left.label.localeCompare(right.label),
    );
  }

  const scored = items
    .map((item) => {
      const labelResult = fuzzyMatch(query, item.label);
      const keywordResults = item.keywords.map((keyword) => fuzzyMatch(query, keyword));
      const bestKeyword = keywordResults.reduce(
        (best, result) => (result.score > best.score ? result : best),
        { match: false, score: 0 },
      );
      const bestScore = Math.max(labelResult.score, bestKeyword.score * 0.8) + (item.priority ?? 0);
      const isMatch = labelResult.match || bestKeyword.match;

      return { item, score: bestScore, isMatch };
    })
    .filter((entry) => entry.isMatch);

  scored.sort(
    (left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label),
  );
  return scored.map((entry) => entry.item);
}
