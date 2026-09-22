import { useCallback, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { EditBankPanel, type BankEditValue } from "./EditBankPanel";
import {
  BANK_PAGE_SIZE,
  toBankData,
  type BankApiResponse,
  type BankData,
} from "./bankTypes";
import { uploadQuestionMedia } from "./uploadMedia";

const logger = createLogger("BankTab");

const emptyForm = {
  bankCode: "",
  content: "",
  answer: "",
  explanation: "",
  options: "",
  tags: "",
  roundHint: "",
};

export const BankTab = () => {
  const [rows, setRows] = useState<BankData[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<"all" | "only" | "unused">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BankData | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingUploadBank, setPendingUploadBank] = useState<BankData | null>(null);

  const fetchBank = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (used !== "all") params.set("used", used);
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", String(p));
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      const data = json.data as {
        rows: Record<string, unknown>[];
        total: number;
        limit: number;
        page: number;
        pages: number;
      } | null;
      if (json.status === "success" && data) {
        setRows((data.rows as Record<string, unknown>[]).map(toBankData));
        setTotal(data.total);
        setPages(data.pages);
        setPage(data.page);
      } else {
        setRows([]);
        setTotal(0);
        setPages(1);
      }
    } catch (err) {
      logger.error("Error fetching bank:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, used]);

  const createBank = useCallback(async () => {
    if (!form.bankCode.trim() || !form.content.trim() || !form.answer.trim()) {
      alert("Nhập mã bank (QB_*), nội dung và đáp án.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bankCode: form.bankCode.trim(),
          content: form.content.trim(),
          answer: form.answer.trim(),
          explanation: form.explanation.trim() || undefined,
          options: form.options.trim() || undefined,
          tags: form.tags.trim() || undefined,
          roundHint: form.roundHint.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setForm(emptyForm);
        await fetchBank(1);
      } else {
        alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error creating bank:", err);
      alert("Lỗi kết nối khi tạo bank");
    } finally {
      setSaving(false);
    }
  }, [fetchBank, form]);

  const saveEdit = useCallback(async (value: BankEditValue) => {
    if (!editing) return;
    try {
      const res = await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(editing.bank_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: value.content.trim() || null,
          answer: value.answer.trim() || null,
          media_url: value.mediaUrl.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setEditing(null);
        await fetchBank(page);
      } else {
        alert(`Lưu thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error patching bank:", err);
      alert("Lỗi kết nối khi sửa bank");
    }
  }, [editing, fetchBank, page]);

  const deleteBank = useCallback(async (q: BankData) => {
    if (!window.confirm(`Xoá bank ${q.bank_code}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(q.bank_id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        await fetchBank(page);
      } else {
        alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error deleting bank:", err);
      alert("Lỗi kết nối khi xoá bank");
    }
  }, [fetchBank, page]);

  const uploadMedia = useCallback(async (q: BankData, file: File) => {
    setUploadingFor(q.bank_id);
    try {
      const key = await uploadQuestionMedia(q.bank_code, file);
      const patchRes = await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(q.bank_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ media_url: key }),
      });
      const patchJson: BankApiResponse = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchJson.message ?? "Lưu mediaUrl thất bại");
      await fetchBank(page);
    } catch (err) {
      logger.error("Error uploading media:", err);
      alert(err instanceof Error ? err.message : "Upload media thất bại");
    } finally {
      setUploadingFor(null);
      setPendingUploadBank(null);
    }
  }, [fetchBank, page]);

  return (
    <div className="flex flex-col gap-4">
      <EditBankPanel item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pendingUploadBank) void uploadMedia(pendingUploadBank, file);
          e.target.value = "";
        }}
      />

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={form.bankCode}
            onChange={(e) => setForm((p) => ({ ...p, bankCode: e.target.value.toUpperCase() }))}
            placeholder="Mã bank (VD: QB_KDC_003)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
          <input
            value={form.answer}
            onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
            placeholder="Đáp án"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <textarea
            rows={2}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Nội dung câu hỏi (text từ Excel, media chèn sau)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none md:col-span-2"
          />
          <input
            value={form.roundHint}
            onChange={(e) => setForm((p) => ({ ...p, roundHint: e.target.value.toUpperCase() }))}
            placeholder="Round (KD_C, GM, BP, VD)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
          <input
            value={form.tags}
            onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
            placeholder="Tags (VD: dia-ly,viet-nam)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <input
            value={form.explanation}
            onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
            placeholder="Giải thích (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <input
            value={form.options}
            onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
            placeholder="Options JSON (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
        </div>
        <button
          onClick={() => void createBank()}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
        >
          <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu bank"}
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã / nội dung / đáp án…"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <select
            value={used}
            onChange={(e) => setUsed(e.target.value as "all" | "only" | "unused")}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          >
            <option value="all">Tất cả</option>
            <option value="unused">Chưa dùng</option>
            <option value="only">Đã dùng</option>
          </select>
          <button
            onClick={() => void fetchBank(1)}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
          >
            <Search size={14} /> Tìm
          </button>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">Đang tải…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có dữ liệu bank. Bấm Tìm để tải.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-300 border-b border-white/10">
                  <th className="py-2 px-2">Mã</th>
                  <th className="py-2 px-2">Nội dung</th>
                  <th className="py-2 px-2">Đáp án</th>
                  <th className="py-2 px-2">Media</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.bank_id} className="border-b border-white/5 align-top">
                    <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                      {q.bank_code}
                      {q.round_hint && <span className="ml-1 text-gray-500">· {q.round_hint}</span>}
                    </td>
                    <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                    <td className="py-2 px-2 font-semibold">{q.answer}</td>
                    <td className="py-2 px-2 font-mono text-xs max-w-48 truncate">
                      {q.media_url ? (
                        <span className="text-green-300" title={q.media_url}>Có media</span>
                      ) : (
                        <span className="text-gray-500">Chưa có</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => {
                            setPendingUploadBank(q);
                            fileRef.current?.click();
                          }}
                          disabled={uploadingFor === q.bank_id}
                          className="p-1.5 rounded bg-blue-700/70 hover:bg-blue-600 disabled:opacity-50"
                          title="Upload ảnh/audio/video rồi chèn vào câu này"
                        >
                          <Upload size={13} />
                        </button>
                        <button
                          onClick={() => setEditing(q)}
                          className="p-1.5 rounded bg-white-600/70 hover:bg-white-500"
                          title="Sửa"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => void deleteBank(q)}
                          className="p-1.5 rounded bg-red-700/70 hover:bg-red-600"
                          title="Xoá"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">Trang {page}/{pages} · {total} câu</p>
              <div className="flex gap-2">
                <button
                  onClick={() => void fetchBank(page - 1)}
                  disabled={loading || page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
                >
                  ← Trước
                </button>
                <button
                  onClick={() => void fetchBank(page + 1)}
                  disabled={loading || page >= pages}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
                >
                  Sau →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
