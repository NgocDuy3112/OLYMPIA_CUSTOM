import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, RefreshCw, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { setMatchCode as persistMatchCode } from "@/utils/storage";
import { ScheduleMatchCard, type SlotPlayer } from "@/components/admin/ScheduleMatchCard";
import { MatchScheduleForm } from "@/components/admin/MatchScheduleForm";
import { emptyScheduleForm, type ScheduleFormValue } from "@/components/admin/scheduleFormState";
import { isoToLocalInput } from "@/components/admin/scheduleUtils";
import { QuestionsCard } from "@/components/admin/QuestionsCard";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { EditMatchQuestionPanel, type MatchQuestionEditValue } from "@/components/admin/EditMatchQuestionPanel";
import type { MatchData, QuestionData } from "@/components/admin/gameTypes";

const logger = createLogger("AdminSchedule");

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

interface BackendMatch {
  id: string;
  matchSlug: string;
  matchCode: string;
  matchName: string;
  matchStatus: string;
  tournamentId?: string | null;
  scheduledAt?: string | null;
  venue?: string | null;
  matchLabel?: string | null;
  phaseId?: string | null;
}

interface TournamentOpt {
  id: string;
  tournamentCode: string;
  tournamentName: string;
}

const toMatchData = (m: BackendMatch): MatchData => ({
  match_code: m.matchCode,
  match_name: m.matchName,
  match_status: m.matchStatus,
  match_slug: m.matchSlug,
  scheduled_at: m.scheduledAt ?? null,
  venue: m.venue ?? null,
  match_label: m.matchLabel ?? null,
  tournament_id: m.tournamentId ?? null,
  phase_id: m.phaseId ?? null,
});

const req = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

function dayKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayTitleOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("vi-VN", { weekday: "long" });
  return `${weekday}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const AdminGameManagingPage = () => {
  const [allMatches, setAllMatches] = useState<MatchData[]>([]);
  const [slugByCode, setSlugByCode] = useState<Record<string, string>>({});
  const [tournamentCodeById, setTournamentCodeById] = useState<Record<string, string>>({});
  const [playersByCode, setPlayersByCode] = useState<Record<string, SlotPlayer[]>>({});
  const [loading, setLoading] = useState(false);

  const [tournaments, setTournaments] = useState<TournamentOpt[]>([]);
  const [query, setQuery] = useState("");
  const [tournamentFilter, setTournamentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "done">("all");

  // Form lên lịch / sửa
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<ScheduleFormValue>(emptyScheduleForm());
  const [saving, setSaving] = useState(false);

  // Câu hỏi của trận đang chọn
  const [selectedCode, setSelectedCode] = useState("");
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(null);
  const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, tRes] = await Promise.all([
        req(`${API_BASE_URL}/matches`),
        req(`${API_BASE_URL}/tournaments`),
      ]);
      const mJson: ApiResponse = await mRes.json();
      const tJson: ApiResponse = await tRes.json().catch(() => null);
      let rows: BackendMatch[] = [];
      if (mJson.status === "success" && Array.isArray(mJson.data)) {
        rows = mJson.data as unknown as BackendMatch[];
        setAllMatches(rows.map(toMatchData));
        const map: Record<string, string> = {};
        rows.forEach((r) => {
          map[r.matchCode] = r.matchSlug;
        });
        setSlugByCode(map);
      } else {
        logger.warn("Fetch matches failed:", mJson.message);
      }
      if (tJson && tJson.status === "success" && Array.isArray(tJson.data)) {
        const tours = tJson.data as unknown as TournamentOpt[];
        setTournaments(tours);
        const tmap: Record<string, string> = {};
        tours.forEach((t) => {
          tmap[t.id] = t.tournamentCode;
        });
        setTournamentCodeById(tmap);
      }
      // Nạp players từng trận để vẽ 4 slot (song song, lỗi từng trận không chặn)
      if (rows.length > 0) {
        const settled = await Promise.allSettled(
          rows.map((r) =>
            req(`${API_BASE_URL}/matches/${encodeURIComponent(r.matchSlug)}`).then((res) => res.json()),
          ),
        );
        const pmap: Record<string, SlotPlayer[]> = {};
        settled.forEach((s, i) => {
          if (s.status === "fulfilled" && s.value?.status === "success" && s.value.data && !Array.isArray(s.value.data)) {
            const players = (s.value.data as { players?: SlotPlayer[] }).players ?? [];
            pmap[rows[i].matchCode] = players;
          }
        });
        setPlayersByCode(pmap);
      } else {
        setPlayersByCode({});
      }
    } catch (err) {
      logger.error("Error fetching schedule:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const fetchQuestions = useCallback(async (code: string) => {
    if (!code) return;
    setQuestionsLoading(true);
    try {
      const res = await req(`${API_BASE_URL}/questions?match_code=${encodeURIComponent(code)}`);
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setQuestions(json.data as unknown as QuestionData[]);
      } else if (json.status === "success" && json.data && !Array.isArray(json.data)) {
        setQuestions([json.data as unknown as QuestionData]);
      } else {
        setQuestions([]);
      }
    } catch (err) {
      logger.error("Error fetching questions:", err);
    } finally {
      setQuestionsLoading(false);
    }
  }, []);

  const handleSelect = useCallback(
    (code: string) => {
      const m = allMatches.find((x) => x.match_code === code);
      setSelectedCode(code);
      persistMatchCode(code);
      setQuestions([]);
      void fetchQuestions(code);
      if (m) {
        // Mở form sửa với dữ liệu hiện tại
        const players = playersByCode[code] ?? [];
        const codes = ["", "", "", ""];
        players.forEach((p) => {
          const idx = (p.position ?? 0) - 1;
          if (idx >= 0 && idx < 4) codes[idx] = p.userCode;
        });
        setEditingCode(code);
        setFormInitial({
          matchName: m.match_name,
          tournamentCode: (m.tournament_id && tournamentCodeById[m.tournament_id]) ?? "",
          scheduledAt: isoToLocalInput(m.scheduled_at),
          venue: m.venue ?? "",
          matchLabel: m.match_label ?? "",
          phaseId: m.phase_id ?? "",
          playerCodes: codes,
        });
        setShowForm(true);
      }
    },
    [allMatches, playersByCode, tournamentCodeById, fetchQuestions],
  );

  const handleNew = useCallback(() => {
    setEditingCode(null);
    setFormInitial(emptyScheduleForm());
    setShowForm(true);
  }, []);

  const syncPlayers = useCallback(async (slug: string, codes: string[]) => {
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i].trim();
      if (!code) continue;
      await req(`${API_BASE_URL}/matches/${encodeURIComponent(slug)}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code, position: i + 1 }),
      }).catch(() => null);
    }
  }, []);

  const handleSubmitForm = useCallback(
    async (v: ScheduleFormValue) => {
      if (!v.matchName.trim()) {
        alert("Vui lòng nhập tên trận đấu.");
        return;
      }
      setSaving(true);
      try {
        const scheduledAt = v.scheduledAt ? new Date(v.scheduledAt).toISOString() : null;
        if (!editingCode) {
          const res = await req(`${API_BASE_URL}/matches`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchName: v.matchName.trim(),
              ...(v.tournamentCode ? { tournamentCode: v.tournamentCode } : {}),
              ...(scheduledAt ? { scheduledAt } : {}),
              ...(v.venue.trim() ? { venue: v.venue.trim() } : {}),
              ...(v.matchLabel.trim() ? { matchLabel: v.matchLabel.trim() } : {}),
              ...(v.phaseId ? { phaseId: v.phaseId } : {}),
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
            return;
          }
          const created = json.data as { matchSlug: string; matchCode: string };
          await syncPlayers(created.matchSlug, v.playerCodes);
          setSelectedCode(created.matchCode);
          void fetchQuestions(created.matchCode);
          alert(`Lên lịch thành công — mã: ${created.matchCode}`);
        } else {
          const slug = slugByCode[editingCode];
          if (!slug) {
            alert("Không xác định được trận — tải lại trang.");
            return;
          }
          const res = await req(`${API_BASE_URL}/matches/${encodeURIComponent(slug)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              matchName: v.matchName.trim(),
              ...(v.tournamentCode ? { tournamentCode: v.tournamentCode } : {}),
              scheduledAt,
              venue: v.venue.trim() || null,
              matchLabel: v.matchLabel.trim() || null,
              phaseId: v.phaseId || null,
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            alert(`Lưu thất bại: ${json.message ?? "Lỗi không xác định"}`);
            return;
          }
          await syncPlayers(slug, v.playerCodes);
          alert("Lưu lịch thi đấu thành công");
        }
        setShowForm(false);
        setEditingCode(null);
        await fetchAll();
      } catch (err) {
        logger.error("Error saving schedule:", err);
        alert("Lỗi kết nối khi lưu");
      } finally {
        setSaving(false);
      }
    },
    [editingCode, slugByCode, syncPlayers, fetchAll, fetchQuestions],
  );

  const finishMatch = useCallback(
    async (m: MatchData) => {
      const slug = m.match_slug ?? slugByCode[m.match_code];
      if (!slug) {
        alert("Không xác định được trận.");
        return;
      }
      if (!confirm(`Xác nhận hoàn thành trận "${m.match_name}" (${m.match_code})?`)) return;
      try {
        const res = await req(`${API_BASE_URL}/matches/${encodeURIComponent(slug)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchStatus: "finished" }),
        });
        const json = await res.json();
        if (json.status === "success" || res.ok) {
          await fetchAll();
        } else {
          alert(`Lỗi: ${json.message ?? "Không thể hoàn thành"}`);
        }
      } catch (err) {
        logger.error("Error finishing match:", err);
        alert("Lỗi kết nối khi hoàn thành trận đấu");
      }
    },
    [slugByCode, fetchAll],
  );

  const uploadMediaViaPresign = useCallback(async (questionCode: string, file: File) => {
    const key = `questions/${questionCode}/${file.name}`;
    const presignRes = await req(
      `${API_BASE_URL}/media/presign-question/?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(file.type || "image/png")}`,
    );
    const presignJson = await presignRes.json();
    if (!presignRes.ok || presignJson.status !== "success") {
      throw new Error(presignJson.message ?? "Không lấy được presigned URL");
    }
    const putRes = await fetch(presignJson.data.url, { method: "PUT", body: file });
    if (!putRes.ok) throw new Error(`Upload S3 thất bại (HTTP ${putRes.status})`);
    return (presignJson.data.key as string) ?? key;
  }, []);

  const patchQuestion = useCallback(
    async (value: MatchQuestionEditValue, mediaFile: File | null) => {
      if (!editingQuestion || !selectedCode) return;
      setSavingQuestionEdit(true);
      try {
        let mediaUrl = value.mediaUrl.trim() || null;
        if (mediaFile) {
          try {
            mediaUrl = await uploadMediaViaPresign(editingQuestion.question_code, mediaFile);
          } catch (err) {
            alert(err instanceof Error ? err.message : "Upload media thất bại — giữ URL cũ");
          }
        }
        const res = await req(
          `${API_BASE_URL}/questions/${encodeURIComponent(selectedCode)}/${encodeURIComponent(editingQuestion.question_code)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: value.content.trim() || null,
              answer: value.answer.trim() || null,
              explanation: value.explanation.trim() || null,
              media_url: mediaUrl,
            }),
          },
        );
        const json: ApiResponse = await res.json();
        if (json.status === "success") {
          setEditingQuestion(null);
          await fetchQuestions(selectedCode);
        } else {
          alert(`Thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error patching question:", err);
        alert("Lỗi kết nối khi sửa câu hỏi");
      } finally {
        setSavingQuestionEdit(false);
      }
    },
    [editingQuestion, selectedCode, fetchQuestions, uploadMediaViaPresign],
  );

  // Lọc + nhóm theo ngày
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allMatches.filter((m) => {
      const done = m.match_status === "finished" || m.match_status === "completed";
      if (statusFilter === "live" && done) return false;
      if (statusFilter === "done" && !done) return false;
      if (tournamentFilter) {
        const codeOf = (m.tournament_id && tournamentCodeById[m.tournament_id]) ?? "";
        // Trận không thuộc giải nào (code rỗng) cũng bị loại khi đang lọc theo giải
        if (codeOf !== tournamentFilter) return false;
      }
      if (!q) return true;
      return (
        m.match_code.toLowerCase().includes(q) ||
        m.match_name.toLowerCase().includes(q) ||
        (m.match_label ?? "").toLowerCase().includes(q) ||
        (m.venue ?? "").toLowerCase().includes(q)
      );
    });
    const byDay = new Map<string, MatchData[]>();
    const unscheduled: MatchData[] = [];
    filtered.forEach((m) => {
      const key = dayKeyOf(m.scheduled_at);
      if (!key) {
        unscheduled.push(m);
        return;
      }
      const arr = byDay.get(key) ?? [];
      arr.push(m);
      byDay.set(key, arr);
    });
    const sortedKeys = [...byDay.keys()].sort();
    const out: { key: string; title: string; items: MatchData[] }[] = sortedKeys.map((key) => ({
      key,
      title: dayTitleOf(key),
      items: (byDay.get(key) ?? []).slice().sort((a, b) =>
        String(a.scheduled_at ?? "").localeCompare(String(b.scheduled_at ?? "")),
      ),
    }));
    if (unscheduled.length > 0) out.push({ key: "unscheduled", title: "Chưa xếp lịch", items: unscheduled });
    return out;
  }, [allMatches, query, statusFilter, tournamentFilter, tournamentCodeById]);

  const liveCount = allMatches.filter(
    (m) => m.match_status !== "finished" && m.match_status !== "completed",
  ).length;
  const unscheduledCount = allMatches.filter((m) => !dayKeyOf(m.scheduled_at)).length;

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Lịch thi đấu</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Mỗi ô là một trận — 4 slot thí sinh. Bấm card để sửa lịch / xem câu hỏi.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            <Plus size={15} /> Lên lịch
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Tổng trận</p>
          <p className="text-xl font-bold">{allMatches.length}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Chưa xong</p>
          <p className="text-xl font-bold text-amber-300">{liveCount}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Chưa xếp lịch</p>
          <p className="text-xl font-bold text-purple-300">{unscheduledCount}</p>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã / tên / nhãn / địa điểm…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <select
          value={tournamentFilter}
          onChange={(e) => setTournamentFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
        >
          <option value="">Mọi giải đấu</option>
          {tournaments.map((t) => (
            <option key={t.tournamentCode} value={t.tournamentCode}>
              {t.tournamentName}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-white/10 text-sm">
          {(["all", "live", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 transition-colors ${
                statusFilter === f ? "bg-blue-600/30 text-blue-200" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {f === "all" ? "Tất cả" : f === "live" ? "Live" : "Xong"}
            </button>
          ))}
        </div>
      </div>

      <SidePanel
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingCode(null);
        }}
        title={editingCode ? "Sửa trận / lịch" : "Lên lịch trận mới"}
        wide
      >
        <MatchScheduleForm
          initial={formInitial}
          isEdit={editingCode !== null}
          saving={saving}
          tournaments={tournaments}
          bare
          onSubmit={(v) => void handleSubmitForm(v)}
          onCancel={() => {
            setShowForm(false);
            setEditingCode(null);
          }}
        />
      </SidePanel>
      {/* Lịch theo ngày */}
      {loading && allMatches.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Đang tải lịch…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
          <CalendarDays size={32} className="mx-auto text-gray-600 mb-2" />
          <p className="text-gray-400 text-sm">Chưa có trận nào. Bấm “Lên lịch” để tạo trận đầu tiên.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-300">{g.title}</h2>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-400">
                {g.items.length}
              </span>
              <div className="flex-1 border-t border-white/10" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {g.items.map((m) => (
                <ScheduleMatchCard
                  key={m.match_code}
                  match={m}
                  players={playersByCode[m.match_code] ?? []}
                  selected={selectedCode === m.match_code}
                  onSelect={handleSelect}
                  onFinish={finishMatch}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Câu hỏi của trận đang chọn */}
      {selectedCode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-300">
              Câu hỏi — <span className="font-mono text-blue-300">{selectedCode}</span>
            </h2>
            <div className="flex-1 border-t border-white/10" />
          </div>
          <QuestionsCard
            matchCode={selectedCode}
            questionsMatchCode={selectedCode}
            questions={questions}
            questionsLoading={questionsLoading}
            onFetch={() => void fetchQuestions(selectedCode)}
            onEditQuestion={setEditingQuestion}
          />
        </div>
      )}

      <EditMatchQuestionPanel
        item={editingQuestion}
        matchCode={selectedCode}
        saving={savingQuestionEdit}
        onClose={() => setEditingQuestion(null)}
        onSave={patchQuestion}
      />
    </div>
  );
};

export default AdminGameManagingPage;
