import type { AudienceLayoutProps } from "@/types/audience";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useRevealAnswer } from "@/hooks/useRevealAnswer";
import type { RawPlayer } from "@/utils/playerHelpers";

interface KhoiDongAudiencePageProps {
  variant: "chung" | "rieng";
  Layout: ComponentType<AudienceLayoutProps>;
  matchCode?: string;
}

export function KhoiDongAudiencePage({ variant, Layout }: KhoiDongAudiencePageProps) {
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const [currentPlayerCode, setCurrentPlayerCode] = useState("");
  const { lastMessage } = useGameWebSocket();
  const { timer, startSynced } = useCountdownTimer();
  const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
  const {
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    applyBuzz,
    applyWrongAttempt,
    clearAnswers,
  } = useAudiencePlayers();
  const {
    answer: questionAnswer,
    explanation: questionExplanation,
    applyReveal,
    clear: clearAnswer,
  } = useRevealAnswer();

  useEffect(() => {
    if (variant !== "rieng") return;
    queueMicrotask(() => {
      setPlayers((previous) => previous.map((player) => ({
        ...player,
        playerWrongAttempts: undefined,
      })));
    });
  }, [currentQuestionIndex, setPlayers, variant]);

  useEffect(() => {
    if (!lastMessage) return;
    const message = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(message);
      applyReveal(message);

      switch (message.type) {
        case "send_players_info": {
          applyPlayersInfo(message);
          if (variant === "rieng") {
            const rawPlayers = Array.isArray(message.players) ? message.players as RawPlayer[] : [];
            const current = rawPlayers.find((player) => player.is_current);
            setCurrentPlayerCode(String(current?.user_code ?? ""));
          }
          break;
        }
        case "start_the_timer":
          startSynced(Number(message.time_limit ?? (variant === "chung" ? 60 : 0)), Number(message.started_at ?? Date.now()));
          clearAnswers();
          setBuzzerWinnerCode(null);
          break;
        case "player_score_updated":
          applyScoreUpdate(message);
          break;
        case "clear_answers":
          clearAnswers();
          break;
        case "clear_question":
          clearAnswer();
          break;
        case "send_answers_to_players":
          applyAnswers(message);
          break;
        case "buzz":
          applyBuzz(message);
          break;
        case "buzzer_winner": {
          const winner = String(message.user_code ?? "");
          setBuzzerWinnerCode(winner || null);
          if (variant === "rieng") {
            setPlayers((previous) => previous.map((player) => ({
              ...player,
              playerHasBuzzed: winner ? player.playerCode === winner : false,
            })));
          }
          break;
        }
        case "player_wrong_attempt":
          if (variant === "rieng") applyWrongAttempt(message);
          break;
      }
    });
  }, [
    applyAnswers,
    applyBuzz,
    applyPlayersInfo,
    applyReveal,
    applyScoreUpdate,
    applyWrongAttempt,
    applyWsMessage,
    clearAnswer,
    clearAnswers,
    lastMessage,
    setPlayers,
    startSynced,
    variant,
  ]);

  const question = {
    ...currentQuestion,
    questionAnswer: questionAnswer || currentQuestion.questionAnswer,
    questionExplanation: questionExplanation || currentQuestion.questionExplanation,
  };
  const hasSecondAttempt = variant === "rieng" && players.some((player) => player.playerWrongAttempts === 1);

  return (
    <Layout
      players={players}
      currentPlayerCode={variant === "rieng" ? currentPlayerCode : ""}
      buzzerWinnerCode={buzzerWinnerCode}
    >
      {hasSecondAttempt && (
        <div className="flex justify-center">
          <div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold animate-pulse">
            Trả lời lần 2
          </div>
        </div>
      )}
      <AQuestionBoard
        title={variant === "rieng" ? "KHỞI ĐỘNG - LƯỢT CÁ NHÂN" : "KHỞI ĐỘNG - LƯỢT CHUNG"}
        question={question}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: 6,
          activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
        boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[60vh]"
      />
    </Layout>
  );
}
