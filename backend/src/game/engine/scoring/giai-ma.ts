// giai-ma: the keyword value starts at a number, drops by a step per correct hint, and
// never falls below the floor.
export interface KeywordRules {
    start: number;
    dropPerHint: number;
    floor: number;
}

export function keywordValue(correctHintsRevealed: number, rules: KeywordRules): number {
    return Math.max(rules.floor, rules.start - rules.dropPerHint * correctHintsRevealed);
}

// Points for a correct keyword answer equal the current keyword value.
export function keywordAnswerPoints(
    correctHintsRevealed: number,
    correct: boolean,
    rules: KeywordRules
): number {
    return correct ? keywordValue(correctHintsRevealed, rules) : 0;
}
