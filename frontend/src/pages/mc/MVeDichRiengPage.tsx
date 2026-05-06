/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import MAnswerDisplay from "@/components/mc/MAnswerDisplay";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";

type RoundQuestion = { code: string; category: string; points: number };

const MVeDichRiengPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, start } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyBuzz, clearAnswers } = useMcPlayers();
    const { questionAnswer, questionExplanation, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
    const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
    const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                break;
            case "start_the_timer":
                setBuzzerWinnerCode(null);
                setAnsweringWindowTimer(0);
                start(Number(msg.time_limit ?? 0));
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                clearAnswers();
                break;
            case "player_score_updated":
                applyScoreUpdate(msg);
                break;
            case "buzzer_winner": {
                const winner = msg.user_code;
                setBuzzerWinnerCode(winner ?? null);
                setPlayers((prev) =>
                    prev.map((p) => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false })),
                );
                break;
            }
            case "clear_buzz":
                setBuzzerWinnerCode(null);
                setAnsweringWindowTimer(0);
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                break;
            case "buzz":
                applyBuzz(msg);
                break;
            case "send_question":
                void fetchAnswer(msg.question_code ?? "");
                break;
            case "clear_question":
                clearAnswer();
                break;
            case "answering_window_activated":
                setAnsweringWindowTimer(msg.countdown ?? 5);
                break;
            case "veDich_questions_selected":
            case "veDich_rieng_questions_meta": {
                const metadata: RoundQuestion[] = msg.question_metadata ?? [];
                if (metadata.length > 0) setRoundQuestionsData(metadata);
                break;
            }
            case "veDich_question_state": {
                const { question_code, state: qState } = msg;
                if (question_code && qState) {
                    setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
                }
                break;
            }
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, start, applyPlayersInfo, applyScoreUpdate, applyBuzz, setPlayers, clearAnswers, fetchAnswer, clearAnswer]);

    // Countdown answering window timer
    useEffect(() => {
        if (answeringWindowTimer <= 0) return;
        const intervalId = window.setInterval(() => {
            setAnsweringWindowTimer((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, [answeringWindowTimer]);

    const buzzerWinnerName = buzzerWinnerCode
        ? (players.find((p) => p.playerCode === buzzerWinnerCode)?.playerName ?? buzzerWinnerCode)
        : null;

    return (
        <PBasePageLayout players={players} currentPlayerCode="">
            <>
                <PQuestionBoard
                    title="VỀ ĐÍCH - LƯỢT CÁ NHÂN"
                    question={currentQuestion}
                    timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer}
                >
                    <div className="flex gap-2">
                        {roundQuestionsData.length > 0
                            ? roundQuestionsData.map((q) => {
                                const qState = questionStates[q.code] ?? "available";
                                const isActive = currentQuestion.questionCode === q.code;
                                return (
                                    <div key={q.code} className="w-60 shrink-0 h-9">
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
                            : Array.from({ length: 3 }).map((_, i) => (
                                <div key={`ph-${i}`} className="w-60 shrink-0 h-9">
                                    <VeDichQuestionCard placeholder category="" disabled />
                                </div>
                            ))}
                    </div>
                </PQuestionBoard>

                {buzzerWinnerName && (
                    <div className="mx-3 mt-2 p-4 bg-yellow-600 border-2 border-yellow-400 rounded-xl text-center font-bold text-white text-xl">
                        BUZZER: {buzzerWinnerName}
                    </div>
                )}

                <MAnswerDisplay answer={questionAnswer} explanation={questionExplanation} />
            </>
        </PBasePageLayout>
    );
};

export default MVeDichRiengPage;
