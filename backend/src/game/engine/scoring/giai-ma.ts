export interface KeywordRules {
    start: number;
    dropPerHint: number;
    floor: number;
}

export function keywordValue(correctHintsRevealed: number, rules: KeywordRules): number {
    return Math.max(rules.floor, rules.start - rules.dropPerHint * correctHintsRevealed);
}

export function keywordAnswerPoints(
    correctHintsRevealed: number,
    correct: boolean,
    rules: KeywordRules
): number {
    return correct ? keywordValue(correctHintsRevealed, rules) : 0;
}
