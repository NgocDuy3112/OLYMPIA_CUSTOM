import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  Plus,
  Calendar,
  MapPin,
  Users,
  Trophy,
  Trash2,
  Edit,
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  active: "bg-green-500",
  completed: "bg-blue-500",
  archived: "bg-purple-500",
};

const TournamentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTournaments = async () => {
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
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            Giải Đấu
          </h1>
          <p className="text-gray-400 text-sm mt-1">Quản lý các giải đấu</p>
        </div>
        <button
          onClick={() => navigate("/admin/tournaments/create")}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors touch-target"
        >
          <Plus size={18} />
          <span>Tạo giải đấu mới</span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tournament list */}
      {tournaments.length === 0 ? (
        <div className="card text-center py-12">
          <Trophy size={48} className="mx-auto text-gray-500 mb-4" />
          <p className="text-gray-400 mb-4">Chưa có giải đấu nào</p>
          <button
            onClick={() => navigate("/admin/tournaments/create")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Tạo giải đấu đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="card !p-4 sm:!p-6 hover:border-blue-500 transition-colors"
            >
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                {/* Tournament info */}
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() =>
                    navigate(`/admin/tournaments/${tournament.tournamentCode}`)
                  }
                >
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                      {tournament.tournamentName}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[tournament.status] || "bg-gray-500"}`}
                    >
                      {STATUS_LABELS[tournament.status] || tournament.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <Trophy size={14} />
                      {tournament.tournamentCode}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {tournament.startDate || "Chưa đặt"} -{" "}
                      {tournament.endDate || "Chưa đặt"}
                    </span>
                    {tournament.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin size={14} />
                        {tournament.venue}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {tournament.tournamentFormat.toUpperCase()}
                    </span>
                  </div>

                  {tournament.description && (
                    <p className="text-gray-400 text-sm mt-2 line-clamp-2">
                      {tournament.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() =>
                      navigate(
                        `/admin/tournaments/${tournament.tournamentCode}/edit`,
                      )
                    }
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm touch-target"
                  >
                    <Edit size={16} />
                    <span className="hidden sm:inline">Sửa</span>
                  </button>
                  <button
                    onClick={() => handleDelete(tournament.tournamentCode)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm touch-target"
                  >
                    <Trash2 size={16} />
                    <span className="hidden sm:inline">Xóa</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TournamentListPage;
