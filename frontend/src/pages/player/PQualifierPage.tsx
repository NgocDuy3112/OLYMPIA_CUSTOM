/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
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
    const { matchCode, playerCode, token } = usePlayerSession();
    const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
    const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();

    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    const [parsedOptions, setParsedOptions] = useState<string[]>([]);
    /** The option letter the player selected (or null if not yet answered) */
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showAnswers, setShowAnswers] = useState(false);
    const [myStanding, setMyStanding] = useState<QualifierStandingEntry | null>(null);

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

    // ── WS message handler ────────────────────────────────────────────────────

    useEffect(() => {
        if (!lastMessage) return;
        const raw: any = lastMessage;
        const msg: any = raw?.message ?? raw;

        // Let the question hook handle send_question / clear_question
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_question": {
                // Parse options from WS message (admin sends options field)
                const opts = parseOptions(msg.options ?? undefined);
                setParsedOptions(opts);
                setSelectedOption(null);
                setShowAnswers(false);
                break;
            }

            case "clear_question": {
                setParsedOptions([]);
                setSelectedOption(null);
                setShowAnswers(false);
                break;
            }

            case "start_the_timer": {
                startSynced(Number(msg.time_limit ?? QUALIFIER_TIME_LIMIT), msg.started_at);
                setSelectedOption(null);
                setShowAnswers(false);
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
                    if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
                    else {
                        const scoreEntry = scoreboard.find((s: any) => String(s?.user_code) === code);
                        scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? 0;
                    }
                    return { playerCode: code, playerName: name, playerScore: scoreVal };
                });

                setPlayers(finalPlayers);
                break;
            }

            case "qualifier_scores_updated": {
                // Update this player's standing score display
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
                        return ans ? { ...p, playerLastAnswer: ans.content, playerTimestamp: ans.timestamp } : p;
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

    // ── Submit answer ─────────────────────────────────────────────────────────

    const handleSelectOption = useCallback(
        async (option: string) => {
            if (selectedOption !== null) return; // already answered
            if (!isConnected) return;
            if (timer <= 0) return;
            if (!currentQuestion.questionCode) return;

            setSelectedOption(option);

            const elapsed = getElapsedSeconds();
            const ts = Math.max(0, Math.min(timeLimit, elapsed));

            // Optimistic player list update
            setPlayers((prev) =>
                prev.map((p) =>
                    p.playerCode === playerCode
                        ? { ...p, playerLastAnswer: option, playerTimestamp: Number(ts.toFixed(3)) }
                        : p,
                ),
            );

            try {
                const res = await fetch(`${API_BASE_URL}/answers/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        user_code: playerCode,
                        match_code: matchCode,
                        question_code: currentQuestion.questionCode,
                        answer_text: option,
                        has_buzzed: false,
                        timestamp: ts,
                    }),
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
        [selectedOption, isConnected, timer, currentQuestion.questionCode, getElapsedSeconds, timeLimit, playerCode, matchCode, token, sendMessage],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    const correctAnswer = currentQuestion.questionAnswer?.toUpperCase() ?? "";
    const buttonsDisabled = selectedOption !== null || timer <= 0 || !isConnected;

    // Only show other players' answers when admin reveals them
    const displayPlayers = players.map((p) =>
        showAnswers || p.playerCode === playerCode
            ? p
            : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
    );

    return (
        <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
            <>
                <PPlayerInfoCard
                    playerName={players.find((p) => p.playerCode === playerCode)?.playerName ?? ""}
                    playerScore={myStanding?.total_score ?? players.find((p) => p.playerCode === playerCode)?.playerScore ?? 0}
                    playerRank={myStanding?.rank ?? null}
                />

                <PQuestionBoard
                    title={`VÒNG LOẠI`}
                    question={currentQuestion}
                    timerDuration={timer}
                />

                {/* Option grid — 2 columns of 3 */}
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
                                onClick={() => void handleSelectOption(opt)}
                                className={`flex items-center gap-4 px-6 py-4 rounded-xl border text-white font-bold text-lg transition-all duration-150 shadow-xl ${classes} ${buttonsDisabled && !isSelected ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                                <span className={`text-2xl font-extrabold w-10 shrink-0 ${isCorrect ? "text-gray-900" : ""}`}>
                                    {opt}
                                </span>
                                <span className={`leading-snug text-left ${isCorrect ? "text-gray-900" : ""}`}>
                                    {text || opt}
                                </span>
                                {isSelected && (
                                    <span className="ml-auto text-2xl">
                                        {showAnswers ? (isCorrect ? "✓" : "✗") : "✓"}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Status line */}
                <div className="mt-4 text-center text-sm font-medium text-white/70">
                    {selectedOption
                        ? showAnswers
                            ? correctAnswer === selectedOption
                                ? "✅ Đúng rồi!"
                                : `❌ Sai! Đáp án đúng là ${correctAnswer}`
                            : `Đã chọn: ${selectedOption} — chờ kết quả...`
                        : timer > 0
                          ? "Chọn đáp án của bạn"
                          : "Hết giờ"}
                    {myStanding && (
                        <span className="ml-4 text-blue-200">
                            Điểm vòng loại: {myStanding.total_score > 0 ? "+" : ""}
                            {myStanding.total_score}
                        </span>
                    )}
                </div>
            </>
        </PBasePageLayout>
    );
};

export default PQualifierPage;
