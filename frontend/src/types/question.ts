export interface Question {
    questionCode: string;
    questionText: string;
    questionAnswer: string;
    questionExplanation?: string;
    questionMediaURL?: string;
    /** JSON-encoded list of 6 option strings for Qualifier questions. */
    questionOptions?: string;
}