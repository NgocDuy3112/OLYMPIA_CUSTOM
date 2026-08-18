import type { NavigateFunction } from "react-router-dom";
import type { WebSocketPayload } from "@/types/websocket";

type SendMessage = (payload: WebSocketPayload) => Promise<boolean>;

interface EndRoundAndReturnToWaitingOptions {
  currentMatchCode: string;
  navigate: NavigateFunction;
  round: string;
  sendMessage: SendMessage;
}

export async function endRoundAndReturnToWaiting({
  currentMatchCode,
  navigate,
  round,
  sendMessage,
}: EndRoundAndReturnToWaitingOptions): Promise<void> {
  const adminPath = `/admin/waiting/${currentMatchCode}`;
  const playerPath = `/player/waiting/${currentMatchCode}`;

  await Promise.all([
    sendMessage({ type: "round_end", round }),
    sendMessage({ type: "clear_question", user_code: "" }),
    sendMessage({ type: "navigate", user_code: "", path: playerPath }),
  ]);
  navigate(adminPath);
}
