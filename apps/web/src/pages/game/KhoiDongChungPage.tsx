/**
 * KhoiDongChungPage — Unified page for Khởi Động Chung (group warm-up).
 *
 * Admin: auto-advance through 6 questions (10s each), 60s total timer.
 * MC: read-only audience view.
 * Player: answer input for each question.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useGameRound } from "@/hooks/useGameRound";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { submitAnswer } from "@/api/answers";
import { API_BASE_URL } from "@/configs";
import type { Question } from "@/types/question";

import ANewBaseLayout from "@/pages/admin/ANewBaseLayout";
import AControlButton from "@/components/admin/AControlButton";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";

const QUESTION_PREFIX = "OC3_Q_KD_C";
const MAX_QUESTION_INDEX = 6;
const TIME_LIMIT = 60;

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminKhoiDongChungView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();

  const {
    players,
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
    setPlayers,
    sendPlayersSnapshot,
  } = useGameRound({
    round: "kdc",
    questionPrefix: QUESTION_PREFIX,
    timeLimit: TIME_LIMIT,
    timerPhase: "kdc",
  });

  const lastAutoAdvancedIndexRef = useRef(0);
  const hasStartedRoundTimerRef = useRef(false);

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== localStorage.getItem("matchCode")) {
      localStorage.setItem("matchCode", urlMatchCode);
    }
  }, [urlMatchCode]);

  useEffect(() => {
    if (!matchCode) navigate("/admin/manage");
  }, [matchCode, navigate]);

  // Auto-advance questions based on timer
  useEffect(() => {
    if (!isTimerRunning || timer <= 0) return;
    const derivedIndex = Math.ceil((TIME_LIMIT - timer + 1) / 10);
    const targetIndex = Math.min(Math.max(derivedIndex, 1), MAX_QUESTION_INDEX);

    if (targetIndex !== lastAutoAdvancedIndexRef.current) {
      lastAutoAdvancedIndexRef.current = targetIndex;
      setCurrentQuestionIndex(targetIndex);
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          playerLastAnswer: undefined,
          playerTimestamp: undefined,
          playerHasBuzzed: undefined,
        })),
      );
      void loadQuestion(targetIndex).then((q) => {
        if (q) void sendQuestionToPlayers(targetIndex, q);
      });
    }
  }, [
    isTimerRunning,
    timer,
    setCurrentQuestionIndex,
    setPlayers,
    loadQuestion,
    sendQuestionToPlayers,
  ]);

  useEffect(() => {
    if (timer <= 0) {
      lastAutoAdvancedIndexRef.current = 0;
      hasStartedRoundTimerRef.current = false;
    }
  }, [timer]);

  const handleStartRound = useCallback(async () => {
    if (hasStartedRoundTimerRef.current || isTimerRunning) return;
    hasStartedRoundTimerRef.current = true;
    void sendPlayersSnapshot();
    await startTimer(1);
    loadQuestion(1).then((q) => {
      if (q) void sendQuestionToPlayers(1, q);
    });
  }, [
    isTimerRunning,
    startTimer,
    loadQuestion,
    sendQuestionToPlayers,
    sendPlayersSnapshot,
  ]);

  const questionControls = (
    <div className="flex gap-2">
      {Array.from({ length: MAX_QUESTION_INDEX }).map((_, idx) => {
        const isActive = currentQuestionIndex === idx + 1;
        return (
          <button
            key={idx}
            type="button"
            disabled={isTimerRunning}
            onClick={() => {
              if (!isTimerRunning) {
                setCurrentQuestionIndex(idx + 1);
                loadQuestion(idx + 1).then((q) => {
                  if (q) void sendQuestionToPlayers(idx + 1, q);
                });
              }
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors ${
              isActive
                ? "bg-blue-300 text-blue-900 border border-blue-200"
                : "bg-transparent border border-blue-600 text-white hover:bg-blue-700"
            } disabled:opacity-50`}
          >
            {idx + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <ANewBaseLayout
      title="KHỞI ĐỘNG - LƯỢT CHUNG"
      players={players}
      selectedPlayerCodes={selectedPlayerCodes}
      onTogglePlayer={toggleSelectedPlayer}
      playersSelectable
      playersDisabled={isTimerRunning}
      onEditScore={handleEditScore}
      actions={
        <AControlButton onClick={endRound} disabled={isTimerRunning}>
          <Power size={18} />
          <span className="ml-2 font-bold">KẾT THÚC</span>
        </AControlButton>
      }
      playerActions={
        <>
          <AControlButton
            onClick={handleStartRound}
            disabled={isTimerRunning || hasStartedRoundTimerRef.current}
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </AControlButton>
          <AControlButton
            onClick={() => calculateAndBroadcastScore("kdc_correct")}
            disabled={
              selectedPlayerCodes.length === 0 ||
              hasAddedScore ||
              isTimerRunning
            }
          >
            <Calculator size={18} />
            <span className="ml-2 font-bold">TÍNH ĐIỂM</span>
          </AControlButton>
          <AControlButton
            onClick={showAnswers}
            disabled={!hasQuestionSelected || isTimerRunning}
          >
            <Eye size={18} />
            <span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </AControlButton>
        </>
      }
    >
      <AQuestionBoard
        title="KHỞI ĐỘNG - LƯỢT CHUNG"
        question={currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: MAX_QUESTION_INDEX,
          activeIndices:
            currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
        children={() => questionControls}
      />
    </ANewBaseLayout>
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
const PlayerKhoiDongChungView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    sendMessage,
    timer,
    timeLimit,
    getElapsedSeconds,
    currentQuestion,
    currentQuestionIndex,
    players,
    setPlayers,
    showAnswers,
  } = usePlayerRound({ audioSrc: "/audios/bgm/KD_60s.MP3" });

  const [answer, setAnswer] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<
    number | null
  >(null);
  const [answeredQuestionCodes, setAnsweredQuestionCodes] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    void fetch(`${API_BASE_URL}/questions/${encodeURIComponent(matchCode)}`)
      .then((response) => response.json())
      .then((json) => {
        const rows = Array.isArray(json.data) ? json.data : [];
        setQuestions(
          rows
            .filter((row: any) =>
              String(row.question_code ?? row.questionCode).startsWith(
                QUESTION_PREFIX,
              ),
            )
            .slice(0, MAX_QUESTION_INDEX)
            .map((row: any) => ({
              questionCode: row.question_code ?? row.questionCode,
              questionText: row.content ?? row.questionText ?? "",
              questionAnswer: row.answer ?? "",
              questionExplanation: row.explanation ?? undefined,
              questionMediaURL:
                row.media_url ?? row.questionMediaURL ?? undefined,
              questionOptions: row.options ?? undefined,
            })),
        );
      })
      .catch(() => setQuestions([]));
  }, [matchCode]);

  const selectedQuestion =
    selectedQuestionIndex == null
      ? null
      : (questions[selectedQuestionIndex] ?? null);
  const selectedAnswered =
    !!selectedQuestion &&
    answeredQuestionCodes.has(selectedQuestion.questionCode);
  const isPlayerAfk = players.some(
    (player) => player.playerCode === playerCode && player.playerAfk,
  );

  useEffect(() => {
    setAnswer("");
  }, [selectedQuestionIndex]);

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (
      !trimmed ||
      !isConnected ||
      timer <= 0 ||
      !selectedQuestion ||
      selectedAnswered ||
      isPlayerAfk
    )
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
        question_code: selectedQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
        timestamp: ts,
      });
      await sendMessage({
        type: "player_answer",
        user_code: playerCode,
        question_code: selectedQuestion.questionCode,
        answer: trimmed,
        answer_text: trimmed,
        timestamp: ts,
        phase: "kdc",
      });
      setAnsweredQuestionCodes((previous) =>
        new Set(previous).add(selectedQuestion.questionCode),
      );
    } catch (error) {
      console.warn("Failed to submit answer:", error);
    }
    setAnswer("");
  }, [
    answer,
    getElapsedSeconds,
    isConnected,
    isPlayerAfk,
    matchCode,
    playerCode,
    selectedQuestion,
    selectedAnswered,
    sendMessage,
    setPlayers,
    timeLimit,
    timer,
  ]);

  const displayPlayers = players.map((p) =>
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="KHỞI ĐỘNG - LƯỢT CHUNG"
        question={selectedQuestion ?? currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: MAX_QUESTION_INDEX,
          activeIndices:
            selectedQuestionIndex == null ? [] : [selectedQuestionIndex],
        }}
        questionSelect={(index) => setSelectedQuestionIndex(index)}
        answeredIndices={
          new Set(
            questions.map((question, index) =>
              answeredQuestionCodes.has(question.questionCode) ? index : -1,
            ),
          )
        }
      />
      <PAnswerBox
        answer={answer}
        setAnswer={setAnswer}
        isDisabled={
          !isConnected ||
          timer <= 0 ||
          !selectedQuestion ||
          selectedAnswered ||
          isPlayerAfk
        }
        onSubmit={handleSubmitAnswer}
        placeholderString={
          timer <= 0
            ? "Bạn không thể nhập đáp án tại thời điểm này"
            : "Nhập đáp án và nhấn Enter"
        }
      />
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCKhoiDongChungView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <KhoiDongAudiencePage
      variant="chung"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const KhoiDongChungPage = () => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminKhoiDongChungView />;
  if (role === "mc") return <MCKhoiDongChungView />;
  return <PlayerKhoiDongChungView />;
};

export default KhoiDongChungPage;
