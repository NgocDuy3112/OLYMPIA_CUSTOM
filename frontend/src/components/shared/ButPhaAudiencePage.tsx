import type { AudienceLayoutProps } from "@/types/audience";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useRevealAnswer } from "@/hooks/useRevealAnswer";

interface ButPhaAudiencePageProps {
  Layout: ComponentType<AudienceLayoutProps>;
  matchCode?: string;
}

export function ButPhaAudiencePage({ Layout }: ButPhaAudiencePageProps) {
  const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const { lastMessage } = useGameWebSocket();
  const { timer, startSynced } = useCountdownTimer();
  const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
  const {
    players,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    applyBuzz,
    clearAnswers,
  } = useAudiencePlayers();
  const { answer, applyReveal, clear: clearAnswer } = useRevealAnswer();

  useEffect(() => {
    if (!lastMessage) return;
    const message = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(message);
      applyReveal(message);

      switch (message.type) {
        case "send_players_info":
          applyPlayersInfo(message);
          break;
        case "send_question":
        case "round_start":
        case "round_end":
          setVideoPlayState(null);
          setBuzzerWinnerCode(null);
          break;
        case "clear_question":
          clearAnswer();
          setVideoPlayState(null);
          setBuzzerWinnerCode(null);
          break;
        case "start_the_timer":
          startSynced(Number(message.time_limit ?? 0), Number(message.started_at ?? Date.now()));
          clearAnswers();
          setVideoPlayState("playing");
          setBuzzerWinnerCode(null);
          break;
        case "player_score_updated":
          applyScoreUpdate(message);
          break;
        case "clear_answers":
          clearAnswers();
          break;
        case "play_video":
          setVideoPlayState("playing");
          break;
        case "pause_video":
          setVideoPlayState("paused");
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
          break;
        }
      }
    });
  }, [
    applyAnswers,
    applyBuzz,
    applyPlayersInfo,
    applyReveal,
    applyScoreUpdate,
    applyWsMessage,
    clearAnswer,
    clearAnswers,
    lastMessage,
    startSynced,
  ]);

  const question = {
    ...currentQuestion,
    questionAnswer: answer || currentQuestion.questionAnswer,
  };

  return (
    <Layout players={players} currentPlayerCode="" buzzerWinnerCode={buzzerWinnerCode}>
      <AQuestionBoard
        title="BỨT PHÁ"
        question={question}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: 5,
          activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
        videoPlayState={videoPlayState}
        hideMediaUntilPlayed
        boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
      />
    </Layout>
  );
}
