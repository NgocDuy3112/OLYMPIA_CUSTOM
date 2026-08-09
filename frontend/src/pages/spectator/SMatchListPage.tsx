import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { Trophy, Clock, ExternalLink, LogIn } from "lucide-react";

interface Match {
  id: string;
  matchCode: string;
  matchName: string;
  matchStatus: string;
  createdAt: string;
  videoUrl?: string;
}

const STATUS_LABELS: Record<string, string> = {
  setup: "Chuẩn bị",
  open: "Đang diễn ra",
  ended: "Đã kết thúc",
  finished: "Hoàn thành",
};

const STATUS_COLORS: Record<string, string> = {
  setup: "bg-gray-500",
  open: "bg-green-500",
  ended: "bg-yellow-500",
  finished: "bg-blue-500",
};

const SMatchListPage: React.FC = () => {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/matches`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch matches");
        }

        const data = await response.json();
        if (data.status === "success" && data.data) {
          setMatches(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load matches");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, []);

  const handleWatchLive = (matchCode: string) => {
    navigate(`/spectator/live/${matchCode}`);
  };

  const handleWatchReplay = (matchCode: string) => {
    navigate(`/spectator/replay/${matchCode}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <div className="card text-center w-full max-w-md">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">OLYMPIA CUSTOM</h1>
          <p className="text-blue-300 text-sm sm:text-base mb-4">Xem trận đấu</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <LogIn size={16} />
            Đăng nhập để tham gia
          </a>
        </div>

        {/* Match List */}
        {matches.length === 0 ? (
          <div className="card text-center">
            <p className="text-gray-400">Chưa có trận đấu nào</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="card !p-4 sm:!p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* Match Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                      {match.matchName}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[match.matchStatus] || "bg-gray-500"}`}
                    >
                      {STATUS_LABELS[match.matchStatus] || match.matchStatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <Trophy size={14} />
                      {match.matchCode}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(match.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 w-full sm:w-auto">
                  {match.matchStatus === "open" && (
                    <button
                      onClick={() => handleWatchLive(match.matchCode)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors touch-target"
                    >
                      <ExternalLink size={16} />
                      <span>Xem trực tiếp</span>
                    </button>
                  )}
                  {(match.matchStatus === "ended" || match.matchStatus === "finished") && (
                    <button
                      onClick={() => handleWatchReplay(match.matchCode)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors touch-target"
                    >
                      <ExternalLink size={16} />
                      <span>Xem lại</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SMatchListPage;
