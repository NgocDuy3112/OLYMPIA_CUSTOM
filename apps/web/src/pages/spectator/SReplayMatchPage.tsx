import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { ArrowLeft } from "lucide-react";

interface MatchInfo {
  matchCode: string;
  matchName: string;
  videoUrl?: string;
  matchStatus: string;
}

const SReplayMatchPage: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const navigate = useNavigate();
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch match info
  useEffect(() => {
    if (!matchCode) return;

    const fetchMatchInfo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/matches/${matchCode}`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === "success" && data.data) {
            setMatchInfo(data.data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch match info:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatchInfo();
  }, [matchCode]);

  // Extract YouTube ID from URL
  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? null;
  };

  const videoId = matchInfo?.videoUrl
    ? extractYouTubeId(matchInfo.videoUrl)
    : null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-black/50">
        <button
          onClick={() => navigate("/spectator")}
          className="flex items-center gap-1 sm:gap-2 text-white hover:text-blue-400 touch-target"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Quay lại</span>
        </button>
        <div className="text-center flex-1 min-w-0 px-2">
          <h1 className="text-base sm:text-xl font-bold text-white truncate">
            {matchInfo?.matchName || matchCode}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">Xem lại trận đấu</p>
        </div>
        <div className="w-16 sm:w-20" /> {/* Spacer for alignment */}
      </div>

      <div className="flex flex-col items-center p-3 sm:p-4 gap-4">
        {/* Video player */}
        {videoId ? (
          <div className="w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
              className="w-full h-full"
              allow="encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="w-full max-w-5xl aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
            <p className="text-gray-500 text-sm sm:text-base">Không có video replay</p>
          </div>
        )}

        {/* Info */}
        <div className="w-full max-w-5xl bg-black/30 rounded-lg p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-bold text-white mb-2">Thông tin trận đấu</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div>
              <span className="text-gray-400">Mã trận:</span>
              <span className="ml-2 text-white font-mono">{matchCode}</span>
            </div>
            <div>
              <span className="text-gray-400">Trạng thái:</span>
              <span className="ml-2 text-green-400">Hoàn thành</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SReplayMatchPage;
