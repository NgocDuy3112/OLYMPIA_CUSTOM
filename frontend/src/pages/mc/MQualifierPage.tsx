/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";
import { QUALIFIER_OPTIONS, QUALIFIER_TIME_LIMIT } from "@/types/qualifier";

const MQualifierPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, setPlayers, applyPlayersInfo, applyAnswers, applyRealTimeAnswer, clearAnswers } = useMcPlayers();
    const { questionAnswer, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);

    const [boardCount, setBoardCount] = useState<number>(6);
    const [activeQuestionIndex, setActiveQuestionIndex] = useState<number | null>(null);
    const [parsedOptions, setParsedOptions] = useState<string[]>([]);
    const [showAnswers, setShowAnswers] = useState(false);
    const answeredCodesRef = useRef<Set<string>>(new Set());
    const [answeredCount, setAnsweredCount] = useState(0);

    const parseOptions = (options: string | string[] | undefined): string[] => {
        if (!options) return [];
        if (Array.isArray(options)) return options.slice(0, 6);
        try {
            const parsed = JSON.parse(options as string);
            return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
        } catch {
            return [];
        }
    };

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                break;
            case "send_question": {
                setParsedOptions(parseOptions(msg.options ?? undefined));
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);
                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                if (typeof msg.question_index === "number") setActiveQuestionIndex(Number(msg.question_index));
                void fetchAnswer(msg.question_code ?? "");
                break;
            }
            case "clear_question": {
                setParsedOptions([]);
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);
                setActiveQuestionIndex(null);
                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                clearAnswer();
                break;
            }
            case "sync_qualifier_round":
                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                break;
            case "start_the_timer":
                startSynced(Number(msg.time_limit ?? QUALIFIER_TIME_LIMIT), msg.started_at);
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);
                clearAnswers();
                break;
            case "qualifier_scores_updated": {
                const updates: any[] = Array.isArray(msg.score_updates) ? msg.score_updates : [];
                if (updates.length > 0) {
                    setPlayers((prev) =>
                        prev.map((p) => {
                            const u = updates.find((uu: any) => uu.user_code === p.playerCode);
                            return u ? { ...p, playerScore: u.new_total ?? p.playerScore } : p;
                        }),
                    );
                }
                break;
            }
            case "send_answers_to_players":
                applyAnswers(msg);
                setShowAnswers(true);
                break;
            case "clear_answers":
                clearAnswers();
                setShowAnswers(false);
                break;
            case "player_answer":
            case "answer": {
                applyRealTimeAnswer(msg);
                const code = String(msg.user_code ?? "");
                if (code && !answeredCodesRef.current.has(code)) {
                    answeredCodesRef.current.add(code);
                    setAnsweredCount(answeredCodesRef.current.size);
                }
                break;
            }
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, setPlayers, applyAnswers, applyRealTimeAnswer, clearAnswers, fetchAnswer, clearAnswer]);

    const correctAnswer = (questionAnswer || currentQuestion.questionAnswer)?.toUpperCase() ?? "";

    const statsAnswered = showAnswers
        ? players.filter((p) => p.playerLastAnswer).length
        : answeredCount;
    const statsCorrect = showAnswers && correctAnswer
        ? players.filter((p) => p.playerLastAnswer?.toUpperCase() === correctAnswer).length
        : 0;
    const statsWrong = showAnswers ? statsAnswered - statsCorrect : 0;
    const statsNoAnswer = players.length - statsAnswered;

    const questionWithAnswer = {
        ...currentQuestion,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
        questionExplanation: currentQuestion.questionExplanation,
    };

    return (
        <PBasePageLayout players={players} currentPlayerCode="">
            <>
                {players.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-900 border-2 border-blue-600 w-full text-sm mb-2">
                        {showAnswers ? (
                            <>
                                <span className="text-blue-300 font-semibold mr-1 shrink-0">Kết quả:</span>
                                <span className="flex items-center gap-1 bg-blue-700 text-white font-bold px-3 py-1 rounded-lg">
                                    ✓&nbsp;<span className="text-base">{statsCorrect}</span>
                                    <span className="font-normal text-xs ml-0.5">đúng</span>
                                </span>
                                <span className="flex items-center gap-1 bg-red-700 text-white font-bold px-3 py-1 rounded-lg">
                                    ✗&nbsp;<span className="text-base">{statsWrong}</span>
                                    <span className="font-normal text-xs ml-0.5">sai</span>
                                </span>
                                <span className="flex items-center gap-1 bg-blue-800 text-blue-200 font-bold px-3 py-1 rounded-lg">
                                    —&nbsp;<span className="text-base">{statsNoAnswer}</span>
                                    <span className="font-normal text-xs ml-0.5">chưa trả lời</span>
                                </span>
                                <span className="ml-auto text-blue-400 text-xs shrink-0">
                                    {statsAnswered}/{players.length} đã trả lời
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="text-blue-300 font-semibold mr-1 shrink-0">Đã trả lời:</span>
                                <span className="flex items-center gap-1 bg-blue-800 text-white font-bold px-3 py-1 rounded-lg">
                                    <span className="text-base">{statsAnswered}</span>
                                    <span className="font-normal text-xs ml-0.5">người</span>
                                </span>
                                <span className="flex items-center gap-1 bg-blue-800 text-blue-200 font-bold px-3 py-1 rounded-lg">
                                    —&nbsp;<span className="text-base">{statsNoAnswer}</span>
                                    <span className="font-normal text-xs ml-0.5">chưa trả lời</span>
                                </span>
                                <span className="ml-auto text-blue-400 text-xs shrink-0">
                                    {statsAnswered}/{players.length} đã trả lời
                                </span>
                            </>
                        )}
                    </div>
                )}

                <AQuestionBoard
                    title="VÒNG LOẠI"
                    question={questionWithAnswer}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: boardCount, activeIndices: activeQuestionIndex ? [activeQuestionIndex - 1] : [] }}
                    boardHeightClass="h-[50vh]"
                    answerBoxHeightClass="h-[13vh]"
                    hideAnswerBox={true}
                />

                {parsedOptions.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 mt-3 w-full">
                        {QUALIFIER_OPTIONS.map((opt, idx) => {
                            const text = parsedOptions[idx] ?? "";
                            const isCorrect = showAnswers && correctAnswer === opt;
                            const classes = isCorrect
                                ? "bg-white border-white text-gray-900"
                                : "bg-blue-800 border-blue-600 text-white";

                            return (
                                <div
                                    key={opt}
                                    className={`flex items-center gap-4 px-6 py-4 rounded-xl border font-bold text-lg shadow-xl ${classes}`}
                                >
                                    <span className={`text-2xl font-extrabold w-10 shrink-0 ${isCorrect ? "text-gray-900" : ""}`}>
                                        {opt}
                                    </span>
                                    <span className={`leading-snug text-left ${isCorrect ? "text-gray-900" : ""}`}>
                                        {text}
                                    </span>
                                    {isCorrect && <span className="ml-auto text-2xl">✓</span>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </>
        </PBasePageLayout>
    );
};

export default MQualifierPage;
