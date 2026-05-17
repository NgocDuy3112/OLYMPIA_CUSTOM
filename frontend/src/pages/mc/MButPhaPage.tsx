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

const MButPhaPage = () => {
    const { matchCode, token } = useMcSession();
    const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, clearAnswers } = useMcPlayers();
    const { questionAnswer, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

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
                setVideoPlayState("playing");
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
                setVideoPlayState(null);
                break;
            case "clear_question":
                clearAnswer();
                // Keep videoPlayState unchanged - do not reset when admin switches questions
                break;
            case "play_video":
                setVideoPlayState("playing");
                break;
            case "pause_video":
                setVideoPlayState("paused");
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
                // Only first buzzer gets the lightning icon
                if (msg.user_code && !buzzerWinnerCode) {
                    setBuzzerWinnerCode(msg.user_code);
                }
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, clearAnswers, fetchAnswer, clearAnswer, buzzerWinnerCode]);

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
    };

    return (
        <PBasePageLayout players={players} currentPlayerCode="" buzzerWinnerCode={buzzerWinnerCode}>
            <>
                <AQuestionBoard
                    title="BỨT PHÁ"
                    question={questionWithAnswer}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: 5, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                    videoPlayState={videoPlayState}
                    hideMediaUntilPlayed
                    boardHeightClass="h-[45vh]"
                    answerBoxHeightClass="min-h-[4rem]"
                />
            </>
        </PBasePageLayout>
    );
};

export default MButPhaPage;
