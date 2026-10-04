import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, LayoutTemplate, Plus, RefreshCw, Trophy } from "lucide-react";
import { apiGet, apiSend } from "@/api/client";
import { MatchScheduleForm } from "./MatchScheduleForm";
import { ScheduleMatchCard, type SlotPlayer } from "./ScheduleMatchCard";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { emptyScheduleForm, type ScheduleFormValue } from "./scheduleFormState";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { notifyApiFailure, notifyError } from "@/lib/notify";

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
      // Lỗi từng endpoint: bỏ qua như trước (đọc thất bại không toast).
      const [bJson, sJson, tJson] = await Promise.all([
        apiGet<{ phases: BracketPhase[]; matches: BracketMatch[] }>(
          `/tournaments/${tournamentCode}/bracket`,
        ).catch(() => null),
        apiGet<{ standings: StandingRow[] }>(
          `/tournaments/${tournamentCode}/standings`,
        ).catch(() => null),
        apiGet<BuiltinTemplate[]>(`/templates`).catch(() => null),
      ]);
      if (bJson) {
        setPhases((bJson.data!.phases ?? []).filter((p: BracketPhase) => p.phaseType === "group_stage"));
        setMatches(bJson.data!.matches ?? []);
      }
      if (sJson) setStandings(sJson.data!.standings ?? []);
      if (tJson && Array.isArray(tJson.data)) setTemplates(tJson.data);
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
              return found ?? null;
            }),
          );
          const slotted = new Set(grid.flat().filter(Boolean).map((m) => (m as BracketMatch).matchCode));
          const others = inPhase.filter((m) => !slotted.has(m.matchCode));
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
      await apiSend<unknown>("POST", `/tournaments/${tournamentCode}/apply-template`, {
        templateId,
      }).catch((err) => notifyApiFailure(err, "Thất bại", "không kết nối được"));
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleFillSlot = async (phase: BracketPhase, round: number, index: number) => {
    const key = `${phase.id}-${round}-${index}`;
    setFilling(key);
    try {
      await apiSend<unknown>("POST", "/matches", {
        matchName: `${phase.phaseName} - Round ${round} - Match ${index}`,
        tournamentCode,
        phaseId: phase.id,
      }).catch((err) =>
        notifyApiFailure(err, "Tạo thất bại", "không kết nối được"),
      );
      await fetchAll();
    } finally {
      setFilling(null);
    }
  };

  const handleSubmit = async (v: ScheduleFormValue) => {
    if (!v.matchName.trim()) {
      notifyError("Nhập tên trận.");
      return;
    }
    setSaving(true);
    try {
      const json = await apiSend<{ matchSlug: string }>("POST", "/matches", {
        matchName: v.matchName.trim(),
        tournamentCode,
        ...(v.scheduledAt ? { scheduledAt: new Date(v.scheduledAt).toISOString() } : {}),
        ...(v.venue.trim() ? { venue: v.venue.trim() } : {}),
        ...(v.matchLabel.trim() ? { matchLabel: v.matchLabel.trim() } : {}),
        ...(v.phaseId ? { phaseId: v.phaseId } : {}),
      }).catch((err) => {
        notifyApiFailure(err, "Tạo thất bại", "không kết nối được");
        return null;
      });
      if (!json) return;
      const matchSlug = json.data!.matchSlug;
      for (let i = 0; i < v.playerCodes.length; i++) {
        const code = v.playerCodes[i].trim();
        if (!code) continue;
        await apiSend<unknown>("POST", `/matches/${matchSlug}/players`, {
          userCode: code,
          position: i + 1,
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
    // Không kiểm tra res.ok như trước — bỏ qua lỗi.
    await apiSend<unknown>("PUT", `/matches/${matchSlug}`, {
      matchStatus: "finished",
    }).catch(() => null);
    await fetchAll();
  };

  const goSchedule = () => navigate("/admin/schedule");

  if (loading) return <p className="text-muted-foreground text-sm py-8 text-center">Đang tải vòng bảng…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-accent/50 border border-border p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Khung 2×4</p>
          <p className="text-xl font-bold">{totalSlotted}/8 <span className="text-sm font-normal text-muted-foreground">trận</span></p>
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Vòng bảng</p>
          <p className="text-xl font-bold">{phases.length}</p>
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Thí sinh BXH</p>
          <p className="text-xl font-bold">{standings.length}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="secondary"
          onClick={() => void fetchAll()}
          className="gap-1.5 bg-accent/50 border border-border hover:bg-accent text-sm"
        >
          <RefreshCw size={14} /> Làm mới
        </Button>
        <Button
          variant="default"
          onClick={() => setShowForm(true)}
          className="gap-1.5 text-sm font-medium"
        >
          <Plus size={14} /> Thêm trận nhánh
        </Button>
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
        <div className="rounded-xl bg-accent/50 border border-border p-5 flex flex-col gap-3">
          <p className="text-sm text-foreground font-medium">Giải chưa có vòng phân nhánh</p>
          <p className="text-xs text-muted-foreground">Áp template để dựng khung 2 vòng × 4 trận × 4 thí sinh.</p>
          <div className="flex gap-2">
            <NativeSelect
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex-1"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.templateName} — {t.description}
                </option>
              ))}
              {templates.length === 0 && <option value="oc3-classic">OC3 Classic</option>}
            </NativeSelect>
            <Button
              variant="default"
              onClick={() => void handleApplyTemplate()}
              disabled={saving}
              className="gap-1.5 disabled:opacity-50 text-sm font-medium"
            >
              <LayoutTemplate size={14} /> {saving ? "…" : "Áp template"}
            </Button>
          </div>
        </div>
      ) : (
        structures.map(({ phase, grid, others }) => (
          <section key={phase.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{phase.phaseName}</h3>
              <span className="px-1.5 py-0.5 rounded bg-accent text-[11px]  text-muted-foreground">
                {grid.flat().filter(Boolean).length}/8
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            {[0, 1].map((r) => (
              <div key={r} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                      <Button
                        key={`empty-${r}-${i}`}
                        variant="ghost"
                        onClick={() => void handleFillSlot(phase, r + 1, i + 1)}
                        disabled={filling !== null}
                        className="min-h-[180px] w-full flex-col gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground/70 hover:text-foreground hover:border-border hover:bg-accent/25 text-sm disabled:opacity-50"
                      >
                        <Plus size={18} />
                        {filling === `${phase.id}-${r + 1}-${i + 1}` ? "Đang tạo…" : `Vòng ${r + 1} · Trận ${i + 1}`}
                      </Button>
                    ),
                  )}
                </div>
              </div>
            ))}
            {others.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                  Trận khác trong {phase.phaseName} (tên không theo mẫu Vòng/Trận)
                </p>
                {others.map((m) => {
                  const done = m.matchStatus === "finished" || m.matchStatus === "completed";
                  return (
                    <div
                      key={m.matchCode}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/25 border border-border/50 text-sm"
                    >
                      <span className="flex-1 text-foreground truncate">{m.matchName}</span>
                      <span className="text-[11px]  text-muted-foreground">{m.matchCode}</span>
                      {!done && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void handleFinish(m.matchSlug, m.matchName)}
                          className="bg-success/20 border border-success/30 text-success hover:bg-success/40"
                          title="Hoàn thành"
                        >
                          <Flag size={12} />
                        </Button>
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
        <div className="rounded-xl bg-accent/50 border border-border p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-2">
            <Trophy size={14} className="text-warning" /> Leaderboard vòng bảng
          </p>
          <div className="flex flex-col gap-1">
            {standings.slice(0, 10).map((s) => (
              <div key={s.userCode} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50 text-sm">
                <span className="w-6 text-xs font-bold text-muted-foreground">{s.rank}</span>
                <span className="flex-1 text-foreground truncate">{s.userName || s.userCode}</span>
                <span className="text-[11px] text-muted-foreground">{s.matchesPlayed} trận</span>
                <span className=" text-xs text-foreground w-14 text-right">{s.totalPoints}đ</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={() => navigate("/admin/schedule")}
        className="self-start px-0 text-xs text-brand hover:text-brand/80"
      >
        Mở Lịch thi đấu tổng →
      </Button>
    </div>
  );
}

export default GroupStageManager;
