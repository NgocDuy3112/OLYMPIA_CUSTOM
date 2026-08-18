/**
 * VeDichChungPage — Unified page for Về Đích Chung (group final).
 *
 * Admin: question grid, power system, scoring.
 * MC: read-only audience view.
 * Player: question grid, answer input, power selection.
 */
import {
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
  ListRestart,
  RefreshCw,
  Eye,
  Power,
  Star,
  Shield,
} from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { useQuestionTimerLock } from "@/hooks/useQuestionTimerLock";
import { useRoleSession } from "@/hooks/useRoleSession";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, getVeDichMeta } from "@/utils/veDichGrid";
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
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";

const logger = createLogger("VeDichChungPage");
const DEFAULT_QUESTION: Question = {
  questionCode: "",
  questionText: "",
  questionAnswer: "",
  questionExplanation: "",
  questionMediaURL: undefined,
};
const getTimeLimitForPoints = (points: number): number => {
  switch (points) {
    case 20:
      return 15;
    case 30:
      return 20;
    case 40:
      return 30;
    case 50:
      return 45;
    default:
      return 0;
  }
};

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminVeDichChungView = () => {
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
  const activePlayers = players.filter((player) => !player.playerAfk);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });
  const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
  const toggleSelectedPlayer = useCallback((playerCode: string) => {
    setSelectedPlayerCodes((prev) =>
      prev.includes(playerCode)
        ? prev.filter((c) => c !== playerCode)
        : [...prev, playerCode],
    );
  }, []);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionCategories, setQuestionCategories] = useState<string[]>([]);
  const [questionPoints, setQuestionPoints] = useState<number[]>([]);
  const [questionStates, setQuestionStates] = useState<
    Record<string, "answered" | "answered-wrong" | "available">
  >(() => {
    if (!currentMatchCode) return {};
    try {
      const stored = localStorage.getItem(
        `vd_chung_states_${currentMatchCode}`,
      );
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    ...DEFAULT_QUESTION,
  });
  const pendingQuestionRef = useRef<{
    questionCode: string;
    question: Question;
  } | null>(null);
  const pendingBroadcastTimerRef = useRef<number | null>(null);
  const clearPendingBroadcastTimer = useCallback(() => {
    if (pendingBroadcastTimerRef.current != null) {
      window.clearTimeout(pendingBroadcastTimerRef.current);
      pendingBroadcastTimerRef.current = null;
    }
  }, []);
  const broadcastPendingVeDichQuestion = useCallback(() => {
    const pending = pendingQuestionRef.current;
    if (!pending || !currentMatchCode) return;
    const { questionCode, question } = pending;
    void sendMessage({
      type: "send_question",
      user_code: "",
      question_code: questionCode,
      content: question.questionText ?? "",
      media_source: question.questionMediaURL ?? undefined,
    });
    if (question.questionMediaURL) {
      void sendMessage({ type: "media_control", action: "play" });
      setVideoPlayState("playing");
    }
    pendingQuestionRef.current = null;
    clearPendingBroadcastTimer();
  }, [currentMatchCode, sendMessage, clearPendingBroadcastTimer]);
  const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => {
    if (!currentMatchCode) return [];
    try {
      const stored = localStorage.getItem(`vd_chung_codes_${currentMatchCode}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const { isLocked: isTimerLocked, lock: lockTimer } = useQuestionTimerLock(
    currentQuestion.questionCode,
  );
  const [videoPlayState, setVideoPlayState] = useState<
    "playing" | "paused" | null
  >(null);
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(
    () => {
      if (!currentMatchCode) return {};
      try {
        const stored = localStorage.getItem(`vd_powers_${currentMatchCode}`);
        if (!stored) return {};
        const parsed = JSON.parse(stored);
        const migrated: Record<string, string | null> = {};
        for (const [code, val] of Object.entries(parsed)) {
          if (typeof val === "string" || val === null) migrated[code] = val;
          else if (typeof val === "object" && val !== null)
            migrated[code] = (val as any).star
              ? "star"
              : (val as any).shield
                ? "shield"
                : null;
          else migrated[code] = null;
        }
        return migrated;
      } catch {
        return {};
      }
    },
  );
  const [playerPowers, setPlayerPowers] = useState<
    Record<string, "star" | "shield" | null>
  >({});

  useEffect(() => {
    if (!currentMatchCode) return;
    localStorage.setItem(
      `vd_powers_${currentMatchCode}`,
      JSON.stringify(usedPowers),
    );
  }, [usedPowers, currentMatchCode]);
  useEffect(() => {
    setPlayerPowers({});
  }, [currentQuestion.questionCode]);
  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage as Record<string, any> | null;
    if (msg?.type === "vd_power_window_closed")
      broadcastPendingVeDichQuestion();
  }, [lastMessage, broadcastPendingVeDichQuestion]);

  const questionTitle = "VỀ ĐÍCH - LƯỢT CHUNG";
  const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode;
  const currentPoints = (() => {
    if (!currentQuestion.questionCode) return 0;
    const idx = questions.findIndex(
      (q) => q.questionCode === currentQuestion.questionCode,
    );
    return questionPoints[idx] || 0;
  })();

  useEffect(() => {
    if (!currentMatchCode) return;
    localStorage.setItem(
      `vd_chung_states_${currentMatchCode}`,
      JSON.stringify(questionStates),
    );
    const answeredCodes = Object.entries(questionStates)
      .filter(([, v]) => v === "answered")
      .map(([k]) => k);
    if (answeredCodes.length > 0) {
      try {
        const existing = JSON.parse(
          localStorage.getItem(`vd_used_codes_${currentMatchCode}`) ?? "[]",
        ) as string[];
        localStorage.setItem(
          `vd_used_codes_${currentMatchCode}`,
          JSON.stringify([...new Set([...existing, ...answeredCodes])]),
        );
      } catch {}
    }
  }, [questionStates, currentMatchCode]);

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
      await sendMessage({ type: "send_players_info", players: mergedPlayers });
    } catch (err) {
      logger.error("Failed to send players snapshot:", err);
    }
  }, [currentMatchCode, loadPlayersState, sendMessage]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!currentMatchCode) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const result = await res.json();
        const raw = Array.isArray(result.data)
          ? result.data
          : [result.data].filter(Boolean);
        const veDichRaw = raw.filter((q: any) =>
          q.question_code?.startsWith("OC3_Q_VD"),
        );
        const mapped: Question[] = veDichRaw.map((q: any) => ({
          questionCode: q.question_code,
          questionText: q.content,
          questionAnswer: q.answer,
          questionExplanation: q.explanation ?? "",
          questionMediaURL: q.media_url ?? undefined,
        }));
        mapped.sort((a, b) =>
          compareVeDichCodes(a.questionCode, b.questionCode),
        );
        setQuestions(mapped);
        setQuestionCategories(
          mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).category),
        );
        setQuestionPoints(
          mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).points),
        );
      } catch (err) {
        logger.error("Failed to fetch questions:", err);
      }
    };
    fetchQuestions();
  }, [currentMatchCode]);

  useEffect(() => {
    startTransition(() => {
      void sendPlayersSnapshot();
    });
  }, [sendPlayersSnapshot]);

  useEffect(() => {
    if (
      !currentMatchCode ||
      questions.length === 0 ||
      roundQuestionCodes.length === 0
    )
      return;
    const metadata = roundQuestionCodes.map((code) => {
      const idx = questions.findIndex((q) => q.questionCode === code);
      const raw = questionCategories[idx] || "Unknown";
      const pts = questionPoints[idx] || 0;
      const [catPrimary] = raw.split("|").map((s) => s?.trim());
      return { code, category: catPrimary || raw, points: pts };
    });
    void sendMessage({
      type: "vdc_questions_meta",
      match_code: currentMatchCode,
      question_metadata: metadata,
    });
  }, [
    questions,
    roundQuestionCodes,
    questionCategories,
    questionPoints,
    currentMatchCode,
    sendMessage,
  ]);

  const sendSpecificRoundSnapshot = useCallback(async () => {
    if (
      roundQuestionCodes.length > 0 &&
      questions.length > 0 &&
      currentMatchCode
    ) {
      const metadata = roundQuestionCodes.map((code) => {
        const idx = questions.findIndex((q) => q.questionCode === code);
        const raw = questionCategories[idx] || "Unknown";
        const pts = questionPoints[idx] || 0;
        const [catPrimary] = raw.split("|").map((s) => s?.trim());
        return { code, category: catPrimary || raw, points: pts };
      });
      await sendMessage({
        type: "vdc_questions_meta",
        match_code: currentMatchCode,
        question_metadata: metadata,
      });
    }
    for (const [code, state] of Object.entries(questionStates)) {
      if (state === "answered" || state === "answered-wrong")
        await sendMessage({
          type: "vdc_question_state",
          question_code: code,
          state,
        });
    }
    if (currentQuestion.questionCode) {
      await sendMessage({
        type: "send_question",
        user_code: "",
        question_code: currentQuestion.questionCode,
        content: currentQuestion.questionText ?? "",
        media_source: currentQuestion.questionMediaURL ?? undefined,
      });
    }
    if (timerRef.current > 0 && currentQuestion.questionCode) {
      await sendStartTimer({
        sendMessage,
        phase: "vdc",
        timeLimit: timerRef.current,
        questionCode: currentQuestion.questionCode,
      });
      if (videoPlayState === "playing")
        await sendMessage({ type: "media_control", action: "play" });
    }
    if (Object.keys(usedPowers).length > 0)
      await sendMessage({ type: "vd_powers_used", used_powers: usedPowers });
  }, [
    currentMatchCode,
    currentQuestion,
    questionCategories,
    questionPoints,
    questionStates,
    questions,
    roundQuestionCodes,
    sendMessage,
    usedPowers,
    videoPlayState,
  ]);
  const sendRoundSnapshot = useCallback(async () => {
    await sendPlayersSnapshot();
    await sendSpecificRoundSnapshot();
  }, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

  const clearQuestion = useCallback(async () => {
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    setVideoPlayState(null);
    pendingQuestionRef.current = null;
    clearPendingBroadcastTimer();
    try {
      await sendMessage({ type: "clear_question", user_code: "" });
    } catch (err) {
      logger.error("Failed to clear question:", err);
    }
  }, [sendMessage, clearPendingBroadcastTimer]);

  const handleQuestionActivate = useCallback(
    async (questionCode: string) => {
      if (isTimerRunning) return;
      if (currentQuestion.questionCode === questionCode) {
        setSelectedPlayerCodes([]);
        setPlayerPowers({});
        setUsedPowers({});
        await clearQuestion();
        return;
      }
      setSelectedPlayerCodes([]);
      setPlayerPowers({});
      setUsedPowers({});
      setVideoPlayState(null);
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          playerLastAnswer: undefined,
          playerTimestamp: undefined,
          playerHasBuzzed: undefined,
        })),
      );
      if (currentMatchCode) {
        void sendMessage({ type: "clear_answers", user_code: "" });
        void sendMessage({
          type: "send_question",
          user_code: "",
          question_code: questionCode,
          content: "",
          media_source: undefined,
        });
        void sendMessage({ type: "vd_power_window_open", duration: 5 });
      }
      try {
        const res = await fetch(
          `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode ?? "")}&question_code=${encodeURIComponent(questionCode)}`,
          { credentials: "include" },
        );
        let q: Question;
        if (res.ok) {
          const data = await res.json();
          let payload: any = null;
          if (Array.isArray(data.data))
            payload =
              data.data.find(
                (item: any) =>
                  String(item?.question_code) === String(questionCode),
              ) ??
              data.data[0] ??
              null;
          else payload = data.data ?? null;
          q = mapQuestionApiPayload(payload, questionCode);
        } else q = { ...DEFAULT_QUESTION, questionCode };
        setCurrentQuestion(q);
        pendingQuestionRef.current = { questionCode, question: q };
        clearPendingBroadcastTimer();
        pendingBroadcastTimerRef.current = window.setTimeout(() => {
          pendingBroadcastTimerRef.current = null;
          broadcastPendingVeDichQuestion();
        }, 5500);
      } catch (err) {
        logger.error("handleQuestionActivate failed:", err);
      }
    },
    [
      isTimerRunning,
      currentQuestion.questionCode,
      clearQuestion,
      currentMatchCode,
      sendMessage,
      clearPendingBroadcastTimer,
      broadcastPendingVeDichQuestion,
    ],
  );

  const startTheClock = useCallback(() => {
    if (!currentQuestion.questionCode || isTimerRunning || isTimerLocked)
      return;
    lockTimer();
    const timeLimit = getTimeLimitForPoints(currentPoints);
    setTimer(timeLimit);
    setIsTimerRunning(true);
    if (currentMatchCode)
      void sendStartTimer({
        sendMessage,
        phase: "vdc",
        timeLimit,
        questionCode: currentQuestion.questionCode,
      });
  }, [
    currentQuestion.questionCode,
    isTimerRunning,
    isTimerLocked,
    lockTimer,
    currentPoints,
    currentMatchCode,
    sendMessage,
  ]);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);
  useEffect(() => {
    if (timer <= 0) return;
    const id = window.setInterval(() => {
      setTimer((prev) => {
        const next = prev <= 1 ? 0 : prev - 1;
        timerRef.current = next;
        if (next === 0) window.clearInterval(id);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer]);
  useEffect(() => {
    if (timer !== 0 || !isTimerRunning) return;
    startTransition(() => setIsTimerRunning(false));
  }, [timer, isTimerRunning]);

  const showAnswers = useCallback(async () => {
    if (!canShowAnswers) return;
    const qCode = currentQuestion.questionCode;
    const answersPayload: Array<{
      user_code: string;
      content: string;
      timestamp: number;
    }> = [];
    for (const player of players) {
      try {
        const res = await fetch(
          `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(currentMatchCode!)}&user_code=${encodeURIComponent(player.playerCode)}&question_code=${encodeURIComponent(qCode)}`,
          { credentials: "include" },
        );
        if (!res.ok) continue;
        const json = await res.json();
        const data = json.data;
        if (!data) continue;
        const answerObj = Array.isArray(data)
          ? data.reduce(
              (a: any, b: any) => (b.timestamp > a.timestamp ? b : a),
              data[0],
            )
          : data;
        if (answerObj?.answer_text)
          answersPayload.push({
            user_code: player.playerCode,
            content: answerObj.answer_text,
            timestamp: answerObj.timestamp || 0,
          });
      } catch {}
    }
    try {
      await sendMessage({
        type: "send_answers_to_players",
        answers: answersPayload,
      });
    } catch (err) {
      logger.error("showAnswers failed:", err);
    }
  }, [canShowAnswers, currentMatchCode, currentQuestion, players, sendMessage]);

  const handleAddScore = useCallback(
    async (playerCode: string, delta: number, broadcast = true) => {
      if (!playerCode) return;
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerCode === playerCode
            ? { ...p, playerScore: (p.playerScore ?? 0) + delta }
            : p,
        ),
      );
      if (!currentMatchCode) return;
      try {
        if (currentQuestion.questionCode) {
          await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              user_code: playerCode,
              match_code: currentMatchCode,
              question_code: currentQuestion.questionCode,
              points: delta,
            }),
          });
        }
        const recentRes = await fetch(
          `${API_BASE_URL}/scoreboard/${currentMatchCode}`,
          { credentials: "include" },
        );
        if (recentRes.ok) {
          const json = await recentRes.json();
          let arr: any[] = [];
          if (Array.isArray(json.data)) arr = json.data;
          else if (Array.isArray(json.data?.scoreboard))
            arr = json.data.scoreboard;
          setPlayers((prev) =>
            prev.map((p) => {
              const entry = arr.find(
                (item: any) => item.user_code === p.playerCode,
              );
              const updated = entry?.cumulative_score ?? entry?.total_score;
              return typeof updated === "number"
                ? { ...p, playerScore: updated }
                : p;
            }),
          );
        }
        if (broadcast) await sendPlayersSnapshot();
      } catch (err) {
        logger.error("handleAddScore failed:", err);
      }
    },
    [currentMatchCode, currentQuestion.questionCode, sendPlayersSnapshot],
  );

  const handleCalculateScore = useCallback(async () => {
    if (!currentQuestion.questionCode) return;
    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.questionCode]: "answered",
    }));
    void sendMessage({
      type: "vdc_question_state",
      question_code: currentQuestion.questionCode,
      state: "answered",
    });
    void sendMessage({
      type: selectedPlayerCodes.length > 0 ? "vd_dung" : "wrong",
      phase: "vdc",
    });
    try {
      await calculateScore(
        currentMatchCode,
        currentQuestion.questionCode,
        "vdc_resolve",
        selectedPlayerCodes,
      );
      const newUsedPowers = { ...usedPowers };
      for (const [code, power] of Object.entries(playerPowers)) {
        if (power) newUsedPowers[code] = power;
      }
      setUsedPowers(newUsedPowers);
      void sendMessage({ type: "vd_powers_used", used_powers: newUsedPowers });
      if (currentMatchCode) await sendPlayersSnapshot();
      setSelectedPlayerCodes([]);
      setPlayerPowers({});
    } catch (err) {
      logger.error("handleCalculateScore failed:", err);
    }
  }, [
    selectedPlayerCodes,
    currentQuestion.questionCode,
    players,
    playerPowers,
    usedPowers,
    handleAddScore,
    sendPlayersSnapshot,
    currentMatchCode,
    sendMessage,
  ]);

  const handleEndRound = useCallback(async () => {
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    setTimer(0);
    setIsTimerRunning(false);
    if (!currentMatchCode) return;
    try {
      await endRoundAndReturnToWaiting({
        currentMatchCode,
        navigate,
        round: "vdc",
        sendMessage,
      });
    } catch (err) {
      logger.error("handleEndRound failed:", err);
    }
  }, [currentMatchCode, navigate, sendMessage]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg: any = lastMessage;
    switch (msg?.type) {
      case "vd_questions_selected": {
        if (Array.isArray(msg.selected_question_codes)) {
          if (currentMatchCode)
            localStorage.setItem(
              `vd_chung_codes_${currentMatchCode}`,
              JSON.stringify(msg.selected_question_codes),
            );
          startTransition(() => {
            setRoundQuestionCodes(msg.selected_question_codes);
          });
        }
        break;
      }
      case "player_offline": {
        if (msg.user_code)
          startTransition(() => {
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === msg.user_code
                  ? { ...p, playerConnected: false }
                  : p,
              ),
            );
          });
        break;
      }
      case "send_players_info":
        startTransition(() => {
          applyPlayersSnapshot(msg);
        });
        break;
      case "player_score_updated": {
        if (msg.user_code && typeof msg.new_total_score === "number")
          startTransition(() => {
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === msg.user_code
                  ? { ...p, playerScore: msg.new_total_score }
                  : p,
              ),
            );
          });
        break;
      }
      case "clear_answers":
        startTransition(() => {
          setPlayers((prev) =>
            prev.map((p) => ({
              ...p,
              playerLastAnswer: undefined,
              playerTimestamp: undefined,
            })),
          );
        });
        break;
      case "send_answers_to_players": {
        const answers = Array.isArray(msg.answers) ? msg.answers : [];
        startTransition(() => {
          setPlayers((prev) =>
            prev.map((player) => {
              const answer = answers.find(
                (item: any) => item.user_code === player.playerCode,
              );
              if (!answer) return player;
              return {
                ...player,
                playerLastAnswer:
                  answer.content ??
                  answer.answer_text ??
                  player.playerLastAnswer,
                playerTimestamp: answer.timestamp ?? player.playerTimestamp,
              };
            }),
          );
        });
        break;
      }
      case "player_answer": {
        const { user_code, answer_text, timestamp } = msg;
        if (user_code && answer_text)
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
        break;
      }
      case "vd_player_power": {
        const { user_code, power } = msg;
        if (
          user_code &&
          (power === "star" || power === "shield") &&
          !usedPowers[user_code]
        ) {
          startTransition(() => {
            setPlayerPowers((prev) => ({ ...prev, [user_code]: power }));
          });
          if (Object.keys(playerPowers).length === 0)
            void sendMessage({ type: "vd_power_activated", power });
        }
        break;
      }
      case "vd_powers_used": {
        if (msg.used_powers)
          startTransition(() => {
            setUsedPowers(msg.used_powers);
          });
        break;
      }
    }
  }, [applyPlayersSnapshot, lastMessage, sendMessage, sendRoundSnapshot]);

  const getQuestionMeta = (questionCode: string) => {
    const idx = questions.findIndex((q) => q.questionCode === questionCode);
    const raw = questionCategories[idx] || "Unknown";
    const pts = questionPoints[idx] || 0;
    const [catPrimary, catSecondary] = (raw || "")
      .split("|")
      .map((s) => s?.trim());
    return { catPrimary: catPrimary || raw, catSecondary, pts };
  };

  return (
    <ABasePageLayout
      questionTitle={questionTitle}
      question={currentQuestion}
      videoPlayState={videoPlayState}
      timerDuration={timer}
      controlsChildren={() => (
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({
            length: Math.max(roundQuestionCodes.length, activePlayers.length),
          }).map((_, i) => {
            const code = roundQuestionCodes[i];
            if (!code)
              return (
                <div
                  key={`rq-empty-${i}`}
                  className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                >
                  <VeDichQuestionCard placeholder category="" disabled />
                </div>
              );
            const { catPrimary, catSecondary, pts } = getQuestionMeta(code);
            const state = questionStates[code] || "available";
            const isActive = currentQuestion.questionCode === code;
            return (
              <div
                key={`rq-${code}`}
                className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
              >
                <VeDichQuestionCard
                  category={catPrimary}
                  subcategory={catSecondary}
                  points={pts}
                  state={state}
                  isSelected={isActive}
                  disabled={state !== "available"}
                  onClick={() => {
                    if (state === "available" && !isTimerRunning)
                      void handleQuestionActivate(code);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      playerSectionButtons={
        <>
          <AControlButton
            onClick={startTheClock}
            disabled={
              !currentQuestion.questionCode || isTimerRunning || isTimerLocked
            }
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleCalculateScore().catch((err) =>
                logger.error("TÍNH ĐIỂM failed:", err),
              );
            }}
            disabled={!currentQuestion.questionCode || isTimerRunning}
          >
            <Calculator size={18} />
            <span className="ml-2 font-bold">TÍNH ĐIỂM</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void showAnswers();
            }}
            disabled={!canShowAnswers || isTimerRunning}
          >
            <Eye size={18} />
            <span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void loadPlayersState();
            }}
            disabled={isTimerRunning}
          >
            <RefreshCw size={18} />
            <span className="ml-2 font-bold">CẬP NHẬT</span>
          </AControlButton>
        </>
      }
      bottomActionButtons={
        <>
          <AControlButton
            onClick={() =>
              navigate(`/admin/vdc/pick/${currentMatchCode ?? ""}`)
            }
            disabled={isTimerRunning}
          >
            <ListRestart size={18} />
            <span className="ml-2 font-bold">CHỌN LẠI</span>
          </AControlButton>
          <AControlButton
            onClick={() => {
              void handleEndRound();
            }}
            disabled={isTimerRunning}
          >
            <Power size={18} />
            <span className="ml-2 font-bold">KẾT THÚC</span>
          </AControlButton>
        </>
      }
      topControlButtons={null}
      renderPlayerList={() =>
        activePlayers.map((player) => (
          <APlayerBar
            key={player.playerCode}
            player={player}
            isActive={selectedPlayerCodes.includes(player.playerCode)}
            isCurrent={selectedPlayerCodes.includes(player.playerCode)}
            playerPower={
              (playerPowers[player.playerCode] ||
                usedPowers[player.playerCode]) as "star" | "shield" | undefined
            }
            onClick={toggleSelectedPlayer}
            disabled={timer > 0}
            onEditScore={() => {}}
            matchCode={currentMatchCode}
            sendMessage={sendMessage}
          />
        ))
      }
    />
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
type RoundQuestion = { code: string; category: string; points: number };
const PlayerVeDichChungView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    sendMessage,
    timer,
    timeLimit,
    getElapsedSeconds,
    currentQuestion,
    players,
    setPlayers,
    lastMessage,
    showAnswers,
    videoPlayState,
  } = usePlayerRound();
  const activePlayers = players.filter((player) => !player.playerAfk);
  const [answer, setAnswer] = useState("");
  const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(
    () => {
      if (!matchCode) return [];
      try {
        const stored = localStorage.getItem(`vd_chung_meta_${matchCode}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    },
  );
  const [questionStates, setQuestionStates] = useState<
    Record<string, "answered" | "answered-wrong" | "available">
  >({});
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(
    () => {
      if (!matchCode) return {};
      try {
        return JSON.parse(
          localStorage.getItem(`vd_powers_${matchCode}`) ?? "{}",
        );
      } catch {
        return {};
      }
    },
  );
  const [powerWindowOpen, setPowerWindowOpen] = useState(false);
  const [powerWindowCountdown, setPowerWindowCountdown] = useState(0);
  const [selectedPower, setSelectedPower] = useState<"star" | "shield" | null>(
    null,
  );
  const powerWindowTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useEffect(() => {
    if (!matchCode || !isConnected || roundQuestionsData.length > 0) return;
    sendMessage({ type: "vd_questions_meta_request", match_code: matchCode });
  }, [matchCode, isConnected, roundQuestionsData.length, sendMessage]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    switch (msg?.type) {
      case "vdc_question_state": {
        const { question_code, state: qState } = msg;
        if (question_code && qState)
          setQuestionStates((prev) => ({ ...prev, [question_code]: qState }));
        break;
      }
      case "vd_questions_selected":
      case "vdc_questions_meta": {
        const metadata: RoundQuestion[] = msg.question_metadata ?? [];
        if (metadata.length > 0) {
          setRoundQuestionsData(metadata);
          try {
            localStorage.setItem(
              `vd_chung_meta_${matchCode}`,
              JSON.stringify(metadata),
            );
          } catch {}
        }
        break;
      }
      case "vd_power_window_open": {
        const eligible = msg.eligible_user_codes;
        if (Array.isArray(eligible) && !eligible.includes(playerCode ?? ""))
          break;
        setPowerWindowOpen(true);
        setPowerWindowCountdown(Number(msg.duration ?? 5));
        setSelectedPower(null);
        break;
      }
      case "vd_player_power": {
        const { user_code, power } = msg;
        if (user_code && (power === "star" || power === "shield")) {
          setUsedPowers((prev) => {
            const next = { ...prev, [user_code]: power };
            try {
              localStorage.setItem(
                `vd_powers_${matchCode}`,
                JSON.stringify(next),
              );
            } catch {}
            return next;
          });
          setPlayers((prev) =>
            prev.map((p) =>
              p.playerCode === user_code ? { ...p, playerPower: power } : p,
            ),
          );
        }
        break;
      }
      case "vd_powers_used": {
        if (msg.used_powers) {
          setUsedPowers(msg.used_powers);
          try {
            localStorage.setItem(
              `vd_powers_${matchCode}`,
              JSON.stringify(msg.used_powers),
            );
          } catch {}
          setPlayers((prev) =>
            prev.map((p) => {
              const power = msg.used_powers[p.playerCode];
              return power ? { ...p, playerPower: power } : p;
            }),
          );
        }
        break;
      }
    }
  }, [matchCode, playerCode, setPlayers]);

  useEffect(() => {
    if (!powerWindowOpen || powerWindowCountdown <= 0) return;
    powerWindowTimerRef.current = window.setInterval(() => {
      setPowerWindowCountdown((prev) => {
        if (prev <= 1) {
          setPowerWindowOpen(false);
          void sendMessage({
            type: "vd_power_window_closed",
            user_code: playerCode,
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (powerWindowTimerRef.current)
        window.clearInterval(powerWindowTimerRef.current);
    };
  }, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);
  useEffect(
    () => () => {
      if (powerWindowTimerRef.current)
        window.clearInterval(powerWindowTimerRef.current);
    },
    [],
  );

  const handleSelectPower = useCallback(
    async (power: "star" | "shield") => {
      if (!powerWindowOpen || usedPowers[playerCode]) return;
      setSelectedPower(power);
      setPowerWindowOpen(false);
      await sendMessage({
        type: "vd_player_power",
        user_code: playerCode,
        power,
      });
    },
    [powerWindowOpen, usedPowers, playerCode, sendMessage],
  );

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || !isConnected || timer <= 0 || !currentQuestion.questionCode)
      return;
    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));
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
    } catch (error) {
      console.warn("Failed to submit answer:", error);
    }
    setAnswer("");
  }, [
    answer,
    currentQuestion.questionCode,
    getElapsedSeconds,
    isConnected,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
    timeLimit,
    timer,
  ]);

  const currentPoints =
    roundQuestionsData.find((r) => r.code === currentQuestion.questionCode)
      ?.points ?? 0;
  const displayPlayers = players.map((p) =>
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="VỀ ĐÍCH - LƯỢT CHUNG"
        question={currentQuestion}
        timerDuration={timer}
        videoPlayState={videoPlayState}
      >
        <div className="flex gap-1 overflow-x-auto">
          {roundQuestionsData.length > 0
            ? roundQuestionsData.map((q) => {
                const qState = questionStates[q.code] ?? "available";
                const isActive = currentQuestion.questionCode === q.code;
                return (
                  <div
                    key={q.code}
                    className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                  >
                    <VeDichQuestionCard
                      category={q.category}
                      points={q.points}
                      state={qState}
                      isSelected={isActive}
                      disabled={qState !== "available"}
                    />
                  </div>
                );
              })
            : Array.from({ length: activePlayers.length || 2 }).map((_, i) => (
                <div
                  key={`ph-${i}`}
                  className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                >
                  <VeDichQuestionCard placeholder category="" disabled />
                </div>
              ))}
        </div>
      </PQuestionBoard>
      <PAnswerBox
        answer={answer}
        setAnswer={setAnswer}
        isDisabled={!isConnected || timer <= 0}
        onSubmit={handleSubmitAnswer}
        placeholderString={
          timer <= 0
            ? "Bạn không thể nhập đáp án tại thời điểm này"
            : "Nhập đáp án và nhấn Enter"
        }
      />
      {powerWindowOpen && !usedPowers[playerCode] && (
        <div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-4 flex flex-col items-center gap-3">
          <p className="text-white font-bold text-lg">
            Chọn quyền năng ({powerWindowCountdown}s)
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => void handleSelectPower("star")}
              disabled={currentPoints === 20}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${selectedPower === "star" ? "bg-yellow-500 text-blue-900 ring-2 ring-yellow-300" : "bg-yellow-500/20 text-yellow-300 border-2 border-yellow-500/50 hover:bg-yellow-500/40"} ${currentPoints === 20 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Star size={20} />
              <span>Ngôi Sao Hy Vọng</span>
            </button>
            <button
              onClick={() => void handleSelectPower("shield")}
              disabled={currentPoints === 50}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${selectedPower === "shield" ? "bg-blue-500 text-blue-900 ring-2 ring-blue-300" : "bg-blue-500/20 text-blue-300 border-2 border-blue-500/50 hover:bg-blue-500/40"} ${currentPoints === 50 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Shield size={20} />
              <span>Bảo Hộ Miễn Trừ</span>
            </button>
          </div>
          <p className="text-blue-300 text-sm">
            Chỉ được dùng 1 lần xuyên suốt VĐC & VĐR
          </p>
        </div>
      )}
      {!powerWindowOpen && usedPowers[playerCode] && (
        <div className="bg-blue-900/60 border-2 border-blue-400 rounded-xl p-3 flex items-center gap-2 font-bold text-sm text-blue-100">
          {usedPowers[playerCode] === "star" ? (
            <Star size={18} className="shrink-0" />
          ) : (
            <Shield size={18} className="shrink-0" />
          )}
          <span>
            Bạn đã dùng Quyền năng{" "}
            {usedPowers[playerCode] === "star"
              ? "Ngôi Sao Hy Vọng"
              : "Bảo Hộ Miễn Trừ"}
            .
          </span>
        </div>
      )}
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCVeDichChungView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <VeDichAudiencePage
      variant="chung"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const VeDichChungPage = () => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminVeDichChungView />;
  if (role === "mc") return <MCVeDichChungView />;
  return <PlayerVeDichChungView />;
};
export default VeDichChungPage;
