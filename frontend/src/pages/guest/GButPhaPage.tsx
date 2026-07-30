import { useEffect, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useGuestSession } from "@/hooks/useGuestSession";
import { useGuestWebSocket } from "@/hooks/useGuestWebSocket";
import { useGuestPlayers } from "@/hooks/useGuestPlayers";
import { useGuestRevealAnswer } from "@/hooks/useGuestRevealAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const GButPhaPage = () => {
    const { matchCode } = useGuestSession();
    const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const { lastMessage } = useGuestWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, clearAnswers } = useGuestPlayers();
    const { answer: questionAnswer, applyReveal, clear: clearAnswer } = useGuestRevealAnswer();

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);
        applyReveal(msg);

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
            case "clear_question":
                clearAnswer();
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
        <GBasePageLayout players={players} currentPlayerCode="" buzzerWinnerCode={buzzerWinnerCode}>
            <>
                <AQuestionBoard
                    title="BỨT PHÁ"
                    question={questionWithAnswer}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: 5, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                    videoPlayState={videoPlayState}
                    hideMediaUntilPlayed
                    boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
                />
            </>
        </GBasePageLayout>
    );
};

export default GButPhaPage;