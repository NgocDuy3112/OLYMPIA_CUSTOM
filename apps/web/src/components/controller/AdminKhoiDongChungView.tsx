import { useCallback, useEffect, useRef, useState } from "react";
import { getMatchCode, setMatchCode } from "@/utils/storage";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";

import { useGameRound } from "@/hooks/useGameRound";
import { MAX_QUESTION_INDEX, QUESTION_PREFIX, TIME_LIMIT } from "@/pages/game/khoiDongShared";

import CNewBaseLayout from "@/pages/controller/CNewBaseLayout";
import CControlButton from "@/components/controller/CControlButton";
import CQuestionBoard from "@/components/controller/CQuestionBoard";
import { Button } from "@/components/ui/button";

export const AdminKhoiDongChungView = () => {
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
  const [hasStartedRoundTimer, setHasStartedRoundTimer] = useState(false);

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== getMatchCode()) {
      setMatchCode(urlMatchCode);
    }
  }, [urlMatchCode]);

  useEffect(() => {
    if (!matchCode) navigate("/operator/controller/overview");
  }, [matchCode, navigate]);

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
      setHasStartedRoundTimer(false);
    }
  }, [timer]);

  const handleStartRound = useCallback(async () => {
    if (hasStartedRoundTimer || isTimerRunning) return;
    setHasStartedRoundTimer(true);
    void sendPlayersSnapshot();
    await startTimer(1);
    loadQuestion(1).then((q) => {
      if (q) void sendQuestionToPlayers(1, q);
    });
  }, [
    hasStartedRoundTimer,
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
          <Button
            key={idx}
            type="button"
            variant="ghost"
            disabled={isTimerRunning}
            onClick={() => {
              if (!isTimerRunning) {
                setCurrentQuestionIndex(idx + 1);
                loadQuestion(idx + 1).then((q) => {
                  if (q) void sendQuestionToPlayers(idx + 1, q);
                });
              }
            }}
            className={`h-10 w-10 items-center justify-center rounded-md text-sm font-bold ${
              isActive
                ? "bg-brand text-background border border-brand"
                : "bg-transparent border border-primary text-foreground hover:bg-primary/70"
            } disabled:opacity-50`}
          >
            {idx + 1}
          </Button>
        );
      })}
    </div>
  );

  return (
    <CNewBaseLayout
      title="KHỞI ĐỘNG - LƯỢT CHUNG"
      players={players}
      selectedPlayerCodes={selectedPlayerCodes}
      onTogglePlayer={toggleSelectedPlayer}
      playersSelectable
      playersDisabled={isTimerRunning}
      onEditScore={handleEditScore}
      questionCode={currentQuestion.questionCode || undefined}
      onReviewRequested={() => {}}
      actions={
        <CControlButton onClick={endRound} disabled={isTimerRunning}>
          <Power size={18} />
          <span className="ml-2 font-bold">KẾT THÚC</span>
        </CControlButton>
      }
      playerActions={
        <>
          <CControlButton
            onClick={handleStartRound}
            disabled={isTimerRunning || hasStartedRoundTimer}
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </CControlButton>
          <CControlButton
            onClick={() => calculateAndBroadcastScore("kdc_correct")}
            disabled={
              selectedPlayerCodes.length === 0 ||
              hasAddedScore ||
              isTimerRunning
            }
          >
            <Calculator size={18} />
            <span className="ml-2 font-bold">TÍNH ĐIỂM</span>
          </CControlButton>
          <CControlButton
            onClick={showAnswers}
            disabled={!hasQuestionSelected || isTimerRunning}
          >
            <Eye size={18} />
            <span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </CControlButton>
        </>
      }
    >
      <CQuestionBoard
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
    </CNewBaseLayout>
  );
};
