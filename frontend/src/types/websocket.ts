export type WebSocketPayload = Record<string, unknown>;

export interface WebSocketAnswer {
  user_code: string | number;
  content?: string;
  answer_text?: string;
  timestamp?: number;
  clues_opened?: number;
}

export interface WebSocketMessage extends WebSocketPayload {
  type?: string;
  message?: WebSocketMessage;
  user_code?: string | number | null;
  question_code?: string;
  match_code?: string;
  answer?: string;
  explanation?: string;
  content?: string;
  keyword_text?: string;
  keyword_answer?: string | null;
  keyword_banner?: string;
  hint_content?: string;
  hint_media_source?: string;
  state?: string;
  power?: "star" | "shield";
  phase?: string;
  time_limit?: number | string;
  started_at?: number | string;
  client_ts?: number;
  new_total_score?: number;
  attempt_count?: number;
  duration?: number;
  countdown?: number;
  clue_index?: number;
  clues_opened?: number;
  players?: unknown[];
  scoreboard?: unknown[];
  profiles?: unknown[];
  answers?: WebSocketAnswer[];
  target_players?: Array<string | number>;
  eligible_user_codes?: Array<string | number>;
  selected_question_codes?: string[];
  all_question_codes?: string[];
  used_question_codes?: string[];
  question_metadata?: Array<{ code: string; category: string; points: number }>;
  used_powers?: Record<string, "star" | "shield" | null>;
  round?: string;
  selected_player_code?: string;
}

export interface WebSocketContextValue {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (payload: WebSocketPayload) => Promise<boolean>;
}

export function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWebSocketMessage(value: string): WebSocketMessage | null {
  const parsed: unknown = JSON.parse(value);
  return isWebSocketMessage(parsed) ? parsed : null;
}

export function unwrapWebSocketMessage(message: WebSocketMessage | null): WebSocketMessage | null {
  return message?.message ?? message;
}
