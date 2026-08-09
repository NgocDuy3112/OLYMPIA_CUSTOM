/**
 * usePlayerRound — Shared hook for all player game round pages.
 *
 * Encapsulates: WebSocket message handling, timer sync, player state updates.
 */
import { useEffect, useRef, useState } from "react";
import { useGameWebSocket } from "./useGameWebSocket";
import { useCountdownTimer } from "./useCountdownTimer";
import { useQuestionState } from "./useQuestionState";
import { useAudiencePlayers } from "./useAudiencePlayers";
import type { PlayerStatus } from "@/types/player";

export interface UsePlayerRoundOptions {
  /** Whether to play audio on timer start */
  audioSrc?: string;
}

export interface UsePlayerRoundReturn {
  // WebSocket
  isConnected: boolean;
  lastMessage: any;
  sendMessage: (payload: any) => Promise<boolean>;

  // Timer
  timer: number;
  timeLimit: number;
  startSynced: (timeLimit: number, startedAt: number) => void;
  getElapsedSeconds: () => number;

  // Question
  currentQuestion: any;
  currentQuestionIndex: number;
  applyWsMessage: (msg: any) => void;

  // Players
  players: PlayerStatus[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;
  applyPlayersInfo: (msg: any) => void;
  applyScoreUpdate: (msg: any) => void;
  applyAnswers: (msg: any) => void;
  applyWrongAttempt: (msg: any) => void;
  clearAnswers: () => void;

  // Extra states
  showAnswers: boolean;
  setShowAnswers: (v: boolean) => void;
  videoPlayState: "playing" | "paused" | null;
  setVideoPlayState: (v: "playing" | "paused" | null) => void;
  timerHasStarted: boolean;
  setTimerHasStarted: (v: boolean) => void;
}

export function usePlayerRound(options: UsePlayerRoundOptions = {}): UsePlayerRoundReturn {
  const { audioSrc } = options;
  const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
  const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
  const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
  const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyWrongAttempt, clearAnswers } = useAudiencePlayers();

  const [showAnswers, setShowAnswers] = useState(false);
  const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
  const [timerHasStarted, setTimerHasStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  // Base WebSocket message handling
  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;

    queueMicrotask(() => {
      applyWsMessage(msg);

      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;

        case "player_score_updated":
          applyScoreUpdate(msg);
          break;

        case "start_the_timer": {
          const tl = Number(msg.time_limit ?? 0);
          const sa = typeof msg.started_at === 'string' ? parseInt(msg.started_at, 10) : Number(msg.started_at ?? Date.now());
          startSynced(tl, sa);
          setTimerHasStarted(true);
          setShowAnswers(false);
          setVideoPlayState("playing");

          // Play audio if provided
          if (audioSrc) {
            audioRef.current?.pause();
            audioRef.current = new Audio(audioSrc);
            audioRef.current.play().catch(() => {});
          }
          break;
        }

        case "clear_question":
        case "send_question":
          setVideoPlayState(null);
          break;

        case "media_control":
          setVideoPlayState(msg.action === "pause" ? "paused" : "playing");
          break;

        case "clear_answers":
          clearAnswers();
          setShowAnswers(false);
          setTimerHasStarted(false);
          break;

        case "send_answers_to_players":
          applyAnswers(msg);
          setShowAnswers(true);
          break;

        case "player_wrong_attempt":
          applyWrongAttempt(msg);
          break;
      }
    });
  }, [lastMessage, applyWsMessage, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyWrongAttempt, clearAnswers, startSynced, audioSrc]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    timer,
    timeLimit,
    startSynced,
    getElapsedSeconds,
    currentQuestion,
    currentQuestionIndex,
    applyWsMessage,
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    applyWrongAttempt,
    clearAnswers,
    showAnswers,
    setShowAnswers,
    videoPlayState,
    setVideoPlayState,
    timerHasStarted,
    setTimerHasStarted,
  };
}
