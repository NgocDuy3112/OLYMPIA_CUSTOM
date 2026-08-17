import { useCallback, useState } from "react";
import type { PlayerStatus } from "@/types/player";
import type { WebSocketMessage } from "@/types/websocket";
import { buildPlayersSnapshot, normalizePlayerSnapshot } from "@/utils/playerHelpers";

interface AnswerMessage {
  user_code?: string | number;
  content?: string;
  answer_text?: string;
  timestamp?: number;
  clues_opened?: number;
}

const getAnswers = (message: WebSocketMessage): AnswerMessage[] =>
  Array.isArray(message.answers) ? message.answers as AnswerMessage[] : [];

export function useAudiencePlayers() {
  const [players, setPlayers] = useState<PlayerStatus[]>([]);

  const applyPlayersInfo = useCallback((message: WebSocketMessage) => {
    const snapshot = normalizePlayerSnapshot(message);
    setPlayers((previous) => buildPlayersSnapshot(snapshot.players, snapshot.scoreboard, snapshot.profiles, previous));
  }, []);

  const applyScoreUpdate = useCallback((message: WebSocketMessage) => {
    if (
      (typeof message.user_code === "string" || typeof message.user_code === "number") &&
      typeof message.new_total_score === "number"
    ) {
      const userCode = String(message.user_code);
      const score = message.new_total_score;
      setPlayers((previous) => previous.map((player) =>
        player.playerCode === userCode ? { ...player, playerScore: score } : player,
      ));
    }
  }, []);

  const applyAnswers = useCallback((message: WebSocketMessage) => {
    const answers = getAnswers(message);
    setPlayers((previous) => previous.map((player) => {
      const answer = answers.find((item) => String(item.user_code) === player.playerCode);
      if (!answer) return player;
      return {
        ...player,
        playerLastAnswer: answer.content ?? answer.answer_text,
        playerTimestamp: message.type === "send_keyword_answers"
          ? undefined
          : answer.timestamp ?? player.playerTimestamp,
        playerKeywordCluesOpened: answer.clues_opened ?? player.playerKeywordCluesOpened,
      };
    }));
  }, []);

  const applyKeywordSubmit = useCallback((message: WebSocketMessage) => {
    if (typeof message.user_code !== "string" && typeof message.user_code !== "number") return;
    const userCode = String(message.user_code);
    const cluesOpened = typeof message.clues_opened === "number" ? message.clues_opened : undefined;
    setPlayers((previous) => previous.map((player) =>
      player.playerCode === userCode
        ? {
            ...player,
            playerHasSubmittedKeyword: true,
            playerKeywordCluesOpened: cluesOpened ?? player.playerKeywordCluesOpened,
          }
        : player,
    ));
  }, []);

  const applyBuzz = useCallback((message: WebSocketMessage) => {
    if (typeof message.user_code !== "string" && typeof message.user_code !== "number") return;
    const userCode = String(message.user_code);
    setPlayers((previous) => previous.map((player) =>
      player.playerCode === userCode ? { ...player, playerHasBuzzed: true } : player,
    ));
  }, []);

  const applyPlayerPower = useCallback((userCode: string, power: "star" | "shield") => {
    setPlayers((previous) => previous.map((player) =>
      player.playerCode === userCode ? { ...player, playerPower: power } : player,
    ));
  }, []);

  const applyWrongAttempt = useCallback((message: WebSocketMessage) => {
    if (
      (typeof message.user_code !== "string" && typeof message.user_code !== "number") ||
      typeof message.attempt_count !== "number"
    ) return;
    const userCode = String(message.user_code);
    const attempts = message.attempt_count;
    setPlayers((previous) => previous.map((player) =>
      player.playerCode === userCode ? { ...player, playerWrongAttempts: attempts } : player,
    ));
  }, []);

  const clearAnswers = useCallback(() => {
    setPlayers((previous) => previous.map((player) => ({
      ...player,
      playerLastAnswer: undefined,
      playerTimestamp: undefined,
      playerHasBuzzed: undefined,
      playerWrongAttempts: undefined,
    })));
  }, []);

  return {
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    applyBuzz,
    applyPlayerPower,
    applyWrongAttempt,
    applyKeywordSubmit,
    clearAnswers,
  };
}
