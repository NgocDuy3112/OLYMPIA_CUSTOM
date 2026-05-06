/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import MAnswerDisplay from "@/components/mc/MAnswerDisplay";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";

type RoundQuestion = { code: string; category: string; points: number };

const MVeDichChungPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers } = useMcPlayers();
    const { questionAnswer, questionExplanation, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

    const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(() => {
        if (!matchCode) return [];
        try {
            const stored = localStorage.getItem(`veDich_chung_meta_${matchCode}`);
            return stored ? (JSON.parse(stored) as RoundQuestion[]) : [];
        } catch { return []; }
    });
    const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});

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
            case "veDich_question_state": {
                const { question_code, state: qState } = msg;
                if (question_code && qState) {
                    setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
                }
                break;
            }
            case "veDich_questions_selected":
            case "veDich_questions_meta": {
                const metadata: RoundQuestion[] = msg.question_metadata ?? [];
                if (metadata.length > 0) {
                    setRoundQuestionsData(metadata);
                    try { localStorage.setItem(`veDich_chung_meta_${matchCode}`, JSON.stringify(metadata)); } catch { /* ignore */ }
                }
                break;
            }
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers, fetchAnswer, clearAnswer, matchCode]);

    return (
        <PBasePageLayout players={players} currentPlayerCode="">
            <>
                <PQuestionBoard
                    title="VỀ ĐÍCH - LƯỢT CHUNG"
                    question={currentQuestion}
                    timerDuration={timer}
                >
                    <div className="flex gap-2">
                        {roundQuestionsData.length > 0
                            ? roundQuestionsData.map((q) => {
                                const qState = questionStates[q.code] ?? "available";
                                const isActive = currentQuestion.questionCode === q.code;
                                return (
                                    <div key={q.code} className="w-60 shrink-0 h-9">
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
                            : Array.from({ length: players.length || 4 }).map((_, i) => (
                                <div key={`ph-${i}`} className="w-60 shrink-0 h-9">
                                    <VeDichQuestionCard placeholder category="" disabled />
                                </div>
                            ))}
                    </div>
                </PQuestionBoard>

                <MAnswerDisplay answer={questionAnswer} explanation={questionExplanation} />
            </>
        </PBasePageLayout>
    );
};

export default MVeDichChungPage;
