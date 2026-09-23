import { useEffect, useRef, useState } from "react";
import {
  Search,
  HelpCircle,
  FileSpreadsheet,
  ChevronDown,
  Pencil,
  Paperclip,
} from "lucide-react";
import type { QuestionData } from "./gameTypes";

interface QuestionsCardProps {
  matchCode: string;
  questionsMatchCode: string;
  questions: QuestionData[];
  questionsLoading: boolean;
  uploadingExcel: boolean;
  uploadingExcelQl: boolean;
  onQuestionsMatchCodeChange: (value: string) => void;
  onFetch: () => void;
  onUploadExcel: (file: File, isQualifier: boolean) => void;
  onEditQuestion: (q: QuestionData) => void;
}

/** Card danh sách câu hỏi + import Excel — AdminGameManagingPage. */
export function QuestionsCard({
  matchCode,
  questionsMatchCode,
  questions,
  questionsLoading,
  uploadingExcel,
  uploadingExcelQl,
  onQuestionsMatchCodeChange,
  onFetch,
  onUploadExcel,
  onEditQuestion,
}: QuestionsCardProps) {
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const excelQlInputRef = useRef<HTMLInputElement>(null);

  // Đóng menu import khi click ra ngoài.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        importMenuRef.current &&
        !importMenuRef.current.contains(e.target as Node)
      ) {
        setShowImportMenu(false);
      }
    };
    if (showImportMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showImportMenu]);

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

  return (
    <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
          <HelpCircle size={22} /> Câu hỏi
        </h2>
        <div className="flex items-center gap-2">
          {}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadExcel(file, false);
              e.target.value = "";
            }}
          />
          <input
            ref={excelQlInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadExcel(file, true);
              e.target.value = "";
            }}
          />
          <input
            type="text"
            placeholder="Mã trận đấu"
            value={questionsMatchCode}
            onChange={(e) => onQuestionsMatchCodeChange(e.target.value)}
            className={`${inputClass} w-40`}
          />
          <button
            onClick={onFetch}
            disabled={
              questionsLoading || (!questionsMatchCode && !matchCode)
            }
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Search size={14} /> Tải câu hỏi
          </button>
          {}
          <div className="relative" ref={importMenuRef}>
            <button
              onClick={() => setShowImportMenu((v) => !v)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors text-sm"
            >
              <FileSpreadsheet size={14} /> Import <ChevronDown size={14} />
            </button>
            {showImportMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-blue-950 border border-blue-700 rounded-lg shadow-xl flex flex-col min-w-40">
                <button
                  onClick={() => {
                    excelInputRef.current?.click();
                    setShowImportMenu(false);
                  }}
                  disabled={
                    uploadingExcel || (!questionsMatchCode && !matchCode)
                  }
                  className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  <FileSpreadsheet size={14} /> Excel thường
                </button>
                <button
                  onClick={() => {
                    excelQlInputRef.current?.click();
                    setShowImportMenu(false);
                  }}
                  disabled={uploadingExcelQl}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-800 disabled:opacity-50 transition-colors"
                >
                  <FileSpreadsheet size={14} /> Excel VL
                </button>
              </div>
            )}
          </div>
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
                <th className="py-2 px-2 w-10"></th>
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
                  <td className="py-2 px-2">
                    <button
                      onClick={() => onEditQuestion(q)}
                      className="p-1 rounded hover:bg-blue-700 transition-colors"
                      title="Sửa câu hỏi"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                    {q.question_code}
                  </td>
                  <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                  <td className="py-2 px-2 font-semibold">{q.answer}</td>
                  <td className="py-2 px-2 text-gray-300 max-w-xs truncate">
                    {q.explanation ?? "—"}
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {q.media_url ? (
                      <span
                        className="inline-flex items-center gap-1 text-blue-400"
                        title={q.media_url}
                      >
                        <Paperclip size={14} />{" "}
                        <span className="text-gray-400">✓</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default QuestionsCard;
