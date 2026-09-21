import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Mic, Search, Trophy } from "lucide-react";
import { API_BASE_URL, WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { parseWebSocketMessage } from "@/types/websocket";

const logger = createLogger("MQualifierPage");

interface QualifierQuestion {
  id: string;
  questionCode: string;
  content: string;
  options: string[];
  position: number;
  status: string;
}

interface Standing {
  playerId: string;
  userCode: string;
  userName: string;
  totalPoints: number;
  correctCount: number;
  avgCorrectTimeSec: number;
  rank: number;
}

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const toQuestion = (row: Record<string, unknown>): QualifierQuestion => ({
  id: String(row.id ?? ""),
  questionCode: String(row.questionCode ?? row.question_code ?? ""),
  content: String(row.content ?? ""),
  options: Array.isArray(row.options) ? (row.options as string[]) : [],
  position: Number(row.position ?? 0),
  status: String(row.status ?? "open"),
});

const MQualifierPage = () => {
  const [tournamentCode, setTournamentCode] = useState("");
  const [questions, setQuestions] = useState<QualifierQuestion[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(false);

  const base = useCallback(
    () => `/qualifier/${encodeURIComponent(tournamentCode.trim())}`,
    [tournamentCode],
  );

  const fetchAll = useCallback(async () => {
    const code = tournamentCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}${base()}/questions`, { credentials: "include" }),
        fetch(`${API_BASE_URL}${base()}/standings?limit=16`, {
          credentials: "include",
        }),
      ]);
      const qJson: ApiResponse = await qRes.json().catch(() => ({ status: "error", message: "", data: null }));
      const sJson: ApiResponse = await sRes.json().catch(() => ({ status: "error", message: "", data: null }));
      setQuestions(
        qJson.status === "success" && Array.isArray(qJson.data)
          ? (qJson.data as Record<string, unknown>[]).map(toQuestion)
          : [],
      );
      setStandings(
        sJson.status === "success" && Array.isArray(sJson.data)
          ? (sJson.data as Standing[])
          : [],
      );
    } catch (err) {
      logger.error("Error fetching qualifier:", err);
    } finally {
      setLoading(false);
    }
  }, [base, tournamentCode]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Realtime: refresh on any qualifier change.
  useEffect(() => {
    const code = tournamentCode.trim();
    if (!code) return;
    let socket: WebSocket | null = null;
    let closed = false;
    try {
      socket = new WebSocket(`${WS_BASE_URL}/ws/qualifier_${encodeURIComponent(code)}`);
    } catch {
      return;
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      const msg = parseWebSocketMessage(event.data);
      if (!msg || closed) return;
      if (
        msg.type === "qualifier_opened" ||
        msg.type === "qualifier_updated" ||
        msg.type === "qualifier_deleted" ||
        msg.type === "qualifier_closed"
      ) {
        void fetchAll();
      }
    };
    return () => {
      closed = true;
      socket?.close(1000, "cleanup");
    };
  }, [tournamentCode, fetchAll]);

  const current = questions[index] ?? null;
  const closedCount = questions.filter((q) => q.status === "closed").length;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white max-w-4xl mx-auto w-full">
      <h1 className="flex items-center gap-2 text-xl font-bold text-purple-300">
        <Mic size={20} /> Dẫn vòng loại
      </h1>
      <div className="flex gap-2">
        <input
          value={tournamentCode}
          onChange={(e) => setTournamentCode(e.target.value)}
          placeholder="Mã giải đấu (VD: OC3_T_...)"
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
        />
        <button
          onClick={() => void fetchAll()}
          disabled={loading || !tournamentCode.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> Tải
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {loading ? "Đang tải…" : `${questions.length}/16 câu · ${closedCount} đã chốt`}
      </p>

      {current ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-5 flex flex-col gap-4">
          <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Danh sách câu">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => { setIndex(i); setReveal(false); }}
                className={`min-w-11 min-h-11 px-2 rounded-lg text-sm font-bold transition-colors ${
                  i === index
                    ? "bg-purple-500 text-white"
                    : q.status === "closed"
                      ? "bg-emerald-700 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                {q.position}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Câu {current.position}/{questions.length} · {current.questionCode}
            {current.status === "closed" && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300">Đã chốt</span>
            )}
          </p>
          <h2 className="text-2xl font-bold leading-snug">{current.content}</h2>
          <ol className="grid gap-2">
            {current.options.map((opt, i) => (
              <li
                key={LETTERS[i] ?? i}
                className="min-h-11 px-4 py-3 rounded-lg bg-white/10 text-base flex gap-3"
              >
                <span className="font-bold font-mono">{LETTERS[i]}.</span>
                <span>{reveal ? opt : "• • •"}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="self-start px-4 py-2 min-h-11 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
          >
            {reveal ? "Ẩn phương án" : "Hiện phương án để đọc"}
          </button>
        </div>
      ) : (
        !loading && <p className="text-gray-400 text-sm">Chưa có câu hỏi. Nhập mã giải rồi bấm Tải.</p>
      )}

      <div className="rounded-xl bg-white/5 border border-white/10 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-300 uppercase tracking-wide mb-3">
          <Trophy size={16} /> Top 16
        </h3>
        {standings.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {standings.map((s) => (
              <li key={s.playerId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                <span className="font-mono text-gray-400 w-6">{s.rank}</span>
                <span className="flex-1 truncate text-lg font-semibold">{s.userName}</span>
                <span className="font-bold">{s.totalPoints}đ</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <ListOrdered size={14} /> MC chỉ đọc câu + top 16. Chấm câu do QAuthor/Controller.
      </p>
    </div>
  );
};

export default MQualifierPage;
