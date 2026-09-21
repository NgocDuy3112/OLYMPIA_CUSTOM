import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("QAuthorImportPage");

interface PreviewRow {
  bankCode: string;
  content: string;
  answer: string;
  explanation: string;
  options: string;
  tags: string;
  roundHint: string;
  error?: string;
}

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

// Header Excel chap nhan (khong phan biet hoa/thuong, trim).
const HEADER_MAP: Record<string, keyof PreviewRow> = {
  bank_code: "bankCode",
  bankcode: "bankCode",
  ma_bank: "bankCode",
  content: "content",
  noi_dung: "content",
  noidung: "content",
  answer: "answer",
  dap_an: "answer",
  dapan: "answer",
  explanation: "explanation",
  giai_thich: "explanation",
  giaithich: "explanation",
  options: "options",
  lua_chon: "options",
  luachon: "options",
  tags: "tags",
  the: "tags",
  round_hint: "roundHint",
  roundhint: "roundHint",
  round: "roundHint",
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseSheet(json: Record<string, unknown>[]): PreviewRow[] {
  return json.map((row) => {
    const out: PreviewRow = {
      bankCode: "",
      content: "",
      answer: "",
      explanation: "",
      options: "",
      tags: "",
      roundHint: "",
    };
    for (const [k, v] of Object.entries(row)) {
      const field = HEADER_MAP[normHeader(k)];
      if (field) out[field] = String(v ?? "").trim();
    }
    out.bankCode = out.bankCode.toUpperCase();
    out.roundHint = out.roundHint.toUpperCase();
    if (!/^QB_[A-Z0-9_]{1,20}$/.test(out.bankCode)) {
      out.error = "bankCode phải dạng QB_*";
    } else if (!out.content || !out.answer) {
      out.error = "Thiếu content/answer";
    }
    return out;
  });
}

const QAuthorImportPage = () => {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setDone(0);
    setFailed([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        alert("Excel không có sheet nào.");
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      setRows(parseSheet(json));
    } catch (err) {
      logger.error("Error parsing Excel:", err);
      alert("Không đọc được file Excel.");
    }
  }, []);

  const doImport = useCallback(async () => {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) {
      alert("Không có dòng hợp lệ để nhập.");
      return;
    }
    if (!window.confirm(`Nhập ${valid.length} câu vào bank? Media chèn sau ở trang Media.`)) return;
    setImporting(true);
    setDone(0);
    const errors: string[] = [];
    let ok = 0;
    for (const r of valid) {
      try {
        const res = await fetch(`${API_BASE_URL}/bank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            bankCode: r.bankCode,
            content: r.content,
            answer: r.answer,
            explanation: r.explanation || undefined,
            options: r.options || undefined,
            tags: r.tags || undefined,
            roundHint: r.roundHint || undefined,
          }),
        });
        const json: ApiResponse = await res.json().catch(() => ({ status: "error", message: "", data: null }));
        if (res.ok) {
          ok++;
        } else {
          errors.push(`${r.bankCode}: ${json.message ?? "lỗi"}`);
        }
      } catch (err) {
        errors.push(`${r.bankCode}: lỗi kết nối`);
        logger.error("Error importing row:", err);
      }
      setDone(ok + errors.length);
    }
    setFailed(errors);
    setImporting(false);
    alert(`Nhập xong: ${ok} thành công, ${errors.length} thất bại.`);
  }, [rows]);

  const validCount = rows.filter((r) => !r.error).length;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white max-w-4xl mx-auto w-full">
      <h1 className="flex items-center gap-2 text-xl font-bold text-green-300">
        <FileSpreadsheet size={20} /> Import Excel vào bank
      </h1>
      <p className="text-xs text-gray-500">
        Excel chỉ nhập text (nội dung, đáp án, giải thích, options, tags, round).
        Câu nào cần ảnh/audio/video thì chèn sau ở trang Media. Không dùng ZIP.
      </p>
      <p className="text-xs text-gray-500 font-mono">
        Header nhận: bank_code · content · answer · explanation · options · tags · round_hint
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
        >
          <FileSpreadsheet size={16} /> Chọn file Excel
        </button>
        {fileName && <p className="text-xs text-gray-400 font-mono self-center">{fileName}</p>}
      </div>

      {rows.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">
              {rows.length} dòng · <span className="text-emerald-300">{validCount} hợp lệ</span> ·{" "}
              <span className="text-red-300">{rows.length - validCount} lỗi</span>
              {importing && <span className="text-gray-500"> · {done}/{validCount}</span>}
            </p>
            <button
              onClick={() => void doImport()}
              disabled={importing || validCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
            >
              <Upload size={16} /> {importing ? "Đang nhập…" : `Nhập ${validCount} câu`}
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#12102e]">
                <tr className="text-left text-green-300 border-b border-white/10">
                  <th className="py-2 px-2">Mã</th>
                  <th className="py-2 px-2">Nội dung</th>
                  <th className="py-2 px-2">Đáp án</th>
                  <th className="py-2 px-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-white/5 align-top">
                    <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">{r.bankCode || "—"}</td>
                    <td className="py-2 px-2 max-w-xs truncate">{r.content || "—"}</td>
                    <td className="py-2 px-2">{r.answer || "—"}</td>
                    <td className="py-2 px-2 text-xs text-red-300">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failed.length > 0 && (
            <div className="text-xs text-red-300 font-mono max-h-32 overflow-y-auto">
              {failed.map((f, i) => (
                <p key={i}>{f}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QAuthorImportPage;
