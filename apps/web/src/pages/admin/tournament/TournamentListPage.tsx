import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  TournamentFormPanel,
  type TournamentFormValue,
} from "@/components/admin/TournamentFormPanel";
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
  draft: "bg-gray-600/20 text-gray-300",
  active: "bg-green-600/20 text-green-300",
  completed: "bg-blue-600/20 text-blue-300",
  archived: "bg-purple-600/20 text-purple-300",
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
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
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Giải đấu</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Quản lý các giải đấu · {tournaments.length} giải
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => void fetchTournaments()}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            title="Làm mới"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={15} /> Tạo giải đấu
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {tournaments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center">
          <Trophy size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 text-sm mb-4">Chưa có giải đấu nào</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Tạo giải đấu đầu tiên
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/5 hover:border-white/20 transition-colors"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() =>
                  navigate(`/admin/tournaments/${tournament.tournamentCode}`)
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white truncate">
                    {tournament.tournamentName}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[tournament.status] || "bg-gray-600/20 text-gray-300"}`}
                  >
                    {STATUS_LABELS[tournament.status] || tournament.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
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
                  <p className="text-gray-500 text-xs mt-1 truncate">
                    {tournament.description}
                  </p>
                )}
              </div>

              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() =>
                    navigate(`/admin/tournaments/${tournament.tournamentCode}/edit`)
                  }
                  className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                  title="Sửa"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => void handleDelete(tournament.tournamentCode)}
                  className="p-2 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Xóa"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TournamentListPage;
