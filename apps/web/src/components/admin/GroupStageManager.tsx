import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, LayoutTemplate, Plus, RefreshCw, Trophy } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { MatchScheduleForm } from "./MatchScheduleForm";
import { ScheduleMatchCard, type SlotPlayer } from "./ScheduleMatchCard";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { emptyScheduleForm, type ScheduleFormValue } from "./scheduleFormState";

interface BracketMatch {
  matchCode: string;
  matchSlug: string;
  matchName: string;
  matchStatus: string;
  matchLabel: string | null;
  scheduledAt: string | null;
  venue: string | null;
  phaseId: string | null;
  players: SlotPlayer[];
}

interface BracketPhase {
  id: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
}

interface BuiltinTemplate {
  id: string;
  templateName: string;
  description: string;
}

interface StandingRow {
  userCode: string;
  userName: string;
  totalPoints: number;
  matchesPlayed: number;
  rank: number;
}

function parseSlot(name: string): { round: number; index: number } | null {
  const r = /round\s+(\d+)/i.exec(name);
  const m = /match\s+(\d+)/i.exec(name);
  if (!r || !m) return null;
  return { round: Number(r[1]), index: Number(m[1]) };
}

/** Tab Vòng phân nhánh: khung 2 vòng × 4 trận × 4 thí sinh. */
export function GroupStageManager({
  tournamentCode,
  tournamentName,
}: {
  tournamentCode: string;
  tournamentName: string;
}) {
  const navigate = useNavigate();
  const [phases, setPhases] = useState<BracketPhase[]>([]);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [templates, setTemplates] = useState<BuiltinTemplate[]>([]);
  const [templateId, setTemplateId] = useState("oc3-classic");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes, tRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/bracket`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/standings`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/templates`, { credentials: "include" }),
      ]);
      const bJson = await bRes.json().catch(() => null);
      if (bRes.ok && bJson?.status === "success") {
        setPhases((bJson.data.phases ?? []).filter((p: BracketPhase) => p.phaseType === "group_stage"));
        setMatches(bJson.data.matches ?? []);
      }
      const sJson = await sRes.json().catch(() => null);
      if (sRes.ok && sJson?.status === "success") setStandings(sJson.data.standings ?? []);
      const tJson = await tRes.json().catch(() => null);
      if (tRes.ok && tJson?.status === "success" && Array.isArray(tJson.data)) setTemplates(tJson.data);
    } finally {
      setLoading(false);
    }
  }, [tournamentCode]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const groupIds = useMemo(() => new Set(phases.map((p) => p.id)), [phases]);
  const groupMatches = useMemo(
    () => matches.filter((m) => m.phaseId && groupIds.has(m.phaseId)),
    [matches, groupIds],
  );

  // Khung từng phase: vòng 1-2 × ô 1-4
  const structures = useMemo(
    () =>
      [...phases]
        .sort((a, b) => a.phaseNumber - b.phaseNumber)
        .map((phase) => {
          const inPhase = groupMatches.filter((m) => m.phaseId === phase.id);
          const grid: (BracketMatch | null)[][] = [1, 2].map((round) =>
            [1, 2, 3, 4].map((index) => {
              const found = inPhase.find((m) => {
                const s = parseSlot(m.matchName);
                return s?.round === round && s?.index === index;
              });
              // Trận không parse được slot nhưng cùng phase: nhét vào ô trống đầu tiên
              return found ?? null;
            }),
          );
          // Trận cùng phase nhưng không parse được tên chuẩn → gom riêng
          const slotted = new Set(grid.flat().filter(Boolean).map((m) => (m as BracketMatch).matchCode));
          const others = inPhase.filter((m) => !slotted.has(m.matchCode));
          // Lấp ô trống bằng trận "others" dư (giữ đủ 4 ô/vòng hiển thị đúng số lượng)
          return { phase, grid, others };
        }),
    [phases, groupMatches],
  );

  const totalSlotted = structures.reduce(
    (n, s) => n + s.grid.flat().filter(Boolean).length,
    0,
  );

  const handleApplyTemplate = async () => {
    if (!templateId) return;
    if (!confirm(`Áp template "${templateId}" để dựng vòng cho giải?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/apply-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) alert(`Thất bại: ${json?.message ?? "?"}`);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleFillSlot = async (phase: BracketPhase, round: number, index: number) => {
    const key = `${phase.id}-${round}-${index}`;
    setFilling(key);
    try {
      const res = await fetch(`${API_BASE_URL}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          matchName: `${phase.phaseName} - Round ${round} - Match ${index}`,
          tournamentCode,
          phaseId: phase.id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) alert(`Tạo thất bại: ${json?.message ?? "?"}`);
      await fetchAll();
    } finally {
      setFilling(null);
    }
  };

  const handleSubmit = async (v: ScheduleFormValue) => {
    if (!v.matchName.trim()) {
      alert("Nhập tên trận.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          matchName: v.matchName.trim(),
          tournamentCode,
          ...(v.scheduledAt ? { scheduledAt: new Date(v.scheduledAt).toISOString() } : {}),
          ...(v.venue.trim() ? { venue: v.venue.trim() } : {}),
          ...(v.matchLabel.trim() ? { matchLabel: v.matchLabel.trim() } : {}),
          ...(v.phaseId ? { phaseId: v.phaseId } : {}),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(`Tạo thất bại: ${json?.message ?? "?"}`);
        return;
      }
      for (let i = 0; i < v.playerCodes.length; i++) {
        const code = v.playerCodes[i].trim();
        if (!code) continue;
        await fetch(`${API_BASE_URL}/matches/${json.data.matchSlug}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userCode: code, position: i + 1 }),
        }).catch(() => null);
      }
      setShowForm(false);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async (matchSlug: string, matchName: string) => {
    if (!confirm(`Hoàn thành "${matchName}"?`)) return;
    await fetch(`${API_BASE_URL}/matches/${matchSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ matchStatus: "finished" }),
    });
    await fetchAll();
  };

  const goSchedule = () => navigate("/admin/schedule");

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">Đang tải vòng bảng…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Khung 2×4</p>
          <p className="text-xl font-bold">{totalSlotted}/8 <span className="text-sm font-normal text-gray-500">trận</span></p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Vòng bảng</p>
          <p className="text-xl font-bold">{phases.length}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Thí sinh BXH</p>
          <p className="text-xl font-bold">{standings.length}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void fetchAll()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
        >
          <RefreshCw size={14} /> Làm mới
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Thêm trận nhánh
        </button>
      </div>

      <SidePanel
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Thêm trận nhánh"
        wide
      >
        <MatchScheduleForm
          initial={{ ...emptyScheduleForm(), tournamentCode }}
          isEdit={false}
          saving={saving}
          tournaments={[{ tournamentCode, tournamentName }]}
          phases={phases.map((p) => ({ id: p.id, phaseName: p.phaseName }))}
          bare
          onSubmit={(v) => void handleSubmit(v)}
          onCancel={() => setShowForm(false)}
        />
      </SidePanel>

      {phases.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-5 flex flex-col gap-3">
          <p className="text-sm text-gray-300 font-medium">Giải chưa có vòng phân nhánh</p>
          <p className="text-xs text-gray-500">Áp template để dựng khung 2 vòng × 4 trận × 4 thí sinh.</p>
          <div className="flex gap-2">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.templateName} — {t.description}
                </option>
              ))}
              {templates.length === 0 && <option value="oc3-classic">OC3 Classic</option>}
            </select>
            <button
              onClick={() => void handleApplyTemplate()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              <LayoutTemplate size={14} /> {saving ? "…" : "Áp template"}
            </button>
          </div>
        </div>
      ) : (
        structures.map(({ phase, grid, others }) => (
          <section key={phase.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-200">{phase.phaseName}</h3>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-400">
                {grid.flat().filter(Boolean).length}/8
              </span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            {[0, 1].map((r) => (
              <div key={r} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Vòng {r + 1} · {grid[r].filter(Boolean).length}/4 trận
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                  {grid[r].map((m, i) =>
                    m ? (
                      <ScheduleMatchCard
                        key={m.matchCode}
                        match={{
                          match_code: m.matchCode,
                          match_name: m.matchName,
                          match_status: m.matchStatus,
                          match_slug: m.matchSlug,
                          scheduled_at: m.scheduledAt,
                          venue: m.venue,
                          match_label: m.matchLabel,
                        }}
                        players={m.players}
                        selected={false}
                        onSelect={goSchedule}
                        onFinish={(mm) => void handleFinish(m.matchSlug, mm.match_name)}
                      />
                    ) : (
                      <button
                        key={`empty-${r}-${i}`}
                        onClick={() => void handleFillSlot(phase, r + 1, i + 1)}
                        disabled={filling !== null}
                        className="min-h-[180px] rounded-xl border border-dashed border-white/15 text-gray-600 hover:text-gray-300 hover:border-white/30 hover:bg-white/[0.02] transition-colors flex flex-col items-center justify-center gap-1.5 text-sm disabled:opacity-50"
                      >
                        <Plus size={18} />
                        {filling === `${phase.id}-${r + 1}-${i + 1}` ? "Đang tạo…" : `Vòng ${r + 1} · Trận ${i + 1}`}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
            {others.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Trận khác trong {phase.phaseName} (tên không theo mẫu Vòng/Trận)
                </p>
                {others.map((m) => {
                  const done = m.matchStatus === "finished" || m.matchStatus === "completed";
                  return (
                    <div
                      key={m.matchCode}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-sm"
                    >
                      <span className="flex-1 text-white truncate">{m.matchName}</span>
                      <span className="text-[11px] font-mono text-gray-500">{m.matchCode}</span>
                      {!done && (
                        <button
                          onClick={() => void handleFinish(m.matchSlug, m.matchName)}
                          className="p-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-300 hover:bg-green-600/40 transition-colors"
                          title="Hoàn thành"
                        >
                          <Flag size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}

      {standings.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-300 mb-2">
            <Trophy size={14} className="text-amber-300" /> Leaderboard vòng bảng
          </p>
          <div className="flex flex-col gap-1">
            {standings.slice(0, 10).map((s) => (
              <div key={s.userCode} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-sm">
                <span className="w-6 text-xs font-bold text-gray-500">{s.rank}</span>
                <span className="flex-1 text-white truncate">{s.userName || s.userCode}</span>
                <span className="text-[11px] text-gray-500">{s.matchesPlayed} trận</span>
                <span className="font-mono text-xs text-gray-300 w-14 text-right">{s.totalPoints}đ</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate("/admin/schedule")}
        className="text-xs text-blue-400 hover:text-blue-300 self-start"
      >
        Mở Lịch thi đấu tổng →
      </button>
    </div>
  );
}

export default GroupStageManager;
