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
  "px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

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
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
          <HelpCircle size={16} className="text-emerald-400" />
          Câu hỏi
          {questions.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-400">
              {filtered.length}/{questions.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => navigate("/operator/qauthor/overview")}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 transition-colors text-xs"
          title="Thêm câu hỏi bằng QAuthor pick từ bank đã duyệt"
        >
          <Plus size={13} /> QAuthor
        </button>
      </div>

      <div className="flex items-center gap-2">
        {onQuestionsMatchCodeChange && (
          <input
            type="text"
            placeholder="Mã trận đấu"
            value={questionsMatchCode}
            onChange={(e) => onQuestionsMatchCodeChange(e.target.value)}
            className={`${inputClass} flex-1 min-w-0 font-mono text-xs`}
          />
        )}
        <button
          onClick={onFetch}
          disabled={questionsLoading || !activeCode}
          className="shrink-0 px-3 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 disabled:opacity-50 transition-colors text-sm"
        >
          {questionsLoading ? "Đang tải…" : "Tải"}
        </button>
      </div>

      {questions.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lọc theo mã / nội dung / đáp án…"
            className={`${inputClass} pl-8`}
          />
        </div>
      )}

      <div className="overflow-y-auto min-h-0 max-h-[520px] -mr-1 pr-1">
        {questionsLoading ? (
          <p className="text-gray-500 text-sm py-4 text-center">Đang tải…</p>
        ) : questions.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-500 text-sm">Chưa có câu hỏi.</p>
            <p className="text-gray-600 text-xs mt-1">
              Chọn trận bên trái rồi bấm Tải — thêm câu mới qua QAuthor (pick từ bank).
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">Không khớp tìm kiếm.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((q) => (
              <div
                key={q.question_code}
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/15 transition-colors"
              >
                <button
                  onClick={() => onEditQuestion(q)}
                  className="mt-0.5 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  title="Sửa câu hỏi"
                >
                  <Pencil size={13} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-blue-300/80">{q.question_code}</span>
                    {q.media_url && (
                      <span className="inline-flex items-center gap-1 text-gray-500" title={q.media_url}>
                        <Paperclip size={12} />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white truncate mt-0.5">{q.content}</p>
                  <p className="text-xs text-gray-400 truncate">
                    Đáp án: <span className="text-gray-200 font-medium">{q.answer}</span>
                    {q.explanation && <span className="text-gray-600"> · {q.explanation}</span>}
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
