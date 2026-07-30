
import { useEffect, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useRevealAnswer } from "@/hooks/useRevealAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const MKhoiDongChungPage = () => {
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, clearAnswers } = useMcPlayers();
    const { answer: questionAnswer, applyReveal, clear: clearAnswer } = useRevealAnswer();

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);
        applyReveal(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                break;
            case "start_the_timer": {
                const timeLimit = Number(msg.time_limit ?? 60);
                const startedAt = msg.started_at ?? Date.now();
                startSynced(timeLimit, startedAt);
                clearAnswers();
                setBuzzerWinnerCode(null);
                break;
            }
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
                if (msg.user_code && !buzzerWinnerCode) {
                    setBuzzerWinnerCode(msg.user_code);
                }
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, applyReveal, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, clearAnswers, clearAnswer, buzzerWinnerCode]);

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
    };

    return (
        <PBasePageLayout players={players} currentPlayerCode="" buzzerWinnerCode={buzzerWinnerCode}>
            <AQuestionBoard
                title="KHỞI ĐỘNG - LƯỢT CHUNG"
                question={questionWithAnswer}
                timerDuration={timer}
                controls={{ variant: "numbers", count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[60vh]"
            />
        </PBasePageLayout>
    );
};

export default MKhoiDongChungPage;
