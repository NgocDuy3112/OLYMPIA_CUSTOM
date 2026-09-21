import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Play, Search, Trophy } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode } from "@/utils/storage";

const logger = createLogger("CQualifierPage");

interface QualifierQuestion {
  id: string;
  questionCode: string;
  content: string;
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

const toQuestion = (row: Record<string, unknown>): QualifierQuestion => ({
  id: String(row.id ?? ""),
  questionCode: String(row.questionCode ?? row.question_code ?? ""),
  content: String(row.content ?? ""),
  position: Number(row.position ?? 0),
  status: String(row.status ?? "open"),
});

const CQualifierPage = () => {
  const [tournamentCode, setTournamentCode] = useState("");
  const [questions, setQuestions] = useState<QualifierQuestion[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(false);
  const [closingAll, setClosingAll] = useState(false);
  const [seeding, setSeeding] = useState(false);

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

  const seed = useCallback(async () => {
    if (!tournamentCode.trim()) return;
    setSeeding(true);
    try {
      const res = await fetch(`${API_BASE_URL}${base()}/seed`, {
        method: "POST",
        credentials: "include",
      });
      const json: ApiResponse = await res.json().catch(() => ({ status: "error", message: "", data: null }));
      if (!res.ok) alert(`Seed thất bại: ${json.message ?? "Lỗi không xác định"}`);
      await fetchAll();
    } catch (err) {
      logger.error("Error seeding qualifier:", err);
      alert("Lỗi kết nối khi seed");
    } finally {
      setSeeding(false);
    }
  }, [base, fetchAll, tournamentCode]);

  const closeAll = useCallback(async () => {
    const open = questions.filter((q) => q.status === "open");
    if (open.length === 0) return;
    if (!window.confirm(`Chốt + chấm ${open.length} câu đang mở?`)) return;
    setClosingAll(true);
    try {
      const res = await fetch(`${API_BASE_URL}${base()}/close-all`, {
        method: "POST",
        credentials: "include",
      });
      const json: ApiResponse = await res.json().catch(() => ({ status: "error", message: "", data: null }));
      if (!res.ok) alert(`Chốt thất bại: ${json.message ?? "Lỗi không xác định"}`);
      await fetchAll();
    } catch (err) {
      logger.error("Error closing all:", err);
      alert("Lỗi kết nối khi chốt");
    } finally {
      setClosingAll(false);
    }
  }, [base, fetchAll, questions]);

  const openCount = questions.filter((q) => q.status === "open").length;
  const closedCount = questions.length - openCount;
  void getMatchCode;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-white">
        <ListOrdered size={20} /> Vòng loại — điều phối live
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
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> Tải
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void seed()}
          disabled={seeding || !tournamentCode.trim()}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold text-white"
        >
          <Play size={14} /> {seeding ? "Đang seed…" : "Seed 16 câu mẫu"}
        </button>
        <button
          onClick={() => void closeAll()}
          disabled={closingAll || openCount === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white"
        >
          {closingAll ? "Đang chốt…" : `Chốt + chấm ${openCount} câu mở`}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {loading
          ? "Đang tải…"
          : `${questions.length}/16 câu · ${closedCount} đã chốt · ${openCount} đang mở`}
      </p>
      {questions.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="flex gap-1.5 flex-wrap">
            {questions.map((q) => (
              <span
                key={q.id}
                title={`${q.questionCode}: ${q.content}`}
                className={`min-w-9 min-h-9 px-2 flex items-center justify-center rounded-lg text-xs font-bold font-mono ${
                  q.status === "closed"
                    ? "bg-emerald-600/30 text-emerald-300"
                    : "bg-yellow-600/20 text-yellow-300"
                }`}
              >
                {q.position}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-orange-300 uppercase tracking-wide mb-3">
          <Trophy size={16} /> Top 16
        </h3>
        {standings.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm text-white">
            {standings.map((s) => (
              <li key={s.playerId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                <span className="font-mono text-gray-400 w-6">{s.rank}</span>
                <span className="flex-1 truncate">{s.userName}</span>
                <span className="font-bold">{s.totalPoints}đ</span>
                <span className="text-gray-400 text-xs">{s.correctCount} đúng</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Controller điều phối live. Soạn đề chi tiết nằm ở QAuthor.
      </p>
    </div>
  );
};

export default CQualifierPage;
