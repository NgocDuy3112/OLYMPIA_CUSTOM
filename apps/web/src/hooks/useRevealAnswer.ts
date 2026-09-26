import { useCallback, useState } from "react";
import type { WebSocketMessage } from "@/types/websocket";

export function useRevealAnswer() {
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");

  const applyReveal = useCallback((msg: WebSocketMessage | null) => {
    if (msg?.type !== "reveal_answer") return;
    setAnswer(String(msg.answer ?? ""));
    setExplanation(String(msg.explanation ?? ""));
  }, []);

  const clear = useCallback(() => {
    setAnswer("");
    setExplanation("");
  }, []);

  return { answer, explanation, applyReveal, clear };
}
