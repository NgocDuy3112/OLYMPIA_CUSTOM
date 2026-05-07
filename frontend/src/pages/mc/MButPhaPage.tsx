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
import { RenderMedia } from "@/components/shared/RenderMedia";

const MButPhaPage = () => {
    const { matchCode, token } = useMcSession();
    const [revealedHints, setRevealedHints] = useState<Record<number, { type: "text" | "image"; content: string }>>({});
    const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
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
                setVideoPlayState(null);
                break;
            case "clear_question":
                clearAnswer();
                setVideoPlayState(null);
                break;
            case "play_video":
                setVideoPlayState("playing");
                break;
            case "pause_video":
                setVideoPlayState("paused");
                break;
            case "show_hint": {
                const idx = Number(msg.hint_index);
                if (idx > 0 && msg.hint_content) {
                    setRevealedHints((prev) => ({
                        ...prev,
                        [idx]: { type: msg.hint_type ?? "text", content: msg.hint_content },
                    }));
                }
                break;
            }
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
                    title="BỨT PHÁ"
                    question={currentQuestion}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: 5, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
                    videoPlayState={videoPlayState}
                />
                <div className="grid grid-cols-5 gap-3 px-3">
                    {Array.from({ length: 5 }).map((_, i) => {
                        const qIndex = i + 1;
                        const hint = revealedHints[qIndex];
                        const isCurrentQ = currentQuestionIndex === qIndex;
                        return (
                            <div
                                key={qIndex}
                                className={`rounded-xl border-2 p-3 flex items-center justify-center min-h-20 transition-all duration-300 ${hint ? "bg-yellow-900/60 border-yellow-400" : isCurrentQ ? "bg-blue-500/30 border-blue-300" : "bg-blue-900/40 border-blue-700"}`}
                            >
                                {hint ? (
                                    hint.type === "text" ? (
                                        <p className="text-yellow-100 font-bold text-sm text-center leading-tight">{hint.content}</p>
                                    ) : (
                                        <RenderMedia mediaUrl={hint.content} />
                                    )
                                ) : (
                                    <span className="text-3xl font-[SVN-Gratelos_Display] font-extrabold text-white">{qIndex}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
                <MAnswerDisplay answer={questionAnswer} explanation={questionExplanation} />
            </>
        </PBasePageLayout>
    );
};

export default MButPhaPage;
