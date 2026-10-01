import { useCallback, useEffect, useState } from "react";
import { Layers, Plus, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { formInputClass, formLabelClass } from "@/components/shared/ui/form";
import { SetFillPanel } from "@/components/qauthor/SetFillPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
            <Button
              variant="ghost"
              onClick={() => setShowCreate(false)}
              className="bg-accent/50 hover:bg-accent text-sm"
            >
              Huỷ
            </Button>
            <Button
              variant="default"
              onClick={() => void createSet()}
              disabled={creating || !name.trim()}
              className="gap-1.5 bg-success hover:bg-success/90 disabled:opacity-50 font-semibold text-sm text-success-foreground"
            >
              <Plus size={15} /> {creating ? "Đang tạo…" : "Tạo bộ"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>Tên bộ đề <span className="text-destructive">*</span></label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Bộ đề 1"
            className={formInputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>Mã trận</label>
          <Input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value.toUpperCase())}
            placeholder="VD: OC4_M01T (gán sau cũng được)"
            className={`${formInputClass} font-mono`}
          />
        </div>
        <p className="text-xs text-muted-foreground">1 bộ thuộc đúng 1 mã trận.</p>
      </SidePanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Layers size={20} /> Bộ đề
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Mỗi bộ thuộc 1 trận · pick từ bank đã duyệt, không soạn tay · {sets.length} bộ
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void fetchSets()}
            disabled={loading}
            className="bg-accent/50 border border-border hover:bg-accent disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="default"
            onClick={() => setShowCreate(true)}
            className="gap-1.5 bg-success hover:bg-success/90 text-sm font-medium text-success-foreground"
          >
            <Plus size={15} /> Tạo bộ đề
          </Button>
        </div>
      </div>

      {loading && sets.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Đang tải…</p>
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Layers size={36} className="mx-auto text-muted-foreground/70 mb-3" />
          <p className="text-muted-foreground text-sm">Chưa có bộ đề nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {sets.map((s) => (
            <Button
              key={s.setCode}
              variant="ghost"
              onClick={() => setOpenCode(s.setCode)}
              className="h-auto flex-col items-stretch gap-2 rounded-xl bg-accent/25 border border-border p-4 text-left hover:bg-accent/50 hover:border-border"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{s.setName}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] ${
                    s.status === "ready" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                  }`}
                >
                  {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                </span>
                {s.activeMatchCode && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/20 text-brand">
                    Live {s.activeMatchCode}
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-muted-foreground">{s.setCode}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-accent overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${s.expected ? Math.min((s.filled / s.expected) * 100, 100) : 0}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {s.filled}/{s.expected}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Trận: <span className="font-mono text-foreground/80">{s.matchCode ?? "— chưa gán —"}</span>
              </p>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default QAuthorSetsPage;
