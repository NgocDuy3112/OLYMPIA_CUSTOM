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
  setMatchCode,
  writeMatchJson,
} from "@/utils/storage";
import {
  mapQuestionApiPayload,
  type QuestionApiPayload,
} from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlarmClockCheck,
  Calculator,
  ListRestart,
  RefreshCw,
  Eye,
  Power,
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
import { endRoundAndReturnToWaiting } from "@/utils/controllerRoundNavigation";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { apiGetOrNull } from "@/api/client";

import CBasePageLayout from "@/pages/controller/CBasePageLayout";
import CControlButton from "@/components/controller/CControlButton";
import CPlayerBar from "@/components/controller/CPlayerBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { logger } from "@/pages/game/veDichChungShared";

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

export const ControllerVeDichChungView = () => {
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
      const stored = localStore.get(`vd_chung_states_${currentMatchCode}`);
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
    return readMatchJson<string[]>(
      matchStoragePrefixes.chungCodes,
      currentMatchCode,
      [],
    );
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
  const [playerPowers, setPlayerPowers] = useState<
    Record<string, "star" | "shield" | null>
  >({});

  useEffect(() => {
    if (!currentMatchCode) return;
    writeMatchJson(matchStoragePrefixes.powers, currentMatchCode, usedPowers);
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
    localStore.set(
      `vd_chung_states_${currentMatchCode}`,
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
      await sendMessage({ type: "send_players_info", players: mergedPlayers });
    } catch (err) {
      logger.error("Failed to send players snapshot:", err);
    }
  }, [currentMatchCode, loadPlayersState, sendMessage]);

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
  }, [setVideoPlayState, sendMessage, clearPendingBroadcastTimer]);

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
    try {
      const json = await apiGetOrNull<Record<string, unknown>[]>(
        `/answers/${encodeURIComponent(currentMatchCode!)}/${encodeURIComponent(qCode)}`,
      );
      if (!json) return;
      const rows = Array.isArray(json.data) ? json.data : [];
      const answersPayload = rows
        .filter(
          (row: { answer_text?: unknown; answerText?: unknown }) =>
            (row?.answer_text ?? row?.answerText) != null &&
            String(row?.answer_text ?? row?.answerText) !== "",
        )
        .map(
          (row: {
            user_code?: unknown;
            userCode?: unknown;
            answer_text?: unknown;
            answerText?: unknown;
            timestamp?: unknown;
          }) => ({
            user_code: String(row?.user_code ?? row?.userCode ?? ""),
            content: String(row?.answer_text ?? row?.answerText ?? ""),
            timestamp: Number(row?.timestamp ?? 0),
          }),
        )
        .filter((a: { user_code: string }) => a.user_code !== "");
      await sendMessage({
        type: "send_answers_to_players",
        answers: answersPayload,
      });
    } catch (err) {
      logger.error("showAnswers failed:", err);
    }
  }, [canShowAnswers, currentMatchCode, currentQuestion, sendMessage]);

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
    playerPowers,
    usedPowers,
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
            writeMatchJson(
              matchStoragePrefixes.chungCodes,
              currentMatchCode,
              msg.selected_question_codes,
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
  }, [
    applyPlayersSnapshot,
    lastMessage,
    sendMessage,
    sendRoundSnapshot,
    currentMatchCode,
    playerPowers,
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
          <CControlButton
            onClick={handleOpenPowerWindow}
            disabled={
              !currentQuestion.questionCode || isTimerRunning
            }
          >
            <Star size={18} />
            <span className="ml-2 font-bold">MỞ POWER</span>
          </CControlButton>
          <CControlButton
            onClick={startTheClock}
            disabled={
              !currentQuestion.questionCode || isTimerRunning || isTimerLocked
            }
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void handleCalculateScore().catch((err) =>
                logger.error("TÍNH ĐIỂM failed:", err),
              );
            }}
            disabled={!currentQuestion.questionCode || isTimerRunning}
          >
            <Calculator size={18} />
            <span className="ml-2 font-bold">TÍNH ĐIỂM</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void showAnswers();
            }}
            disabled={!canShowAnswers || isTimerRunning}
          >
            <Eye size={18} />
            <span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </CControlButton>
          <CControlButton
            onClick={() => {
              void loadPlayersState();
            }}
            disabled={isTimerRunning}
          >
            <RefreshCw size={18} />
            <span className="ml-2 font-bold">CẬP NHẬT</span>
          </CControlButton>
        </>
      }
      bottomActionButtons={
        <>
          <CControlButton
            onClick={() =>
              navigate(`/operator/controller/vdc/pick/${currentMatchCode ?? ""}`)
            }
            disabled={isTimerRunning}
          >
            <ListRestart size={18} />
            <span className="ml-2 font-bold">CHỌN LẠI</span>
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
      topControlButtons={null}
      renderPlayerList={() =>
        activePlayers.map((player) => (
          <CPlayerBar
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
