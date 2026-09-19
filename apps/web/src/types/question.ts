export interface Question {
  questionCode: string;
  questionText: string;
  questionAnswer: string;
  questionExplanation?: string;
  questionHintText?: string;
  questionMediaURL?: string;

  questionOptions?: string;
}
