import type { WebSocketPayload } from "@/types/websocket";

type SendMessage = (payload: WebSocketPayload) => Promise<boolean>;

type TimerPayload = {
  sendMessage: SendMessage;
  phase: string;
  timeLimit: number;
  questionCode: string;
  startedAt?: number;
  selectedPlayerCode?: string | null;
};

export async function sendStartTimer({
  sendMessage,
  phase,
  timeLimit,
  questionCode,
  startedAt = Date.now(),
}: TimerPayload) {
  return sendMessage({
    type: "start_the_timer",
    user_code: "",
    phase,
    time_limit: timeLimit,
    question_code: questionCode,
    started_at: startedAt,
    selected_player_code: selectedPlayerCode,
  });
}
