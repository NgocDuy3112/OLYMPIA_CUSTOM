import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle,
  UserPlus,
  BookOpen,
  Calendar,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { apiGet } from "@/api/client";
import {
  PublicLayout,
  TabNavigation,
} from "@/components/layout";
import { PlayerGrid, MatchCard, StandingsTable, RoleManager } from "@/components/tournament";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TournamentStatusBadge } from "@/components/shared/StatusBadges";

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
  role?: string;
  groupNumber?: string;
  notes?: string;
}

interface TournamentMatch {
  id: string;
  matchSlug: string;
  matchPin: string;
  matchName: string;
  matchStatus: string;
  tournamentFormat: string;
  videoUrl?: string;
  createdAt: string;
}

interface MyMembership {
  role: string;
  groupNumber?: string;
}

const TOURNAMENT_TABS = [
  { label: "Tổng quan", path: "" },
  { label: "Kết quả", path: "/standings" },
  { label: "Thí sinh", path: "/players" },
  { label: "Luật chơi", path: "/rules" },
];

const TournamentDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [myMembership, setMyMembership] = useState<MyMembership | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const fetchData = async () => {
      try {
        const tournamentData = await apiGet<
          Tournament & {
            players?: TournamentPlayer[];
            matches?: TournamentMatch[];
          }
        >(`/tournaments/${code}`);
        if (tournamentData.data) {
          setTournament(tournamentData.data);
          setPlayers(tournamentData.data.players || []);
          setMatches(tournamentData.data.matches || []);
        }

        try {
          const standingsData = await apiGet<{ standings?: any[] }>(
            `/tournaments/${code}/standings`,
          );
          if (standingsData.data) {
            setStandings(standingsData.data.standings || []);
          }
        } catch {
        }

        try {
          const meData = await apiGet<MyMembership>(`/tournaments/${code}/me`);
          setIsAuthenticated(true);
          setMyMembership(meData.data);
        } catch {
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tournament",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [code]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-12" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <PublicLayout>
        <div className="flex justify-center items-center p-4">
          <div className="card text-center w-full max-w-md">
            <p className="text-muted-foreground mb-4">Không tìm thấy giải đấu</p>
            <Button onClick={() => navigate("/")}>Về trang chủ</Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
        <div className="max-w-4xl mx-auto">
          {}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                {tournament.tournamentName}
              </h1>
              <TournamentStatusBadge status={tournament.status} />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Trophy size={14} className="text-brand" />
                {tournament.tournamentFormat.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={14} className="text-brand" />
                {tournament.startDate || "Chưa đặt"} -{" "}
                {tournament.endDate || "Chưa đặt"}
              </span>
              {tournament.venue && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} className="text-brand" />
                  {tournament.venue}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={14} className="text-brand" />
                {players.length} thí sinh
              </span>
            </div>
          </div>

          {}
          {error && (
            <div className="mb-4 p-3 bg-destructive/20 border border-destructive rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          {}
          {myMembership && (
            <div className="mb-4 p-3 bg-success/20 border border-success rounded-lg flex items-center gap-2">
              <CheckCircle size={16} className="text-success" />
              <span className="text-success">
                Bạn là:{" "}
                <span className="font-bold">
                  {myMembership.role === "operator"
                    ? "Điều hành"
                    : myMembership.role === "player"
                      ? "Thí sinh"
                      : "Khán giả"}
                </span>
              </span>
              {myMembership.groupNumber && (
                <span className="text-success/70">
                  · Nhóm {myMembership.groupNumber}
                </span>
              )}
            </div>
          )}

          {}
          <TabNavigation tabs={TOURNAMENT_TABS} basepath={`/tournament/${code}`} />

          {}
          <div className="py-6 space-y-6">
            {activeTab === "standings" ? (
              <Card className="px-4">
                <h2 className="text-lg font-bold text-foreground mb-4">
                  Bảng xếp hạng
                </h2>
                <StandingsTable
                  standings={standings.map((s) => ({
                    rank: s.rank,
                    userId: s.playerId,
                    userName: s.userName,
                    score: s.totalPoints,
                    matchesPlayed: s.matchesPlayed,
                  }))}
                />
              </Card>
            ) : (
              <>
                {}
                {tournament.description && (
                  <Card className="px-4">
                    <h2 className="text-lg font-bold text-foreground mb-3">Giới thiệu</h2>
                    <p className="text-foreground/80 text-sm leading-relaxed">
                      {tournament.description}
                    </p>
                  </Card>
                )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {}
              <div className="lg:col-span-2 space-y-6">
                {}
                <Card className="px-4">
                  <h2 className="text-lg font-bold text-foreground mb-4">
                    Trận đấu ({matches.length})
                  </h2>
                  {matches.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Chưa có trận đấu nào</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          {...match}
                          onWatch={() =>
                            navigate(
                              `/tournament/${code}/match/${match.matchSlug}`,
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </Card>

                {}
                <Card className="px-4">
                  <h2 className="text-lg font-bold text-foreground mb-4">
                    Danh sách thí sinh ({players.length})
                  </h2>
                  <PlayerGrid players={players} />
                  
                  {}
                  {(myMembership?.role === "operator" ||
                    myMembership?.role === "controller") && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <RoleManager
                        tournamentCode={tournament.tournamentCode}
                        players={players}
                        isController={true}
                        onRoleUpdated={(userId: string, newRole: string) => {
                          setPlayers(prev =>
                            prev.map(p =>
                              p.userId === userId ? { ...p, role: newRole } : p
                            )
                          );
                        }}
                      />
                    </div>
                  )}
                </Card>
              </div>

              {}
              <div className="space-y-6">
                {}
                <Card className="px-4">
                  <h2 className="text-lg font-bold text-foreground mb-4">Tham gia</h2>
                  {!isAuthenticated ? (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">
                        Đăng nhập để đăng ký tham gia giải đấu
                      </p>
                      <Button
                        className="w-full"
                        onClick={() => navigate("/login")}
                      >
                        Đăng nhập
                      </Button>
                    </div>
                  ) : myMembership ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-success">
                        <CheckCircle size={18} />
                        <span>Bạn đã đăng ký</span>
                      </div>
                      {(myMembership.role === "player" ||
                        myMembership.role === "operator") && (
                        <Button
                          className="w-full bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => navigate("/")}
                        >
                          Vào sảnh thi đấu
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">
                        Đăng ký để tham gia giải đấu này
                      </p>
                      <Button
                        className="w-full"
                        onClick={() => navigate(`/tournament/${code}/register`)}
                      >
                        <UserPlus size={18} />
                        Đăng ký tham gia
                      </Button>
                    </div>
                  )}
                </Card>

                {}
                <Card className="px-4">
                  <h2 className="text-lg font-bold text-foreground mb-4">Liên kết</h2>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => navigate(`/tournament/${code}/rules`)}
                  >
                    <BookOpen size={18} />
                    Luật chơi
                  </Button>
                </Card>

                {}
                <Card className="px-4">
                  <h2 className="text-lg font-bold text-foreground mb-4">Thống kê</h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-foreground/80">
                      <span>Số thí sinh:</span>
                      <span className="font-bold text-foreground">
                        {players.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-foreground/80">
                      <span>Số trận đấu:</span>
                      <span className="font-bold text-foreground">
                        {matches.length}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </>
          )}
          </div>
        </div>
    </PublicLayout>
  );
};

export default TournamentDetailPage;
