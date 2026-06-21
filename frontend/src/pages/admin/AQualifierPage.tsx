/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
    AlarmClockCheck,
    Play,
    Calculator,
    Power,
    Trophy,
} from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { usePlayerLatency } from "@/hooks/usePlayerLatency";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import {
    QUALIFIER_OPTIONS,
    QUALIFIER_TIME_LIMIT,
    QUALIFIER_QUESTIONS_PER_ROUND,
    QUALIFIER_ROUND_COUNT,
    QUALIFIER_QUESTION_PREFIX,
    type QualifierStandingEntry,
} from "@/types/qualifier";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AQualifier");

const QUESTION_PREFIX = QUALIFIER_QUESTION_PREFIX || "OC3_Q_VL";

const DEFAULT_QUESTION: Question = {
    questionCode: "",
    questionText: "",
    questionAnswer: "",
    questionExplanation: "",
    questionMediaURL: undefined,
    questionOptions: undefined,
};

const OPTION_BG: Record<string, string> = {
    // Use the same blue tone as AQuestionBoard for all option boxes
    A: "bg-blue-900 border-blue-600",
    B: "bg-blue-900 border-blue-600",
    C: "bg-blue-900 border-blue-600",
    D: "bg-blue-900 border-blue-600",
    E: "bg-blue-900 border-blue-600",
    F: "bg-blue-900 border-blue-600",
};


