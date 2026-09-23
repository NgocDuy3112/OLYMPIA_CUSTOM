export interface MatchData {
  match_code: string;
  match_name: string;
  match_status?: string;
}

export interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
}
