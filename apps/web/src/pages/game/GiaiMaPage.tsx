/**
 * GiaiMaPage — Unified page for Giải Mã (decode game).
 *
 * Admin: clue grid management, hint reveal/hide, keyword phase, scoring.
 * MC: read-only audience view.
 * Player: clue display, answer input, keyword submission.
 */
import React, {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlarmClockCheck,
  Calculator,
  Power,
  Eye,
  EyeOff,
  Lightbulb,
  KeyRound,
} from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { useRoleSession } from "@/hooks/useRoleSession";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { buildKeywordBanner } from "@/utils/keywordBanner";
import { submitAnswer } from "@/api/answers";
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { RenderMedia } from "@/components/shared/RenderMedia";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { GiaiMaAudiencePage } from "@/components/shared/GiaiMaAudiencePage";

const logger = createLogger("GiaiMaPage");
const TIME_LIMIT = 15;
const CLUE_COUNT = 8;
const CLUE_QUESTION_PREFIX = "OC3_Q_GM_";
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY";

const DEFAULT_QUESTION: Question = {
  questionCode: "",
  questionText: "",
  questionAnswer: "",
  questionExplanation: "",
  questionMediaURL: undefined,
};

type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

const isMediaFilename = (v: string): boolean =>
  /\.(mp3|ogg|wav|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(
    v.trim(),
  );

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminGiaiMaView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const storedMatchCode = localStorage.getItem("matchCode");
  const currentMatchCode = urlMatchCode || storedMatchCode || "";

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== storedMatchCode) {
      try {
        localStorage.setItem("matchCode", urlMatchCode);
      } catch {}
    }
  }, [urlMatchCode, storedMatchCode]);
  useEffect(() => {
    if (!currentMatchCode) navigate("/admin/manage");
  }, [currentMatchCode, navigate]);

  const { lastMessage, sendMessage } = useGameWebSocket();
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });
  const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
  const toggleSelectedPlayer = useCallback((playerCode: string) => {
    setSelectedPlayerCodes((prev) =>
      prev.includes(playerCode)
        ? prev.filter((c) => c !== playerCode)
        : [...prev, playerCode],
    );
  }, []);

  const [clueQuestions, setClueQuestions] = useState<(Question | null)[]>(() =>
    Array(CLUE_COUNT).fill(null),
  );
  const [clueStates, setClueStates] = useState<ClueState[]>(() =>
    Array(CLUE_COUNT).fill("idle"),
  );
  const [activeClueIndex, setActiveClueIndex] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    ...DEFAULT_QUESTION,
  });
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [hasAddedKeywordScore, setHasAddedKeywordScore] = useState(false);
  const [shownHintContent, setShownHintContent] = useState<string | null>(null);
  const [hintHidden, setHintHidden] = useState(false);
  const [revealedHints, setRevealedHints] = useState<
    Record<number, RevealedHint>
  >({});
  const [, setCorrectClues] = useState<Set<number>>(new Set());
  const [pendingClueAction, setPendingClueAction] = useState(false);
  const [, setTotalOpenedCluesCount] = useState(0);
  const [hideQuestionContent, setHideQuestionContent] = useState(false);
  const [isKeywordTimerRunning, setIsKeywordTimerRunning] = useState(false);
  const [timedClueCodes, setTimedClueCodes] = useState<Set<string>>(new Set());
  const [keywordTimerStarted, setKeywordTimerStarted] = useState(false);
  const [keywordSubmissions, setKeywordSubmissions] = useState<
    Record<string, { text: string; cluesOpened?: number }>
  >({});
  const [keywordAnswerRevealed, setKeywordAnswerRevealed] = useState(false);
  const [keywordQuestion, setKeywordQuestion] = useState<Question | null>(null);
  const [keywordRevealedCodes, setKeywordRevealedCodes] = useState<Set<string>>(
    new Set(),
  );
  const [keywordPhaseActive, setKeywordPhaseActive] = useState(false);
  const [keywordCluesLocked, setKeywordCluesLocked] = useState(false);
  const [keyInfo, setKeyInfo] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");

  const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode;

  useEffect(() => {
    Promise.resolve().then(() => {
      setShownHintContent(null);
      setHintHidden(false);
    });
  }, [activeClueIndex]);

  const loadClueQuestion = useCallback(
    async (clueIndex: number): Promise<Question | undefined> => {
      if (!currentMatchCode) return undefined;
      const questionCode = `${CLUE_QUESTION_PREFIX}${clueIndex + 1}`;
      try {
        const res = await fetch(
          `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`,
          { credentials: "include" },
        );
        if (!res.ok) return mapQuestionApiPayload(null, questionCode);
        const data = await res.json();
        let payload: any = null;
        if (Array.isArray(data.data))
          payload =
            data.data.find(
              (q: any) => String(q?.question_code) === questionCode,
            ) ??
            data.data[0] ??
            null;
        else payload = data.data ?? null;
        return mapQuestionApiPayload(payload, questionCode);
      } catch (err) {
        logger.error("loadClueQuestion failed:", err);
        return mapQuestionApiPayload(null, questionCode);
      }
    },
    [currentMatchCode],
  );

  useEffect(() => {
    if (!currentMatchCode) return;
    let mounted = true;
    const fetchAdminState = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/gm/admin-state?match_code=${encodeURIComponent(currentMatchCode)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const json = await res.json();
        const snap = json?.data ?? {};
        if (!mounted || !snap || typeof snap !== "object") return;
        startTransition(() => {
          if (
            Array.isArray(snap.clue_states) &&
            snap.clue_states.length === CLUE_COUNT
          )
            setClueStates(snap.clue_states as ClueState[]);
          if (snap.revealed_hints && typeof snap.revealed_hints === "object") {
            const normalised: Record<number, RevealedHint> = {};
            for (const [k, v] of Object.entries(
              snap.revealed_hints as Record<string, any>,
            )) {
              const idx = Number(k);
              if (Number.isInteger(idx) && idx >= 0 && idx < CLUE_COUNT) {
                const payload = v ?? {};
                normalised[idx] = {
                  text: payload.text || undefined,
                  mediaUrl: payload.media_url || undefined,
                };
              }
            }
            setRevealedHints(normalised);
          }
          if (
            snap.active_clue_index !== undefined &&
            snap.active_clue_index !== null
          ) {
            const idx = Number(snap.active_clue_index);
            if (Number.isInteger(idx) && idx >= 0 && idx < CLUE_COUNT)
              setActiveClueIndex(idx);
          }
          if (
            snap.current_question &&
            typeof snap.current_question === "object"
          ) {
            const q = snap.current_question;
            if (q.question_code)
              setCurrentQuestion({
                questionCode: String(q.question_code),
                questionText: String(q.content ?? ""),
                questionAnswer: "",
                questionExplanation: "",
                questionMediaURL: q.media_url || undefined,
              });
          }
          if (typeof snap.timer === "number") {
            setTimer(snap.timer);
            timerRef.current = snap.timer;
          }
          if (typeof snap.is_keyword_timer_running === "boolean")
            setIsKeywordTimerRunning(snap.is_keyword_timer_running);
          if (typeof snap.total_opened_clues_count === "number")
            setTotalOpenedCluesCount(snap.total_opened_clues_count);
          if (typeof snap.keyword_phase_active === "boolean")
            setKeywordPhaseActive(snap.keyword_phase_active);
          if (typeof snap.keyword_clues_locked === "boolean")
            setKeywordCluesLocked(snap.keyword_clues_locked);
          if (typeof snap.keyword_answer_revealed === "boolean")
            setKeywordAnswerRevealed(snap.keyword_answer_revealed);
          if (typeof snap.keyword_banner === "string" && snap.keyword_banner)
            setKeyInfo(snap.keyword_banner);
          if (typeof snap.hidden_question_content === "boolean")
            setHideQuestionContent(snap.hidden_question_content);
          if (typeof snap.has_added_keyword_score === "boolean")
            setHasAddedKeywordScore(snap.has_added_keyword_score);
          if (typeof snap.pending_clue_action === "boolean")
            setPendingClueAction(snap.pending_clue_action);
          if (typeof snap.hint_hidden === "boolean")
            setHintHidden(snap.hint_hidden);
          if (snap.shown_hint_content !== undefined)
            setShownHintContent(
              snap.shown_hint_content === null
                ? null
                : String(snap.shown_hint_content),
            );
          if (
            snap.keyword_submissions &&
            typeof snap.keyword_submissions === "object"
          )
            setKeywordSubmissions(snap.keyword_submissions);
          if (Array.isArray(snap.keyword_revealed_codes))
            setKeywordRevealedCodes(new Set(snap.keyword_revealed_codes));
          if (Array.isArray(snap.correct_clues))
            setCorrectClues(new Set(snap.correct_clues));
        });
      } catch (err) {
        logger.warn("[GM REHYDRATE] fetch failed:", err);
      }
    };
    void fetchAdminState();
    return () => {
      mounted = false;
    };
  }, [currentMatchCode]);

  useEffect(() => {
    const fetchAll = async () => {
      const results = await Promise.all(
        Array.from({ length: CLUE_COUNT }, (_, i) => loadClueQuestion(i)),
      );
      setClueQuestions(results.map((q) => q ?? null));
    };
    void fetchAll();
  }, [loadClueQuestion]);

  const broadcastKeywordInfo = useCallback(async () => {
    if (!currentMatchCode) return;
    try {
      await sendMessage({
        type: "send_keyword_info",
        user_code: "",
        banner: keyInfo,
      });
    } catch (err) {
      logger.error("broadcastKeywordInfo failed:", err);
    }
  }, [currentMatchCode, sendMessage, keyInfo]);

  useEffect(() => {
    const fetchKeywordQ = async () => {
      if (!currentMatchCode) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(KEYWORD_QUESTION_CODE)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const data = await res.json();
        let payload: any = null;
        if (Array.isArray(data.data))
          payload =
            data.data.find(
              (q: any) => String(q?.question_code) === KEYWORD_QUESTION_CODE,
            ) ??
            data.data[0] ??
            null;
        else payload = data.data ?? null;
        if (payload) {
          const q = mapQuestionApiPayload(payload, KEYWORD_QUESTION_CODE);
          setKeywordQuestion(q);
          const answer: string = q.questionAnswer ?? "";
          if (answer) {
            const banner = buildKeywordBanner(answer);
            setKeyInfo(banner);
            void sendMessage({
              type: "send_keyword_info",
              user_code: "",
              banner,
            });
          }
        }
      } catch (err) {
        logger.error("fetchKeywordQ failed:", err);
      }
    };
    void fetchKeywordQ();
  }, [currentMatchCode, sendMessage]);

  const applyPlayersSnapshot = useCallback(
    (payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
      const playersList = Array.isArray(payload?.players)
        ? payload.players
        : [];
      const scoreboardList = Array.isArray(payload?.scoreboard)
        ? payload.scoreboard
        : [];
      const profileList = Array.isArray(payload?.profiles)
        ? payload.profiles
        : [];
      setPlayers((prev) =>
        buildPlayersSnapshot(playersList, scoreboardList, profileList, prev),
      );
    },
    [],
  );

  const loadPlayersState = useCallback(async () => {
    if (!currentMatchCode) return undefined;
    try {
      const snapshot = await loadAdminPlayersSnapshot(currentMatchCode);
      setPlayers((prev) =>
        buildPlayersSnapshot(
          snapshot.players,
          snapshot.scoreboard,
          snapshot.profiles,
          prev,
        ),
      );
      return snapshot;
    } catch (err) {
      logger.error("Failed to load players:", err);
      return undefined;
    }
  }, [currentMatchCode]);

  const sendPlayersSnapshot = useCallback(async () => {
    if (!currentMatchCode) return;
    try {
      const payload = await loadPlayersState();
      if (!payload) return;
      const mergedPlayers = (payload.players ?? []).map((p: any) => {
        const userCode = String(p?.user_code ?? p?.playerCode ?? "");
        const profile =
          (payload.profiles ?? []).find(
            (pr: any) => String(pr?.user_code) === userCode,
          ) ?? {};
        const scoreEntry =
          (payload.scoreboard ?? []).find(
            (s: any) => String(s?.user_code) === userCode,
          ) ?? {};
        const cumulativeScore =
          scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? 0;
        return {
          user_code: userCode,
          user_name:
            profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
          position: p?.position ?? undefined,
          cumulative_score: cumulativeScore,
        };
      });
      await sendMessage({
        type: "send_players_info",
        user_code: "",
        players: mergedPlayers,
      });
    } catch (err) {
      logger.error("Failed to send players snapshot:", err);
    }
  }, [currentMatchCode, loadPlayersState, sendMessage]);

  const sendSpecificRoundSnapshot = useCallback(async () => {
    if (currentQuestion.questionCode) {
      await sendMessage({
        type: "send_question",
        user_code: "",
        question_code: currentQuestion.questionCode,
        content: currentQuestion.questionText ?? "",
        media_source: currentQuestion.questionMediaURL ?? undefined,
      });
    }
    if (isTimerRunning && timerRef.current > 0) {
      await sendStartTimer({
        sendMessage,
        phase: isKeywordTimerRunning ? "gm_keyword" : "gm",
        timeLimit: timerRef.current,
        questionCode: currentQuestion.questionCode,
      });
    }
    await broadcastKeywordInfo();
    for (let idx = 0; idx < CLUE_COUNT; idx++) {
      const state = clueStates[idx];
      const question = clueQuestions[idx];
      if (state === "idle" || !question) continue;
      await sendMessage({
        type: "send_question",
        user_code: "",
        question_code: question.questionCode,
        content: question.questionText,
        media_source: question.questionMediaURL ?? undefined,
      });
    }
    if (keywordCluesLocked)
      await sendMessage({
        type: "keyword_clues_locked",
        user_code: "",
        total_clues: CLUE_COUNT,
      });
  }, [
    broadcastKeywordInfo,
    clueQuestions,
    clueStates,
    currentQuestion,
    isKeywordTimerRunning,
    isTimerRunning,
    keywordCluesLocked,
    sendMessage,
  ]);

  const sendRoundSnapshot = useCallback(async () => {
    await sendPlayersSnapshot();
    await sendSpecificRoundSnapshot();
  }, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

  useEffect(() => {
    (async () => {
      if (!lastMessage) return;
      const msg: any = lastMessage;
      switch (msg?.type) {
        case "player_reconnected":
          void sendRoundSnapshot();
          break;
        case "send_players_info":
          startTransition(() => {
            applyPlayersSnapshot(msg);
          });
          break;
        case "player_score_updated":
          if (msg.user_code && typeof msg.new_total_score === "number") {
            startTransition(() => {
              setPlayers((prev) =>
                prev.map((p) =>
                  p.playerCode === msg.user_code
                    ? { ...p, playerScore: msg.new_total_score }
                    : p,
                ),
              );
            });
          }
          break;
        case "player_answer": {
          const { user_code, answer_text, timestamp } = msg;
          if (user_code && answer_text) {
            startTransition(() => {
              setPlayers((prev) =>
                prev.map((p) =>
                  p.playerCode === user_code
                    ? {
                        ...p,
                        playerLastAnswer: answer_text,
                        playerTimestamp: timestamp ?? p.playerTimestamp,
                      }
                    : p,
                ),
              );
            });
          }
          break;
        }
        case "keyword_submit": {
          const { user_code, keyword_text, clues_opened } = msg;
          if (user_code && keyword_text) {
            startTransition(() => {
              setKeywordSubmissions((prev) => ({
                ...prev,
                [user_code]: {
                  text: keyword_text,
                  cluesOpened:
                    typeof clues_opened === "number" ? clues_opened : undefined,
                },
              }));
              setPlayers((prev) =>
                prev.map((p) =>
                  p.playerCode === user_code
                    ? {
                        ...p,
                        playerHasSubmittedKeyword: true,
                        playerKeywordCluesOpened:
                          typeof clues_opened === "number"
                            ? clues_opened
                            : p.playerKeywordCluesOpened,
                      }
                    : p,
                ),
              );
            });
          }
          break;
        }
        case "keyword_clues_locked":
          startTransition(() => {
            setKeywordCluesLocked(true);
          });
          break;
      }
    })();
  }, [applyPlayersSnapshot, lastMessage, sendMessage, sendRoundSnapshot]);

  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setTimer((prev) => {
        const next = Math.max(0, prev - 1);
        timerRef.current = next;
        if (next === 0) {
          setIsTimerRunning(false);
          window.clearInterval(id);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning]);

  useEffect(() => {
    if (isTimerRunning) return;
    if (!isKeywordTimerRunning) return;
    setIsKeywordTimerRunning(false);
    void sendMessage({ type: "keyword_locked" });
  }, [isTimerRunning, isKeywordTimerRunning, sendMessage]);

  useEffect(() => {
    startTransition(() => {
      void loadPlayersState();
    });
  }, [loadPlayersState]);

  const handleRevealClue = useCallback(
    async (clueIndex: number) => {
      const q = clueQuestions[clueIndex];
      if (!q) return;
      const nextStates = clueStates.map((s, i) => {
        if (i === activeClueIndex && activeClueIndex !== clueIndex)
          return "used" as ClueState;
        if (i === clueIndex) return "active" as ClueState;
        return s;
      });
      setClueStates(nextStates);
      setActiveClueIndex(clueIndex);
      setCurrentQuestion({ ...q });
      setSelectedPlayerCodes([]);
      setPendingClueAction(true);
      setHideQuestionContent(false);
      setTotalOpenedCluesCount((prev) => {
        const wasAlreadyOpened = clueStates[clueIndex] !== "idle";
        return wasAlreadyOpened ? prev : prev + 1;
      });
      try {
        await sendMessage({
          type: "send_question",
          user_code: "",
          question_code: q.questionCode,
          content: q.questionText,
          media_source: q.questionMediaURL ?? undefined,
        });
        const wasAlreadyOpened = clueStates[clueIndex] !== "idle";
        if (!wasAlreadyOpened)
          void sendMessage({
            type: "gm_chon_goi_y",
            clue_index: clueIndex,
            question_code: q.questionCode,
          });
      } catch (err) {
        logger.error("handleRevealClue failed:", err);
      }
    },
    [activeClueIndex, clueQuestions, clueStates, sendMessage],
  );

  const handleEndRound = useCallback(async () => {
    setTimer(0);
    setIsTimerRunning(false);
    setIsKeywordTimerRunning(false);
    if (!currentMatchCode) return;
    try {
      await endRoundAndReturnToWaiting({
        currentMatchCode,
        navigate,
        round: "gm",
        sendMessage,
      });
    } catch (err) {
      logger.error("handleEndRound failed:", err);
    }
  }, [currentMatchCode, navigate, sendMessage]);

  const startTheClock = useCallback(async () => {
    if (
      !currentQuestion.questionCode ||
      isTimerRunning ||
      timedClueCodes.has(currentQuestion.questionCode)
    )
      return;
    setTimedClueCodes((prev) =>
      new Set(prev).add(currentQuestion.questionCode),
    );
    setSelectedPlayerCodes([]);
    setKeywordRevealedCodes(new Set());
    setIsKeywordTimerRunning(false);
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        playerLastAnswer: undefined,
        playerTimestamp: undefined,
        playerHasBuzzed: undefined,
      })),
    );
    setTimer(TIME_LIMIT);
    setIsTimerRunning(true);
    if (currentMatchCode) {
      void sendMessage({ type: "clear_answers", user_code: "" });
      void sendStartTimer({
        sendMessage,
        phase: "gm",
        timeLimit: TIME_LIMIT,
        questionCode: currentQuestion.questionCode,
      });
    }
  }, [
    currentMatchCode,
    currentQuestion.questionCode,
    isTimerRunning,
    sendMessage,
    timedClueCodes,
  ]);

  const startKeywordTimer = useCallback(async () => {
    if (
      !keywordPhaseActive ||
      isTimerRunning ||
      isKeywordTimerRunning ||
      keywordTimerStarted ||
      !currentMatchCode
    )
      return;
    setKeywordTimerStarted(true);
    setIsKeywordTimerRunning(true);
    setTimer(15);
    setIsTimerRunning(true);
    await sendStartTimer({
      sendMessage,
      phase: "gm_keyword",
      timeLimit: 15,
      questionCode: KEYWORD_QUESTION_CODE,
    });
    await sendMessage({
      type: "keyword_clues_locked",
      user_code: "",
      total_clues: CLUE_COUNT,
    });
  }, [
    keywordPhaseActive,
    isTimerRunning,
    isKeywordTimerRunning,
    keywordTimerStarted,
    currentMatchCode,
    sendMessage,
  ]);

  const showAnswers = useCallback(async () => {
    if (!canShowAnswers) return;
    const answersPayload = players
      .filter((p) => {
        const isKeywordSubmission =
          keywordSubmissions[p.playerCode] !== undefined;
        return (
          p.playerLastAnswer &&
          !keywordRevealedCodes.has(p.playerCode) &&
          !isKeywordSubmission
        );
      })
      .map((p) => ({
        user_code: p.playerCode,
        content: p.playerLastAnswer!,
        timestamp: p.playerTimestamp ?? 0,
      }));
    try {
      await sendMessage({
        type: "send_answers_to_players",
        answers: answersPayload,
      });
    } catch (err) {
      logger.error("showAnswers failed:", err);
    }
  }, [
    canShowAnswers,
    keywordRevealedCodes,
    keywordSubmissions,
    players,
    sendMessage,
  ]);

  const handleShowHint = useCallback(async () => {
    const explanation = currentQuestion.questionExplanation ?? "";
    const hintText = explanation;
    if (!hintText) return;
    const codeMatch = String(currentQuestion.questionCode ?? "").match(
      /(\d+)\s*$/,
    );
    const codeIndex = codeMatch ? Number(codeMatch[1]) - 1 : null;
    const clueIndexForHint =
      activeClueIndex !== null
        ? activeClueIndex
        : Number.isInteger(codeIndex) &&
            codeIndex !== null &&
            codeIndex >= 0 &&
            codeIndex < CLUE_COUNT
          ? codeIndex
          : null;
    setPendingClueAction(false);
    setShownHintContent(hintText);
    setHideQuestionContent(true);
    if (clueIndexForHint !== null) {
      const idx = clueIndexForHint;
      setActiveClueIndex(idx);
      setRevealedHints((prev) => {
        const next: Record<number, RevealedHint> = { ...prev };
        next[idx] = { text: hintText || undefined };
        return next;
      });
    }
    try {
      await sendMessage({
        type: "show_hint",
        user_code: "",
        hint_content: hintText,
        target_players: selectedPlayerCodes,
        audience_visible: selectedPlayerCodes.length > 0,
        ...(clueIndexForHint !== null
          ? {
              clue_index: clueIndexForHint,
              question_code: currentQuestion.questionCode,
            }
          : {}),
      });
      sendMessage({ type: "gm_dung" });
      if (selectedPlayerCodes.length > 0 && currentQuestion.questionCode) {
        if (clueIndexForHint !== null)
          setCorrectClues((prev) => new Set([...prev, clueIndexForHint]));
        await calculateScore(
          currentMatchCode,
          currentQuestion.questionCode,
          "gm_clue_correct",
          selectedPlayerCodes,
        );
        if (currentMatchCode) {
          try {
            await sendPlayersSnapshot();
          } catch {}
        }
      }
    } catch (err) {
      logger.error("handleShowHint failed:", err);
    }
  }, [
    currentQuestion,
    activeClueIndex,
    sendMessage,
    selectedPlayerCodes,
    currentMatchCode,
    sendPlayersSnapshot,
  ]);

  const handleHideHint = useCallback(async () => {
    setPendingClueAction(false);
    setHintHidden(true);
    setHideQuestionContent(true);
    try {
      await sendMessage({
        type: "hide_hint",
        user_code: "",
        ...(activeClueIndex !== null ? { clue_index: activeClueIndex } : {}),
      });
    } catch (err) {
      logger.error("handleHideHint failed:", err);
    }
  }, [activeClueIndex, sendMessage]);

  const handleRevealKeywordAnswer = useCallback(async () => {
    const answer = keywordQuestion?.questionAnswer;
    if (!answer) return;
    setKeywordAnswerRevealed(true);
    const buildHintFor = (q: Question) => {
      const explanation = q.questionExplanation ?? "";
      return { text: explanation, mediaUrl: undefined as string | undefined };
    };
    const newHints: Record<number, RevealedHint> = {};
    for (let i = 0; i < CLUE_COUNT; i++) {
      const question = clueQuestions[i];
      if (!question) continue;
      const { text, mediaUrl } = buildHintFor(question);
      if (text || mediaUrl)
        newHints[i] = {
          text: text || undefined,
          mediaUrl: mediaUrl || undefined,
        };
    }
    setRevealedHints(newHints);
    setClueStates(Array(CLUE_COUNT).fill("used"));
    setActiveClueIndex(null);
    setTotalOpenedCluesCount(CLUE_COUNT);
    setPendingClueAction(false);
    try {
      await sendMessage({
        type: "reveal_keyword_answer",
        answer,
        keyword_banner: buildKeywordBanner(answer),
      });
      for (let i = 0; i < CLUE_COUNT; i++) {
        const question = clueQuestions[i];
        if (!question) continue;
        const { text, mediaUrl } = buildHintFor(question);
        if (!text && !mediaUrl) continue;
        try {
          await sendMessage({
            type: "show_hint",
            user_code: "",
            hint_content: text,
            hint_media_source: mediaUrl ?? undefined,
            target_players: [],
            audience_visible: true,
            clue_index: i,
          });
        } catch {}
      }
    } catch (err) {
      logger.error("handleRevealKeywordAnswer failed:", err);
    }
  }, [clueQuestions, keywordQuestion?.questionAnswer, sendMessage]);

  const canShowKeywordAnswers =
    keywordPhaseActive &&
    Object.keys(keywordSubmissions).length > 0 &&
    keywordRevealedCodes.size === 0;

  const handleShowKeywordAnswers = useCallback(async () => {
    const answer = keywordQuestion?.questionAnswer;
    if (!answer) return;
    if (!keywordAnswerRevealed) {
      setKeywordAnswerRevealed(true);
      try {
        await sendMessage({
          type: "reveal_keyword_answer",
          answer,
          keyword_banner: buildKeywordBanner(answer),
        });
      } catch {}
    }
    setKeywordRevealedCodes(new Set(Object.keys(keywordSubmissions)));
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        playerLastAnswer:
          keywordSubmissions[p.playerCode]?.text ?? p.playerLastAnswer,
      })),
    );
    const answers = Object.entries(keywordSubmissions).map(
      ([user_code, { text, cluesOpened }]) => ({
        user_code,
        content: text,
        clues_opened: cluesOpened,
      }),
    );
    try {
      await sendMessage({ type: "send_keyword_answers", answers });
    } catch {}
  }, [keywordAnswerRevealed, keywordQuestion, keywordSubmissions, sendMessage]);

  const handleEditScore = useCallback(
    (playerCode: string, newScore: number) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerCode === playerCode ? { ...p, playerScore: newScore } : p,
        ),
      );
      void sendPlayersSnapshot();
    },
    [sendPlayersSnapshot],
  );

  const handleAddKeywordScoreToSelected = useCallback(async () => {
    if (selectedPlayerCodes.length === 0) return;
    setHasAddedKeywordScore(true);
    void sendMessage({ type: "gm_dung_tu_khoa" });
    try {
      for (const code of selectedPlayerCodes) {
        const submission = keywordSubmissions[code];
        if (!submission) continue;
        await calculateScore(
          currentMatchCode,
          KEYWORD_QUESTION_CODE,
          "gm_keyword_correct",
          [code],
        );
      }
      if (currentMatchCode) await sendPlayersSnapshot();
      setSelectedPlayerCodes([]);
    } catch (err) {
      logger.error("handleAddKeywordScoreToSelected failed:", err);
      setHasAddedKeywordScore(false);
    }
  }, [
    selectedPlayerCodes,
    sendMessage,
    currentMatchCode,
    sendPlayersSnapshot,
    keywordSubmissions,
  ]);

  const AdminClueCard: React.FC<{
    index: number;
    state: ClueState;
    onClick: () => void;
    disabled?: boolean;
    hintContent?: RevealedHint;
  }> = ({ index, state, onClick, disabled, hintContent }) => {
    const base =
      "flex-1 h-24 sm:h-28 lg:h-36 xl:h-44 flex items-center justify-center rounded-xl font-bold cursor-pointer transition-all duration-200 select-none border-2";
    const styles: Record<ClueState, string> = {
      idle: "bg-blue-900 border-blue-600 text-white hover:bg-blue-700 shadow",
      active:
        "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
      used: "bg-blue-700 border-blue-500 text-white cursor-default",
    };
    const showHint =
      (state === "active" || state === "used") &&
      !!(hintContent?.text || hintContent?.mediaUrl);
    return (
      <button
        type="button"
        onClick={state === "used" || disabled ? undefined : onClick}
        disabled={disabled && state !== "active"}
        className={`${base} ${styles[state]}`}
        aria-pressed={state === "active"}
        aria-label={`Gợi ý ${index}`}
      >
        {showHint ? (
          <div className="flex items-center justify-center w-full h-full p-3">
            {hintContent!.mediaUrl ? (
              <RenderMedia mediaUrl={hintContent!.mediaUrl} />
            ) : (
              <span className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-center leading-snug">
                {hintContent!.text}
              </span>
            )}
          </div>
        ) : (
          <span className="font-[SVN-Gratelos_Display] text-2xl sm:text-[30pt] lg:text-[40pt] xl:text-[50pt]">
            {index}
          </span>
        )}
      </button>
    );
  };

  const clueGrid = (
    <div className="flex flex-col gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={() => setKeywordPhaseActive((prev) => !prev)}
        className={`w-full rounded-xl px-3 sm:px-6 py-3 sm:py-6 text-center font-[SVN-Gratelos_Display] text-2xl sm:text-3xl lg:text-5xl font-bold text-white uppercase shadow border-2 transition-colors duration-200 cursor-pointer select-none ${keywordPhaseActive ? "bg-blue-500 border-blue-300 ring-2 ring-blue-300" : "bg-blue-900 border-blue-600 hover:bg-blue-800"}`}
      >
        {keywordAnswerRevealed && keywordQuestion?.questionAnswer
          ? `${keywordQuestion.questionAnswer}`
          : keyInfo}
      </button>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full">
        {Array.from({ length: CLUE_COUNT }, (_, i) => (
          <AdminClueCard
            key={i}
            index={i + 1}
            state={clueStates[i]}
            onClick={() => {
              void handleRevealClue(i);
            }}
            disabled={
              isTimerRunning ||
              (pendingClueAction && clueStates[i] !== "active")
            }
            hintContent={revealedHints[i]}
          />
        ))}
      </div>
    </div>
  );

  const questionToShow = isKeywordTimerRunning
    ? { ...currentQuestion, questionText: keyInfo, questionMediaURL: undefined }
    : currentQuestion;

  return (
    <ABasePageLayout
      questionTitle="GIẢI MÃ"
      question={questionToShow}
      timerDuration={timer}
      aboveQuestionBoard={clueGrid}
      boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
      hideQuestionContent={hideQuestionContent || isKeywordTimerRunning}
      controlsChildren={() => null}
      topControlButtons={null}
      bottomActionButtons={
        <>
          <AControlButton
            onClick={() => {
              void handleEndRound();
            }}
            disabled={isTimerRunning || isKeywordTimerRunning}
          >
            <Power size={18} />
            <span className="ml-2 font-bold">KẾT THÚC</span>
          </AControlButton>
        </>
      }
      playerSectionButtons={
        <>
          <AControlButton
            onClick={() => {
              void (keywordPhaseActive ? startKeywordTimer() : startTheClock());
            }}
            disabled={
              isTimerRunning ||
              (keywordPhaseActive
                ? keywordTimerStarted
                : !currentQuestion.questionCode ||
                  timedClueCodes.has(currentQuestion.questionCode))
            }
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void (keywordPhaseActive
                ? handleShowKeywordAnswers()
                : showAnswers());
            }}
            disabled={
              (keywordPhaseActive ? !canShowKeywordAnswers : !canShowAnswers) ||
              isTimerRunning ||
              isKeywordTimerRunning
            }
          >
            <Eye size={18} />
            <span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleShowHint();
            }}
            disabled={
              !currentQuestion.questionCode ||
              shownHintContent !== null ||
              selectedPlayerCodes.length === 0 ||
              isTimerRunning ||
              isKeywordTimerRunning
            }
          >
            <Lightbulb size={18} />
            <span className="ml-2 font-bold">MỞ GỢI Ý</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleHideHint();
            }}
            disabled={
              !currentQuestion.questionCode ||
              hintHidden ||
              isTimerRunning ||
              isKeywordTimerRunning
            }
          >
            <EyeOff size={18} />
            <span className="ml-2 font-bold">KHOÁ GỢI Ý</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleAddKeywordScoreToSelected().catch((err) =>
                logger.error("AddKeywordScore failed:", err),
              );
            }}
            disabled={
              selectedPlayerCodes.length === 0 ||
              hasAddedKeywordScore ||
              isTimerRunning ||
              isKeywordTimerRunning
            }
          >
            <Calculator size={18} />
            <span className="ml-2 font-bold">TÍNH TỪ KHOÁ</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleRevealKeywordAnswer();
            }}
            disabled={
              !keywordPhaseActive ||
              keywordAnswerRevealed ||
              isTimerRunning ||
              isKeywordTimerRunning
            }
          >
            <KeyRound size={18} />
            <span className="ml-2 font-bold">HIỆN TỪ KHOÁ</span>
          </AControlButton>
        </>
      }
      renderPlayerList={() => {
        const keywordPhaseRevealed = keywordRevealedCodes.size > 0;
        return players.map((player) => {
          const submittedKeyword = !!keywordSubmissions[player.playerCode];
          const isDisabledByKeywordReveal =
            keywordPhaseRevealed &&
            !keywordRevealedCodes.has(player.playerCode);
          return (
            <div className="flex flex-col gap-3" key={player.playerCode}>
              <APlayerBar
                player={player}
                isActive={selectedPlayerCodes.includes(player.playerCode)}
                isCurrent={selectedPlayerCodes.includes(player.playerCode)}
                hasKeywordSubmission={submittedKeyword}
                cluesOpened={keywordSubmissions[player.playerCode]?.cluesOpened}
                showClueCount={
                  keywordRevealedCodes.has(player.playerCode) ||
                  keywordAnswerRevealed
                }
                onClick={toggleSelectedPlayer}
                disabled={timer > 0 || isDisabledByKeywordReveal}
                disableReason={
                  isDisabledByKeywordReveal
                    ? "Thí sinh chưa nộp từ khoá"
                    : undefined
                }
                onEditScore={handleEditScore}
                matchCode={currentMatchCode}
                sendMessage={sendMessage}
              />
            </div>
          );
        });
      }}
    />
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
const PlayerGiaiMaView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    lastMessage,
    sendMessage,
    timer,
    timeLimit,
    startSynced,
    getElapsedSeconds,
    currentQuestion,
    applyWsMessage,
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
  } = usePlayerRound();

  const [clueStates, setClueStates] = useState<ClueState[]>(() =>
    Array(CLUE_COUNT).fill("idle"),
  );
  const [revealedHints, setRevealedHints] = useState<
    Record<number, RevealedHint>
  >({});
  const [keywordBanner, setKeywordBanner] = useState(
    "MẬT MÃ GỒM CÓ ... CHỮ CÁI",
  );
  const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
  const [hideQuestionContent, setHideQuestionContent] = useState(false);
  const activeClueIdxRef = useRef<number | null>(null);
  const [isKeywordPhase, setIsKeywordPhase] = useState(false);
  const [isKeywordLocked, setIsKeywordLocked] = useState(false);
  const [isKeywordCluesLocked, setIsKeywordCluesLocked] = useState(false);
  const [timerHasStarted, setTimerHasStarted] = useState(false);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [keyword, setKeyword] = useState("");
  const [hasSubmittedKeyword, setHasSubmittedKeyword] = useState(false);
  const [keywordSubmittedCodes, setKeywordSubmittedCodes] = useState<
    Set<string>
  >(new Set());
  const [showAnswers, setShowAnswers] = useState(false);
  const [showKeywordConfirm, setShowKeywordConfirm] = useState(false);
  const [keywordToConfirm, setKeywordToConfirm] = useState("");

  const resetGameState = useCallback(() => {
    setKeywordAnswer(null);
    setClueStates(Array(CLUE_COUNT).fill("idle"));
    setRevealedHints({});
    setKeywordSubmittedCodes(new Set());
    setShowAnswers(false);
    setHasSubmittedKeyword(false);
    setTimerHasStarted(false);
    setIsKeywordLocked(false);
    setHideQuestionContent(false);
    setIsKeywordPhase(false);
    setIsKeywordCluesLocked(false);
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, playerKeywordCluesOpened: undefined })),
    );
    activeClueIdxRef.current = null;
  }, [setPlayers]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(msg);
      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "send_question": {
          const code = String(msg.question_code ?? "");
          const m = code.match(/(\d+)\s*$/);
          const clueNumber = m ? Number(m[1]) : 0;
          if (clueNumber >= 1 && clueNumber <= CLUE_COUNT) {
            const idx = clueNumber - 1;
            activeClueIdxRef.current = idx;
            setClueStates((prev) =>
              prev.map((s, i) =>
                i === idx ? "active" : s === "active" ? "used" : s,
              ),
            );
          }
          setHideQuestionContent(false);
          break;
        }
        case "start_the_timer": {
          const isKeyword = msg.phase === "gm_keyword";
          if (isKeyword) setIsKeywordLocked(false);
          startSynced(
            Number(msg.time_limit ?? 0),
            Number(msg.started_at ?? Date.now()),
          );
          setTimerHasStarted(true);
          if (!isKeyword) {
            setQuestionAnswer("");
            setKeyword("");
          }
          setIsKeywordPhase(isKeyword);
          break;
        }
        case "clear_question":
        case "round_start":
          resetGameState();
          break;
        case "show_hint": {
          const hintContent = msg.hint_content ?? "";
          const hintMedia = msg.hint_media_source ?? "";
          const targets: string[] = Array.isArray(msg.target_players)
            ? msg.target_players.map(String)
            : [];
          const canSee =
            targets.length === 0 || targets.includes(String(playerCode));
          const contentIsMedia = isMediaFilename(hintContent);
          const displayText = canSee
            ? contentIsMedia
              ? hintMedia
              : hintContent
            : "";
          const displayMedia = canSee
            ? contentIsMedia
              ? hintContent
              : hintMedia
            : "";
          setHideQuestionContent(true);
          const explicitIdx = Number(msg.clue_index);
          const codeMatch = String(msg.question_code ?? "").match(/(\d+)\s*$/);
          const codeIdx = codeMatch ? Number(codeMatch[1]) - 1 : null;
          const resolvedIdx =
            Number.isInteger(explicitIdx) &&
            explicitIdx >= 0 &&
            explicitIdx < CLUE_COUNT
              ? explicitIdx
              : Number.isInteger(codeIdx) &&
                  codeIdx !== null &&
                  codeIdx >= 0 &&
                  codeIdx < CLUE_COUNT
                ? codeIdx
                : null;
          if (resolvedIdx !== null) {
            activeClueIdxRef.current = resolvedIdx;
            setClueStates((prev) =>
              prev[resolvedIdx] === "used"
                ? prev
                : prev.map((s, i) => (i === resolvedIdx ? "used" : s)),
            );
            setRevealedHints((prev) => {
              const next = { ...prev };
              if (displayText || displayMedia)
                next[resolvedIdx] = {
                  text: displayText || undefined,
                  mediaUrl: displayMedia || undefined,
                };
              else delete next[resolvedIdx];
              return next;
            });
          } else {
            const idx = activeClueIdxRef.current;
            if (idx !== null && canSee) {
              setRevealedHints((prev) => ({
                ...prev,
                [idx]: {
                  text: displayText || undefined,
                  mediaUrl: displayMedia || undefined,
                },
              }));
            }
          }
          break;
        }
        case "hide_hint": {
          setHideQuestionContent(true);
          const explicitIdx = Number(msg.clue_index);
          const idx =
            Number.isInteger(explicitIdx) &&
            explicitIdx >= 0 &&
            explicitIdx < CLUE_COUNT
              ? explicitIdx
              : activeClueIdxRef.current;
          if (idx !== null) {
            activeClueIdxRef.current = idx;
            setRevealedHints((prev) => {
              if (!(idx! in prev)) return prev;
              const next = { ...prev };
              delete next[idx!];
              return next;
            });
          }
          break;
        }
        case "player_score_updated":
          applyScoreUpdate(msg);
          break;
        case "clear_answers":
          setPlayers((prev) =>
            prev.map((p) => ({
              ...p,
              playerLastAnswer: undefined,
              playerTimestamp: undefined,
              playerHasBuzzed: undefined,
            })),
          );
          setTimerHasStarted(false);
          setQuestionAnswer("");
          setKeyword("");
          setShowAnswers(false);
          break;
        case "keyword_locked":
          setIsKeywordLocked(true);
          break;
        case "keyword_clues_locked":
          setIsKeywordCluesLocked(true);
          break;
        case "reveal_keyword_answer": {
          const answer = msg.answer ?? null;
          setKeywordAnswer(answer);
          if (answer)
            setKeywordBanner(msg.keyword_banner || buildKeywordBanner(answer));
          break;
        }
        case "send_keyword_info": {
          if (typeof msg.banner === "string" && msg.banner)
            setKeywordBanner(msg.banner);
          break;
        }
        case "keyword_submit": {
          const { user_code, keyword_text, clues_opened } = msg;
          if (user_code) {
            setKeywordSubmittedCodes((prev) => new Set([...prev, user_code]));
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === user_code
                  ? {
                      ...p,
                      playerHasSubmittedKeyword: true,
                      playerKeywordCluesOpened:
                        typeof clues_opened === "number"
                          ? clues_opened
                          : p.playerKeywordCluesOpened,
                    }
                  : p,
              ),
            );
            if (user_code === playerCode) {
              setHasSubmittedKeyword(true);
              if (typeof keyword_text === "string" && keyword_text)
                setKeyword(keyword_text);
            }
          }
          break;
        }
        case "send_keyword_answers": {
          const answers = msg.answers ?? [];
          setPlayers((prev) =>
            prev.map((p) => {
              const a = answers.find(
                (x: any) => String(x.user_code) === p.playerCode,
              );
              return a
                ? {
                    ...p,
                    playerLastAnswer: a.content,
                    playerKeywordCluesOpened:
                      typeof a.clues_opened === "number"
                        ? a.clues_opened
                        : p.playerKeywordCluesOpened,
                  }
                : p;
            }),
          );
          setKeywordSubmittedCodes(new Set());
          break;
        }
        case "send_answers_to_players": {
          const answers = msg.answers ?? [];
          setPlayers((prev) =>
            prev.map((p) => {
              const ans = answers.find(
                (a: any) => String(a.user_code) === p.playerCode,
              );
              return ans
                ? {
                    ...p,
                    playerLastAnswer: ans.content,
                    playerTimestamp: ans.timestamp || p.playerTimestamp,
                  }
                : p;
            }),
          );
          setShowAnswers(true);
          break;
        }
      }
    });
  }, [
    lastMessage,
    playerCode,
    setPlayers,
    startSynced,
    applyWsMessage,
    applyPlayersInfo,
    applyScoreUpdate,
    resetGameState,
  ]);

  const handleSubmitQuestionAnswer = useCallback(async () => {
    const trimmed = questionAnswer.trim();
    if (!trimmed || !isConnected || !currentQuestion.questionCode) return;
    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));
    try {
      await submitAnswer({
        user_code: playerCode,
        match_code: matchCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
        timestamp: ts,
      });
      await sendMessage({
        type: "player_answer",
        user_code: playerCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        timestamp: ts,
      });
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerCode === playerCode
            ? {
                ...p,
                playerLastAnswer: trimmed,
                playerTimestamp: Number(ts.toFixed(3)),
              }
            : p,
        ),
      );
    } catch {}
    setQuestionAnswer("");
  }, [
    questionAnswer,
    isConnected,
    currentQuestion.questionCode,
    getElapsedSeconds,
    timeLimit,
    playerCode,
    matchCode,
    sendMessage,
    setPlayers,
  ]);

  const handleSubmitKeyword = useCallback(() => {
    if (
      !keyword.trim() ||
      hasSubmittedKeyword ||
      isKeywordLocked ||
      !currentQuestion.questionCode
    )
      return;
    setKeywordToConfirm(keyword.trim());
    setShowKeywordConfirm(true);
  }, [
    keyword,
    hasSubmittedKeyword,
    isKeywordLocked,
    currentQuestion.questionCode,
  ]);

  const handleConfirmKeyword = useCallback(async () => {
    const trimmed = keywordToConfirm.trim();
    setShowKeywordConfirm(false);
    if (!trimmed || !currentQuestion.questionCode) return;
    try {
      await submitAnswer({
        user_code: playerCode,
        match_code: matchCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
      });
    } catch {}
    const cluesOpened = isKeywordCluesLocked
      ? CLUE_COUNT
      : clueStates.filter((s) => s !== "idle").length;
    await sendMessage({
      type: "keyword_submit",
      user_code: playerCode,
      keyword_text: trimmed,
      clues_opened: cluesOpened,
    });
    setHasSubmittedKeyword(true);
    setKeywordSubmittedCodes((prev) => new Set([...prev, playerCode]));
    setPlayers((prev) =>
      prev.map((p) =>
        p.playerCode === playerCode
          ? { ...p, playerKeywordCluesOpened: cluesOpened }
          : p,
      ),
    );
    setKeyword("");
  }, [
    clueStates,
    currentQuestion.questionCode,
    isKeywordCluesLocked,
    keywordToConfirm,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
  ]);

  const isTimerExpired = timeLimit > 0 && timer === 0;
  const isQuestionAnswerDisabled =
    !isConnected ||
    hasSubmittedKeyword ||
    !currentQuestion.questionCode ||
    !timerHasStarted ||
    isTimerExpired ||
    isKeywordPhase;
  const isKeywordInputDisabled =
    !isConnected ||
    hasSubmittedKeyword ||
    isKeywordLocked ||
    (isKeywordPhase && isTimerExpired) ||
    !currentQuestion.questionCode;

  const displayPlayers = players.map((p) => {
    const withKeyword = keywordSubmittedCodes.has(p.playerCode)
      ? { ...p, playerHasSubmittedKeyword: true }
      : p;
    if (p.playerCode !== playerCode && !showAnswers)
      return {
        ...withKeyword,
        playerLastAnswer: undefined,
        playerTimestamp: undefined,
      };
    return withKeyword;
  });

  const PlayerClueCard: React.FC<{
    index: number;
    state: ClueState;
    hintContent?: RevealedHint;
  }> = ({ index, state, hintContent }) => {
    const styles: Record<ClueState, string> = {
      idle: "bg-blue-900 border-blue-600 text-white",
      active:
        "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
      used: "bg-blue-700 border-blue-500 text-white",
    };
    const showHint =
      (state === "active" || state === "used") &&
      !!(hintContent?.text || hintContent?.mediaUrl);
    return (
      <div
        className={`flex-1 h-16 sm:h-20 lg:h-28 xl:h-36 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2 ${styles[state]}`}
      >
        {showHint ? (
          <div className="flex items-center justify-center w-full h-full p-2">
            {hintContent!.mediaUrl ? (
              <RenderMedia mediaUrl={hintContent!.mediaUrl} />
            ) : (
              <span className="text-sm sm:text-base lg:text-lg xl:text-xl font-bold text-center leading-snug">
                {hintContent!.text}
              </span>
            )}
          </div>
        ) : (
          <span className="font-[SVN-Gratelos_Display] text-2xl sm:text-3xl lg:text-[40pt] xl:text-[50pt]">
            {index}
          </span>
        )}
      </div>
    );
  };

  const clueGrid = (
    <div className="flex flex-col gap-2 sm:gap-3 w-full mb-2 sm:mb-3 px-1 sm:px-3">
      <div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center font-[SVN-Gratelos_Display] text-lg sm:text-2xl lg:text-3xl font-bold text-white uppercase shadow">
        {keywordAnswer || keywordBanner}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
        {Array.from({ length: CLUE_COUNT }, (_, i) => (
          <PlayerClueCard
            key={i}
            index={i + 1}
            state={clueStates[i]}
            hintContent={revealedHints[i]}
          />
        ))}
      </div>
    </div>
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      {clueGrid}
      <PQuestionBoard
        title="GIẢI MÃ"
        question={
          isKeywordPhase
            ? {
                ...currentQuestion,
                questionText: keywordBanner,
                questionMediaURL: undefined,
              }
            : currentQuestion
        }
        timerDuration={timer}
        boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
        controls={{ variant: "numbers", count: 0 }}
        hideContent={hideQuestionContent || isKeywordPhase}
      />
      <PAnswerBox
        answer={questionAnswer}
        setAnswer={setQuestionAnswer}
        isDisabled={isQuestionAnswerDisabled}
        onSubmit={handleSubmitQuestionAnswer}
        placeholderString={
          isQuestionAnswerDisabled
            ? "Không thể nhập câu trả lời"
            : "Nhập câu trả lời và nhấn Enter"
        }
      />
      <PAnswerBox
        answer={keyword}
        setAnswer={setKeyword}
        isDisabled={isKeywordInputDisabled}
        onSubmit={handleSubmitKeyword}
        placeholderString={
          isKeywordInputDisabled
            ? "Không thể nhập từ khoá"
            : "Nhập từ khoá và nhấn Enter"
        }
        showKeyIcon
      />
      {showKeywordConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-6 sm:p-8 flex flex-col gap-4 max-w-sm w-full mx-4">
            <p className="text-white font-bold text-xl text-center">
              Xác nhận nộp Từ khoá
            </p>
            <p className="text-blue-200 text-center text-sm">
              Bạn chỉ được nộp <strong>1 lần</strong>. Không thể thay đổi.
            </p>
            <p className="text-white font-bold text-center text-lg">
              "{keywordToConfirm}"
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowKeywordConfirm(false)}
                className="px-5 py-2 rounded-lg bg-slate-600 text-white font-bold hover:bg-slate-500"
              >
                HỦY
              </button>
              <button
                onClick={() => void handleConfirmKeyword()}
                className="px-5 py-2 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-400"
              >
                XÁC NHẬN
              </button>
            </div>
          </div>
        </div>
      )}
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCGiaiMaView = () => {
  const { matchCode } = useRoleSession("mc");
  return <GiaiMaAudiencePage Layout={PBasePageLayout} matchCode={matchCode} />;
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const GiaiMaPage = () => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminGiaiMaView />;
  if (role === "mc") return <MCGiaiMaView />;
  return <PlayerGiaiMaView />;
};

export default GiaiMaPage;
