/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import MAnswerDisplay from "@/components/mc/MAnswerDisplay";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const MKhoiDongChungPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, clearAnswers } = useMcPlayers();
    const { questionAnswer, questionExplanation, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                break;
            case "start_the_timer":
                startSynced(Number(msg.time_limit ?? 0), msg.started_at);
                clearAnswers();
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
            case "answer":
                applyRealTimeAnswer(msg);
                break;
            case "buzz":
                applyBuzz(msg);
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, clearAnswers, fetchAnswer, clearAnswer]);

    return (
        <PBasePageLayout players={players} currentPlayerCode="">
            <>
                <PQuestionBoard
                    title="KHỞI ĐỘNG - LƯỢT CHUNG"
                    question={currentQuestion}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                />
                <MAnswerDisplay answer={questionAnswer} explanation={questionExplanation} />
            </>
        </PBasePageLayout>
    );
};

export default MKhoiDongChungPage;
