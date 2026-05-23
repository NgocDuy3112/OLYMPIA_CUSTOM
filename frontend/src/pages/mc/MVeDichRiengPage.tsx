/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Star, Shield } from "lucide-react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
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
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyBuzz, clearAnswers } = useMcPlayers();
    const { questionAnswer, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

    const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
    const [activePower, setActivePower] = useState<"star" | "shield" | null>(null);
	const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
    const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
    const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
    const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});
    const [currentPlayerCode, setCurrentPlayerCode] = useState("");

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

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
                console.info(`[VDR MC] Received buzzer_winner: winner=${winner}, current=${buzzerWinnerCode}`);
                // Only accept the first buzzer_winner to avoid overriding
                if (winner && !buzzerWinnerCode) {
                    setBuzzerWinnerCode(winner);
                    setPlayers((prev) =>
                        prev.map((p) => ({ ...p, playerHasBuzzed: p.playerCode === winner })),
                    );
                }
                break;
            }
            case "clear_buzz":
                setBuzzerWinnerCode(null);
                setAnsweringWindowTimer(0);
                setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));  
                break;
            case "blocked_buzz": {
                // msg.user_code may be null/empty to block all players or clear the blocked player
                if (msg.user_code === null || msg.user_code === undefined) {
                    // Block all players - no one can buzz anymore
                    console.info("[VDR MC] Blocking all buzzers");
                    // MC page doesn't have buzz functionality, but track state for consistency
                } else if (msg.user_code === "") {
                    // Clear blocked player
                } else {
                    // Block specific player
                }
                break;
            }
            case "buzz":
                // Don't show lightning icon yet — wait for admin's buzzer_winner broadcast
                // so only the fastest buzzer gets the icon
                break;
            case "veDich_power_activated":
                setActivePower((msg.power as "star" | "shield") ?? null);
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
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyBuzz, setPlayers, clearAnswers, fetchAnswer, clearAnswer, setCurrentPlayerCode]);

    // Countdown answering window timer
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
        <PBasePageLayout players={players} currentPlayerCode={currentPlayerCode} buzzerWinnerCode={buzzerWinnerCode}>
            <>
                <AQuestionBoard
                    title="VỀ ĐÍCH - LƯỢT CÁ NHÂN"
                    question={questionWithAnswer}
                    timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer}
                    videoPlayState={videoPlayState}
                    boardHeightClass="h-[55vh]"
                    answerBoxHeightClass="min-h-[4rem]"
                >
                    {() => (
                        <div className="flex gap-1 overflow-x-auto">
                            {roundQuestionsData.length > 0
                                ? roundQuestionsData.map((q) => {
                                    const qState = questionStates[q.code] ?? "available";
                                    const isActive = currentQuestion.questionCode === q.code;
                                    return (
                                        <div key={q.code} className="w-55 shrink-0 h-20">
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
                                    <div key={`ph-${i}`} className="w-55 shrink-0 h-20">
                                        <VeDichQuestionCard placeholder category="" disabled />
                                    </div>
                                ))}
                        </div>
                    )}
                </AQuestionBoard>

                {activePower && (
                    <div className="mx-3 mt-2 p-3 bg-blue-800 border-2 border-blue-400 rounded-xl flex items-center gap-3">
                        {activePower === 'star' ? (
                            <>
                                <Star size={20} className="text-yellow-400 shrink-0" />
                                <span className="font-bold text-yellow-300 uppercase tracking-wide">Ngôi sao hy vọng đang kích hoạt</span>
                                <span className="text-yellow-200 text-sm">Đúng: +150% · Sai: -100%</span>
                            </>
                        ) : (
                            <>
                                <Shield size={20} className="text-blue-400 shrink-0" />
                                <span className="font-bold text-blue-300 uppercase tracking-wide">Bảo hộ miễn trừ đang kích hoạt</span>
                                <span className="text-blue-200 text-sm">Đúng: +50% · Sai: không trừ</span>
                            </>
                        )}
                    </div>
                )}
            </>
        </PBasePageLayout>
    );
};

export default MVeDichRiengPage;
