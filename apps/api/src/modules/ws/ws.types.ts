import type { WebSocket } from "ws";
import type { TournamentFormat } from "@oc/shared";

export interface WsConnection {
  ws: WebSocket;
  matchCode: string;
  userId: string;
  userCode: string;
  role: "controller" | "mc" | "player";
  sid: string;
  tournamentFormat: TournamentFormat;
}

export interface WsMessage {
  type: string;
  user_code?: string;
  role?: string;
  question_code?: string;
  status?: string;
  [key: string]: unknown;
}

const PLAYER_ALLOWED = new Set([
  "player_answer",
  "buzz",
  "user_online",
  "request_presence",
  "keyword_submit",
  "vd_player_power",
  "vd_power_window_closed",
  "vd_questions_meta_request",
  "pong_latency",
  "qualifier_standings",
  "send_room_info",
  "request_snapshot",
  "camera_ready",
  "camera_offer",
  "camera_answer",
  "camera_ice_candidate",
  "camera_request",
  "voice_ready",
  "voice_offer",
  "voice_answer",
  "voice_ice_candidate",
  "voice_request",
]);

const MC_ALLOWED = new Set([
  "buzz",
  "user_online",
  "request_presence",
  "send_question",
  "clear_question",
  "start_the_timer",
  "send_answers_to_players",
  "clear_answers",
  "round_start",
  "round_end",
  "navigate",
  "media_control",
  "send_players_info",
  "player_score_updated",
  "player_offline",
  "buzzer_activated",
  "clear_buzz",
  "vd_power_activated",
  "vdc_questions_meta",
  "vdc_question_state",
  "vdr_questions_meta",
  "vdr_question_state",
  "vd_questions_selected",
  "vd_selection_update",
  "bp_dung",
  "bp_chon_cau_hoi",
  "wrong",
  "skip",
  "game_end",
  "match_state",
  "show_hint",
  "introduce_players",
  "show_scoreboard",
  "keyword_submit",
  "keyword_locked",
  "buzzer_winner",
  "blocked_buzz",
  "vd_power_window_open",
  "qualifier_standings",
  "send_room_info",
  "camera_ready",
  "camera_offer",
  "camera_answer",
  "camera_ice_candidate",
  "camera_request",
  "voice_ready",
  "voice_offer",
  "voice_answer",
  "voice_ice_candidate",
  "voice_request",
  "request_snapshot",
]);

export function isAllowedByRole(role: string, msgType: string): boolean {
  if (role === "controller") return true;
  if (role === "player") return PLAYER_ALLOWED.has(msgType);
  if (role === "mc") return MC_ALLOWED.has(msgType);
  return false;
}
