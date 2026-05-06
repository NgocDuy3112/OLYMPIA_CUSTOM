/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import MAnswerDisplay from "@/components/mc/MAnswerDisplay";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";

const MGiaiMaPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers } = useMcPlayers();
    const { questionAnswer, questionExplanation, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);
    const [revealedHint, setRevealedHint] = useState<string | null>(null);
    const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);

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
                setRevealedHint(null);
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
                setRevealedHint(null);
                setKeywordAnswer(null);
                break;
            case "show_hint":
                setRevealedHint(msg.hint_content ?? null);
                break;
            case "send_answers_to_players":
                applyAnswers(msg);
                break;
            case "send_keyword_answers":
                applyAnswers(msg);
                break;
            case "answer":
                applyRealTimeAnswer(msg);
                break;
            case "reveal_keyword_answer":
                setKeywordAnswer(msg.answer ?? null);
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers, fetchAnswer, clearAnswer]);

    return (
        <PBasePageLayout players={players} currentPlayerCode="">
            <>
                <PQuestionBoard
                    title="GIẢI MÃ"
                    question={currentQuestion}
                    timerDuration={timer}
                    boardHeightClass="h-[38vh]"
                    controls={{ variant: "numbers", count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                />

                {revealedHint && (
                    <div className="mx-3 mt-2 p-4 bg-yellow-600 border-2 border-yellow-400 rounded-xl text-center font-bold text-white text-xl">
                        GỢI Ý: {revealedHint}
                    </div>
                )}

                {keywordAnswer && (
                    <div className="mx-3 mt-2 p-4 bg-green-700 border-2 border-green-400 rounded-xl text-center font-bold text-white text-xl">
                        TỪ KHOÁ: {keywordAnswer}
                    </div>
                )}

                <MAnswerDisplay answer={questionAnswer} explanation={questionExplanation} />
            </>
        </PBasePageLayout>
    );
};

export default MGiaiMaPage;
