import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Network,
  ListChecks,
  GitBranch,
} from "lucide-react";
import { API_BASE_URL } from "@/configs";
import TournamentBracket from "@/components/admin/TournamentBracket";
import QualifierManager from "@/components/admin/QualifierManager";
import GroupStageManager from "@/components/admin/GroupStageManager";
import {
  TournamentFormPanel,
  type TournamentFormValue,
} from "@/components/admin/TournamentFormPanel";

interface Tournament {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  status: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"qualifier" | "groups" | "playoffs">("qualifier");
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadTournament = React.useCallback(async () => {
    if (!code) return;
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
      }
    } finally {
      setIsLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void loadTournament();
  }, [loadTournament]);

  const handleSaveEdit = async (v: TournamentFormValue) => {
    if (!code) return;
    if (!v.tournamentName.trim()) {
      setEditError("Tên giải đấu là bắt buộc");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/tournaments/${code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(v),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Failed to save tournament");
      }
      setShowEdit(false);
      await loadTournament();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save tournament");
    } finally {
      setSavingEdit(false);
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
      <TournamentFormPanel
        open={showEdit}
        initial={(tournament as unknown as TournamentFormValue | null) ?? null}
        saving={savingEdit}
        error={editError}
        onClose={() => {
          setShowEdit(false);
          setEditError(null);
        }}
        onSubmit={handleSaveEdit}
      />
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
          onClick={() => setShowEdit(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors touch-target"
        >
          <Edit size={16} />
          <span className="hidden sm:inline">Chỉnh sửa</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-white/5 border border-white/10 w-fit max-w-full overflow-x-auto">
        <button
          onClick={() => setTab("qualifier")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            tab === "qualifier" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <ListChecks size={15} /> Vòng loại
        </button>
        <button
          onClick={() => setTab("groups")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            tab === "groups" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <GitBranch size={15} /> Vòng phân nhánh
        </button>
        <button
          onClick={() => setTab("playoffs")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            tab === "playoffs" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Network size={15} /> Playoffs & Chung kết
        </button>
      </div>

      {tab === "qualifier" ? (
        <QualifierManager tournamentCode={code ?? ""} />
      ) : tab === "groups" ? (
        <GroupStageManager tournamentCode={code ?? ""} tournamentName={tournament.tournamentName} />
      ) : (
        <TournamentBracket tournamentCode={code ?? ""} />
      )}
    </div>
  );
};

export default TournamentDetailPage;
