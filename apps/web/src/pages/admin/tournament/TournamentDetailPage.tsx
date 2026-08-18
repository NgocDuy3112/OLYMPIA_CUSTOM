import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  ArrowLeft,
  Edit,
  Users,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  Trophy,
  Loader2,
  UserPlus,
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
  notes?: string;
  createdAt: string;
}

interface TournamentPlayer {
  id: string;
  userCode: string;
  userName: string;
  userId: string;
  email?: string;
  groupNumber?: string;
  notes?: string;
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

const TournamentDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add player form
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerUserCode, setPlayerUserCode] = useState("");
  const [playerGroup, setPlayerGroup] = useState("");
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  useEffect(() => {
    if (!code) return;

    const fetchTournament = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tournaments/${code}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Tournament not found");
        }

        const data = await response.json();
        if (data.status === "success" && data.data) {
          setTournament(data.data);
          setPlayers(data.data.players || []);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tournament",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournament();
  }, [code]);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!playerUserCode.trim()) {
      setError("Mã thí sinh là bắt buộc");
      return;
    }

    setIsAddingPlayer(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${code}/players`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            userCode: playerUserCode.trim(),
            groupNumber: playerGroup.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to add player");
      }

      // Refresh tournament data
      const refreshResponse = await fetch(
        `${API_BASE_URL}/tournaments/${code}`,
        {
          credentials: "include",
        },
      );
      const refreshData = await refreshResponse.json();
      if (refreshData.status === "success" && refreshData.data) {
        setPlayers(refreshData.data.players || []);
      }

      setPlayerUserCode("");
      setPlayerGroup("");
      setShowAddPlayer(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const handleRemovePlayer = async (userCode: string) => {
    if (
      !confirm(`Bạn có chắc chắn muốn xóa thí sinh ${userCode} khỏi giải đấu?`)
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${code}/players/${userCode}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (response.ok) {
        setPlayers((prev) => prev.filter((p) => p.userCode !== userCode));
      }
    } catch (err) {
      console.error("Failed to remove player:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-400">Không tìm thấy giải đấu</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin/tournaments")}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
              {tournament.tournamentName}
            </h1>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[tournament.status] || "bg-gray-500"}`}
            >
              {STATUS_LABELS[tournament.status] || tournament.status}
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            {tournament.tournamentCode}
          </p>
        </div>
        <button
          onClick={() => navigate(`/admin/tournaments/${code}/edit`)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors touch-target"
        >
          <Edit size={16} />
          <span className="hidden sm:inline">Chỉnh sửa</span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tournament info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info card */}
          <div className="card !p-6">
            <h2 className="text-lg font-bold text-white mb-4">
              Thông tin giải đấu
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-300">
                <Trophy size={16} className="text-blue-400" />
                <span>Format: {tournament.tournamentFormat.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Calendar size={16} className="text-blue-400" />
                <span>
                  {tournament.startDate || "Chưa đặt"} -{" "}
                  {tournament.endDate || "Chưa đặt"}
                </span>
              </div>
              {tournament.venue && (
                <div className="flex items-center gap-2 text-gray-300">
                  <MapPin size={16} className="text-blue-400" />
                  <span>{tournament.venue}</span>
                </div>
              )}
              {tournament.maxPlayers && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Users size={16} className="text-blue-400" />
                  <span>Tối đa {tournament.maxPlayers} thí sinh</span>
                </div>
              )}
            </div>

            {tournament.description && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-gray-300 text-sm">
                  {tournament.description}
                </p>
              </div>
            )}

            {tournament.notes && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-gray-400 text-xs">
                  Ghi chú: {tournament.notes}
                </p>
              </div>
            )}
          </div>

          {/* Players list */}
          <div className="card !p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                Thí sinh ({players.length})
              </h2>
              <button
                onClick={() => setShowAddPlayer(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm touch-target"
              >
                <UserPlus size={16} />
                <span>Thêm thí sinh</span>
              </button>
            </div>

            {/* Add player form */}
            {showAddPlayer && (
              <form
                onSubmit={handleAddPlayer}
                className="mb-4 p-4 bg-white/5 rounded-lg"
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={playerUserCode}
                    onChange={(e) => setPlayerUserCode(e.target.value)}
                    placeholder="Mã thí sinh (VD: OC_U_001)"
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                  <input
                    type="text"
                    value={playerGroup}
                    onChange={(e) => setPlayerGroup(e.target.value)}
                    placeholder="Nhóm (tùy chọn)"
                    className="w-full sm:w-32 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isAddingPlayer}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {isAddingPlayer ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                      <span>Thêm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddPlayer(false);
                        setPlayerUserCode("");
                        setPlayerGroup("");
                      }}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Players table */}
            {players.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                <p>Chưa có thí sinh nào</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">
                        #
                      </th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">
                        Mã
                      </th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">
                        Tên
                      </th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium hidden sm:table-cell">
                        Email
                      </th>
                      <th className="text-left py-2 px-3 text-gray-400 font-medium">
                        Nhóm
                      </th>
                      <th className="text-right py-2 px-3 text-gray-400 font-medium">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => (
                      <tr
                        key={player.id}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="py-2 px-3 text-gray-400">{index + 1}</td>
                        <td className="py-2 px-3 text-white font-mono">
                          {player.userCode}
                        </td>
                        <td className="py-2 px-3 text-white">
                          {player.userName}
                        </td>
                        <td className="py-2 px-3 text-gray-400 hidden sm:table-cell">
                          {player.email || "-"}
                        </td>
                        <td className="py-2 px-3 text-gray-300">
                          {player.groupNumber || "-"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleRemovePlayer(player.userCode)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                            title="Xóa thí sinh"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="card !p-6">
            <h2 className="text-lg font-bold text-white mb-4">
              Thao tác nhanh
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => navigate(`/admin/tournaments/${code}/edit`)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
              >
                <Edit size={18} />
                <span>Chỉnh sửa thông tin</span>
              </button>
              <button
                onClick={() => setShowAddPlayer(true)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors"
              >
                <UserPlus size={18} />
                <span>Thêm thí sinh</span>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="card !p-6">
            <h2 className="text-lg font-bold text-white mb-4">Thống kê</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Số thí sinh:</span>
                <span className="font-bold text-white">{players.length}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Số nhóm:</span>
                <span className="font-bold text-white">
                  {
                    new Set(
                      players
                        .filter((p) => p.groupNumber)
                        .map((p) => p.groupNumber),
                    ).size
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TournamentDetailPage;
