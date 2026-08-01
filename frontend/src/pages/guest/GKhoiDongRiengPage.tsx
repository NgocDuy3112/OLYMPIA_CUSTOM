import { useEffect, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useGuestWebSocket } from "@/hooks/useGuestWebSocket";
import { useGuestPlayers } from "@/hooks/useGuestPlayers";
import { useGuestRevealAnswer } from "@/hooks/useGuestRevealAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const GKhoiDongRiengPage = () => {
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const { lastMessage } = useGuestWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, applyWrongAttempt, clearAnswers } = useGuestPlayers();
    const { answer: questionAnswer, explanation: questionExplanation, applyReveal, clear: clearAnswer } = useGuestRevealAnswer();
    const [currentPlayerCode, setCurrentPlayerCode] = useState("");

    useEffect(() => {
        setPlayers((prev) =>
            prev.map((p) => ({ ...p, playerWrongAttempts: undefined })),
        );
    }, [currentQuestionIndex]);

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);
        applyReveal(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                {
                    const current = (msg?.players ?? []).find((p: any) => p?.is_current);
                    setCurrentPlayerCode(current ? String(current.user_code ?? "") : "");
                }
                break;
            case "start_the_timer":
                startSynced(Number(msg.time_limit ?? 0), msg.started_at);
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
                break;
            case "send_answers_to_players":
                applyAnswers(msg);
                break;
            case "buzz":
                applyBuzz(msg);
                break;
            case "buzzer_winner": {
                const winner: string = msg.user_code ?? "";
                setBuzzerWinnerCode(winner || null);
                setPlayers((prev) =>
                    prev.map((p) => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false })),
                );
                break;
            }
            case "player_wrong_attempt":
                applyWrongAttempt(msg);
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, applyReveal, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, applyWrongAttempt, clearAnswers, clearAnswer, setPlayers, buzzerWinnerCode]);

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
        questionExplanation: questionExplanation ?? currentQuestion.questionExplanation,
    };

    const hasPlayerWithSecondAttempt = players.some((p) => p.playerWrongAttempts === 1);

    return (
        <GBasePageLayout players={players} currentPlayerCode={currentPlayerCode} buzzerWinnerCode={buzzerWinnerCode}>
            <AQuestionBoard
                title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
                question={questionWithAnswer}
                timerDuration={timer}
                controls={{ variant: "numbers", count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[60vh]"
            >
                {() => (
                    <div className="flex gap-2 items-center">
                        {hasPlayerWithSecondAttempt && (
                            <div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold shrink-0 animate-pulse">
                                Trả lời lần 2
                            </div>
                        )}
                    </div>
                )}
            </AQuestionBoard>
        </GBasePageLayout>
    );
};

export default GKhoiDongRiengPage;