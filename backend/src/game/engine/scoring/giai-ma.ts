// giai-ma: keyword value starts at 100, drops 10 per correct hint.
export const KEYWORD_START = 100;
export const HINT_PENALTY = 10;

export function keywordValue(correctHintsRevealed: number): number {
    return KEYWORD_START - HINT_PENALTY * correctHintsRevealed;
}

// Points for a correct keyword answer equal the current keyword value.
export function keywordAnswerPoints(correctHintsRevealed: number, correct: boolean): number {
    return correct ? keywordValue(correctHintsRevealed) : 0;
}
