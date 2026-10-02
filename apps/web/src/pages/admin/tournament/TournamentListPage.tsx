import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  TournamentFormPanel,
  type TournamentFormValue,
} from "@/components/admin/TournamentFormPanel";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Calendar,
  MapPin,
  Users,
  Trophy,
  Trash2,
  Pencil,
  RefreshCw,
} from "lucide-react";

interface Tournament {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  description?: string;
  tournamentFormat: string;
  startDate?: string;
  endDate?: string;
  status: string;
  maxPlayers?: string;
  venue?: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  active: "Đang diễn ra",
  completed: "Hoàn thành",
  archived: "Lưu trữ",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted/20 text-foreground/80",
  active: "bg-success/20 text-success",
  completed: "bg-primary/20 text-brand",
  archived: "bg-purple/20 text-purple",
};

const TournamentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTournaments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tournaments`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tournaments");
      }

      const data = await response.json();
      if (data.status === "success" && data.data) {
        setTournaments(data.data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load tournaments",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const handleCreate = async (v: TournamentFormValue) => {
    if (!v.tournamentName.trim()) {
      setCreateError("Tên giải đấu là bắt buộc");
      return;
    }
    setSavingCreate(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to save tournament");
      }
      setShowCreate(false);
      await fetchTournaments();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to save tournament");
    } finally {
      setSavingCreate(false);
    }
  };

  const handleDelete = async (tournamentCode: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa giải đấu này?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${tournamentCode}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (response.ok) {
        setTournaments((prev) =>
          prev.filter((t) => t.tournamentCode !== tournamentCode),
        );
      }
    } catch (err) {
      console.error("Failed to delete tournament:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <TournamentFormPanel
        open={showCreate}
        initial={null}
        saving={savingCreate}
        error={createError}
        onClose={() => {
          setShowCreate(false);
          setCreateError(null);
        }}
        onSubmit={handleCreate}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-sm text-muted-foreground">
          {tournaments.length} giải
        </span>
        <div className="flex gap-2 shrink-0">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void fetchTournaments()}
            className="bg-accent/50 border border-border hover:bg-accent"
            title="Làm mới"
          >
            <RefreshCw size={15} />
          </Button>
          <Button
            variant="default"
            onClick={() => setShowCreate(true)}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-sm font-medium"
          >
            <Plus size={15} /> Tạo giải đấu
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
          {error}
        </div>
      )}

      {tournaments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Trophy size={36} className="mx-auto text-muted-foreground/70 mb-3" />
          <p className="text-muted-foreground text-sm mb-4">Chưa có giải đấu nào</p>
          <Button
            variant="default"
            onClick={() => setShowCreate(true)}
            className="bg-primary hover:bg-primary/90 text-foreground text-sm font-medium"
          >
            Tạo giải đấu đầu tiên
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-accent/25 border border-border hover:bg-accent/50 hover:border-border transition-colors"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() =>
                  navigate(`/admin/tournaments/${tournament.tournamentCode}`)
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">
                    {tournament.tournamentName}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[tournament.status] || "bg-muted/20 text-foreground/80"}`}
                  >
                    {STATUS_LABELS[tournament.status] || tournament.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{tournament.tournamentCode}</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {tournament.startDate || "—"} – {tournament.endDate || "—"}
                  </span>
                  {tournament.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      <span className="truncate max-w-40">{tournament.venue}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {tournament.tournamentFormat.toUpperCase()}
                  </span>
                </div>
                {tournament.description && (
                  <p className="text-muted-foreground text-xs mt-1 truncate">
                    {tournament.description}
                  </p>
                )}
              </div>

              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    navigate(`/admin/tournaments/${tournament.tournamentCode}/edit`)
                  }
                  className="text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Sửa"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleDelete(tournament.tournamentCode)}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="Xóa"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TournamentListPage;
