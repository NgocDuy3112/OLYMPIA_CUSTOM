
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { useRoleSession } from "@/hooks/useRoleSession";
import { validateAnswerInput } from "@/utils/validation";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useQuestionState } from "@/hooks/useQuestionState";
import { createLogger } from "@/utils/logger";
import PPlayerInfoCard from "@/components/player/PPlayerInfoCard";
import { QUALIFIER_OPTIONS, QUALIFIER_TIME_LIMIT, type QualifierStandingEntry } from "@/types/qualifier";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("PQualifier");

const OPTION_BG: Record<string, string> = {
    A: "bg-blue-800 hover:bg-blue-700 border-blue-600",
    B: "bg-blue-800 hover:bg-blue-700 border-blue-600",
    C: "bg-blue-800 hover:bg-blue-700 border-blue-600",
    D: "bg-blue-800 hover:bg-blue-700 border-blue-600",
    E: "bg-blue-800 hover:bg-blue-700 border-blue-600",
    F: "bg-blue-800 hover:bg-blue-700 border-blue-600",
};

const OPTION_SELECTED_BG: Record<string, string> = {
    A: "bg-blue-400 border-blue-200 text-gray-900",
    B: "bg-blue-400 border-blue-200 text-gray-900",
    C: "bg-blue-400 border-blue-200 text-gray-900",
    D: "bg-blue-400 border-blue-200 text-gray-900",
    E: "bg-blue-400 border-blue-200 text-gray-900",
    F: "bg-blue-400 border-blue-200 text-gray-900",
};

