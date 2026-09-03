import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Calendar,
  MapPin,
  Users,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Plus,
  UserPlus,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layout";
import { Button, Card, TournamentStatusBadge } from "@/components/shared/ui";

interface Tournament {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  description?: string;
  tournamentFormat: string;
  startDate?: string;
  endDate?: string;
  status: string;
  venue?: string;
  config?: {
    type: string;
    playersPerTeam?: number;
    teamsPerMatch?: number;
  };
}

interface Team {
  id: string;
  teamName: string;
  teamCode: string;
  members: Array<{
    id: string;
    userName: string;
    userCode: string;
  }>;
}

interface MyMembership {
  role: string;
  groupNumber?: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

const slideInFromRight = {
  hidden: { opacity: 0, x: 100 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    x: -100,
    transition: {
      duration: 0.3,
    },
  },
};

const scaleUp = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "backOut",
    },
  },
};

const RegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myMembership, setMyMembership] = useState<MyMembership | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCode, setNewTeamCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const isTeamFormat = tournament?.config?.type === "team";

  useEffect(() => {
    if (!code) return;

    const fetchData = async () => {
      try {
        // Fetch tournament
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
        }

        // Fetch teams if team format
        if (tournamentData.data?.config?.type === "team") {
          const teamsResponse = await fetch(
            `${API_BASE_URL}/tournaments/${code}/teams`,
            { credentials: "include" },
          );
          if (teamsResponse.ok) {
            const teamsData = await teamsResponse.json();
            if (teamsData.status === "success") {
              setTeams(teamsData.data || []);
            }
          }
        }

        // Check user membership
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

  const handleRegisterIndividual = async () => {
    if (!code) return;

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

      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRegisterTeam = async () => {
    if (!code || !selectedTeamId) return;

    setIsRegistering(true);
    setError(null);

    try {
      // Join existing team
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${code}/teams/${selectedTeamId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userCode: myMembership?.role }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to join team");
      }

      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join team");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!code || !newTeamName || !newTeamCode) return;

    setIsRegistering(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${code}/teams`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            teamName: newTeamName,
            teamCode: newTeamCode.toUpperCase(),
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to create team");
      }

      const data = await response.json();
      if (data.status === "success" && data.data) {
        // Auto-join the created team
        setSelectedTeamId(data.data.id);
        setCurrentStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setIsRegistering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="text-center">
            <p className="text-gray-400 mb-4">Không tìm thấy giải đấu</p>
            <Button onClick={() => navigate("/")}>Về trang chủ</Button>
          </Card>
        </div>
        <PublicFooter />
      </div>
    );
  }

  // Already registered
  if (myMembership) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader isAuthenticated={isAuthenticated} />
        <main className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleUp}
            className="w-full max-w-md"
          >
            <Card className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle size={32} className="text-green-400" />
              </motion.div>
              <h2 className="text-xl font-bold text-white mb-2">
                Bạn đã đăng ký rồi!
              </h2>
              <p className="text-gray-400 mb-6">
                Bạn đã đăng ký tham gia giải đấu này.
              </p>
              <Button onClick={() => navigate(`/tournament/${code}`)}>
                Xem giải đấu
              </Button>
            </Card>
          </motion.div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  // Success state
  if (showSuccess) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicHeader isAuthenticated={isAuthenticated} />
        <main className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleUp}
            className="w-full max-w-md"
          >
            <Card className="text-center">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle size={32} className="text-green-400" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl font-bold text-white mb-2"
              >
                Đăng ký thành công!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-gray-400 mb-6"
              >
                Bạn đã đăng ký tham gia giải đấu {tournament.tournamentName}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="flex gap-3 justify-center"
              >
                <Button onClick={() => navigate(`/tournament/${code}`)}>
                  Xem giải đấu
                </Button>
                <Button variant="secondary" onClick={() => navigate("/")}>
                  Về trang chủ
                </Button>
              </motion.div>
            </Card>
          </motion.div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  // Registration form
  const renderStepContent = () => {
    if (!isTeamFormat) {
      // Individual registration
      return (
        <motion.div
          key="individual"
          variants={slideInFromRight}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <Card>
            <h3 className="text-lg font-bold text-white mb-4">
              Đăng ký cá nhân
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Bạn sẽ tham gia thi đấu với tư cách cá nhân.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
                {error}
              </div>
            )}

            <Button
              fullWidth
              isLoading={isRegistering}
              onClick={handleRegisterIndividual}
              leftIcon={<UserPlus size={18} />}
            >
              Đăng ký tham gia
            </Button>
          </Card>
        </motion.div>
      );
    }

    // Team registration steps
    switch (currentStep) {
      case 0:
        return (
          <motion.div
            key="step0"
            variants={slideInFromRight}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Card>
              <h3 className="text-lg font-bold text-white mb-4">
                Chọn cách tham gia
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/20 hover:border-blue-500 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Plus size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Tạo team mới
                      </div>
                      <div className="text-sm text-gray-400">
                        Tạo team và mời người khác tham gia
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setCurrentStep(2)}
                  className="w-full p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/20 hover:border-purple-500 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Users size={20} className="text-purple-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Tham gia team có sẵn
                      </div>
                      <div className="text-sm text-gray-400">
                        Chọn team đã tồn tại để tham gia
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </Card>
          </motion.div>
        );

      case 1:
        return (
          <motion.div
            key="step1"
            variants={slideInFromRight}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Card>
              <h3 className="text-lg font-bold text-white mb-4">
                Tạo team mới
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Tên team
                  </label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="VD: Team Alpha"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Mã team (viết hoa, không dấu)
                  </label>
                  <input
                    type="text"
                    value={newTeamCode}
                    onChange={(e) =>
                      setNewTeamCode(e.target.value.toUpperCase())
                    }
                    placeholder="VD: TEAM_ALPHA"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentStep(0)}
                    leftIcon={<ArrowLeft size={16} />}
                  >
                    Quay lại
                  </Button>
                  <Button
                    fullWidth
                    isLoading={isRegistering}
                    onClick={handleCreateTeam}
                    disabled={!newTeamName || !newTeamCode}
                    rightIcon={<ArrowRight size={16} />}
                  >
                    Tạo team
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            variants={slideInFromRight}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Card>
              <h3 className="text-lg font-bold text-white mb-4">
                Chọn team
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
                  {error}
                </div>
              )}

              {teams.length === 0 ? (
                <p className="text-gray-400 text-center py-4">
                  Chưa có team nào. Hãy tạo team mới.
                </p>
              ) : (
                <div className="space-y-3 mb-4">
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`
                        w-full p-4 rounded-lg border transition-all text-left
                        ${
                          selectedTeamId === team.id
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-white/20 hover:border-white/40 bg-white/5"
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">
                            {team.teamName}
                          </div>
                          <div className="text-sm text-gray-400">
                            {team.teamCode} • {team.members.length} thành viên
                          </div>
                        </div>
                        {selectedTeamId === team.id && (
                          <CheckCircle size={20} className="text-blue-400" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setCurrentStep(0)}
                  leftIcon={<ArrowLeft size={16} />}
                >
                  Quay lại
                </Button>
                <Button
                  fullWidth
                  isLoading={isRegistering}
                  onClick={handleRegisterTeam}
                  disabled={!selectedTeamId}
                >
                  Tham gia team
                </Button>
              </div>
            </Card>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader isAuthenticated={isAuthenticated} />

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="text-center mb-8"
          >
            <motion.div variants={itemVariants}>
              <Trophy size={48} className="text-yellow-400 mx-auto mb-4" />
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-3xl sm:text-4xl font-bold text-white mb-2"
            >
              {tournament.tournamentName}
            </motion.h1>

            <motion.div variants={itemVariants} className="mb-4">
              <TournamentStatusBadge status={tournament.status} />
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-400"
            >
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
                {tournament.tournamentFormat.toUpperCase()}
              </span>
            </motion.div>

            {tournament.description && (
              <motion.p
                variants={itemVariants}
                className="mt-4 text-gray-400 max-w-lg mx-auto"
              >
                {tournament.description}
              </motion.p>
            )}
          </motion.div>

          {/* Registration Form */}
          <AnimatePresence mode="wait">
            {renderStepContent()}
          </AnimatePresence>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default RegistrationPage;
