import { useCallback, useRef, useState } from "react";
import { ImagePlus, Link2, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { uploadQuestionMedia } from "./uploadMedia";

const logger = createLogger("MediaTab");

export const MediaTab = () => {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"bank" | "question">("bank");
  const [matchCode, setMatchCode] = useState("");
  const [found, setFound] = useState<{ id: string; code: string; mediaUrl: string | null } | null>(null);
  const [looking, setLooking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lookup = useCallback(async () => {
    const c = code.trim();
    if (!c) return;
    setLooking(true);
    setFound(null);
    setNewKey(null);
    try {
      if (kind === "bank") {
        const res = await fetch(
          `${API_BASE_URL}/bank/search?q=${encodeURIComponent(c)}&limit=5`,
          { credentials: "include" },
        );
        const json = await res.json();
        const rows = (json.data?.rows ?? []) as Record<string, unknown>[];
        const row = rows.find(
          (r) => String(r.bankCode ?? r.bank_code ?? "").toUpperCase() === c.toUpperCase(),
        );
        if (!row) {
          alert(`Không thấy bank ${c}`);
          return;
        }
        setFound({
          id: String(row.id ?? ""),
          code: String(row.bankCode ?? row.bank_code ?? ""),
          mediaUrl: (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
        });
      } else {
        const m = matchCode.trim();
        if (!m) {
          alert("Nhập mã trận để tìm câu hỏi trận.");
          return;
        }
        const res = await fetch(
          `${API_BASE_URL}/questions?match_code=${encodeURIComponent(m)}&question_code=${encodeURIComponent(c)}`,
          { credentials: "include" },
        );
        const json = await res.json();
        const row = json.data as Record<string, unknown> | null;
        if (!row) {
          alert(`Không thấy câu ${c} trong trận ${m}`);
          return;
        }
        setFound({
          id: String(row.id ?? ""),
          code: String(row.questionCode ?? row.question_code ?? c),
          mediaUrl: (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
        });
      }
    } catch (err) {
      logger.error("Error lookup:", err);
      alert("Lỗi kết nối khi tìm");
    } finally {
      setLooking(false);
    }
  }, [code, kind, matchCode]);

  const upload = useCallback(async (file: File) => {
    if (!found) return;
    setUploading(true);
    try {
      const key = await uploadQuestionMedia(found.code, file);
      const url =
        kind === "bank"
          ? `${API_BASE_URL}/bank/${encodeURIComponent(found.id)}`
          : `${API_BASE_URL}/questions/${encodeURIComponent(matchCode.trim())}/${encodeURIComponent(found.code)}`;
      const patchRes = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ media_url: key }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchJson.message ?? "Lưu mediaUrl thất bại");
      setNewKey(key);
      setFound((p) => (p ? { ...p, mediaUrl: key } : p));
    } catch (err) {
      logger.error("Error uploading media:", err);
      alert(err instanceof Error ? err.message : "Upload media thất bại");
    } finally {
      setUploading(false);
    }
  }, [found, kind, matchCode]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">
        Câu nào cần ảnh/audio/video thì upload ở đây, key tự
        chèn vào bank/question.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "bank" | "question")}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          >
            <option value="bank">Bank QB_*</option>
            <option value="question">Câu hỏi trận</option>
          </select>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={kind === "bank" ? "Mã bank (VD: QB_KDC_003)" : "Mã câu (VD: OC3_Q_KD_C_...)"}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
        </div>
        {kind === "question" && (
          <input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            placeholder="Mã trận (VD: OC3_M_...)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
        )}
        <button
          onClick={() => void lookup()}
          disabled={looking || !code.trim()}
          className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> {looking ? "Đang tìm…" : "Tìm câu hỏi"}
        </button>
      </div>

      {found && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
          <p className="font-mono text-sm text-green-300">{found.code}</p>
          {found.mediaUrl ? (
            <>
              <p className="text-xs text-gray-500 font-mono break-all">Hiện tại: {found.mediaUrl}</p>
              <div className="rounded-lg bg-black/30 border border-white/10 p-3">
                <RenderMedia mediaUrl={found.mediaUrl} />
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Chưa có media.</p>
          )}
          {newKey && (
            <p className="text-xs text-emerald-300 font-mono break-all flex items-center gap-1">
              <Link2 size={12} /> Đã chèn: {newKey}
            </p>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm"
          >
            <ImagePlus size={16} /> {uploading ? "Đang upload…" : "Upload + chèn media"}
          </button>
        </div>
      )}
    </div>
  );
};
