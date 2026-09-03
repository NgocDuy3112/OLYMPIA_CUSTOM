/**
 * ButPhaPage — Unified page for Bứt Phá (buzzer sprint).
 *
 * Admin: full control panel with question selection, timer, scoring.
 * MC: read-only audience view (same as player).
 * Player: answer input with timer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useGameRound } from "@/hooks/useGameRound";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { submitAnswer } from "@/api/answers";

import ANewBaseLayout from "@/pages/admin/ANewBaseLayout";
import AControlButton from "@/components/admin/AControlButton";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { ButPhaAudiencePage } from "@/components/shared/ButPhaAudiencePage";

const QUESTION_PREFIX = "OC3_Q_BP";
const MAX_QUESTION_INDEX = 5;
const TIME_LIMIT = 30;

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminButPhaView = () => {
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
    clearQuestion,
    sendQuestionToPlayers,
    startTimer,
    showAnswers,
    calculateAndBroadcastScore,
    handleEditScore,
    endRound,
  } = useGameRound({
    round: "bp",
    questionPrefix: QUESTION_PREFIX,
    timeLimit: TIME_LIMIT,
    timerPhase: "bp",
  });

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== localStorage.getItem("matchCode")) {
      localStorage.setItem("matchCode", urlMatchCode);
    }
  }, [urlMatchCode]);

  useEffect(() => {
    if (!matchCode) navigate("/admin/manage");
  }, [matchCode, navigate]);

  const handleSelectQuestion = useCallback(
    async (index: number) => {
      if (isTimerRunning) return;
      if (currentQuestionIndex === index) {
        setCurrentQuestionIndex(0);
        await clearQuestion();
      } else {
        setCurrentQuestionIndex(index);
        const q = await loadQuestion(index);
        await sendQuestionToPlayers(index, q);
      }
    },
    [
      isTimerRunning,
      currentQuestionIndex,
      setCurrentQuestionIndex,
      loadQuestion,
      sendQuestionToPlayers,
      clearQuestion,
    ],
  );

  const questionControls = (
    <div className="flex gap-2">
      {Array.from({ length: MAX_QUESTION_INDEX }).map((_, idx) => {
        const isActive = currentQuestionIndex === idx + 1;
        return (
          <button
            key={idx}
            type="button"
            disabled={isTimerRunning}
            onClick={() => handleSelectQuestion(idx + 1)}
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
      title="BỨT PHÁ"
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
            onClick={() => startTimer()}
            disabled={!hasQuestionSelected || isTimerRunning}
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </AControlButton>
          <AControlButton
            onClick={() => calculateAndBroadcastScore("bp_resolve")}
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
        title="BỨT PHÁ"
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
const PlayerButPhaView = () => {
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
    videoPlayState,
    timerHasStarted,
  } = usePlayerRound();

  const [answer, setAnswer] = useState("");
  const isPlayerAfk = players.some(
    (player) => player.playerCode === playerCode && player.playerAfk,
  );
  const [submitDisabledTemporarily, setSubmitDisabledTemporarily] =
    useState(false);
  const [submitDisableSecondsLeft, setSubmitDisableSecondsLeft] = useState(0);
  const submitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current)
        window.clearInterval(submitTimeoutRef.current);
    };
  }, []);

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (
      !trimmed ||
      submitDisabledTemporarily ||
      isPlayerAfk ||
      !isConnected ||
      !currentQuestion.questionCode ||
      !timerHasStarted ||
      timer <= 0
    )
      return;

    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));

    setSubmitDisabledTemporarily(true);
    setSubmitDisableSecondsLeft(1.5);
    if (submitTimeoutRef.current)
      window.clearInterval(submitTimeoutRef.current);
    submitTimeoutRef.current = window.setInterval(() => {
      setSubmitDisableSecondsLeft((prev) => {
        if (prev <= 0.5) {
          if (submitTimeoutRef.current) {
            window.clearInterval(submitTimeoutRef.current);
            submitTimeoutRef.current = null;
          }
          setSubmitDisabledTemporarily(false);
          return 0;
        }
        return Number((prev - 0.5).toFixed(1));
      });
    }, 500);

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
    isPlayerAfk,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
    submitDisabledTemporarily,
    timeLimit,
    timer,
    timerHasStarted,
  ]);

  const isTimerExpired = timerHasStarted && timeLimit > 0 && timer === 0;
  const isSubmissionDisabled =
    isPlayerAfk ||
    !isConnected ||
    !currentQuestion.questionCode ||
    !timerHasStarted ||
    isTimerExpired ||
    submitDisabledTemporarily;

  const answerPlaceholder = !currentQuestion.questionCode
    ? "Chờ admin chọn câu hỏi..."
    : !timerHasStarted
      ? "Chờ admin bắt đầu tính giờ..."
      : isTimerExpired
        ? "Thời gian đã hết!"
        : submitDisabledTemporarily
          ? `Vui lòng đợi trong ${submitDisableSecondsLeft} giây`
          : "Nhập đáp án và nhấn Enter";

  const displayPlayers = players.map((p) =>
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="BỨT PHÁ"
        question={currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: 5,
          activeIndices:
            currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
        videoPlayState={videoPlayState}
        hideMediaUntilPlayed
      />
      <PAnswerBox
        answer={answer}
        setAnswer={setAnswer}
        isDisabled={isSubmissionDisabled}
        onSubmit={handleSubmitAnswer}
        placeholderString={answerPlaceholder}
      />
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCButPhaView = () => {
  const { matchCode } = useRoleSession("mc");
  return <ButPhaAudiencePage Layout={PBasePageLayout} matchCode={matchCode} />;
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const ButPhaPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminButPhaView />;
  if (role === "mc") return <MCButPhaView />;
  return <PlayerButPhaView />;
};

export default ButPhaPage;
