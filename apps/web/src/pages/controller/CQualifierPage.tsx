import { useCallback, useEffect, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
      <InputGroup className="h-9">
        <InputGroupInput
          value={tournamentCode}
          onChange={(e) => setTournamentCode(e.target.value)}
          placeholder="Mã giải đấu (VD: OC3_T_...)"
          className=" text-sm"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
                variant="default"
            onClick={() => void fetchAll()}
            disabled={loading || !tournamentCode.trim()}
            className="disabled:opacity-50 text-sm"
          >
            <Search size={14} /> Tải
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => void closeAll()}
          disabled={closingAll || openCount === 0}
          className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm font-semibold text-success-foreground"
        >
          {closingAll ? "Đang chốt…" : `Chốt + chấm ${openCount} câu mở`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {loading
          ? "Đang tải…"
          : `${questions.length}/16 câu · ${closedCount} đã chốt · ${openCount} đang mở`}
      </p>
      {questions.length > 0 && (
        <div className="rounded-xl bg-accent/50 border border-border p-4">
          <div className="flex gap-1.5 flex-wrap">
            {questions.map((q) => (
              <span
                key={q.id}
                title={`${q.questionCode}: ${q.content}`}
                className={`min-w-9 min-h-9 px-2 flex items-center justify-center rounded-lg text-xs font-bold  ${
                  q.status === "closed"
                    ? "bg-success/30 text-success"
                    : "bg-warning/20 text-warning"
                }`}
              >
                {q.position}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl bg-accent/50 border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-role-controller uppercase tracking-wide mb-3">
          <Trophy size={16} /> Top 16
        </h3>
        {standings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm text-foreground">
            {standings.map((s) => (
              <li key={s.playerId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50">
                <span className=" text-muted-foreground w-6">{s.rank}</span>
                <span className="flex-1 truncate">{s.userName}</span>
                <span className="font-bold">{s.totalPoints}đ</span>
                <span className="text-muted-foreground text-xs">{s.correctCount} đúng</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Controller điều phối live. Soạn đề chi tiết nằm ở QAuthor.
      </p>
    </div>
  );
};

export default CQualifierPage;
