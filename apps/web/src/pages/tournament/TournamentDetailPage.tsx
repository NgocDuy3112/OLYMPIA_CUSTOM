import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import {
  PublicHeader,
  PublicFooter,
  TabNavigation,
} from "@/components/layout";
import { PlayerGrid, MatchCard, StandingsTable } from "@/components/tournament";
import {
  Button,
  Card,
  TournamentStatusBadge,
  PageLoading,
  CheckCircle,
  Loader2,
  UserPlus,
  BookOpen,
  Calendar,
  MapPin,
  Trophy,
  Users,
} from "@/components/shared/ui";

interface Tournament {
  id: string;
  tournamentCode: string;
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
  const { code } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [myMembership, setMyMembership] = useState<MyMembership | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchData = async () => {
      try {
        // Fetch tournament details
        const tournamentResponse = await fetch(
          `${API_BASE_URL}/tournaments/${code}`,
          { credentials: "include" },
        );

        if (!tournamentResponse.ok) {
          throw new Error("Tournament not found");
        }

        const tournamentData = await tournamentResponse.json();
        if (tournamentData.status === "success" && tournamentData.data) {
          setTournament(tournamentData.data);
          setPlayers(tournamentData.data.players || []);
          setMatches(tournamentData.data.matches || []);
        }

        // Fetch standings
        try {
          const standingsResponse = await fetch(
            `${API_BASE_URL}/tournaments/${code}/standings`,
            { credentials: "include" },
          );
          if (standingsResponse.ok) {
            const standingsData = await standingsResponse.json();
            if (standingsData.status === "success" && standingsData.data) {
              setStandings(standingsData.data.standings || []);
            }
          }
        } catch {
          // Ignore standings fetch error
        }

        // Try to fetch user's membership
        try {
          const meResponse = await fetch(
            `${API_BASE_URL}/tournaments/${code}/me`,
            { credentials: "include" },
          );

          if (meResponse.ok) {
            const meData = await meResponse.json();
            if (meData.status === "success") {
              setIsAuthenticated(true);
              setMyMembership(meData.data);
            }
          }
        } catch {
          // Not authenticated
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

  const handleRegister = async () => {
    if (!slug) return;

    setIsRegistering(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${code}/register`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to register");
      }

      // Refresh membership
      const meResponse = await fetch(
        `${API_BASE_URL}/tournaments/${code}/me`,
        { credentials: "include" },
      );
      if (meResponse.ok) {
        const meData = await meResponse.json();
        if (meData.status === "success") {
          setMyMembership(meData.data);
        }
      }

      // Refresh players list
      const tournamentResponse = await fetch(
        `${API_BASE_URL}/tournaments/${code}`,
        { credentials: "include" },
      );
      if (tournamentResponse.ok) {
        const tournamentData = await tournamentResponse.json();
        if (tournamentData.status === "success" && tournamentData.data) {
          setPlayers(tournamentData.data.players || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setIsRegistering(false);
    }
  };

  if (isLoading) {
    return <PageLoading />;
  }

  if (!tournament) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader />
        <div className="flex-1 flex justify-center items-center p-4">
          <div className="card text-center w-full max-w-md">
            <p className="text-gray-400 mb-4">Không tìm thấy giải đấu</p>
            <Button onClick={() => navigate("/")}>Về trang chủ</Button>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader isAuthenticated={isAuthenticated} />

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl sm:text-4xl font-bold text-white">
                {tournament.tournamentName}
              </h1>
              <TournamentStatusBadge status={tournament.status} />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <Trophy size={14} className="text-blue-400" />
                {tournament.tournamentFormat.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={14} className="text-blue-400" />
                {tournament.startDate || "Chưa đặt"} -{" "}
                {tournament.endDate || "Chưa đặt"}
              </span>
              {tournament.venue && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} className="text-blue-400" />
                  {tournament.venue}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={14} className="text-blue-400" />
                {players.length} thí sinh
              </span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* My role badge */}
          {myMembership && (
            <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-green-300">
                Bạn là:{" "}
                <span className="font-bold">
                  {myMembership.role === "controller"
                    ? "Điều hành"
                    : myMembership.role === "mc"
                      ? "MC"
                      : myMembership.role === "player"
                        ? "Thí sinh"
                        : "Khán giả"}
                </span>
              </span>
              {myMembership.groupNumber && (
                <span className="text-green-400/70">
                  · Nhóm {myMembership.groupNumber}
                </span>
              )}
            </div>
          )}

          {/* Tabs */}
          <TabNavigation tabs={TOURNAMENT_TABS} basepath={`/tournament/${code}`} />

          {/* Tab Content */}
          <div className="py-6 space-y-6">
            {activeTab === "standings" ? (
              /* Standings Tab */
              <Card>
                <h2 className="text-lg font-bold text-white mb-4">
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
              /* Overview Tab */
              <>
                {/* Description */}
                {tournament.description && (
                  <Card>
                    <h2 className="text-lg font-bold text-white mb-3">Giới thiệu</h2>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {tournament.description}
                    </p>
                  </Card>
                )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Matches */}
                <Card>
                  <h2 className="text-lg font-bold text-white mb-4">
                    Trận đấu ({matches.length})
                  </h2>
                  {matches.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
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
                              `/tournament/${slug}/match/${match.matchSlug}`,
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </Card>

                {/* Players */}
                <Card>
                  <h2 className="text-lg font-bold text-white mb-4">
                    Danh sách thí sinh ({players.length})
                  </h2>
                  <PlayerGrid players={players} />
                  
                  {/* Role Manager - only visible to controllers */}
                  {myMembership?.role === "controller" && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <RoleManager
                        tournamentCode={tournament.tournamentCode}
                        players={players}
                        isController={true}
                        onRoleUpdated={(userId, newRole) => {
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

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Register / Actions */}
                <Card>
                  <h2 className="text-lg font-bold text-white mb-4">Tham gia</h2>
                  {!isAuthenticated ? (
                    <div className="space-y-3">
                      <p className="text-gray-400 text-sm">
                        Đăng nhập để đăng ký tham gia giải đấu
                      </p>
                      <Button
                        fullWidth
                        onClick={() => navigate("/login")}
                      >
                        Đăng nhập
                      </Button>
                    </div>
                  ) : myMembership ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle size={18} />
                        <span>Bạn đã đăng ký</span>
                      </div>
                      {(myMembership.role === "player" ||
                        myMembership.role === "controller" ||
                        myMembership.role === "mc") && (
                        <Button
                          fullWidth
                          variant="success"
                          onClick={() => navigate("/")}
                        >
                          Vào sảnh thi đấu
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-gray-400 text-sm">
                        Đăng ký để tham gia giải đấu này
                      </p>
                      <Button
                        fullWidth
                        leftIcon={<UserPlus size={18} />}
                        onClick={() => navigate(`/tournament/${code}/register`)}
                      >
                        Đăng ký tham gia
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Quick links */}
                <Card>
                  <h2 className="text-lg font-bold text-white mb-4">Liên kết</h2>
                  <Button
                    fullWidth
                    variant="secondary"
                    leftIcon={<BookOpen size={18} />}
                    onClick={() => navigate(`/tournament/${code}/rules`)}
                  >
                    Luật chơi
                  </Button>
                </Card>

                {/* Stats */}
                <Card>
                  <h2 className="text-lg font-bold text-white mb-4">Thống kê</h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-300">
                      <span>Số thí sinh:</span>
                      <span className="font-bold text-white">
                        {players.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Số trận đấu:</span>
                      <span className="font-bold text-white">
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
      </main>

      <PublicFooter />
    </div>
  );
};

export default TournamentDetailPage;
