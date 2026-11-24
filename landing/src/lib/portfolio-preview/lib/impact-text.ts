export interface TextSegment {
  text: string;
  emphasize: boolean;
}

// Highlight authentic numeric outcomes (percentages, currency, multipliers, counts) without mutating source copy.
const IMPACT_PATTERN =
  /((?:[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?[KMBkmb])?(?:\/(?:wk|mo|yr|hr|day|week|month|year))?)|(?:\b\d+(?:,\d{3})*(?:\.\d+)?(?:\+|%|x)\b))/g;

export function tokenizeImpact(text: string): TextSegment[] {
  if (!text) return [];
  const parts = text.split(IMPACT_PATTERN);
  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      emphasize: IMPACT_PATTERN.test(part) && ((IMPACT_PATTERN.lastIndex = 0), true),
    }));
}
