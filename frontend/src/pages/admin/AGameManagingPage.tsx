import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, RefreshCw, Users, Gamepad2, HelpCircle } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AGameManaging");

// Small button component to navigate directly into the admin room for a match code
const VaoPhongButton = ({ matchCode, disabled }: { matchCode: string; disabled?: boolean }) => {
    const navigate = useNavigate();
    const handleClick = () => {
        const codeToUse = matchCode || (typeof window !== "undefined" ? localStorage.getItem("matchCode") || "" : "");
        if (!codeToUse) {
            alert("Vui lòng nhập Mã trận đấu trước khi vào phòng.");
            return;
        }
        try {
            localStorage.setItem("matchCode", codeToUse);
        } catch {
            // ignore
        }
        navigate(`/admin/kdc/${codeToUse}`);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 font-medium transition-colors"
        >
            Vào phòng
        </button>
    );
};

// Navigate to qualifier (Vòng Loại) admin page
const VaoPhongQualifierButton = ({ matchCode, disabled }: { matchCode: string; disabled?: boolean }) => {
    const navigate = useNavigate();
    const handleClick = () => {
        // Qualifier always uses OC3_M_VL so admin + player share the same WS channel
        try {
            localStorage.setItem("matchCode", matchCode || "OC3_M_VL");
        } catch {
            // ignore
        }
        navigate("/admin/vl");
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 font-medium transition-colors"
        >
            Vòng Loại
        </button>
    );
};

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
    media_url: string | null;  // comma-separated URLs or single URL
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

    // ── Left-card tab ─────────────────────────────────────────────────
    const [leftTab, setLeftTab] = useState<"players" | "createQuestion">("players");

    // ── Questions state ──────────────────────────────────────────────
    const [questions, setQuestions] = useState<QuestionData[]>([]);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const [questionsMatchCode, setQuestionsMatchCode] = useState(localStorage.getItem("matchCode") || "");
    // Quick create-question form state (admin convenience)
    const [newQuestionCode, setNewQuestionCode] = useState("");
    const [newContent, setNewContent] = useState("");
    const [newAnswer, setNewAnswer] = useState("");
    const [newExplanation, setNewExplanation] = useState("");
    const [newMediaUrl, setNewMediaUrl] = useState("");
    const [newOptions, setNewOptions] = useState<string[]>(["", "", "", "", "", ""]);
    const [creatingQuestion, setCreatingQuestion] = useState(false);

    // ── Send credentials state (tracks which user_code is in-flight) ─
    const [sendingCredentials, setSendingCredentials] = useState<string | null>(null);

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

    // ── Send / reset credentials (POST /auth/send-credentials/{code}) ─
    const sendCredentials = useCallback(async (userCode: string) => {
        setSendingCredentials(userCode);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/send-credentials/${userCode}`, {
                method: "POST",
                headers: authHeaders(),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.detail ?? "Lỗi không xác định");
            alert(`✅ ${body.message}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(`❌ Gửi thất bại: ${msg}`);
            logger.error("Error sending credentials:", err);
        } finally {
            setSendingCredentials(null);
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

    const setOptionAt = useCallback((idx: number, val: string) => {
        setNewOptions((prev) => {
            const next = [...prev];
            next[idx] = val;
            return next;
        });
    }, []);

    const createQuestion = useCallback(async () => {
        const codeToUse = questionsMatchCode || matchCode;
        if (!codeToUse) {
            alert("Vui lòng nhập mã trận đấu trước khi tạo câu hỏi (Questions match code)");
            return;
        }
        if (!newQuestionCode || !newContent || !newAnswer) {
            alert("Vui lòng điền question_code, content và answer");
            return;
        }
        setCreatingQuestion(true);
        try {
            const res = await fetch(`${API_BASE_URL}/questions/`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    match_code: codeToUse,
                    question_code: newQuestionCode,
                    content: newContent,
                    answer: newAnswer,
                    explanation: newExplanation || null,
                    media_url: newMediaUrl || null,
                    // send options as native array (backend accepts array or string)
                    options: newOptions,
                }),
            });
            const json: ApiResponse = await res.json();
            if (json.status === "success") {
                alert("Tạo câu hỏi thành công");
                // reset form
                setNewQuestionCode("");
                setNewContent("");
                setNewAnswer("");
                setNewExplanation("");
                setNewMediaUrl("");
                setNewOptions(["", "", "", "", "", ""]);
                // refresh list
                await fetchQuestions();
            } else {
                alert(`Tạo câu hỏi thất bại: ${json.message}`);
            }
        } catch (err) {
            logger.error("Error creating question:", err);
            alert("Lỗi khi tạo câu hỏi");
        } finally {
            setCreatingQuestion(false);
        }
    }, [authHeaders, matchCode, questionsMatchCode, newQuestionCode, newContent, newAnswer, newExplanation, newMediaUrl, newOptions, fetchQuestions]);

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
        <div className="grid grid-cols-[1fr_1fr] grid-rows-[400px_1fr] gap-4 p-6 h-screen text-white">
            {/* ─── Card 1 : Users ────────────────────────────────────── */}
            <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setLeftTab("players")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                leftTab === "players"
                                    ? "bg-blue-600 text-white"
                                    : "bg-blue-900/40 text-blue-300 hover:bg-blue-800"
                            }`}
                        >
                            <Users size={16} /> Người chơi
                        </button>
                        <button
                            onClick={() => setLeftTab("createQuestion")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                leftTab === "createQuestion"
                                    ? "bg-blue-600 text-white"
                                    : "bg-blue-900/40 text-blue-300 hover:bg-blue-800"
                            }`}
                        >
                            <Plus size={16} /> Tạo câu hỏi
                        </button>
                    </div>
                    <button
                        onClick={fetchUsers}
                        disabled={usersLoading}
                        className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        title="Làm mới"
                    >
                        <RefreshCw size={16} className={usersLoading ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Quick create question form (admin) */}
                {leftTab === "createQuestion" && (
                    <div className="bg-blue-800/20 border border-blue-700 rounded-md p-3">
                        <h3 className="text-sm font-semibold text-blue-200 mb-2">Tạo câu hỏi nhanh (admin)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            type="text"
                            placeholder="question_code (OC3_Q_...)"
                            value={newQuestionCode}
                            onChange={(e) => setNewQuestionCode(e.target.value)}
                            className="px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                        />
                        <input
                            type="text"
                            placeholder="answer (A..F)"
                            value={newAnswer}
                            onChange={(e) => setNewAnswer(e.target.value)}
                            className="px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                        />
                        <input
                            type="text"
                            placeholder="media_url (optional)"
                            value={newMediaUrl}
                            onChange={(e) => setNewMediaUrl(e.target.value)}
                            className="px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                        />
                    </div>

                    <textarea
                        placeholder="Nội dung câu hỏi"
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        className="w-full mt-2 px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                        rows={3}
                    />

                    <textarea
                        placeholder="Giải thích (optional)"
                        value={newExplanation}
                        onChange={(e) => setNewExplanation(e.target.value)}
                        className="w-full mt-2 px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                        rows={2}
                    />

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                        {newOptions.map((opt, i) => (
                            <input
                                key={i}
                                type="text"
                                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                value={opt}
                                onChange={(e) => setOptionAt(i, e.target.value)}
                                className="px-2 py-2 rounded bg-blue-950 border border-blue-700 text-white text-sm"
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                        <button
                            onClick={createQuestion}
                            disabled={creatingQuestion}
                            className="px-3 py-2 rounded bg-green-600 hover:bg-green-500 disabled:opacity-50 font-medium"
                        >
                            {creatingQuestion ? "Đang tạo..." : "Tạo câu hỏi"}
                        </button>
                        <div className="text-sm text-blue-300">Match: <span className="font-mono">{questionsMatchCode || matchCode || "(chưa đặt)"}</span></div>
                    </div>
                    </div>
                )}

                {leftTab === "players" && <div className="overflow-y-auto flex-1 -mr-2 pr-2">
                    {usersLoading && users.length === 0 ? (
                        <p className="text-gray-400 text-sm">Đang tải…</p>
                    ) : users.length === 0 ? (
                        <p className="text-gray-400 text-sm">Không có người dùng nào.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-blue-900">
                                <tr className="text-left text-blue-300 border-b border-blue-700">
                                    <th className="py-2 px-2">Mã đăng nhập</th>
                                    <th className="py-2 px-2">Tên thí sinh</th>
                                    <th className="py-2 px-2">Vai trò</th>
                                    <th className="py-2 px-2"></th>
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
                                        <td className="py-2 px-2 text-right">
                                            <button
                                                onClick={() => sendCredentials(u.user_code)}
                                                disabled={sendingCredentials === u.user_code}
                                                className="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                title="Gửi mã đăng nhập & mật khẩu qua email"
                                            >
                                                {sendingCredentials === u.user_code ? "Đang gửi…" : "Gửi thông tin"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>}
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
                        placeholder="Mã trận đấu"
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
                    placeholder="Tên trận đấu"
                    value={matchName}
                    onChange={(e) => setMatchName(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />

                {/* previously showed a green "match exists" helper; removed per UX request */}

                {/* 4 userCode inputs */}
                <div className="grid grid-cols-2 gap-2">
                            {userCodes.map((code, i) => (
                        <input
                            key={i}
                                    type="text"
                                    placeholder={`Mã đăng nhập vị trí #${i + 1} `}
                            value={code}
                            onChange={(e) => handleUserCodeChange(i, e.target.value)}
                            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    ))}
                </div>

                {/* Action button */}
                <div className="flex gap-2">
                    <button
                        onClick={createMatch}
                        disabled={matchLoading || !matchCode || !matchName}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold transition-colors"
                    >
                        <Plus size={16} />
                        {matchExists ? "Cập nhật phòng" : "Tạo phòng"}
                    </button>

                    <VaoPhongButton matchCode={matchCode} disabled={!matchCode} />
                    <VaoPhongQualifierButton matchCode={matchCode} />
                </div>
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
                            placeholder="Mã trận đấu"
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
                                    <th className="py-2 px-2">Mã câu hỏi</th>
                                    <th className="py-2 px-2">Nội dung</th>
                                    <th className="py-2 px-2">Đáp án</th>
                                    <th className="py-2 px-2">Giải thích</th>
                                    <th className="py-2 px-2">Media</th>
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
                                            {q.media_url
                                                ? q.media_url.split(',').map((url, i) => (
                                                      <a
                                                          key={i}
                                                          href={url.trim()}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                          className="text-blue-400 hover:underline block truncate max-w-40"
                                                      >
                                                          {url.trim()}
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