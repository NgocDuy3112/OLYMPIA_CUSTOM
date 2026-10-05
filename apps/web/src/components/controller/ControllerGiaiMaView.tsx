import React, {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getMatchCode, setMatchCode } from "@/utils/storage";
import {
  mapQuestionApiPayload,
  type QuestionApiPayload,
} from "@/utils/questionMapper";
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
import { Button } from "@/components/ui/button";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { buildKeywordBanner } from "@/utils/keywordBanner";
import { loadControllerPlayersSnapshot } from "@/api/controllerPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { apiGetOrNull } from "@/api/client";

import CBasePageLayout from "@/pages/controller/CBasePageLayout";
import CControlButton from "@/components/controller/CControlButton";
import CPlayerBar from "@/components/controller/CPlayerBar";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { CLUE_COUNT } from "@/pages/game/giaiMaShared";
import type { ClueState, RevealedHint } from "@/pages/game/giaiMaShared";

const logger = createLogger("GiaiMaPage");
const TIME_LIMIT = 15;

function ocPrefix(matchCode: string): string {
  return matchCode.toUpperCase().match(/^OC(\d+)/)?.[0] ?? "OC3";
}
function cluePrefix(matchCode: string): string {
  return `${ocPrefix(matchCode)}_Q_GM_`;
}
function keywordCode(matchCode: string): string {
  return `${ocPrefix(matchCode)}_Q_GM_KEY`;
}

const DEFAULT_QUESTION: Question = {
  questionCode: "",
  questionText: "",
  questionAnswer: "",
  questionExplanation: "",
  questionMediaURL: undefined,
};

export const AdminGiaiMaView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const storedMatchCode = getMatchCode();
  const currentMatchCode = urlMatchCode || storedMatchCode || "";

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== storedMatchCode) {
      setMatchCode(urlMatchCode);
    }
  }, [urlMatchCode, storedMatchCode]);
  useEffect(() => {
    if (!currentMatchCode) navigate("/operator/controller/overview");
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
      const questionCode = `${cluePrefix(currentMatchCode)}${clueIndex + 1}`;
      try {
        const data =
          await apiGetOrNull<QuestionApiPayload | QuestionApiPayload[]>(
            `/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`,
          );
        if (!data) return mapQuestionApiPayload(null, questionCode);
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
        const json = await apiGetOrNull<Record<string, any>>(
          `/gm/admin-state?match_code=${encodeURIComponent(currentMatchCode)}`,
        );
        if (!json) return;
        const snap = (json.data ?? {}) as Record<string, any>;
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
        const kwCode = keywordCode(currentMatchCode);
        const data =
          await apiGetOrNull<QuestionApiPayload | QuestionApiPayload[]>(
            `/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(kwCode)}`,
          );
        if (!data) return;
        let payload: any = null;
        if (Array.isArray(data.data))
          payload =
            data.data.find(
              (q: any) => String(q?.question_code) === kwCode,
            ) ??
            data.data[0] ??
            null;
        else payload = data.data ?? null;
        if (payload) {
          const q = mapQuestionApiPayload(payload, kwCode);
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
      const snapshot = await loadControllerPlayersSnapshot(currentMatchCode);
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
      questionCode: keywordCode(currentMatchCode),
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
    const hintText =
      currentQuestion.questionHintText ?? currentQuestion.questionExplanation ?? "";
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
        spectator_visible: selectedPlayerCodes.length > 0,
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
      const text = q.questionHintText ?? q.questionExplanation ?? "";
      return { text, mediaUrl: undefined as string | undefined };
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
            spectator_visible: true,
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
          keywordCode(currentMatchCode),
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
      idle: "bg-primary/40 border-primary text-foreground hover:bg-primary/70 shadow",
      active:
        "bg-primary border-brand text-foreground shadow-lg ring-2 ring-brand",
      used: "bg-primary/70 border-primary text-foreground cursor-default",
    };
    const showHint =
      (state === "active" || state === "used") &&
      !!(hintContent?.text || hintContent?.mediaUrl);
    return (
      <Button
        type="button"
        variant="ghost"
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
          <span className="font-display text-2xl sm:text-[30pt] lg:text-[40pt] xl:text-[50pt]">
            {index}
          </span>
        )}
      </Button>
    );
  };

  const clueGrid = (
    <div className="flex flex-col gap-2 sm:gap-3 w-full">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setKeywordPhaseActive((prev) => !prev)}
        className={`w-full rounded-xl px-3 sm:px-6 py-3 sm:py-6 text-center font-display text-2xl sm:text-3xl lg:text-5xl font-bold text-foreground uppercase shadow border-2 transition-colors duration-200 cursor-pointer select-none ${keywordPhaseActive ? "bg-primary border-brand ring-2 ring-brand" : "bg-primary/40 border-primary hover:bg-primary/60"}`}
      >
        {keywordAnswerRevealed && keywordQuestion?.questionAnswer
          ? `${keywordQuestion.questionAnswer}`
          : keyInfo}
      </Button>
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
    <CBasePageLayout
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
          <CControlButton
            onClick={() => {
              void handleEndRound();
            }}
            disabled={isTimerRunning || isKeywordTimerRunning}
          >
            <Power size={18} />
            <span className="ml-2 font-bold">KẾT THÚC</span>
          </CControlButton>
        </>
      }
      playerSectionButtons={
        <>
          <CControlButton
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
          </CControlButton>
          <CControlButton
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
          </CControlButton>
          <CControlButton
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
          </CControlButton>
          <CControlButton
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
          </CControlButton>
          <CControlButton
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
          </CControlButton>
          <CControlButton
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
          </CControlButton>
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
              <CPlayerBar
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
