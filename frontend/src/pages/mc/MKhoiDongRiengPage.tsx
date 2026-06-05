/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const MKhoiDongRiengPage = () => {
    const { matchCode, token } = useMcSession();
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, applyWrongAttempt, clearAnswers } = useMcPlayers();
    const { questionAnswer, questionExplanation, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);
    const [currentPlayerCode, setCurrentPlayerCode] = useState("");

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                // derive whose turn it is from is_current flag
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
            case "send_question":
                void fetchAnswer(msg.question_code ?? "");
                break;
            case "clear_question":
                clearAnswer();
                break;
            case "send_answers_to_players":
                applyAnswers(msg);
                break;
            case "player_answer":
            case "answer":
                applyRealTimeAnswer(msg);
                break;
            case "buzz":
                applyBuzz(msg);
                if (msg.user_code && !buzzerWinnerCode) {
                    setBuzzerWinnerCode(msg.user_code);
                }
                break;
            case "buzzer_winner": {
                const winner: string = msg.user_code ?? "";
                setBuzzerWinnerCode(winner || null);
                setPlayers((prev) =>
                    prev.map((p) => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false })),
                );
                break;
            }
            case "clear_buzz":
                setBuzzerWinnerCode(null);
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                break;
            case "player_wrong_attempt":
                applyWrongAttempt(msg);
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, applyWrongAttempt, clearAnswers, fetchAnswer, clearAnswer, setPlayers, buzzerWinnerCode]);

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
        questionExplanation: questionExplanation ?? currentQuestion.questionExplanation,
    };

    // Show "Trả lời lần 2" banner when any player has 1 wrong attempt in current question
    const hasPlayerWithSecondAttempt = players.some((p) => p.playerWrongAttempts === 1);

    return (
        <PBasePageLayout players={players} currentPlayerCode={currentPlayerCode} buzzerWinnerCode={buzzerWinnerCode}>
            {hasPlayerWithSecondAttempt && (
                <div className="bg-yellow-600 text-white px-4 py-2 rounded-md text-base sm:text-lg font-bold text-center shrink-0 animate-pulse">
                    Trả lời lần 2
                </div>
            )}
            <AQuestionBoard
                title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
                question={questionWithAnswer}
                timerDuration={timer}
                controls={{ variant: "numbers", count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[60vh]"
                answerBoxHeightClass="h-[15vh]"
                hideAnswerBox={true}
            />
        </PBasePageLayout>
    );
};

export default MKhoiDongRiengPage;
