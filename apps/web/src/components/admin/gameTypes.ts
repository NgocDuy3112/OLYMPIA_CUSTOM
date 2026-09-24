export interface MatchData {
  match_code: string;
  match_name: string;
  match_status?: string;
  match_slug?: string;
  scheduled_at?: string | null;
  venue?: string | null;
  match_label?: string | null;
  tournament_id?: string | null;
  phase_id?: string | null;
}

export interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
}