const AQualifierPage = () => {
    // Use stored matchCode when available; fallback to the qualifier default so
    // the /admin/vl page works even when localStorage wasn't pre-seeded.
    const currentMatchCode = localStorage.getItem("matchCode") ?? "OC3_M_VL";
    const token = localStorage.getItem("jwtToken_admin") ?? "";
    const { lastMessage, sendMessage } = useAdminWebSocket();

    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    usePlayerPresence({ lastMessage, setPlayers });
    usePlayerLatency({ lastMessage, sendMessage, players, setPlayers });

    const [timer, setTimer] = useState<number>(0);
    const timerRef = useRef<number>(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const isTimerRunningRef = useRef(false);
    const timerStartedAtRef = useRef<number | null>(null);

    const [currentRound, setCurrentRound] = useState<number>(1);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
    const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
    const [parsedOptions, setParsedOptions] = useState<string[]>([]);

    const [hasCalculatedScore, setHasCalculatedScore] = useState(false);
    const [_lastScoreResult, _setLastScoreResult] = useState<{ correct_count: number; wrong_count: number } | null>(null);
    const [standings, setStandings] = useState<QualifierStandingEntry[]>([]);
    const [advancements, setAdvancements] = useState<Array<{ round_number: number; status: string; user_code: string; user_name: string }>>([]);

    const maxQuestionsForRound = QUALIFIER_QUESTIONS_PER_ROUND[currentRound] ?? 0;


    // ── Helpers ──────────────────────────────────────────────────────────────

    const resolveQuestionCode = useCallback(
        (round: number, idx: number) => `${QUESTION_PREFIX}_${round}_${String(idx).padStart(2, "0")}`,
        [],
    );

    const parseOptions = useCallback((options: string | string[] | undefined): string[] => {
        if (!options) return [];
        if (Array.isArray(options)) return options.slice(0, 6);
        try {
            const parsed = JSON.parse(options as string);
            return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
        } catch (e) {
            logger.warn("parseOptions: failed to parse options", e);
            return [];
        }
    }, []);

    const mapQuestionPayload = useCallback((payload: any, fallbackCode?: string): Question => ({
        questionCode: payload?.question_code ?? fallbackCode ?? "",
        questionText: payload?.content ?? payload?.question?.content ?? "",
        questionAnswer: payload?.answer ?? payload?.question?.answer ?? "",
        questionExplanation: payload?.explanation ?? payload?.question?.explanation ?? "",
        questionMediaURL: payload?.media_url ?? payload?.question?.media_url ?? undefined,
        questionOptions: payload?.options ?? payload?.question?.options ?? undefined,
    }), []);

    const computePlayersSnapshot = useCallback(
        (playersList: any[], scoreboard: any[] = [], profiles: any[] = [], prev: PlayerStatus[] = []) =>
            buildPlayersSnapshot(playersList, scoreboard, profiles, prev),
        [],
    );

    const applyPlayersSnapshot = useCallback(
        (payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
            setPlayers((prev) => {
                const snapshot = computePlayersSnapshot(
                    Array.isArray(payload?.players) ? payload.players : [],
                    Array.isArray(payload?.scoreboard) ? payload.scoreboard : [],
                    Array.isArray(payload?.profiles) ? payload.profiles : [],
                    prev,
                );
                return [...snapshot].sort((a, b) => b.playerScore - a.playerScore);
            });
        },
        [computePlayersSnapshot],
    );

    // ── Data Loading ──────────────────────────────────────────────────────────

    const loadPlayersState = useCallback(async () => {
        if (!currentMatchCode || !token) return undefined;
        try {
            const playersJson = await fetch(`${API_BASE_URL}/matches/${currentMatchCode}/players`, {
                headers: { Authorization: `Bearer ${token}` },
            }).then((r) => r.json());
            const playersList: any[] = playersJson.data?.players ?? [];

            const profileResponses = await Promise.all(
                playersList.map((entry: any) =>
                    fetch(`${API_BASE_URL}/users/?user_code=${entry.user_code}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then((r) => r.json())
                        .catch(() => null),
                ),
            );
            const profiles = playersList.map((entry: any, i: number) => ({
                user_code: entry.user_code,
                user_name: profileResponses[i]?.data?.user_name ?? "",
            }));

            setPlayers((prev) => {
                const snapshot = computePlayersSnapshot(playersList, [], profiles, prev);
                return [...snapshot].sort((a, b) => b.playerScore - a.playerScore);
            });
            return { playersList, profiles };
        } catch (err) {
            logger.error("Failed to load players:", err);
        }
    }, [computePlayersSnapshot, currentMatchCode, token]);

    const sendPlayersSnapshot = useCallback(async () => {
        if (!currentMatchCode) return;
        try {
            const payload = await loadPlayersState();
            if (!payload) return;
            const { playersList, profiles } = payload;
            const mergedPlayers = (playersList ?? []).map((p: any) => {
                const code = String(p?.user_code ?? "");
                const profile = profiles.find((pr: any) => String(pr?.user_code) === code) as any ?? {};
                return { user_code: code, user_name: (profile?.user_name as string) ?? (p?.user_name as string) ?? "" };
            });
            await sendMessage({ type: "send_players_info", players: mergedPlayers });
        } catch (err) {
            logger.error("Failed to send players snapshot:", err);
        }
    }, [currentMatchCode, loadPlayersState, sendMessage]);

    const loadQualifierStandings = useCallback(async () => {
        if (!currentMatchCode || !token) return;
        try {
            const json = await fetch(
                `${API_BASE_URL}/qualifier/standings/${currentMatchCode}?round_number=${currentRound}`,
                { headers: { Authorization: `Bearer ${token}` } },
            ).then((r) => r.json());
            setStandings(json.data?.standings ?? []);
        } catch (err) {
            logger.error("Failed to load qualifier standings:", err);
        }
    }, [currentMatchCode, currentRound, token]);

    const loadAdvancements = useCallback(async () => {
        if (!currentMatchCode || !token) return;
        try {
            const res = await fetch(`${API_BASE_URL}/qualifier/advancements/${currentMatchCode}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const json = await res.json();
            setAdvancements(json.data?.advancements ?? []);
        } catch (err) {
            logger.warn("Failed to load qualifier advancements:", err);
        }
    }, [currentMatchCode, token]);

    const loadQuestion = useCallback(
        async (round: number, questionIndex: number): Promise<Question | undefined> => {
            if (!currentMatchCode || !token || questionIndex <= 0) {
                setCurrentQuestion({ ...DEFAULT_QUESTION });
                setParsedOptions([]);
                return { ...DEFAULT_QUESTION };
            }

            const candidates = [
                // Preferred format used by UI
                resolveQuestionCode(round, questionIndex),
                // Some DBs may not zero-pad the index
                `${QUESTION_PREFIX}_${round}_${questionIndex}`,
                // Some imports may use prefix + round + index without extra separator
                `${QUESTION_PREFIX}_${round}${String(questionIndex).padStart(2, "0")}`,
                // Fallbacks without round
                `${QUESTION_PREFIX}_${String(questionIndex).padStart(2, "0")}`,
                `${QUESTION_PREFIX}_${questionIndex}`,
            ];

            // Helper to try fetching a single candidate code
            const tryFetch = async (qCode: string) => {
                try {
                    const res = await fetch(
                        `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(qCode)}`,
                        { headers: { Authorization: `Bearer ${token}` } },
                    );
                    const data = await res.json();
                    // API may return single object in data or array; map accordingly
                    if (!data) return undefined;
                    // If API returned an array, pick first
                    const payload = Array.isArray(data.data) ? data.data[0] : data.data;
                    if (!payload) return undefined;
                    return mapQuestionPayload(payload, qCode);
                } catch (e) {
                    // ignore and try next (log for debugging)
                    logger.warn("tryFetch candidate failed:", e);
                    return undefined;
                }
            };

            // Try candidates in order
            for (const c of candidates) {
                const mapped = await tryFetch(c);
                if (mapped && mapped.questionCode) {
                    setCurrentQuestion(mapped);
                    setParsedOptions(parseOptions(mapped.questionOptions));
                    return mapped;
                }
            }

            // As a last resort, fetch all questions for the match and try to find a best match
            try {
                const allRes = await fetch(
                    `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                const allJson = await allRes.json();
                const list = Array.isArray(allJson.data) ? allJson.data : allJson.data ? [allJson.data] : [];

                // Try to find by pattern: contains _VL_ and round and index
                const roundIdxRegex = new RegExp(`${QUESTION_PREFIX}[_-]?${round}[_-]?(\\d{1,3})`, "i");
                for (const item of list) {
                    const code = String(item?.question_code ?? "");
                    const m = code.match(roundIdxRegex);
                    if (m) {
                        const idx = Number(m[1]);
                        if (idx === questionIndex) {
                            const mapped = mapQuestionPayload(item, code);
                            setCurrentQuestion(mapped);
                            setParsedOptions(parseOptions(mapped.questionOptions));
                            return mapped;
                        }
                    }
                }

                // If still not found, try to pick the question by ordinal position within the match
                if (list.length >= questionIndex) {
                    const item = list[questionIndex - 1];
                    const mapped = mapQuestionPayload(item, String(item?.question_code ?? ""));
                    setCurrentQuestion(mapped);
                    setParsedOptions(parseOptions(mapped.questionOptions));
                    return mapped;
                }
            } catch (err) {
                logger.warn("Fallback fetch all questions failed:", err);
            }

            // Nothing found — return empty fallback with constructed code
            const fallbackCode = resolveQuestionCode(round, questionIndex);
            const fallback = mapQuestionPayload(null, fallbackCode);
            setCurrentQuestion(fallback);
            setParsedOptions([]);
            return fallback;
        },
        [currentMatchCode, mapQuestionPayload, parseOptions, resolveQuestionCode, token],
    );

    // ── WebSocket message handler ─────────────────────────────────────────────

    useEffect(() => {
        if (!lastMessage) return;
        const msg = lastMessage as any;
        switch (msg?.type) {
            case "send_players_info":
                startTransition(() => applyPlayersSnapshot(msg));
                break;
            case "answer": {
                const { user_code, answer_text, timestamp } = msg;
                if (user_code && answer_text) {
                    startTransition(() => {
                        setPlayers((prev) =>
                            prev.map((p) =>
                                p.playerCode === user_code
                                    ? { ...p, playerLastAnswer: answer_text, playerTimestamp: timestamp ?? p.playerTimestamp }
                                    : p,
                            ),
                        );
                    });
                }
                break;
            }
            case "qualifier_scores_updated":
                startTransition(() => {
                    setPlayers((prev) => {
                        const updated = prev.map((p) => {
                            const upd = (msg.score_updates as any[]).find((s: any) => s.user_code === p.playerCode);
                            return upd ? { ...p, playerScore: upd.new_total } : p;
                        });
                        return [...updated].sort((a, b) => b.playerScore - a.playerScore);
                    });
                });
                // Refresh standings from server so the right-panel advancement scores update immediately
                void loadQualifierStandings();
                break;
            case "send_answers_to_players": {
                const answers = Array.isArray(msg.answers) ? msg.answers : [];
                startTransition(() => {
                    setPlayers((prev) =>
                        prev.map((p) => {
                            const ans = answers.find((a: any) => a.user_code === p.playerCode);
                            return ans
                                ? { ...p, playerLastAnswer: ans.content, playerTimestamp: ans.timestamp }
                                : p;
                        }),
                    );
                });
                break;
            }
            case "clear_answers":
                startTransition(() => {
                    setPlayers((prev) =>
                        prev.map((p) => ({ ...p, playerLastAnswer: undefined, playerTimestamp: undefined })),
                    );
                });
                break;
            case "qualifier_round_result":
                // refresh server-side persisted advancements so the right column displays accurate lists
                void loadAdvancements();
                break;
            case "player_online": {
                const code = String(msg.user_code ?? "");
                if (!code) break;
                // Mark connected if already in list; otherwise add with placeholder name
                startTransition(() => {
                    setPlayers((prev) => {
                        if (prev.some((p) => p.playerCode === code)) {
                            return prev.map((p) =>
                                p.playerCode === code ? { ...p, playerConnected: true } : p,
                            );
                        }
                        return [...prev, { playerCode: code, playerName: "", playerScore: 0, playerConnected: true }];
                    });
                });
                // Fetch user profile to fill in the name asynchronously
                if (token) {
                    void fetch(`${API_BASE_URL}/users/?user_code=${encodeURIComponent(code)}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then((r) => r.json())
                        .then((json) => {
                            const name: string = json?.data?.user_name ?? "";
                            if (name) {
                                startTransition(() => {
                                    setPlayers((prev) =>
                                        prev.map((p) =>
                                            p.playerCode === code && !p.playerName
                                                ? { ...p, playerName: name }
                                                : p,
                                        ),
                                    );
                                });
                            }
                        })
                        .catch((e) => logger.warn("player_online: failed to fetch profile", e));
                }
                break;
            }
            case "player_heartbeat": {
                const code = String(msg.user_code ?? "");
                if (!code) break;
                // Mark connected; also add to list if missing (e.g. late join)
                startTransition(() => {
                    setPlayers((prev) => {
                        if (prev.some((p) => p.playerCode === code)) {
                            return prev.map((p) =>
                                p.playerCode === code ? { ...p, playerConnected: true } : p,
                            );
                        }
                        // Unknown player — add placeholder and let player_online/API fill in name
                        return [...prev, { playerCode: code, playerName: "", playerScore: 0, playerConnected: true }];
                    });
                });
                if (token) {
                    void fetch(`${API_BASE_URL}/users/?user_code=${encodeURIComponent(code)}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then((r) => r.json())
                        .then((json) => {
                            const name: string = json?.data?.user_name ?? "";
                            if (name) {
                                startTransition(() => {
                                    setPlayers((prev) =>
                                        prev.map((p) =>
                                            p.playerCode === code && !p.playerName
                                                ? { ...p, playerName: name }
                                                : p,
                                        ),
                                    );
                                });
                            }
                        })
                        .catch((e) => logger.warn("player_heartbeat: failed to fetch profile", e));
                }
                break;
            }
            case "request_qualifier_state": {
                // A player just mounted PQualifierPage — re-send current state so they sync immediately
                void sendPlayersSnapshot();
                // Always sync the current round's question count so player board matches admin
                void sendMessage({ type: "sync_qualifier_round", count: maxQuestionsForRound });
                if (currentQuestionIndex > 0 && currentQuestion.questionCode) {
                    void sendMessage({
                        type: "send_question",
                        user_code: "",
                        question_code: currentQuestion.questionCode,
                        content: currentQuestion.questionText ?? "",
                        options: parseOptions(currentQuestion.questionOptions),
                        // include count and index so players can render correct board
                        count: maxQuestionsForRound,
                        question_index: currentQuestionIndex,
                        media_source: currentQuestion.questionMediaURL ?? undefined,
                    });
                    // Re-broadcast timer if still running so the player syncs the countdown
                    if (isTimerRunningRef.current && timerRef.current > 0 && timerStartedAtRef.current !== null) {
                        void sendMessage({
                            type: "start_the_timer",
                            user_code: "",
                            phase: "vl",
                            time_limit: QUALIFIER_TIME_LIMIT,
                            question_code: currentQuestion.questionCode,
                            started_at: timerStartedAtRef.current,
                        });
                    }
                }
                break;
            }
            default:
                break;
        }
    }, [lastMessage, applyPlayersSnapshot, loadAdvancements, loadQualifierStandings, currentQuestion, currentQuestionIndex, maxQuestionsForRound, sendPlayersSnapshot, sendMessage, parseOptions, token]);

    // ── Timer ─────────────────────────────────────────────────────────────────

    useEffect(() => { timerRef.current = timer; }, [timer]);
    useEffect(() => { isTimerRunningRef.current = isTimerRunning; }, [isTimerRunning]);

    useEffect(() => {
        if (!isTimerRunning) return;
        const id = window.setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) { setIsTimerRunning(false); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [isTimerRunning]);

    useEffect(() => {
        setHasCalculatedScore(false);
    }, [currentQuestionIndex, currentRound]);

    // Broadcast the new question count whenever admin switches rounds so players sync immediately
    useEffect(() => {
        const count = QUALIFIER_QUESTIONS_PER_ROUND[currentRound] ?? 0;
        if (!count) return;
        void sendMessage({ type: "sync_qualifier_round", count });
    }, [currentRound, sendMessage]);

    useEffect(() => {
        void loadPlayersState();
        void loadQualifierStandings();
        void loadAdvancements();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Action handlers ───────────────────────────────────────────────────────

    const handleStartRound = useCallback(async () => {
        setCurrentQuestionIndex(0);
        setCurrentQuestion({ ...DEFAULT_QUESTION });
        setParsedOptions([]);
        setTimer(0);
        setIsTimerRunning(false);
        if (!currentMatchCode) return;
        try {
            await sendMessage({ type: "round_start", round: "vl" });
            await sendMessage({ type: "navigate", user_code: "", path: "/player/vl" });
            await sendPlayersSnapshot();
            await sendMessage({ type: "clear_question", user_code: "", count: maxQuestionsForRound });
        } catch (err) {
            logger.error("Failed to start qualifier round:", err);
        }
    }, [currentMatchCode, maxQuestionsForRound, sendMessage, sendPlayersSnapshot]);

    const handleEndRound = useCallback(async () => {
        setCurrentQuestionIndex(0);
        setCurrentQuestion({ ...DEFAULT_QUESTION });
        setParsedOptions([]);
        setTimer(0);
        setIsTimerRunning(false);
        if (!currentMatchCode) return;
        try {
            await sendMessage({ type: "round_end", round: "vl" });
            // Removed navigate to waiting page - players and MC stay on VL page to preserve score context
        } catch (err) {
            logger.error("Failed to end qualifier round:", err);
        }
        try {
            // call backend to finalize round (will persist passed/reserve and broadcast)
            const res = await fetch(`${API_BASE_URL}/qualifier/end-round`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ match_code: currentMatchCode, round_number: currentRound }),
            });
            const json = await res.json();
            if (json.status === "success") {
                // refresh standings and advancements
                await loadQualifierStandings();
                await loadAdvancements();
            } else {
                logger.error("End round failed:", json.message);
            }
        } catch (err) {
            logger.error("Failed to call end-round API:", err);
            await loadQualifierStandings();
        }
    }, [currentMatchCode, currentRound, loadQualifierStandings, loadAdvancements, sendMessage, token]);

    const startTheClock = useCallback(async () => {
        if (!currentMatchCode || !token || currentQuestionIndex <= 0 || timer > 0) return;
        const questionCode = resolveQuestionCode(currentRound, currentQuestionIndex);
        const startedAt = Date.now();
        timerStartedAtRef.current = startedAt;
        setTimer(QUALIFIER_TIME_LIMIT);
        setIsTimerRunning(true);
        try {
            await sendMessage({
                type: "start_the_timer",
                user_code: "",
                phase: "vl",
                time_limit: QUALIFIER_TIME_LIMIT,
                question_code: questionCode,
                started_at: startedAt,
            });
        } catch (err) {
            logger.error("Failed to start timer:", err);
        }
    }, [currentMatchCode, currentQuestionIndex, currentRound, resolveQuestionCode, sendMessage, timer, token]);

    const handleCalculateScores = useCallback(async () => {
        if (!currentMatchCode || !token) {
            alert("Chưa đăng nhập hoặc chưa chọn phòng thi.");
            return;
        }
        if (!currentQuestion.questionCode) {
            alert("Chưa chọn câu hỏi.");
            return;
        }
        if (!currentQuestion.questionAnswer) {
            alert("Câu hỏi này chưa có đáp án đúng trong hệ thống. Vui lòng kiểm tra lại dữ liệu câu hỏi.");
            return;
        }
        if (hasCalculatedScore) return;
        try {
            const res = await fetch(`${API_BASE_URL}/qualifier/calculate-scores`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    match_code: currentMatchCode,
                    question_code: currentQuestion.questionCode,
                    correct_answer: currentQuestion.questionAnswer,
                    round_number: currentRound,
                }),
            });
            const json = await res.json();
            if (res.ok && json.status === "success") {
                setHasCalculatedScore(true);
                await loadQualifierStandings();
            } else {
                const errMsg = json.message ?? (Array.isArray(json.detail) ? json.detail.map((d: { msg: string }) => d.msg).join("; ") : json.detail) ?? "Tính điểm thất bại";
                logger.error("Score calculation failed:", errMsg, json);
                alert(`❌ Tính điểm thất bại: ${errMsg}`);
            }
        } catch (err) {
            logger.error("Failed to calculate qualifier scores:", err);
            alert("❌ Không thể kết nối server để tính điểm.");
        }
    }, [currentMatchCode, currentQuestion, currentRound, hasCalculatedScore, loadQualifierStandings, token]);

    // Select a question by index (1-based). Loads question and broadcasts it to players.
    const handleSelectQuestion = useCallback(
        async (questionIndex: number) => {
            if (questionIndex <= 0) return;
            setCurrentQuestionIndex(questionIndex);
            const q = await loadQuestion(currentRound, questionIndex);
            if (!q || !q.questionCode) return;
            try {
                await sendMessage({
                    type: "send_question",
                    user_code: "",
                    question_code: q.questionCode,
                    content: q.questionText ?? "",
                    options: parseOptions(q.questionOptions),
                    // include count and index so players can render the correct board
                    count: maxQuestionsForRound,
                    question_index: questionIndex,
                    media_source: q.questionMediaURL ?? undefined,
                });
            } catch (err) {
                logger.error("Failed to broadcast question:", err);
            }
        },
        [currentRound, maxQuestionsForRound, loadQuestion, sendMessage, parseOptions],
    );

    // ── Render helpers ────────────────────────────────────────────────────────

    const questionTitle = `VÒNG LOẠI`;

    const renderPlayerList = useCallback(() => {
        // group advancements by round
        const grouped: Record<number, Array<{ round_number: number; status: string; user_code: string; user_name: string }>> = {};
        for (const a of advancements) {
            const r = Number(a.round_number) || 0;
            if (!grouped[r]) grouped[r] = [];
            grouped[r].push(a);
        }
        const roundKeys = Object.keys(grouped).map((k) => Number(k)).sort((a, b) => a - b);

        // Build a PlayerStatus for an advancement entry, merging standings + live presence
        const toPlayerStatus = (entry: { user_code: string; user_name: string }): PlayerStatus => {
            const standing = standings.find((s) => s.user_code === entry.user_code);
            const live = players.find((p) => p.playerCode === entry.user_code);
            return {
                playerCode: entry.user_code,
                playerName: entry.user_name || entry.user_code,
                playerScore: standing?.total_score ?? live?.playerScore ?? 0,
                playerConnected: live?.playerConnected ?? false,
                playerLastAnswer: live?.playerLastAnswer,
                playerHasBuzzed: live?.playerHasBuzzed ?? false,
                playerTimestamp: live?.playerTimestamp,
                // Qualifier tie-breaker fields
                playerCorrectScore: standing?.correct_score,
                playerAvgResponseTime: standing?.avg_response_time,
            };
        };

        if (roundKeys.length > 0) {
            return (
                <div className="space-y-4">
                    {roundKeys.map((r) => {
                        const items = grouped[r] ?? [];
                        const byScore = (a: typeof items[0], b: typeof items[0]) =>
                            (toPlayerStatus(b).playerScore) - (toPlayerStatus(a).playerScore);
                        const passed = items.filter((it) => it.status === "passed").sort(byScore);
                        const reserved = items.filter((it) => it.status === "reserve").sort(byScore);
                        return (
                            <div key={r}>
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <div className="text-sm font-semibold">Vòng {r}</div>
                                    <div className="text-xs text-gray-300">Qua: {passed.length} — Dự phòng: {reserved.length}</div>
                                </div>
                                {passed.length > 0 && (
                                    <>
                                        <div className="space-y-1.5 mb-3">
                                            {passed.map((p) => (
                                                <APlayerBar
                                                    key={p.user_code}
                                                    player={toPlayerStatus(p)}
                                                    isActive={true}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                                {reserved.length > 0 && (
                                    <>
                                        <div className="space-y-1.5">
                                            {reserved.map((p) => (
                                                <APlayerBar
                                                    key={p.user_code}
                                                    player={toPlayerStatus(p)}
                                                    isActive={false}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Fallback: no advancements yet — show live connected players, sorted by score
        const sortedPlayers = [...players].sort((a, b) => {
            const scoreA = (standings.find((s) => s.user_code === a.playerCode)?.total_score ?? a.playerScore);
            const scoreB = (standings.find((s) => s.user_code === b.playerCode)?.total_score ?? b.playerScore);
            return scoreB - scoreA;
        });
        return (
            <div className="space-y-2">
                {sortedPlayers.map((p) => {
                    const standing = standings.find((s) => s.user_code === p.playerCode);
                    const displayScore = standing ? standing.total_score : p.playerScore;
                    const isNegative = displayScore < 0;
                    return (
                        <APlayerBar
                            key={p.playerCode}
                            player={{
                                ...p,
                                playerScore: displayScore,
                                playerCorrectScore: standing?.correct_score,
                                playerAvgResponseTime: standing?.avg_response_time,
                            }}
                            isActive={isNegative}
                        />
                    );
                })}
            </div>
        );
    }, [advancements, players, standings]);

    // ── Answer stats for stats bar ────────────────────────────────────────────
    const statsTotalPlayers = players.length;
    const statsAnsweredCount = players.filter((p) => p.playerLastAnswer).length;
    const statsNoAnswerCount = statsTotalPlayers - statsAnsweredCount;
    const statsCorrectKey = currentQuestion.questionAnswer?.toUpperCase() ?? "";
    const statsCorrectCount = statsCorrectKey
        ? players.filter((p) => p.playerLastAnswer?.toUpperCase() === statsCorrectKey).length
        : 0;
    const statsWrongCount = statsAnsweredCount - statsCorrectCount;

    // Per-option answer count: how many players chose each option in realtime
    const optionAnswerCounts: Record<string, number> = Object.fromEntries(
        QUALIFIER_OPTIONS.map((opt) => [opt, players.filter((p) => p.playerLastAnswer?.toUpperCase() === opt).length]),
    );

    return (
        <ABasePageLayout
            questionTitle={questionTitle}
            question={currentQuestion}
            timerDuration={timer}
            controls={{
                variant: "numbers",
                count: maxQuestionsForRound,
                activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
                onToggle: (idx: number, state: boolean) => {
                    // when an index is toggled on, select the question
                    if (state) void handleSelectQuestion(idx + 1);
                },
            }}
            titleExtra={(
                <div className="flex items-center gap-2">
                    <select
                        value={currentRound}
                        onChange={(e) => {
                            const r = Number(e.target.value || 1);
                            setCurrentRound(r);
                            setCurrentQuestionIndex(0);
                            setCurrentQuestion({ ...DEFAULT_QUESTION });
                            setParsedOptions([]);
                        }}
                        className="bg-blue-800 text-white border border-blue-600 rounded px-3 py-1 text-sm"
                    >
                        {Array.from({ length: QUALIFIER_ROUND_COUNT + 1 }, (_, i) => i + 1).map((r) => (
                            <option key={r} value={r}>
                                {r <= QUALIFIER_ROUND_COUNT ? `Vòng ${r} (${QUALIFIER_QUESTIONS_PER_ROUND[r]} câu)` : "Dự phòng"}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            aboveQuestionBoard={(
                <>
                    {/* Real-time answer stats bar */}
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 border-2 border-blue-600 w-full text-sm">
                        <span className="text-blue-300 font-semibold mr-1 shrink-0">Kết quả:</span>
                        <span className="flex items-center gap-1 bg-blue-700 text-white font-bold px-3 py-1 rounded-lg">
                            ✓&nbsp;<span className="text-base">{statsCorrectCount}</span>
                            <span className="font-normal text-xs ml-0.5">đúng</span>
                        </span>
                        <span className="flex items-center gap-1 bg-red-700 text-white font-bold px-3 py-1 rounded-lg">
                            ✗&nbsp;<span className="text-base">{statsWrongCount}</span>
                            <span className="font-normal text-xs ml-0.5">sai</span>
                        </span>
                        <span className="flex items-center gap-1 bg-blue-800 text-blue-200 font-bold px-3 py-1 rounded-lg">
                            —&nbsp;<span className="text-base">{statsNoAnswerCount}</span>
                            <span className="font-normal text-xs ml-0.5">chưa trả lời</span>
                        </span>
                        <span className="ml-auto text-blue-400 text-xs shrink-0">
                            {statsAnsweredCount}/{statsTotalPlayers} đã trả lời
                        </span>
                    </div>
                </>
            )}
            underQuestionBoard={(
                <div className="mt-4">
                    <div className="grid grid-cols-3 grid-rows-2 gap-4 auto-rows-fr">
                        {QUALIFIER_OPTIONS.map((opt, idx) => {
                            const text = parsedOptions[idx] ?? "";
                            const isCorrect = currentQuestion.questionAnswer?.toUpperCase() === opt;
                            const answerCount = optionAnswerCounts[opt] ?? 0;
                            return (
                                <div
                                    key={opt}
                                    className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-white font-bold text-sm ${OPTION_BG[opt]} ${isCorrect ? "ring-2 ring-white" : ""} h-24 shadow-md`}
                                >
                                    <div className="text-3xl font-extrabold w-8 text-center">{opt}</div>
                                    <div className="leading-tight text-left">{text}</div>
                                    {answerCount > 0 && (
                                        <span className="absolute bottom-2 right-2 bg-white text-blue-900 text-xs font-extrabold px-2 py-0.5 rounded-full">
                                            {answerCount}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            topControlButtons={
                <>
                    <AControlButton onClick={handleStartRound} disabled={timer > 0}>
                        <Power size={18} className="mr-2" /> BẮT ĐẦU VÒNG
                    </AControlButton>
                    <AControlButton
                        onClick={startTheClock}
                        disabled={timer > 0 || currentQuestionIndex <= 0}
                    >
                        <AlarmClockCheck size={18} className="mr-2" /> BẤM GIỜ (10s)
                    </AControlButton>
                </>
            }
            bottomActionButtons={
                <>
                    <AControlButton
                        onClick={handleCalculateScores}
                        disabled={!currentQuestion.questionCode || !currentQuestion.questionAnswer || hasCalculatedScore || timer > 0}
                        className={hasCalculatedScore ? "opacity-60" : ""}
                    >
                        <Calculator size={18} className="mr-2" /> TÍNH ĐIỂM
                    </AControlButton>
                    {/* XÓA ĐÁP ÁN button removed per request */}
                    <AControlButton onClick={() => { void loadQualifierStandings(); void loadAdvancements(); }} disabled={timer > 0}>
                        <Trophy size={18} className="mr-2" /> TẢI BXH
                    </AControlButton>
                    <AControlButton onClick={handleEndRound} disabled={timer > 0}>
                        <Play size={18} className="mr-2" /> KẾT THÚC VÒNG
                    </AControlButton>
                </>
            }
            renderPlayerList={renderPlayerList}
        />
    );
};

export default AQualifierPage;
