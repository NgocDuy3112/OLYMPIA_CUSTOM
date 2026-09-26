import { useCallback, useEffect, useState } from "react";
import { Layers, Plus, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { SetFillPanel } from "@/components/qauthor/SetFillPanel";

const logger = createLogger("QAuthorSetsPage");

interface SetCard {
  setCode: string;
  setName: string;
  matchCode: string | null;
  status: string;
  activeMatchCode: string | null;
  filled: number;
  expected: number;
}

/** Tab Bộ đề: cards từng bộ, mở bảng Excel điền slot từ bank. */
const QAuthorSetsPage = () => {
  const [sets, setSets] = useState<SetCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [matchCode, setMatchCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);

  const fetchSets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/question-sets`, { credentials: "include" });
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setSets(json.data as SetCard[]);
      } else {
        setSets([]);
      }
    } catch (err) {
      logger.error("Error fetching sets:", err);
      setSets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSets();
  }, [fetchSets]);

  const createSet = useCallback(async () => {
    if (!name.trim()) {
      alert("Nhập tên bộ đề (VD: Bộ đề 1).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/question-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          setName: name.trim(),
          matchCode: matchCode.trim() ? matchCode.trim().toUpperCase() : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setName("");
        setMatchCode("");
        setShowCreate(false);
        await fetchSets();
      } else {
        alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error creating set:", err);
      alert("Lỗi kết nối khi tạo bộ đề");
    } finally {
      setCreating(false);
    }
  }, [fetchSets, matchCode, name]);

  return (
    <div className="flex flex-col gap-4">
      <SetFillPanel setCode={openCode} onClose={() => setOpenCode(null)} onChanged={fetchSets} />
      <SidePanel
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Tạo bộ đề"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
            >
              Huỷ
            </button>
            <button
              onClick={() => void createSet()}
              disabled={creating || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
            >
              <Plus size={15} /> {creating ? "Đang tạo…" : "Tạo bộ"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Tên bộ đề *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Bộ đề 1"
            className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Mã trận</label>
          <input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value.toUpperCase())}
            placeholder="VD: OC4_M01T (gán sau cũng được)"
            className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          />
        </div>
        <p className="text-xs text-gray-500">1 bộ thuộc đúng 1 mã trận.</p>
      </SidePanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Layers size={20} /> Bộ đề
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Mỗi bộ thuộc 1 trận · pick từ bank đã duyệt, không soạn tay · {sets.length} bộ
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => void fetchSets()}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-medium"
          >
            <Plus size={15} /> Tạo bộ đề
          </button>
        </div>
      </div>

      {loading && sets.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Đang tải…</p>
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center">
          <Layers size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm">Chưa có bộ đề nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {sets.map((s) => (
            <button
              key={s.setCode}
              onClick={() => setOpenCode(s.setCode)}
              className="text-left p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/5 hover:border-white/20 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white">{s.setName}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    s.status === "ready" ? "bg-green-600/20 text-green-300" : "bg-yellow-600/20 text-yellow-300"
                  }`}
                >
                  {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                </span>
                {s.activeMatchCode && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-600/20 text-blue-300">
                    Live {s.activeMatchCode}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-gray-500">{s.setCode}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${s.expected ? Math.min((s.filled / s.expected) * 100, 100) : 0}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-gray-400 whitespace-nowrap">
                  {s.filled}/{s.expected}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Trận: <span className="font-mono text-gray-300">{s.matchCode ?? "— chưa gán —"}</span>
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default QAuthorSetsPage;
