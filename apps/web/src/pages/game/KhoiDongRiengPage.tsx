/**
 * KhoiDongRiengPage — Unified page for Khởi Động Cá Nhân (individual warm-up).
 *
 * Admin: full control panel with question selection, timer, scoring.
 * MC: read-only audience view.
 * Player: answer input for each question.
 */
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useGameRound } from "@/hooks/useGameRound";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";

import ANewBaseLayout from "@/pages/admin/ANewBaseLayout";
import AControlButton from "@/components/admin/AControlButton";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";

const QUESTION_PREFIX = "OC3_Q_KD_R";
const MAX_QUESTION_INDEX = 6;
const TIME_LIMIT = 60;

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminKhoiDongRiengView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();

  const {
    players, currentQuestion, currentQuestionIndex, setCurrentQuestionIndex,
    timer, isTimerRunning, selectedPlayerCodes, hasAddedScore, matchCode,
    hasQuestionSelected, toggleSelectedPlayer, loadQuestion, clearQuestion,
    sendQuestionToPlayers, startTimer, showAnswers, calculateAndBroadcastScore,
    handleEditScore, endRound,
  } = useGameRound({ round: "kdr", questionPrefix: QUESTION_PREFIX, timeLimit: TIME_LIMIT, timerPhase: "kdr" });

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== localStorage.getItem("matchCode")) {
      localStorage.setItem("matchCode", urlMatchCode);
    }
  }, [urlMatchCode]);

  useEffect(() => {
    if (!matchCode) navigate("/admin/manage");
  }, [matchCode, navigate]);

  const handleSelectQuestion = useCallback(async (index: number) => {
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
  }, [isTimerRunning, currentQuestionIndex, selectedPlayerCodes, hasAddedScore, calculateAndBroadcastScore, setCurrentQuestionIndex, loadQuestion, sendQuestionToPlayers, clearQuestion]);

  const questionControls = (
    <div className="flex gap-2">
      {Array.from({ length: MAX_QUESTION_INDEX }).map((_, idx) => {
        const isActive = currentQuestionIndex === idx + 1;
        return (
          <button key={idx} type="button" disabled={isTimerRunning}
            onClick={() => handleSelectQuestion(idx + 1)}
            className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors ${
              isActive ? "bg-blue-300 text-blue-900 border border-blue-200" : "bg-transparent border border-blue-600 text-white hover:bg-blue-700"
            } disabled:opacity-50`}
          >{idx + 1}</button>
        );
      })}
    </div>
  );

  return (
    <ANewBaseLayout
      title="KHỞI ĐỘNG - LƯỢT RIÊNG" players={players} selectedPlayerCodes={selectedPlayerCodes}
      onTogglePlayer={toggleSelectedPlayer} playersSelectable playersDisabled={isTimerRunning}
      onEditScore={handleEditScore}
      actions={<AControlButton onClick={endRound} disabled={isTimerRunning}><Power size={18} /><span className="ml-2 font-bold">KẾT THÚC</span></AControlButton>}
      playerActions={
        <>
          <AControlButton onClick={() => startTimer()} disabled={!hasQuestionSelected || isTimerRunning}>
            <AlarmClockCheck size={18} /><span className="ml-2 font-bold">ĐẾM GIỜ</span>
          </AControlButton>
          <AControlButton onClick={() => calculateAndBroadcastScore("kdr_correct")} disabled={selectedPlayerCodes.length === 0 || hasAddedScore || isTimerRunning}>
            <Calculator size={18} /><span className="ml-2 font-bold">TÍNH ĐIỂM</span>
          </AControlButton>
          <AControlButton onClick={showAnswers} disabled={!hasQuestionSelected || isTimerRunning}>
            <Eye size={18} /><span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
          </AControlButton>
        </>
      }
    >
      <AQuestionBoard title="KHỞI ĐỘNG - LƯỢT RIÊNG" question={currentQuestion} timerDuration={timer}
        controls={{ variant: "numbers", count: MAX_QUESTION_INDEX, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
        children={() => questionControls}
      />
    </ANewBaseLayout>
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
const PlayerKhoiDongRiengView = () => {
  const { playerCode } = useRoleSession("player");
  const { players, setPlayers, currentQuestion, currentQuestionIndex, timer } = usePlayerRound({ audioSrc: '/audios/bgm/kd_60s.mp3' });

  useEffect(() => {
    setPlayers(prev => prev.map(p => ({ ...p, playerWrongAttempts: undefined })));
  }, [currentQuestionIndex, setPlayers]);

  const hasPlayerWithSecondAttempt = players.some(p => p.playerWrongAttempts === 1);

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <PQuestionBoard title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN" question={currentQuestion} timerDuration={timer}
        controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
      >
        {hasPlayerWithSecondAttempt && (
          <div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold shrink-0 animate-pulse">Trả lời lần 2</div>
        )}
      </PQuestionBoard>
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCKhoiDongRiengView = () => {
  const { matchCode } = useRoleSession("mc");
  return <KhoiDongAudiencePage variant="rieng" Layout={PBasePageLayout} matchCode={matchCode} />;
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const KhoiDongRiengPage = () => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminKhoiDongRiengView />;
  if (role === "mc") return <MCKhoiDongRiengView />;
  return <PlayerKhoiDongRiengView />;
};

export default KhoiDongRiengPage;
