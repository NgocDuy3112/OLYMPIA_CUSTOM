import { useCallback, useEffect } from "react";

import { getMatchCode, setMatchCode } from "@/utils/storage";

import { useNavigate, useParams } from "react-router-dom";

import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";

import { useGameRound } from "@/hooks/useGameRound";

import CNewBaseLayout from "@/pages/controller/CNewBaseLayout";

import CControlButton from "@/components/controller/CControlButton";

import CQuestionBoard from "@/components/controller/CQuestionBoard";

import { Button } from "@/components/ui/button";

const QUESTION_PREFIX = "OC3_Q_KD_R";
const MAX_QUESTION_INDEX = 6;
const TIME_LIMIT = 60;

export const AdminKhoiDongRiengView = () => {
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
    round: "kdr",
    questionPrefix: QUESTION_PREFIX,
    timeLimit: TIME_LIMIT,
    timerPhase: "kdr",
  });

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== getMatchCode()) {
      setMatchCode(urlMatchCode);
    }
  }, [urlMatchCode]);

  useEffect(() => {
    if (!matchCode) navigate("/operator/controller/overview");
  }, [matchCode, navigate]);

  const handleSelectQuestion = useCallback(
    async (index: number) => {
      if (isTimerRunning) return;
      if (currentQuestionIndex === index) {
        if (selectedPlayerCodes.length > 0 && !hasAddedScore) {
          await calculateAndBroadcastScore("kdr_correct");
        } else {
          setCurrentQuestionIndex(0);
          await clearQuestion();
        }
      } else {
        setCurrentQuestionIndex(index);
        const q = await loadQuestion(index);
        await sendQuestionToPlayers(index, q);
      }
    },
    [
      isTimerRunning,
      currentQuestionIndex,
      selectedPlayerCodes,
      hasAddedScore,
      calculateAndBroadcastScore,
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
          <Button
            key={idx}
            type="button"
            variant="ghost"
            disabled={isTimerRunning}
            onClick={() => handleSelectQuestion(idx + 1)}
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
      title="KHỞI ĐỘNG - LƯỢT RIÊNG"
      players={players}
      selectedPlayerCodes={selectedPlayerCodes}
      onTogglePlayer={toggleSelectedPlayer}
      playersSelectable
      playersDisabled={isTimerRunning}
      onEditScore={handleEditScore}
      actions={
        <CControlButton onClick={endRound} disabled={isTimerRunning}>
          <Power size={18} />
          <span className="ml-2 font-bold">KẾT THÚC</span>
        </CControlButton>
      }
      playerActions={
        <>
          <CControlButton
            onClick={() => startTimer()}
            disabled={!hasQuestionSelected || isTimerRunning}
          >
            <AlarmClockCheck size={18} />
            <span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </CControlButton>
          <CControlButton
            onClick={() => calculateAndBroadcastScore("kdr_correct")}
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
        title="KHỞI ĐỘNG - LƯỢT RIÊNG"
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

