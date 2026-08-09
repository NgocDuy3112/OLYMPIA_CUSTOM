/**
 * Answer normalization and validation.
 */

/** Normalize answer text: trim, lowercase, collapse whitespace */
export function normalizeAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Check if two answers match (normalized comparison) */
export function answersMatch(submitted: string, expected: string): boolean {
  return normalizeAnswer(submitted) === normalizeAnswer(expected)
}

/** Check if answer is correct for MCQ */
export function isCorrectOption(submitted: string, correctOption: string): boolean {
  return submitted.trim().toUpperCase() === correctOption.trim().toUpperCase()
}
