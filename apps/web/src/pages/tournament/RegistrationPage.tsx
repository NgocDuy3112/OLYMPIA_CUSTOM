import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Trophy,
  Calendar,
  MapPin,
  Users,
  CheckCircle,
  Loader2,
  UserPlus,
} from "lucide-react";
import { PublicLayout } from "@/components/layout";
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

const itemVariants: Variants = {
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

const slideInFromRight: Variants = {
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

const scaleUp: Variants = {
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
  const [myMembership, setMyMembership] = useState<MyMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

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

        // Check user membership
        try {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center p-4">
          <Card className="text-center">
            <p className="text-gray-400 mb-4">Không tìm thấy giải đấu</p>
            <Button onClick={() => navigate("/")}>Về trang chủ</Button>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  // Already registered
  if (myMembership) {
    return (
      <PublicLayout>
        <main className="flex items-center justify-center p-4">
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
      </PublicLayout>
    );
  }

  // Success state
  if (showSuccess) {
    return (
      <PublicLayout>
        <main className="flex items-center justify-center p-4">
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
      </PublicLayout>
    );
  }

  // Registration form
  const renderStepContent = () => {
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
  };

  return (
    <PublicLayout>
      <main className="p-4 sm:p-6">
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

          <AnimatePresence mode="wait">
            {renderStepContent()}
          </AnimatePresence>
        </div>
      </main>
    </PublicLayout>
  );
};

export default RegistrationPage;
