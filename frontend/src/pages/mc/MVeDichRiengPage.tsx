
import { useEffect, useRef, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useRevealAnswer } from "@/hooks/useRevealAnswer";

type RoundQuestion = { code: string; category: string; points: number };

const MVeDichRiengPage = () => {
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyPlayerPower, clearAnswers } = useMcPlayers();
    const { answer: questionAnswer, applyReveal, clear: clearAnswer } = useRevealAnswer();

    const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
    const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);

    const lastBuzzerQuestionRef = useRef<string | null>(null);
    const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
    const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
    const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});
    const [currentPlayerCode, setCurrentPlayerCode] = useState("");
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
                setBuzzerWinnerCode(null);
                lastBuzzerQuestionRef.current = null;
                setAnsweringWindowTimer(0);
                startSynced(Number(msg.time_limit ?? 0), msg.started_at);
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                clearAnswers();
                break;
            case "player_score_updated":
                applyScoreUpdate(msg);
                break;
            case "buzzer_winner": {
                const winner = msg.user_code;
                const winnerQuestion = msg.question_code;

                if (winner && winnerQuestion !== lastBuzzerQuestionRef.current) {
                    console.info(`[VDR MC] Received buzzer_winner: winner=${winner}, question=${winnerQuestion}`);
                    setBuzzerWinnerCode(winner);
                    lastBuzzerQuestionRef.current = winnerQuestion;
                    setPlayers((prev) =>
                        prev.map((p) => ({ ...p, playerHasBuzzed: p.playerCode === winner })),
                    );
                } else {
                    console.warn(`[VDR MC] Ignoring buzzer_winner: winner=${winner}, question=${winnerQuestion}, current=${buzzerWinnerCode}`);
                }
                break;
            }
            case "clear_buzz": {

                setBuzzerWinnerCode(null);
                lastBuzzerQuestionRef.current = null;
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                break;
            }
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
            case "answering_window_activated":
                setAnsweringWindowTimer(msg.countdown ?? 5);
                break;
            case "vd_player_power": {

                const { user_code, power } = msg;
                if (user_code && (power === "star" || power === "shield")) {
                    applyPlayerPower(user_code, power as "star" | "shield");
                }
                break;
            }
            case "vdr_questions_meta":
            case "vd_questions_selected": {

                if (msg.round !== "chung") {
                    setBuzzerWinnerCode(null);
                    lastBuzzerQuestionRef.current = null;
                    setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
                }
                const metadata: RoundQuestion[] = msg.question_metadata ?? [];
                if (metadata.length > 0) setRoundQuestionsData(metadata);
                break;
            }
            case "vdr_question_state": {
                const { question_code, state: qState } = msg;
                if (question_code && qState) {
                    setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
                }
                break;
            }
            default:
                break;
        }
}, [lastMessage, applyWsMessage, applyReveal, startSynced, applyPlayersInfo, applyScoreUpdate, applyPlayerPower, setPlayers, clearAnswers, clearAnswer, setCurrentPlayerCode, setAnsweringWindowTimer, setRoundQuestionsData, setQuestionStates]);

    useEffect(() => {
        if (answeringWindowTimer <= 0) return;
        const intervalId = window.setInterval(() => {
            setAnsweringWindowTimer((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, [answeringWindowTimer]);

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
    };

    return (
        <PBasePageLayout players={players} currentPlayerCode={currentPlayerCode} currentTurnPlayerCode={currentPlayerCode} buzzerWinnerCode={buzzerWinnerCode}>
            <>
                <AQuestionBoard
                    title="VỀ ĐÍCH - LƯỢT CÁ NHÂN"
                    question={questionWithAnswer}
                    timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer}
                    videoPlayState={videoPlayState}
                    boardHeightClass="h-[40vh] sm:h-[50vh] lg:h-[55vh]"
                >
                    {() => (
                        <div className="flex gap-1 overflow-x-auto">
                            {roundQuestionsData.length > 0
                                ? roundQuestionsData.map((q) => {
                                    const qState = questionStates[q.code] ?? "available";
                                    const isActive = currentQuestion.questionCode === q.code;
                                    return (
                                        <div key={q.code} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
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
                                    <div key={`ph-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
                                        <VeDichQuestionCard placeholder category="" disabled />
                                    </div>
                                ))}
                        </div>
                    )}
                </AQuestionBoard>
            </>
        </PBasePageLayout>
    );
};

export default MVeDichRiengPage;
