import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  HelpCircle,
  Pencil,
  Paperclip,
  Plus,
} from "lucide-react";
import type { QuestionData } from "./gameTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QuestionsCardProps {
  matchCode: string;
  questionsMatchCode: string;
  questions: QuestionData[];
  questionsLoading: boolean;
  onQuestionsMatchCodeChange?: (value: string) => void;
  onFetch: () => void;
  onEditQuestion: (q: QuestionData) => void;
}

const inputClass =
  "h-9 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm";

/** Danh sách câu hỏi của trận — GET /questions?match_code, PATCH /questions/:match/:q. */
export function QuestionsCard({
  matchCode,
  questionsMatchCode,
  questions,
  questionsLoading,
  onQuestionsMatchCodeChange,
  onFetch,
  onEditQuestion,
}: QuestionsCardProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter(
      (item) =>
        item.question_code.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q),
    );
  }, [questions, query]);

  const activeCode = questionsMatchCode || matchCode;

  return (
    <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HelpCircle size={16} className="text-success" />
          Câu hỏi
          {questions.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-accent text-[11px] font-mono text-muted-foreground">
              {filtered.length}/{questions.length}
            </span>
          )}
        </h2>
        <Button
          variant="secondary"
          onClick={() => navigate("/operator/qauthor/overview")}
          className="gap-1 bg-success/20 border border-success/30 text-success hover:bg-success/30 text-xs"
          title="Thêm câu hỏi bằng QAuthor pick từ bank đã duyệt"
        >
          <Plus size={13} /> QAuthor
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {onQuestionsMatchCodeChange && (
          <Input
            type="text"
            placeholder="Mã trận đấu"
            value={questionsMatchCode}
            onChange={(e) => onQuestionsMatchCodeChange(e.target.value)}
            className={`${inputClass} flex-1 min-w-0 font-mono text-xs`}
          />
        )}
        <Button
          variant="secondary"
          onClick={onFetch}
          disabled={questionsLoading || !activeCode}
          className="shrink-0 bg-accent border border-border hover:bg-accent/80 disabled:opacity-50 text-sm"
        >
          {questionsLoading ? "Đang tải…" : "Tải"}
        </Button>
      </div>

      {questions.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc theo mã / nội dung / đáp án…"
            className={`${inputClass} pl-8`}
          />
        </div>
      )}

      <div className="overflow-y-auto min-h-0 max-h-[520px] -mr-1 pr-1">
        {questionsLoading ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Đang tải…</p>
        ) : questions.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Chưa có câu hỏi.</p>
            <p className="text-muted-foreground/70 text-xs mt-1">
              Chọn trận bên trái rồi bấm Tải — thêm câu mới qua QAuthor (pick từ bank).
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Không khớp tìm kiếm.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((q) => (
              <div
                key={q.question_code}
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/25 border border-border/50 hover:bg-accent/50 hover:border-border transition-colors"
              >
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onEditQuestion(q)}
                  className="mt-0.5 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                  title="Sửa câu hỏi"
                >
                  <Pencil size={13} />
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-brand/80">{q.question_code}</span>
                    {q.media_url && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground" title={q.media_url}>
                        <Paperclip size={12} />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground truncate mt-0.5">{q.content}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Đáp án: <span className="text-foreground font-medium">{q.answer}</span>
                    {q.explanation && <span className="text-muted-foreground/70"> · {q.explanation}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionsCard;
