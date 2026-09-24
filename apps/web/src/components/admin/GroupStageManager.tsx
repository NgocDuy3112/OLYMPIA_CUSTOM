import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, Plus, RefreshCw, Trophy } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { MatchScheduleForm } from "./MatchScheduleForm";
import { emptyScheduleForm, type ScheduleFormValue } from "./scheduleFormState";

interface BracketPlayer {
  userCode: string;
  userName: string;
  position: number | null;
}

interface BracketMatch {
  matchCode: string;
  matchSlug: string;
  matchName: string;
  matchStatus: string;
  matchLabel: string | null;
  scheduledAt: string | null;
  venue: string | null;
  phaseId: string | null;
  players: BracketPlayer[];
}

interface BracketPhase {
  id: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
}

interface StandingRow {
  userCode: string;
  userName: string;
  totalPoints: number;
  matchesPlayed: number;
  rank: number;
}

function roundOf(name: string): string {
  const m = /round\s+(\d+)/i.exec(name);
  return m ? `Lượt ${m[1]}` : "Lượt khác";
}

/** Tab Vòng phân nhánh: trận vòng bảng theo lượt + leaderboard + tạo trận gán vòng. */
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/bracket`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/standings`, { credentials: "include" }),
      ]);
      const bJson = await bRes.json().catch(() => null);
      if (bRes.ok && bJson?.status === "success") {
        setPhases((bJson.data.phases ?? []).filter((p: BracketPhase) => p.phaseType === "group_stage"));
        setMatches(bJson.data.matches ?? []);
      }
      const sJson = await sRes.json().catch(() => null);
      if (sRes.ok && sJson?.status === "success") setStandings(sJson.data.standings ?? []);
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

  const byRound = useMemo(() => {
    const map = new Map<string, BracketMatch[]>();
    groupMatches.forEach((m) => {
      const r = roundOf(m.matchName);
      const arr = map.get(r) ?? [];
      arr.push(m);
      map.set(r, arr);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi", { numeric: true }));
  }, [groupMatches]);

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

  const handleFinish = async (m: BracketMatch) => {
    if (!confirm(`Hoàn thành "${m.matchName}"?`)) return;
    await fetch(`${API_BASE_URL}/matches/${m.matchSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ matchStatus: "finished" }),
    });
    await fetchAll();
  };

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">Đang tải vòng bảng…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Vòng bảng</p>
          <p className="text-xl font-bold">{phases.length}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Trận nhánh</p>
          <p className="text-xl font-bold">{groupMatches.length}</p>
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
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Thêm trận nhánh
        </button>
      </div>

      {showForm && (
        <MatchScheduleForm
          initial={{ ...emptyScheduleForm(), tournamentCode }}
          isEdit={false}
          saving={saving}
          tournaments={[{ tournamentCode, tournamentName }]}
          phases={phases.map((p) => ({ id: p.id, phaseName: p.phaseName }))}
          onSubmit={(v) => void handleSubmit(v)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {phases.length === 0 && (
        <p className="text-xs text-gray-500 rounded-xl bg-white/5 border border-white/10 p-3">
          Giải chưa có vòng bảng (phase group_stage) — áp template OC3/OC4 hoặc tạo trận rồi gán vòng ở tab Lịch thi đấu.
        </p>
      )}

      {byRound.map(([round, items]) => (
        <section key={round} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-300">{round}</h3>
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-400">
              {items.length}
            </span>
            <div className="flex-1 border-t border-white/10" />
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((m) => {
              const done = m.matchStatus === "finished" || m.matchStatus === "completed";
              return (
                <div
                  key={m.matchCode}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/5 transition-colors"
                >
                  {m.matchLabel && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[11px] font-mono font-bold">
                      {m.matchLabel}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.matchName}</p>
                    <p className="text-[11px] text-gray-500 font-mono truncate">
                      {m.matchCode} · {m.players.length} thí sinh
                      {m.scheduledAt
                        ? ` · ${new Date(m.scheduledAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                      done ? "bg-green-600/20 text-green-300" : "bg-blue-600/20 text-blue-300"
                    }`}
                  >
                    {done ? "Xong" : m.matchStatus}
                  </span>
                  {!done && (
                    <button
                      onClick={() => void handleFinish(m)}
                      className="shrink-0 p-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-300 hover:bg-green-600/40 transition-colors"
                      title="Hoàn thành"
                    >
                      <Flag size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

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
