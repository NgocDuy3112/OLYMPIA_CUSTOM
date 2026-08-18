import type { AudienceLayoutProps } from "@/types/audience";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";
import { useRevealAnswer } from "@/hooks/useRevealAnswer";

type RoundQuestion = { code: string; category: string; points: number };

interface VeDichAudiencePageProps {
  Layout: ComponentType<AudienceLayoutProps>;
  matchCode?: string;
}

export function VeDichChungAudiencePage({
  Layout,
  matchCode = "",
}: VeDichAudiencePageProps) {
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const { lastMessage } = useGameWebSocket();
  const { timer, startSynced } = useCountdownTimer();
  const { currentQuestion, applyWsMessage } = useQuestionState();
  const [videoPlayState, setVideoPlayState] = useState<
    "playing" | "paused" | null
  >(null);
  const {
    players,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    applyPlayerPower,
    clearAnswers,
  } = useAudiencePlayers();
  const {
    answer: questionAnswer,
    applyReveal,
    clear: clearAnswer,
  } = useRevealAnswer();

  const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(
    () => {
      if (!matchCode) return [];
      try {
        const stored = localStorage.getItem(`vd_chung_meta_${matchCode}`);
        return stored ? (JSON.parse(stored) as RoundQuestion[]) : [];
      } catch {
        return [];
      }
    },
  );
  const [questionStates, setQuestionStates] = useState<
    Record<string, "answered" | "answered-wrong" | "available">
  >({});

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(msg);
      applyReveal(msg);

      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "start_the_timer":
          startSynced(
            Number(msg.time_limit ?? 0),
            Number(msg.started_at ?? Date.now()),
          );
          clearAnswers();
          setBuzzerWinnerCode(null);
          break;
        case "player_score_updated":
          applyScoreUpdate(msg);
          break;
        case "clear_answers":
          clearAnswers();
          break;
        case "clear_question":
          clearAnswer();
          setVideoPlayState(null);
          break;
        case "media_control":
          setVideoPlayState(msg.action === "pause" ? "paused" : "playing");
          break;
        case "send_answers_to_players":
          applyAnswers(msg);
          break;
        case "buzz":
          break;
        case "buzzer_winner":
          setBuzzerWinnerCode(msg.user_code ? String(msg.user_code) : null);
          break;
        case "vdc_question_state": {
          const { question_code, state: qState } = msg;
          if (question_code && qState) {
            setQuestionStates((prev) => ({
              ...prev,
              [question_code]: qState as
                | "answered"
                | "answered-wrong"
                | "available",
            }));
          }
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
            } catch (error) {
              console.error("Storage update failed", error);
            }
          }
          break;
        }
        case "vd_player_power": {
          const { user_code, power } = msg;
          if (user_code && (power === "star" || power === "shield")) {
            applyPlayerPower(String(user_code), power);
          }
          break;
        }
        default:
          break;
      }
    });
  }, [
    lastMessage,
    applyWsMessage,
    applyReveal,
    startSynced,
    applyPlayersInfo,
    applyScoreUpdate,
    applyAnswers,
    clearAnswers,
    clearAnswer,
    matchCode,
    buzzerWinnerCode,
    setRoundQuestionsData,
    applyPlayerPower,
  ]);

  const questionWithAnswer = {
    ...currentQuestion,
    questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
  };

  return (
    <Layout
      players={players}
      currentPlayerCode=""
      buzzerWinnerCode={buzzerWinnerCode}
    >
      <AQuestionBoard
        title="VỀ ĐÍCH - LƯỢT CHUNG"
        question={questionWithAnswer}
        timerDuration={timer}
        videoPlayState={videoPlayState}
        boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[60vh]"
      >
        {() => (
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
              : Array.from({ length: players.length || 4 }).map((_, i) => (
                  <div
                    key={`ph-${i}`}
                    className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                  >
                    <VeDichQuestionCard placeholder category="" disabled />
                  </div>
                ))}
          </div>
        )}
      </AQuestionBoard>
    </Layout>
  );
}
