import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Network,
  ListChecks,
  GitBranch,
} from "lucide-react";
import { apiCall, apiGet } from "@/api/client";
import TournamentBracket from "@/components/admin/TournamentBracket";
import QualifierManager from "@/components/admin/QualifierManager";
import GroupStageManager from "@/components/admin/GroupStageManager";
import { Button } from "@/components/ui/button";
import {
  TournamentFormSidePanel,
  type TournamentFormValue,
} from "@/components/admin/TournamentFormSidePanel";

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
  draft: "bg-muted-foreground",
  active: "bg-success",
  completed: "bg-primary",
  archived: "bg-purple",
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
      const data = await apiGet<Tournament>(`/tournaments/${code}`);
      if (data.data) {
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
      await apiCall(`/tournaments/${code}`, {
        method: "PUT",
        body: JSON.stringify(v),
      });
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
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-muted-foreground">Không tìm thấy giải đấu</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <TournamentFormSidePanel
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
      {}
      <div className="flex items-center gap-4 mb-6">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate("/admin/tournaments")}
          className="hover:bg-accent"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
              {tournament.tournamentName}
            </h1>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium text-foreground ${STATUS_COLORS[tournament.status] || "bg-muted-foreground"}`}
            >
              {STATUS_LABELS[tournament.status] || tournament.status}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {tournament.tournamentCode}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowEdit(true)}
          className="gap-2 bg-accent hover:bg-accent/80 text-foreground touch-target"
        >
          <Edit size={16} />
          <span className="hidden sm:inline">Chỉnh sửa</span>
        </Button>
      </div>

      {}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-accent/50 border border-border w-fit max-w-full overflow-x-auto">
        <Button
          variant="ghost"
          onClick={() => setTab("qualifier")}
          className={`gap-1.5 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap ${
            tab === "qualifier" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListChecks size={15} /> Vòng loại
        </Button>
        <Button
          variant="ghost"
          onClick={() => setTab("groups")}
          className={`gap-1.5 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap ${
            tab === "groups" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitBranch size={15} /> Vòng phân nhánh
        </Button>
        <Button
          variant="ghost"
          onClick={() => setTab("playoffs")}
          className={`gap-1.5 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap ${
            tab === "playoffs" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Network size={15} /> Playoffs & Chung kết
        </Button>
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
