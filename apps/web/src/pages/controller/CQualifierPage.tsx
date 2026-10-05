import { useCallback, useEffect, useState } from "react";
import { Search, Trophy } from "lucide-react";
import {
  ApiError,
  apiCall,
  apiGet,
  type ApiResponse,
} from "@/api/client";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { notifyError } from "@/lib/notify";
import { useConfirm } from "@/hooks/useConfirm";

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

async function softGet<T>(path: string): Promise<ApiResponse<T>> {
  try {
    const res = await apiGet<T>(path);
    return res ?? { status: "error", message: "", data: null };
  } catch (err) {
    if (err instanceof ApiError) {
      return { status: "error", message: "", data: null };
    }
    throw err;
  }
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
  const {confirm, dialog} = useConfirm();

  const base = useCallback(
    () => `/qualifier/${encodeURIComponent(tournamentCode.trim())}`,
    [tournamentCode],
  );

  const fetchAll = useCallback(async () => {
    const code = tournamentCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const [qJson, sJson] = await Promise.all([
        softGet<Record<string, unknown>[]>(`${base()}/questions`),
        softGet<Standing[]>(`${base()}/standings?limit=16`),
      ]);
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
    const ok = await confirm({
      title: "Xác nhận đáp án của các câu hỏi",
      description: `Bạn có xác nhận cho ${open.length} câu hỏi này không?`,
    });
    if (!ok) return;
    setClosingAll(true);
    try {
      try {
        await apiCall(`${base()}/close-all`, { method: "POST" });
      } catch (err) {
        if (err instanceof ApiError) {
          notifyError(`Chốt thất bại: ${err.message}`);
        } else {
          throw err;
        }
      }
      await fetchAll();
    } catch (err) {
      logger.error("Error closing all:", err);
      notifyError("Lỗi kết nối khi chốt");
    } finally {
      setClosingAll(false);
    }
  }, [base, fetchAll, questions, confirm]);

  const openCount = questions.filter((q) => q.status === "open").length;
  const codeMismatch = !tournamentCode.trim();

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
          disabled={closingAll || openCount === 0 || codeMismatch}
          className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm font-semibold text-success-foreground"
        >
          {closingAll ? "Đang chốt…" : `Chốt + chấm ${openCount} câu mở`}
        </Button>
      </div>
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
      {dialog}
    </div>
  );
};

export default CQualifierPage;
