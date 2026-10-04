import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getMatchCode,
  localStore,
  matchStoragePrefixes,
  readMatchJson,
  readMatchString,
  removeMatchKey,
  setMatchCode,
  writeMatchJson,
  writeMatchString,
} from "@/utils/storage";
import {
  mapQuestionApiPayload,
  type QuestionApiPayload,
} from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlarmClockCheck,
  ListRestart,
  Power,
  Zap,
  Plus,
  Minus,
  SkipForward,
  Star,
} from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { useQuestionTimerLock } from "@/hooks/useQuestionTimerLock";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, getVeDichMeta } from "@/utils/veDichGrid";
import { loadControllerPlayersSnapshot } from "@/api/controllerPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { apiGetOrNull } from "@/api/client";
import { logger } from "@/pages/game/veDichRiengShared";

import CBasePageLayout from "@/pages/controller/CBasePageLayout";
import CControlButton from "@/components/controller/CControlButton";
import CPlayerBar from "@/components/controller/CPlayerBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";

const DEFAULT_QUESTION: Question = {
  questionCode: "",
  questionText: "",
  questionAnswer: "",
  questionExplanation: "",
  questionMediaURL: undefined,
};
const ROUND_QUESTION_COUNT = 3;
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

export const AdminVeDichRiengView = () => {
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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionCategories, setQuestionCategories] = useState<string[]>([]);
  const [questionPoints, setQuestionPoints] = useState<number[]>([]);
  const [questionStates, setQuestionStates] = useState<
    Record<string, "answered" | "answered-wrong" | "available">
  >(() => {
    if (!currentMatchCode) return {};
    try {
      const stored = localStore.get(`vd_rieng_states_${currentMatchCode}`);
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
    void sendMessage({
      type: "send_question",
      user_code: "",
      question_code: pending.questionCode,
      content: pending.question.questionText ?? "",
      media_source: pending.question.questionMediaURL ?? undefined,
    });
    if (pending.question.questionMediaURL) {
      void sendMessage({ type: "media_control", action: "play" });
      setVideoPlayState("playing");
    }
    pendingQuestionRef.current = null;
    clearPendingBroadcastTimer();
  }, [currentMatchCode, sendMessage, clearPendingBroadcastTimer]);

  const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => {
    if (!currentMatchCode) return [];
    return readMatchJson<string[]>(
      matchStoragePrefixes.riengCodes,
      currentMatchCode,
      [],
    );
  });
  const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<
    string | null
  >(() => {
    if (!currentMatchCode) return null;
    return (
      readMatchString(
        matchStoragePrefixes.riengSelectedPlayer,
        currentMatchCode,
      ) || null
    );
  });
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(
    () => {
      if (!currentMatchCode) return {};
      try {
        const parsed = readMatchJson<Record<string, unknown>>(
          matchStoragePrefixes.powers,
          currentMatchCode,
          {},
        );
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
  const [activePower, setActivePower] = useState<"star" | "shield" | null>(
    null,
  );
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const lastBuzzerQuestionRef = useRef<string | null>(null);
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const { isLocked: isTimerLocked, lock: lockTimer } = useQuestionTimerLock(
    currentQuestion.questionCode,
  );
  const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
  const [videoPlayState, setVideoPlayState] = useState<
    "playing" | "paused" | null
  >(null);
  const wasTimerRunningRef = useRef<boolean>(false);

  const questionTitle = "VỀ ĐÍCH - LƯỢT CÁ NHÂN";
  const currentPoints = (() => {
    if (!currentQuestion.questionCode) return 0;
    const idx = questions.findIndex(
      (q) => q.questionCode === currentQuestion.questionCode,
    );
    return questionPoints[idx] || 0;
  })();

  useEffect(() => {
    if (!currentMatchCode) return;
    localStore.set(
      `vd_rieng_states_${currentMatchCode}`,
      JSON.stringify(questionStates),
    );
    const answeredCodes = Object.entries(questionStates)
      .filter(([, v]) => v === "answered")
      .map(([k]) => k);
    if (answeredCodes.length > 0) {
      const existing = readMatchJson<string[]>(
        matchStoragePrefixes.usedCodes,
        currentMatchCode,
        [],
      );
      writeMatchJson(matchStoragePrefixes.usedCodes, currentMatchCode, [
        ...new Set([...existing, ...answeredCodes]),
      ]);
    }
  }, [questionStates, currentMatchCode]);
  useEffect(() => {
    if (!currentMatchCode) return;
    writeMatchJson(matchStoragePrefixes.powers, currentMatchCode, usedPowers);
  }, [usedPowers, currentMatchCode]);
  useEffect(() => {
    setActivePower(null);
    if (currentMatchCode)
      void sendMessage({ type: "vd_power_activated", power: null });
  }, [currentQuestion.questionCode, currentMatchCode, sendMessage]);

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
        const isAdminCode = currentTurnPlayerCode?.startsWith("ADMIN") ?? false;
        const isCurrent = !isAdminCode && currentTurnPlayerCode === userCode;
        return {
          user_code: userCode,
          user_name:
            profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
          position: p?.position ?? undefined,
          cumulative_score: cumulativeScore,
          is_current: isCurrent,
        };
      });
      await sendMessage({ type: "send_players_info", players: mergedPlayers });
    } catch (err) {
      logger.error("Failed to send players snapshot:", err);
    }
  }, [currentMatchCode, loadPlayersState, sendMessage, currentTurnPlayerCode]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!currentMatchCode) return;
      try {
        const result = await apiGetOrNull<
          QuestionApiPayload | QuestionApiPayload[]
        >(`/questions/?match_code=${encodeURIComponent(currentMatchCode)}`);
        if (!result) return;
        const raw = Array.isArray(result.data)
          ? result.data
          : [result.data].filter(Boolean);
        const veDichRaw = raw.filter((q: any) =>
          /^OC\d+_Q_VD/.test(String(q.question_code ?? "")),
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
      return {
        code,
        category: questionCategories[idx] ?? "",
        points: questionPoints[idx] ?? 0,
      };
    });
    void sendMessage({
      type: "vdr_questions_meta",
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
    if (roundQuestionCodes.length > 0 && questions.length > 0) {
      const metadata = roundQuestionCodes.map((code) => {
        const idx = questions.findIndex((q) => q.questionCode === code);
        return {
          code,
          category: questionCategories[idx] ?? "",
          points: questionPoints[idx] ?? 0,
        };
      });
      await sendMessage({
        type: "vdr_questions_meta",
        question_metadata: metadata,
      });
      for (const [code, qState] of Object.entries(questionStates)) {
        if (qState === "answered" || qState === "answered-wrong")
          await sendMessage({
            type: "vdr_question_state",
            question_code: code,
            state: qState,
          });
      }
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
        phase: "vdr",
        timeLimit: timerRef.current,
        questionCode: currentQuestion.questionCode,
      });
      if (videoPlayState === "playing")
        await sendMessage({ type: "media_control", action: "play" });
    }
    if (Object.keys(usedPowers).length > 0)
      await sendMessage({ type: "vd_powers_used", used_powers: usedPowers });
  }, [
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
    setTimer(0);
    setAnsweringWindowTimer(0);
    setIsTimerRunning(false);
    setVideoPlayState(null);
    wasTimerRunningRef.current = false;
    pendingQuestionRef.current = null;
    clearPendingBroadcastTimer();
    try {
      await sendMessage({ type: "clear_question", user_code: "" });
    } catch (err) {
      logger.error("Failed to clear question:", err);
    }
  }, [setVideoPlayState, sendMessage, clearPendingBroadcastTimer]);

  const handleQuestionActivate = useCallback(
    async (questionCode: string) => {
      if (isTimerRunning) return;
      if (currentQuestion.questionCode === questionCode) {
        setSelectedPlayerCodes([]);
        setUsedPowers({});
        await clearQuestion();
        return;
      }
      setSelectedPlayerCodes([]);
      setUsedPowers({});
      setVideoPlayState(null);
      lastBuzzerQuestionRef.current = null;
      setBuzzerWinnerCode(null);
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          playerLastAnswer: undefined,
          playerTimestamp: undefined,
          playerHasBuzzed: undefined,
        })),
      );
      if (currentMatchCode) {
        void sendMessage({ type: "clear_buzz", question_code: currentQuestion.questionCode });
        void sendMessage({ type: "clear_answers", user_code: "" });
      }
      try {
        const data = await apiGetOrNull<
          QuestionApiPayload | QuestionApiPayload[]
        >(
          `/questions/?match_code=${encodeURIComponent(currentMatchCode ?? "")}&question_code=${encodeURIComponent(questionCode)}`,
        );
        let q: Question;
        if (data) {
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
        broadcastPendingVeDichQuestion();
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
      broadcastPendingVeDichQuestion,
      setVideoPlayState,
      setPlayers,
    ],
  );

  const handleOpenPowerWindow = useCallback(() => {
    if (!currentMatchCode || !currentQuestion.questionCode || isTimerRunning)
      return;
    void sendMessage({ type: "vd_power_window_open", duration: 5 });
  }, [currentMatchCode, currentQuestion.questionCode, isTimerRunning, sendMessage]);

  const startTheClock = useCallback(() => {
    if (!currentQuestion.questionCode || isTimerRunning || isTimerLocked)
      return;
    lockTimer();
    const timeLimit = getTimeLimitForPoints(currentPoints);
    setTimer(timeLimit);
    setAnsweringWindowTimer(0);
    lastBuzzerQuestionRef.current = null;
    setBuzzerWinnerCode(null);
    setIsTimerRunning(true);
    if (currentMatchCode)
      void sendStartTimer({
        sendMessage,
        phase: "vdr",
        timeLimit,
        questionCode: currentQuestion.questionCode,
        selectedPlayerCode: currentTurnPlayerCode,
      });
  }, [
    currentQuestion.questionCode,
    isTimerRunning,
    isTimerLocked,
    lockTimer,
    currentPoints,
    currentMatchCode,
    currentTurnPlayerCode,
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
  useEffect(() => {
    wasTimerRunningRef.current = isTimerRunning;
  }, [isTimerRunning]);
  useEffect(() => {
    if (isTimerRunning || answeringWindowTimer !== 0) return;
    if (!wasTimerRunningRef.current) return;
    const waitTimeoutId = setTimeout(() => {
      setAnsweringWindowTimer(5);
    }, 5000);
    return () => clearTimeout(waitTimeoutId);
  }, [isTimerRunning, answeringWindowTimer]);
  useEffect(() => {
    if (answeringWindowTimer <= 0) return;
    const id = window.setInterval(() => {
      setAnsweringWindowTimer((prev) => {
        const next = prev <= 1 ? 0 : prev - 1;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [answeringWindowTimer]);
  useEffect(() => {
    if (answeringWindowTimer !== 5 || !currentMatchCode) return;
    void sendMessage({ type: "buzzer_activated", question_code: currentQuestion.questionCode, countdown: 5 });
  }, [answeringWindowTimer, currentMatchCode, currentQuestion.questionCode, sendMessage]);

  const handleAddPoints = useCallback(async () => {
    if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode)
      return;
    const answeredCode = currentQuestion.questionCode;
    setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
    void sendMessage({
      type: "vdr_question_state",
      question_code: answeredCode,
      state: "answered",
    });
    void sendMessage({ type: "vd_dung", phase: "vdr" });
    try {
      await calculateScore(
        currentMatchCode,
        answeredCode,
        "vdr_correct",
        selectedPlayerCodes,
      );
      await sendPlayersSnapshot();
      if (activePower && currentTurnPlayerCode)
        setUsedPowers((prev) => ({
          ...prev,
          [currentTurnPlayerCode]: activePower,
        }));
      setActivePower(null);
      void sendMessage({ type: "vd_power_activated", power: null });
      setSelectedPlayerCodes([]);
    } catch (err) {
      logger.error("handleAddPoints failed:", err);
    }
  }, [
    selectedPlayerCodes,
    currentQuestion.questionCode,
    activePower,
    currentTurnPlayerCode,
    sendPlayersSnapshot,
    sendMessage,
    currentMatchCode,
  ]);

  const handleSubtractPoints = useCallback(async () => {
    if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode)
      return;
    const answeredCode = currentQuestion.questionCode;
    setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
    void sendMessage({
      type: "vdr_question_state",
      question_code: answeredCode,
      state: "answered",
    });
    void sendMessage({ type: "wrong", phase: "vdr" });
    try {
      await calculateScore(
        currentMatchCode,
        answeredCode,
        "vdr_wrong",
        selectedPlayerCodes,
      );
      await sendPlayersSnapshot();
      if (activePower && currentTurnPlayerCode)
        setUsedPowers((prev) => ({
          ...prev,
          [currentTurnPlayerCode]: activePower,
        }));
      setActivePower(null);
      void sendMessage({ type: "vd_power_activated", power: null });
      setSelectedPlayerCodes([]);
    } catch (err) {
      logger.error("handleSubtractPoints failed:", err);
    }
  }, [
    selectedPlayerCodes,
    currentQuestion.questionCode,
    activePower,
    currentTurnPlayerCode,
    sendPlayersSnapshot,
    sendMessage,
    currentMatchCode,
  ]);

  const handleOpenBuzzer = useCallback(async () => {
    if (timer !== 0) return;
    setAnsweringWindowTimer(5);
    lastBuzzerQuestionRef.current = null;
    setBuzzerWinnerCode(null);
    setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
    if (currentMatchCode) {
      void sendMessage({ type: "clear_buzz", question_code: currentQuestion.questionCode });
      void sendMessage({ type: "buzzer_activated", question_code: currentQuestion.questionCode, countdown: 5 });
    }
  }, [timer, currentMatchCode, currentQuestion.questionCode, sendMessage]);

  const handleEndTurn = useCallback(async () => {
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    setTimer(0);
    setIsTimerRunning(false);
    setSelectedPlayerCodes([]);
    setCurrentTurnPlayerCode(null);
    setActivePower(null);
    setBuzzerWinnerCode(null);
    lastBuzzerQuestionRef.current = null;
    if (currentMatchCode)
      removeMatchKey(
        matchStoragePrefixes.riengSelectedPlayer,
        currentMatchCode,
      );
    await Promise.all([
      clearQuestion(),
      sendMessage({ type: "vdr_turn_end" }),
      sendMessage({ type: "blocked_buzz", user_code: null }),
      sendMessage({ type: "vd_power_activated", power: null }),
      sendMessage({
        type: "navigate",
        user_code: "",
        path: "/player/vdr/pick",
      }),
    ]);
    if (currentMatchCode) navigate(`/operator/controller/vdr/pick/${currentMatchCode}`);
  }, [clearQuestion, currentMatchCode, navigate, sendMessage]);

  const handleEndRound = useCallback(async () => {
    setCurrentQuestion({ ...DEFAULT_QUESTION });
    setTimer(0);
    setIsTimerRunning(false);
    if (!currentMatchCode) return;
    try {
      await sendMessage({ type: "vdr_round_end" });
      await endRoundAndReturnToWaiting({
        currentMatchCode,
        navigate,
        round: "vdr",
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
        if (
          Array.isArray(msg.selected_question_codes) &&
          msg.round === "rieng"
        ) {
          if (currentMatchCode)
            writeMatchJson(
              matchStoragePrefixes.riengCodes,
              currentMatchCode,
              msg.selected_question_codes,
            );
          startTransition(() => {
            setRoundQuestionCodes(msg.selected_question_codes);
            lastBuzzerQuestionRef.current = null;
            setBuzzerWinnerCode(null);
          });
        }
        if (msg.selected_player_code) {
          const isAdminCode = String(msg.selected_player_code).startsWith(
            "ADMIN",
          );
          if (!isAdminCode) {
            startTransition(() =>
              setCurrentTurnPlayerCode(msg.selected_player_code),
            );
            if (currentMatchCode)
              writeMatchString(
                matchStoragePrefixes.riengSelectedPlayer,
                currentMatchCode,
                msg.selected_player_code,
              );
          }
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
      case "buzzer_winner": {
        const winner = msg.user_code ?? "";
        setBuzzerWinnerCode(winner || null);
        startTransition(() => {
          setPlayers((prev) =>
            prev.map((p) => ({
              ...p,
              playerHasBuzzed: winner ? p.playerCode === winner : false,
            })),
          );
        });
        if (winner && msg.question_code !== lastBuzzerQuestionRef.current) {
          lastBuzzerQuestionRef.current = msg.question_code;
          void sendMessage({ type: "blocked_buzz", user_code: null });
        }
        break;
      }
      case "clear_buzz":
        setBuzzerWinnerCode(null);
        lastBuzzerQuestionRef.current = null;
        setPlayers((prev) =>
          prev.map((p) => ({ ...p, playerHasBuzzed: false })),
        );
        break;
      case "vd_player_power": {
        const { user_code, power } = msg;
        if (
          user_code &&
          (power === "star" || power === "shield") &&
          !usedPowers[user_code]
        ) {
          const nextUsedPowers = { ...usedPowers, [user_code]: power };
          startTransition(() => {
            setUsedPowers(nextUsedPowers);
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === user_code
                  ? { ...p, playerPower: power as "star" | "shield" }
                  : p,
              ),
            );
          });
          writeMatchJson(
            matchStoragePrefixes.powers,
            currentMatchCode,
            nextUsedPowers,
          );
          void sendMessage({
            type: "vd_powers_used",
            used_powers: nextUsedPowers,
          });
          if (user_code === currentTurnPlayerCode) {
            startTransition(() => {
              setActivePower(power as "star" | "shield");
            });
            void sendMessage({ type: "vd_power_activated", power });
          }
        }
        break;
      }
      case "vd_powers_used": {
        if (msg.used_powers) {
          startTransition(() => {
            setUsedPowers(msg.used_powers);
            setPlayers((prev) =>
              prev.map((p) => {
                const power = msg.used_powers[p.playerCode];
                return power
                  ? { ...p, playerPower: power as "star" | "shield" }
                  : p;
              }),
            );
          });
          writeMatchJson(
            matchStoragePrefixes.powers,
            currentMatchCode,
            msg.used_powers,
          );
        }
        break;
      }
      case "vd_power_window_closed":
        broadcastPendingVeDichQuestion();
        break;
    }
  }, [
    applyPlayersSnapshot,
    lastMessage,
    sendMessage,
    sendRoundSnapshot,
    broadcastPendingVeDichQuestion,
    currentMatchCode,
    currentTurnPlayerCode,
    usedPowers,
  ]);

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
    <CBasePageLayout
      questionTitle={questionTitle}
      question={currentQuestion}
      videoPlayState={videoPlayState}
      timerDuration={timer}
      controlsChildren={() => (
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({ length: ROUND_QUESTION_COUNT }).map((_, i) => {
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
              <div key={`rq-${code}`} className="w-55 shrink-0 h-20">
                <VeDichQuestionCard
                  category={catPrimary}
                  subcategory={catSecondary}
                  points={pts}
                  state={state}
                  isSelected={isActive}
                  disabled={state !== "available"}
                  onClick={() => {
                    if (state === "available" && !isTimerRunning)
                      handleQuestionActivate(code);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      topControlButtons={null}
      playerSectionButtons={
        <>
          <CControlButton
            onClick={handleOpenPowerWindow}
            disabled={
              !currentQuestion.questionCode ||
              isTimerRunning
            }
          >
            <Star size={18} />
            <span className="ml-2 font-bold">MỞ POWER</span>
          </CControlButton>
          <CControlButton
            onClick={startTheClock}
            disabled={
              !currentQuestion.questionCode ||
              isTimerRunning ||
              isTimerLocked ||
              !currentTurnPlayerCode
            }
            title={
              !currentTurnPlayerCode
                ? "Vui lòng chọn thí sinh trước"
                : undefined
            }
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </CControlButton>
          <CControlButton
            onClick={handleOpenBuzzer}
            disabled={
              timer > 0 || answeringWindowTimer > 0 || !currentTurnPlayerCode
            }
            title={
              !currentTurnPlayerCode
                ? "Vui lòng chọn thí sinh trước"
                : undefined
            }
          >
            <Zap size={18} />
            <span className="ml-2 font-bold">MỞ CHUÔNG</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void handleAddPoints().catch((err) =>
                logger.error("Cộng điểm failed:", err),
              );
            }}
            disabled={
              selectedPlayerCodes.length === 0 ||
              !currentQuestion.questionCode ||
              !currentTurnPlayerCode ||
              isTimerRunning
            }
            title={
              !currentTurnPlayerCode
                ? "Vui lòng chọn thí sinh trước"
                : undefined
            }
          >
            <Plus size={18} />
            <span className="ml-2 font-bold">CỘNG ĐIỂM</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void handleSubtractPoints().catch((err) =>
                logger.error("Trừ điểm failed:", err),
              );
            }}
            disabled={
              selectedPlayerCodes.length === 0 ||
              !currentQuestion.questionCode ||
              !currentTurnPlayerCode ||
              isTimerRunning
            }
            title={
              !currentTurnPlayerCode
                ? "Vui lòng chọn thí sinh trước"
                : undefined
            }
          >
            <Minus size={18} />
            <span className="ml-2 font-bold">TRỪ ĐIỂM</span>
          </CControlButton>
        </>
      }
      bottomActionButtons={
        <>
          <CControlButton
            onClick={() =>
              navigate(`/operator/controller/vdr/pick/${currentMatchCode ?? ""}`)
            }
            disabled={isTimerRunning}
          >
            <ListRestart size={18} />
            <span className="ml-2 font-bold">CHỌN LẠI</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void handleEndTurn();
            }}
            disabled={isTimerRunning || !currentTurnPlayerCode}
          >
            <SkipForward size={18} />
            <span className="ml-2 font-bold">HẾT LƯỢT</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void handleEndRound();
            }}
            disabled={isTimerRunning}
          >
            <Power size={18} />
            <span className="ml-2 font-bold">KẾT THÚC</span>
          </CControlButton>
        </>
      }
      renderPlayerList={() =>
        players.map((player) => (
          <CPlayerBar
            key={player.playerCode}
            player={player}
            isActive={selectedPlayerCodes.includes(player.playerCode)}
            isCurrent={player.playerCode === currentTurnPlayerCode}
            playerPower={
              usedPowers[player.playerCode] as "star" | "shield" | undefined
            }
            isBuzzerWinner={player.playerCode === buzzerWinnerCode}
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