const PQualifierPage = () => {
    const { matchCode, playerCode, token } = useRoleSession("player");
    const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
    const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();

    const playerName = useMemo((): string => {
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            return (payload.user_name as string) ?? "";
        } catch {
            return "";
        }
    }, [token]);

    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    const [boardCount, setBoardCount] = useState<number>(6);
    const [activeQuestionIndex, setActiveQuestionIndex] = useState<number | null>(null);
    const [parsedOptions, setParsedOptions] = useState<string[]>([]);

    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    const [pendingOption, setPendingOption] = useState<string | null>(null);
    const [showAnswers, setShowAnswers] = useState(false);
    const [myStanding, setMyStanding] = useState<QualifierStandingEntry | null>(null);

    const answeredCodesRef = useRef<Set<string>>(new Set());
    const [answeredCount, setAnsweredCount] = useState(0);

    useEffect(() => {
        if (!isConnected) return;
        void sendMessage({ type: "request_qualifier_state", user_code: playerCode });

    }, [isConnected, playerCode, sendMessage]);

    const parseOptions = (options: string | string[] | undefined): string[] => {
        if (!options) return [];
        if (Array.isArray(options)) return options.slice(0, 6);
        try {
            const parsed = JSON.parse(options as string);
            return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
        } catch (e) {
            logger.warn("parseOptions: failed to parse options", e);
            return [];
        }
    };

    useEffect(() => {
        if (!lastMessage) return;
        const raw: any = lastMessage;
        const msg: any = raw?.message ?? raw;

        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_question": {

                const opts = parseOptions(msg.options ?? undefined);
                setParsedOptions(opts);
                setSelectedOption(null);
                setPendingOption(null);
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);

                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                if (typeof msg.question_index === "number") setActiveQuestionIndex(Number(msg.question_index));
                break;
            }

            case "clear_question": {
                setParsedOptions([]);
                setSelectedOption(null);
                setPendingOption(null);
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);
                setActiveQuestionIndex(null);
                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                break;
            }

            case "sync_qualifier_round": {
                if (typeof msg.count === "number") setBoardCount(Number(msg.count));
                break;
            }

            case "start_the_timer": {
                startSynced(Number(msg.time_limit ?? QUALIFIER_TIME_LIMIT), msg.started_at);
                setSelectedOption(null);
                setPendingOption(null);
                setShowAnswers(false);
                answeredCodesRef.current.clear();
                setAnsweredCount(0);
                break;
            }

            case "send_players_info": {
                const playersList: any[] = msg.players ?? [];
                const scoreboard: any[] = msg.scoreboard ?? [];
                const profiles: any[] = msg.profiles ?? [];

                const finalPlayers: PlayerStatus[] = playersList.map((p: any) => {
                    const code = String(p?.user_code ?? "");
                    let name = "";
                    if (p?.user_name) name = p.user_name;
                    else {
                        const prof = profiles.find((pr: any) => String(pr?.user_code) === code);
                        if (prof) name = prof.user_name ?? "";
                        else {
                            const scoreEntry = scoreboard.find((s: any) => String(s?.user_code) === code);
                            name = scoreEntry?.user_name ?? "";
                        }
                    }
                    let scoreVal = 0;
                    if (typeof p?.cummulative_score === "number") scoreVal = p.cummulative_score;
                    else {
                        const scoreEntry = scoreboard.find((s: any) => String(s?.user_code) === code);
                        scoreVal = scoreEntry?.cummulative_score ?? scoreEntry?.total_score ?? 0;
                    }
                    return { playerCode: code, playerName: name, playerScore: scoreVal };
                });

                setPlayers(finalPlayers);
                break;
            }

            case "qualifier_standings": {
                const all: QualifierStandingEntry[] = Array.isArray(msg.standings) ? msg.standings : [];
                const mine = all.find((s) => s.user_code === playerCode);
                if (mine) setMyStanding(mine);
                break;
            }

            case "qualifier_scores_updated": {

                const updates: any[] = Array.isArray(msg.score_updates) ? msg.score_updates : [];
                const myUpdate = updates.find((u: any) => u.user_code === playerCode);
                if (myUpdate) {
                    setMyStanding((prev) => ({
                        user_code: playerCode,
                        user_name: prev?.user_name ?? "",
                        total_score: myUpdate.new_total ?? 0,
                        correct_score: myUpdate.correct_score ?? 0,
                        avg_response_time: myUpdate.avg_response_time ?? 0,
                        rank: myUpdate.rank ?? 0,
                    }));
                    setPlayers((prev) =>
                        prev.map((p) =>
                            p.playerCode === playerCode
                                ? { ...p, playerScore: myUpdate.new_total ?? p.playerScore }
                                : p,
                        ),
                    );
                }
                break;
            }

            case "send_answers_to_players": {
                const answers: any[] = msg.answers ?? [];
                setPlayers((prev) =>
                    prev.map((p) => {
                        const ans = answers.find((a: any) => a.user_code === p.playerCode);
                        return ans ? { ...p, playerLastAnswer: ans.content, playerTimestamp: ans.timestamp || p.playerTimestamp } : p;
                    }),
                );
                setShowAnswers(true);
                break;
            }

            case "clear_answers": {
                setPlayers((prev) =>
                    prev.map((p) => ({ ...p, playerLastAnswer: undefined, playerTimestamp: undefined })),
                );
                setShowAnswers(false);
                break;
            }

            default:
                break;
        }
    }, [applyWsMessage, lastMessage, startSynced, playerCode]);

    const handleClickOption = useCallback(
        (option: string) => {
            if (selectedOption !== null) return;
            if (!isConnected) return;
            if (timer <= 0) return;
            if (!currentQuestion.questionCode) return;
            setPendingOption(option);
        },
        [selectedOption, isConnected, timer, currentQuestion.questionCode],
    );

    const handleConfirmOption = useCallback(
        async () => {
            if (!pendingOption) return;
            const option = pendingOption;
            setPendingOption(null);

            setSelectedOption(option);

            const elapsed = getElapsedSeconds();
            const ts = Math.max(0, Math.min(timeLimit, elapsed));

            setPlayers((prev) =>
                prev.map((p) =>
                    p.playerCode === playerCode
                        ? { ...p, playerLastAnswer: option, playerTimestamp: Number(ts.toFixed(3)) }
                        : p,
                ),
            );

            try {
                const answerPayload = {
                    user_code: playerCode,
                    match_code: matchCode,
                    question_code: currentQuestion.questionCode,
                    answer_text: option,
                    has_buzzed: false,
                    timestamp: ts,
                };
                validateAnswerInput(answerPayload);
                const res = await fetch(`${API_BASE_URL}/answers/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(answerPayload),
                });
                if (!res.ok) logger.warn("Failed to POST answer:", res.status);
            } catch (err) {
                logger.warn("Failed to POST answer:", err);
            }

            try {
                await sendMessage({
                    type: "answer",
                    user_code: playerCode,
                    question_code: currentQuestion.questionCode,
                    answer_text: option,
                    timestamp: ts,
                });
            } catch (err) {
                logger.warn("Failed to send WS answer:", err);
            }
        },
        [pendingOption, getElapsedSeconds, timeLimit, playerCode, matchCode, token, currentQuestion.questionCode, sendMessage],
    );

    const correctAnswer = currentQuestion.questionAnswer?.toUpperCase() ?? "";
    const buttonsDisabled = selectedOption !== null || timer <= 0 || !isConnected;

    const displayPlayers = players.map((p) =>
        showAnswers || p.playerCode === playerCode
            ? p
            : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
    );

    const statsAnswered = showAnswers
        ? displayPlayers.filter((p) => p.playerLastAnswer).length
        : answeredCount;
    const statsCorrect = showAnswers && correctAnswer
        ? displayPlayers.filter((p) => p.playerLastAnswer?.toUpperCase() === correctAnswer).length
        : 0;
    const statsWrong = showAnswers ? statsAnswered - statsCorrect : 0;
    const statsNoAnswer = players.length - statsAnswered;

    return (
        <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
            <>
                <PPlayerInfoCard
                    playerName={playerName || players.find((p) => p.playerCode === playerCode)?.playerName || ""}
                    playerScore={myStanding?.total_score ?? players.find((p) => p.playerCode === playerCode)?.playerScore ?? 0}
                    playerRank={myStanding?.rank ?? null}
                />

                {}
                {players.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-900 border-2 border-blue-600 w-full text-sm">
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

                <PQuestionBoard
                    title={`VÒNG LOẠI`}
                    question={currentQuestion}
                    timerDuration={timer}
                    controls={{ variant: "numbers", count: boardCount, activeIndices: activeQuestionIndex ? [activeQuestionIndex - 1] : [] }}
                />

                {}
                <div className="grid grid-cols-2 gap-3 mt-5 w-full">
                    {QUALIFIER_OPTIONS.map((opt, idx) => {
                        const text = parsedOptions[idx] ?? "";
                        const isSelected = selectedOption === opt;
                        const isCorrect = showAnswers && correctAnswer === opt;
                        const isWrong = showAnswers && selectedOption === opt && correctAnswer !== opt;

                        let classes = OPTION_BG[opt];
                        if (isSelected && !showAnswers) classes = OPTION_SELECTED_BG[opt];
                        if (isCorrect) classes = "bg-white border-white text-gray-900";
                        if (isWrong) classes = "bg-gray-700 border-gray-500 opacity-60 text-white";

                        return (
                            <button
                                key={opt}
                                type="button"
                                disabled={buttonsDisabled}
                                onClick={() => handleClickOption(opt)}
                                className={`flex items-center gap-4 px-6 py-4 rounded-xl border text-white font-bold text-lg transition-all duration-150 shadow-xl ${classes} ${buttonsDisabled && !isSelected ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                                <span className={`text-2xl font-extrabold w-10 shrink-0 ${isCorrect ? "text-gray-900" : ""}`}>
                                    {opt}
                                </span>
                                <span className={`leading-snug text-left ${isCorrect ? "text-gray-900" : ""}`}>
                                    {text}
                                </span>
                                {}
                                {showAnswers && isSelected && (
                                    <span className="ml-auto text-2xl">
                                        {isCorrect ? "✓" : "✗"}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {}
                {pendingOption && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                        <div className="bg-blue-900 border-2 border-blue-400 rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-5 w-80">
                            <p className="text-white font-bold text-lg text-center leading-snug">
                                Bạn chọn đáp án&nbsp;
                                <span className="text-blue-200 text-2xl font-extrabold">{pendingOption}</span>
                            </p>
                            <p className="text-white/80 text-sm text-center">
                                Bạn chỉ có thể nộp đáp án&nbsp;<span className="font-bold text-white">1 lần duy nhất</span>.
                            </p>
                            <div className="flex gap-4 w-full">
                                <button
                                    type="button"
                                    onClick={() => setPendingOption(null)}
                                    className="flex-1 py-2 rounded-xl border border-blue-400 text-blue-200 font-semibold hover:bg-blue-800 transition-colors"
                                >
                                    Huỷ
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleConfirmOption()}
                                    className="flex-1 py-2 rounded-xl bg-blue-400 text-gray-900 font-bold hover:bg-blue-300 transition-colors"
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </>
        </PBasePageLayout>
    );
};

export default PQualifierPage;
