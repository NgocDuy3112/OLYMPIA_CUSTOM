/**
 * useGameRound — Unified hook for admin/MC game round pages.
 *
 * Encapsulates: players state, timer, question loading, score management,
 * WebSocket message handling, and snapshot broadcasting.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameWebSocket } from "./useGameWebSocket";
import { usePlayerTelemetry } from "./usePlayerTelemetry";
import { useQuestionTimerLock } from "./useQuestionTimerLock";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { API_BASE_URL } from "@/configs";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";

const logger = createLogger("useGameRound");

export interface GameRoundConfig {
  /** Round code for navigation, e.g. "kdc", "bp", "gm" */
  round: string;
  /** Question code prefix, e.g. "OC3_Q_KD_C" */
  questionPrefix: string;
  /** Timer duration in seconds */
  timeLimit: number;
  /** Phase code for timer broadcast */
  timerPhase: string;
}

export interface UseGameRoundReturn {
  // State
  players: PlayerStatus[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerStatus[]>>;
  currentQuestion: Question;
  currentQuestionIndex: number;
  setCurrentQuestionIndex: React.Dispatch<React.SetStateAction<number>>;
  timer: number;
  isTimerRunning: boolean;
  selectedPlayerCodes: string[];
  hasAddedScore: boolean;

  // Derived
  matchCode: string;
  hasQuestionSelected: boolean;

  // Actions
  toggleSelectedPlayer: (code: string) => void;
  loadQuestion: (index: number) => Promise<Question | undefined>;
  sendQuestionToPlayers: (index: number, question?: Question) => Promise<void>;
  startTimer: (index?: number) => Promise<void>;
  showAnswers: () => Promise<void>;
  calculateAndBroadcastScore: (action: string) => Promise<void>;
  handleEditScore: (playerCode: string, newScore: number) => void;
  endRound: () => Promise<void>;
  clearQuestion: () => Promise<void>;
  sendPlayersSnapshot: () => Promise<void>;
  sendRoundSnapshot: () => Promise<void>;

  // Refs
  timerRef: React.MutableRefObject<number>;
  timerStartedAtRef: React.MutableRefObject<number>;
}

const DEFAULT_QUESTION: Question = {
  questionCode: "",
  questionText: "",
  questionAnswer: "",
  questionExplanation: "",
  questionMediaURL: undefined,
};

export function useGameRound(config: GameRoundConfig): UseGameRoundReturn {
  const { round, questionPrefix, timeLimit, timerPhase } = config;
  const navigate = useNavigate();
  const { lastMessage, sendMessage } = useGameWebSocket();

  const storedMatchCode = localStorage.getItem("matchCode") || "";
  const matchCode = storedMatchCode;

  // ── Players ──
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });

  // ── Question ──
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

  // ── Timer ──
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(0);
  const timerStartedAtRef = useRef(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // ── Selection ──
  const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
  const [hasAddedScore, setHasAddedScore] = useState(false);

  // ── Timer lock ──
  const { isLocked: isTimerLocked, lock: lockTimer } = useQuestionTimerLock(currentQuestion.questionCode);

  // ── Derived ──
  const hasQuestionSelected = currentQuestionIndex > 0;

  // ── Sync timerRef ──
  useEffect(() => { timerRef.current = timer; }, [timer]);

  // ── Reset hasAddedScore on question change ──
  useEffect(() => { setHasAddedScore(false); }, [currentQuestionIndex]);

  // ── Helpers ──
  const resolveQuestionCode = useCallback((index: number) => {
    return `${questionPrefix}_${String(index)}`;
  }, [questionPrefix]);

  const toggleSelectedPlayer = useCallback((code: string) => {
    setSelectedPlayerCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }, []);

  // ── Players snapshot ──
  const loadPlayersState = useCallback(async () => {
    if (!matchCode) return undefined;
    try {
      const snapshot = await loadAdminPlayersSnapshot(matchCode);
      setPlayers(prev => buildPlayersSnapshot(snapshot.players, snapshot.scoreboard, snapshot.profiles, prev));
      return snapshot;
    } catch (error) {
      logger.error("Failed to load players:", error);
      return undefined;
    }
  }, [matchCode]);

  const applyPlayersSnapshot = useCallback((payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
    const playersList = Array.isArray(payload?.players) ? payload.players : [];
    const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
    const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
    setPlayers(prev => buildPlayersSnapshot(playersList, scoreboardList, profileList, prev));
  }, []);

  const sendPlayersSnapshot = useCallback(async () => {
    if (!matchCode) return;
    try {
      const snapshot = await loadPlayersState();
      if (!snapshot) return;

      const mergedPlayers = (snapshot.players ?? []).map((p: any) => {
        const userCode = String(p?.user_code ?? p?.playerCode ?? "");
        const profile = (snapshot.profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {};
        const scoreEntry = (snapshot.scoreboard ?? []).find((s: any) => String(s?.user_code) === userCode) ?? {};
        const cumulativeScore = scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? 0;

        return {
          user_code: userCode,
          user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
          position: p?.position ?? undefined,
          cumulative_score: cumulativeScore,
        };
      });

      await sendMessage({ type: "send_players_info", players: mergedPlayers });
    } catch (err) {
      logger.error("Failed to send players snapshot:", err);
    }
  }, [matchCode, loadPlayersState, sendMessage]);

  // ── Question loading ──
  const loadQuestion = useCallback(async (index: number): Promise<Question | undefined> => {
    if (!matchCode || index <= 0) {
      setCurrentQuestion({ ...DEFAULT_QUESTION });
      return { ...DEFAULT_QUESTION };
    }

    const questionCode = resolveQuestionCode(index);

    try {
      const res = await fetch(
        `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}&question_code=${encodeURIComponent(questionCode)}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        const mapped = mapQuestionApiPayload(null, questionCode);
        setCurrentQuestion(mapped);
        return mapped;
      }

      const data = await res.json();
      let payload: any = null;

      if (Array.isArray(data.data)) {
        payload = data.data.find((q: any) => String(q?.question_code) === questionCode) ?? data.data[0] ?? null;
      } else {
        payload = data.data ?? null;
      }

      const mapped = mapQuestionApiPayload(payload, questionCode);
      setCurrentQuestion(mapped);
      return mapped;
    } catch (error) {
      logger.error("Failed to load question:", error);
      const mapped = mapQuestionApiPayload(null, questionCode);
      setCurrentQuestion(mapped);
      return mapped;
    }
  }, [matchCode, resolveQuestionCode]);

  const sendQuestionToPlayers = useCallback(async (index: number, question?: Question) => {
    if (!matchCode || index <= 0) return;

    const questionCode = resolveQuestionCode(index);
    const q = question ?? currentQuestion;

    try {
      await sendMessage({
        type: "send_question",
        user_code: "",
        question_code: questionCode,
        content: q.questionText ?? "",
        media_source: q.questionMediaURL ?? undefined,
      });
    } catch (error) {
      logger.error("Failed to broadcast question:", error);
    }
  }, [matchCode, resolveQuestionCode, sendMessage, currentQuestion]);

  const clearQuestion = useCallback(async () => {
    if (!matchCode) return;
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    try {
      await sendMessage({ type: "clear_question", user_code: "" });
    } catch (error) {
      logger.error("Failed to clear question:", error);
    }
  }, [matchCode, sendMessage]);

  // ── Timer ──
  const startTimer = useCallback(async (index?: number) => {
    if (isTimerLocked) return;
    lockTimer();

    const targetIndex = index ?? currentQuestionIndex;
    if (targetIndex <= 0) return;

    const questionCode = resolveQuestionCode(targetIndex);
    const startedAt = Date.now();
    timerStartedAtRef.current = startedAt;
    setTimer(timeLimit);
    setIsTimerRunning(true);

    // Clear player answers
    setPlayers(prev => prev.map(p => ({
      ...p,
      playerLastAnswer: undefined,
      playerTimestamp: undefined,
      playerHasBuzzed: undefined,
    })));

    try {
      await sendStartTimer({ sendMessage, phase: timerPhase, timeLimit, questionCode, startedAt });
    } catch (error) {
      logger.error("Failed to start timer:", error);
    }
  }, [currentQuestionIndex, isTimerLocked, lockTimer, resolveQuestionCode, sendMessage, timeLimit, timerPhase]);

  // Timer countdown
  useEffect(() => {
    if (timer <= 0) {
      setIsTimerRunning(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timer]);

  // ── Score ──
  const syncAndBroadcastScores = useCallback(async () => {
    if (!matchCode) return;

    try {
      const res = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, { credentials: "include" });
      const json = await res.json();

      let scoreboardArr: any[] = [];
      if (Array.isArray(json.data)) scoreboardArr = json.data;
      else if (Array.isArray(json.data?.scoreboard)) scoreboardArr = json.data.scoreboard;

      setPlayers(prev => prev.map(player => {
        const entry = scoreboardArr.find((item: any) => item.user_code === player.playerCode);
        const updatedScore = entry?.cumulative_score ?? entry?.total_score;
        return typeof updatedScore === "number" ? { ...player, playerScore: updatedScore } : player;
      }));

      for (const entry of scoreboardArr) {
        const userCode = String(entry?.user_code ?? "");
        const totalScore = entry?.cumulative_score ?? entry?.total_score;
        if (userCode && typeof totalScore === "number") {
          void sendMessage({ type: "player_score_updated", user_code: userCode, new_total_score: totalScore });
        }
      }

      await sendPlayersSnapshot();
    } catch (err) {
      logger.error("Failed to sync scores:", err);
    }
  }, [matchCode, sendMessage, sendPlayersSnapshot]);

  const calculateAndBroadcastScore = useCallback(async (action: string) => {
    if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode || !matchCode) return;
    setHasAddedScore(true);

    try {
      await calculateScore(matchCode, currentQuestion.questionCode, action, selectedPlayerCodes);
      await syncAndBroadcastScores();
      setSelectedPlayerCodes([]);
    } catch (err) {
      logger.error("Failed to calculate score:", err);
      setHasAddedScore(false);
    }
  }, [selectedPlayerCodes, currentQuestion.questionCode, matchCode, syncAndBroadcastScores]);

  const handleEditScore = useCallback((playerCode: string, newScore: number) => {
    setPlayers(prev => prev.map(p => p.playerCode === playerCode ? { ...p, playerScore: newScore } : p));
    void sendPlayersSnapshot();
  }, [sendPlayersSnapshot]);

  // ── Show answers ──
  const showAnswers = useCallback(async () => {
    if (!currentQuestion.questionCode || !matchCode) return;

    const questionCode = currentQuestion.questionCode;
    const answersPayload: Array<{ user_code: string; content: string; timestamp: number }> = [];

    for (const player of players) {
      try {
        const res = await fetch(
          `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(matchCode)}&user_code=${encodeURIComponent(player.playerCode)}&question_code=${encodeURIComponent(questionCode)}`,
          { credentials: "include" }
        );
        if (!res.ok) continue;

        const json = await res.json();
        const data = json.data;
        if (!data) continue;

        const answerObj = Array.isArray(data)
          ? data.reduce((a: any, b: any) => (b.timestamp > a.timestamp ? b : a), data[0])
          : data;

        if (answerObj?.answer_text) {
          answersPayload.push({
            user_code: player.playerCode,
            content: answerObj.answer_text,
            timestamp: answerObj.timestamp || 0,
          });
        }
      } catch (err) {
        logger.warn("Failed to fetch answer for", player.playerCode, err);
      }
    }

    try {
      await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
    } catch (err) {
      logger.error("Failed to broadcast answers:", err);
    }
  }, [currentQuestion, matchCode, players, sendMessage]);

  // ── End round ──
  const endRound = useCallback(async () => {
    setCurrentQuestionIndex(0);
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    setTimer(0);
    setIsTimerRunning(false);
    setSelectedPlayerCodes([]);
    await clearQuestion();

    if (!matchCode) return;
    try {
      await endRoundAndReturnToWaiting({ currentMatchCode: matchCode, navigate, round, sendMessage });
    } catch (error) {
      logger.error("Failed to end round:", error);
    }
  }, [clearQuestion, matchCode, navigate, round, sendMessage]);

  const sendRoundSnapshot = useCallback(async () => {
    await sendPlayersSnapshot();
    if (currentQuestionIndex > 0 && currentQuestion.questionCode) {
      await sendQuestionToPlayers(currentQuestionIndex);
    }
  }, [sendPlayersSnapshot, sendQuestionToPlayers, currentQuestionIndex, currentQuestion]);

  // ── Load players on mount ──
  useEffect(() => {
    void loadPlayersState();
  }, [loadPlayersState]);

  // ── WebSocket message handling ──
  useEffect(() => {
    if (!lastMessage) return;
    const msg: any = lastMessage;

    switch (msg?.type) {
      case "player_reconnected": {
        void sendRoundSnapshot();
        break;
      }
      case "player_offline": {
        if (msg.user_code) {
          setPlayers(prev => prev.map(p => p.playerCode === msg.user_code ? { ...p, playerConnected: false } : p));
        }
        break;
      }
      case "send_players_info": {
        applyPlayersSnapshot(msg);
        break;
      }
      case "player_score_updated": {
        if (msg.user_code && typeof msg.new_total_score === "number") {
          setPlayers(prev => prev.map(p =>
            p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p
          ));
        }
        break;
      }
      case "clear_answers": {
        setPlayers(prev => prev.map(p => ({
          ...p,
          playerLastAnswer: undefined,
          playerTimestamp: undefined,
        })));
        break;
      }
      case "send_answers_to_players": {
        const answers = Array.isArray(msg.answers) ? msg.answers : [];
        setPlayers(prev => prev.map(player => {
          const answer = answers.find((item: any) => item.user_code === player.playerCode);
          if (!answer) return player;
          return {
            ...player,
            playerLastAnswer: answer.content ?? answer.answer_text ?? player.playerLastAnswer,
            playerTimestamp: answer.timestamp ?? player.playerTimestamp,
          };
        }));
        break;
      }
      case "player_answer":
      case "answer": {
        const { user_code, answer_text, timestamp } = msg;
        if (user_code && answer_text) {
          setPlayers(prev => prev.map(p =>
            p.playerCode === user_code
              ? { ...p, playerLastAnswer: answer_text, playerTimestamp: timestamp ?? p.playerTimestamp }
              : p
          ));
        }
        break;
      }
    }
  }, [lastMessage, applyPlayersSnapshot, sendRoundSnapshot]);

  return {
    players,
    setPlayers,
    currentQuestion,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    timer,
    isTimerRunning,
    selectedPlayerCodes,
    hasAddedScore,
    matchCode,
    hasQuestionSelected,
    toggleSelectedPlayer,
    loadQuestion,
    sendQuestionToPlayers,
    startTimer,
    showAnswers,
    calculateAndBroadcastScore,
    handleEditScore,
    endRound,
    clearQuestion,
    sendPlayersSnapshot,
    sendRoundSnapshot,
    timerRef,
    timerStartedAtRef,
  };
}
