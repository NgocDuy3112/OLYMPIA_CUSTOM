import { useCallback, useEffect, useState } from "react";
import { Search, Plus, RefreshCw, Users, Gamepad2, HelpCircle } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AGameManaging");

/* ------------------------------------------------------------------ */
/*  Types matching backend schemas                                     */
/* ------------------------------------------------------------------ */

/** Maps to backend `core/user.py` response fields */
interface UserData {
    user_code: string;
    user_name: string;       // backend returns `user_name` (not userPname)
    role: "guest" | "player" | "admin";
    created_at: string;
    updated_at: string;
}

/** Maps to backend `core/match.py` response fields */
interface MatchData {
    match_code: string;
    match_name: string;
}

/** Maps to backend `core/question.py` response fields */
interface QuestionData {
    question_code: string;
    content: string;
    answer: string;
    explanation: string | null;
    media_url: string[] | null;
}

/** Maps to backend `schemas/base.py` BaseResponse */
interface ApiResponse {
    status: "success" | "error";
    message: string;
    data: Record<string, unknown> | Record<string, unknown>[] | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AGameManagingPage = () => {
    const token = localStorage.getItem("jwtToken_admin") ?? "";

    // ── Users state ──────────────────────────────────────────────────
    const [users, setUsers] = useState<UserData[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);

    // ── Room (match) state ───────────────────────────────────────────
    const [matchCode, setMatchCode] = useState(localStorage.getItem("matchCode") || "");
    const [matchName, setMatchName] = useState("");
    const [userCodes, setUserCodes] = useState<string[]>(["", "", "", ""]);
    const [matchExists, setMatchExists] = useState(false);
    const [matchLoading, setMatchLoading] = useState(false);

    // ── Questions state ──────────────────────────────────────────────
    const [questions, setQuestions] = useState<QuestionData[]>([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const [questionsMatchCode, setQuestionsMatchCode] = useState(localStorage.getItem("matchCode") || "");

    /* ================================================================
     *  API helpers
     * ================================================================ */

    const authHeaders = useCallback(
        (): HeadersInit => ({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        }),
        [token],
    );

    // ── Fetch users (GET /users?user_role=player) ────────────────────
    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/users/?user_role=player`, {
                headers: authHeaders(),
            });
            const json: ApiResponse = await res.json();
            if (json.status === "success" && Array.isArray(json.data)) {
                setUsers(json.data as unknown as UserData[]);
            } else {
                logger.warn("Fetch users failed:", json.message);
            }
        } catch (err) {
            logger.error("Error fetching users:", err);
        } finally {
            setUsersLoading(false);
        }
    }, [authHeaders]);

    // ── Look up existing match (GET /matches?match_code=...) ─────────
    const lookupMatch = useCallback(async () => {
        if (!matchCode) return;
        setMatchLoading(true);
        try {
            const res = await fetch(
                `${API_BASE_URL}/matches/?match_code=${encodeURIComponent(matchCode)}`,
                { headers: authHeaders() },
            );
            const json: ApiResponse = await res.json();
            if (json.status === "success" && json.data && !Array.isArray(json.data)) {
                const match = json.data as unknown as MatchData;
                setMatchName(match.match_name);
                setMatchExists(true);

                // Try to load players that already belong to this match
                try {
                    const playersRes = await fetch(
                        `${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}/players`,
                        { headers: authHeaders() },
                    );
                    const playersJson = await playersRes.json();
                    const playersList: { user_code: string }[] =
                        playersJson.response?.data?.players ??
                        playersJson.data?.players ??
                        (Array.isArray(playersJson.data) ? playersJson.data : []);

                    const codes = playersList
                        .slice(0, 4)
                        .map((p) => p.user_code ?? "");
                    setUserCodes([
                        codes[0] ?? "",
                        codes[1] ?? "",
                        codes[2] ?? "",
                        codes[3] ?? "",
                    ]);
                } catch {
                    logger.warn("Could not load players for match", matchCode);
                }
            } else {
                setMatchExists(false);
            }
        } catch (err) {
            logger.error("Error looking up match:", err);
            setMatchExists(false);
        } finally {
            setMatchLoading(false);
        }
    }, [authHeaders, matchCode]);

    // ── Create or Update match (PATCH /matches/{match_code}) ─────────
    const createMatch = useCallback(async () => {
        if (!matchCode || !matchName) return;
        setMatchLoading(true);

        // Map userCodes to MatchPlayerAssignment format expected by backend
        const players = userCodes
            .map((code, index) => ({
                user_code: code.trim(),
                position: index + 1,
            }))
            .filter((p) => p.user_code !== "");

        try {
            const res = await fetch(`${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({
                    match_name: matchName,
                    players: players,
                }),
            });
            const json: ApiResponse = await res.json();
            if (json.status === "success") {
                logger.info("Match updated/created:", matchCode);
                setMatchExists(true);
                localStorage.setItem("matchCode", matchCode);
                alert(matchExists ? "Cập nhật phòng thành công" : "Tạo/Cập nhật phòng thành công");
            } else {
                logger.warn("Match operation failed:", json.message);
                alert(json.message);
            }
        } catch (err) {
            logger.error("Error updating match:", err);
        } finally {
            setMatchLoading(false);
        }
    }, [authHeaders, matchCode, matchName, userCodes, matchExists]);

    // ── Fetch questions (GET /questions?match_code=...&question_code=)
    const fetchQuestions = useCallback(async () => {
        const code = questionsMatchCode || matchCode;
        if (!code) return;
        setQuestionsLoading(true);
        try {
            const res = await fetch(
                `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(code)}`,
                { headers: authHeaders() },
            );
            const json: ApiResponse = await res.json();
            if (json.status === "success" && Array.isArray(json.data)) {
                setQuestions(json.data as unknown as QuestionData[]);
            } else if (json.status === "success" && json.data && !Array.isArray(json.data)) {
                setQuestions([json.data as unknown as QuestionData]);
            } else {
                setQuestions([]);
                logger.warn("Fetch questions failed:", json.message);
            }
        } catch (err) {
            logger.error("Error fetching questions:", err);
        } finally {
            setQuestionsLoading(false);
        }
    }, [authHeaders, matchCode, questionsMatchCode]);

    // ── Load users on mount ──────────────────────────────────────────
    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    /* ================================================================
     *  Handlers
     * ================================================================ */

    const handleUserCodeChange = (index: number, value: string) => {
        setUserCodes((prev) => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    /* ================================================================
     *  Render
     * ================================================================ */

    return (
        <div className="grid grid-cols-[1fr_1fr] grid-rows-[400px_1fr] gap-4 p-6 min-h-screen text-white">
            {/* ─── Card 1 : Users ────────────────────────────────────── */}
            <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
                        <Users size={22} /> Danh sách người chơi
                    </h2>
                    <button
                        onClick={fetchUsers}
                        disabled={usersLoading}
                        className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw size={16} className={usersLoading ? "animate-spin" : ""} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 -mr-2 pr-2">
                    {usersLoading && users.length === 0 ? (
                        <p className="text-gray-400 text-sm">Đang tải…</p>
                    ) : users.length === 0 ? (
                        <p className="text-gray-400 text-sm">Không có người dùng nào.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-blue-900">
                                <tr className="text-left text-blue-300 border-b border-blue-700">
                                    <th className="py-2 px-2">user_code</th>
                                    <th className="py-2 px-2">user_name</th>
                                    <th className="py-2 px-2">role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr
                                        key={u.user_code}
                                        className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors"
                                    >
                                        <td className="py-2 px-2 font-mono text-xs">{u.user_code}</td>
                                        <td className="py-2 px-2">{u.user_name}</td>
                                        <td className="py-2 px-2 capitalize">{u.role}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ─── Card 2 : Tạo phòng ───────────────────────────────── */}
            <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4">
                <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
                    <Gamepad2 size={22} /> Tạo phòng
                </h2>

                {/* matchCode input + lookup */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="match_code (VD: OC3_M001)"
                        value={matchCode}
                        onChange={(e) => {
                            const val = e.target.value;
                            setMatchCode(val);
                            setQuestionsMatchCode(val);
                            setMatchExists(false);
                            localStorage.setItem("matchCode", val);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                        onClick={lookupMatch}
                        disabled={matchLoading || !matchCode}
                        className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        title="Tìm"
                    >
                        <Search size={16} />
                    </button>
                </div>

                {/* matchName input */}
                <input
                    type="text"
                    placeholder="match_name"
                    value={matchName}
                    onChange={(e) => setMatchName(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />

                {matchExists && (
                    <p className="text-green-400 text-xs">
                        ✓ Match đã tồn tại — dữ liệu đã được tự động điền.
                    </p>
                )}

                {/* 4 userCode inputs */}
                <div className="grid grid-cols-2 gap-2">
                    {userCodes.map((code, i) => (
                        <input
                            key={i}
                            type="text"
                            placeholder={`user_code #${i + 1} (VD: OC_U…)`}
                            value={code}
                            onChange={(e) => handleUserCodeChange(i, e.target.value)}
                            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    ))}
                </div>

                {/* Action button */}
                <button
                    onClick={createMatch}
                    disabled={matchLoading || !matchCode || !matchName}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold transition-colors"
                >
                    <Plus size={16} />
                    {matchExists ? "Cập nhật phòng" : "Tạo phòng"}
                </button>
            </div>

            {/* ─── Card 3 : Câu hỏi (full width) ────────────────────── */}
            <div className="col-span-2 bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
                        <HelpCircle size={22} /> Câu hỏi
                    </h2>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="match_code"
                            value={questionsMatchCode}
                            onChange={(e) => setQuestionsMatchCode(e.target.value)}
                            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-48"
                        />
                        <button
                            onClick={fetchQuestions}
                            disabled={questionsLoading || (!questionsMatchCode && !matchCode)}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm"
                        >
                            <Search size={14} /> Tải câu hỏi
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 -mr-2 pr-2">
                    {questionsLoading ? (
                        <p className="text-gray-400 text-sm">Đang tải…</p>
                    ) : questions.length === 0 ? (
                        <p className="text-gray-400 text-sm">
                            Chưa có câu hỏi. Nhập match_code rồi bấm "Tải câu hỏi".
                        </p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-blue-900">
                                <tr className="text-left text-blue-300 border-b border-blue-700">
                                    <th className="py-2 px-2">question_code</th>
                                    <th className="py-2 px-2">content</th>
                                    <th className="py-2 px-2">answer</th>
                                    <th className="py-2 px-2">explanation</th>
                                    <th className="py-2 px-2">media_url</th>
                                </tr>
                            </thead>
                            <tbody>
                                {questions.map((q) => (
                                    <tr
                                        key={q.question_code}
                                        className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors align-top"
                                    >
                                        <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                                            {q.question_code}
                                        </td>
                                        <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                                        <td className="py-2 px-2 font-semibold">{q.answer}</td>
                                        <td className="py-2 px-2 text-gray-300 max-w-xs truncate">
                                            {q.explanation ?? "—"}
                                        </td>
                                        <td className="py-2 px-2 text-xs">
                                            {q.media_url && q.media_url.length > 0
                                                ? q.media_url.map((url, i) => (
                                                      <a
                                                          key={i}
                                                          href={url}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          className="text-blue-400 hover:underline block truncate max-w-40"
                                                      >
                                                          {url}
                                                      </a>
                                                  ))
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AGameManagingPage;