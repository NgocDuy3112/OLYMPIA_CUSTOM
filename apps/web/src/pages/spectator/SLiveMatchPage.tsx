import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { API_BASE_URL } from "@/configs";
import { ArrowLeft } from "lucide-react";

interface PlayerScore {
  userCode: string;
  userName: string;
  score: number;
}

interface MatchInfo {
  matchCode: string;
  matchName: string;
  videoUrl?: string;
  matchStatus: string;
}

const PHASE_NAMES: Record<string, string> = {
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
  vl: "Vòng Loại",
};

const SLiveMatchPage: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const navigate = useNavigate();
  const { isConnected, lastMessage } = useWebSocket(matchCode || "");

  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [timer, setTimer] = useState<number | null>(null);
  const [actions, setActions] = useState<Array<{ text: string; timestamp: number }>>([]);

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
      }
    };

    fetchMatchInfo();
  }, [matchCode]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;
    const msgType = msg?.type;

    switch (msgType) {
      case "navigate": {
        const phase = msg.path?.toString().split("/").pop() || "";
        setCurrentPhase(phase);
        break;
      }
      case "send_question": {
        setQuestion(msg.content || "");
        setTimer(null);
        break;
      }
      case "clear_question": {
        setQuestion("");
        setTimer(null);
        break;
      }
      case "start_the_timer": {
        const timeLimit = typeof msg.time_limit === "number" ? msg.time_limit : 30;
        setTimer(timeLimit);
        break;
      }
      case "timer_update": {
        const countdown = typeof msg.countdown === "number" ? msg.countdown : null;
        if (countdown !== null) {
          setTimer(countdown);
        }
        break;
      }
      case "player_score_updated": {
        if (Array.isArray(msg.scoreboard)) {
          setScores(msg.scoreboard as PlayerScore[]);
        }
        break;
      }
      case "buzzer_winner": {
        const winner = msg.user_code || "unknown";
        setActions((prev) => [
          { text: `${winner} buzz đúng!`, timestamp: Date.now() },
          ...prev.slice(0, 9),
        ]);
        break;
      }
      case "answer_result": {
        const isCorrect = (msg.status as string) === "correct";
        const userCode = msg.user_code || "unknown";
        setActions((prev) => [
          {
            text: `${userCode} ${isCorrect ? "đúng" : "sai"}`,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 9),
        ]);
        break;
      }
    }
  }, [lastMessage]);

  // Extract YouTube ID from URL
  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? null;
  };

  const videoId = matchInfo?.videoUrl
    ? extractYouTubeId(matchInfo.videoUrl)
    : null;

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
          <p className="text-xs sm:text-sm text-gray-400">
            {currentPhase && PHASE_NAMES[currentPhase]
              ? PHASE_NAMES[currentPhase]
              : "Đang tải..."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-gray-400 hidden sm:inline">
            {isConnected ? "Trực tiếp" : "Mất kết nối"}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Main content: Video + Question */}
        <div className="flex-1 flex flex-col gap-3 sm:gap-4">
          {/* Video embed */}
          {videoId ? (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
              <p className="text-gray-500 text-sm sm:text-base">Không có video stream</p>
            </div>
          )}

          {/* Current question */}
          {question && (
            <div className="bg-blue-900 border-2 border-blue-600 rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-300 font-bold text-xs sm:text-sm">Câu hỏi hiện tại</span>
                {timer !== null && (
                  <span className={`text-xl sm:text-2xl font-bold font-mono ${timer <= 5 ? "timer-danger" : timer <= 10 ? "timer-warning" : "text-white"}`}>
                    {timer}
                  </span>
                )}
              </div>
              <p className="text-white text-sm sm:text-lg">{question}</p>
            </div>
          )}

          {/* Action feed */}
          {actions.length > 0 && (
            <div className="bg-black/30 rounded-lg p-3">
              <h3 className="text-xs sm:text-sm text-gray-400 mb-2">Diễn biến mới nhất</h3>
              <div className="space-y-1">
                {actions.map((action, i) => (
                  <div
                    key={action.timestamp + i}
                    className="text-xs sm:text-sm text-white/80"
                  >
                    • {action.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Scoreboard */}
        <div className="w-full lg:w-72 xl:w-80 bg-black/30 rounded-lg p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4 flex items-center gap-2">
            <span>🏆</span> Bảng xếp hạng
          </h2>

          {scores.length === 0 ? (
            <p className="text-gray-400 text-xs sm:text-sm">Chưa có dữ liệu điểm</p>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {scores.map((player, index) => (
                <div
                  key={player.userCode}
                  className="flex items-center justify-between p-2 bg-white/5 rounded"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm sm:text-lg">
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}
                    </span>
                    <span className="text-white font-medium text-xs sm:text-sm truncate">
                      {player.userName}
                    </span>
                  </div>
                  <span className="text-blue-400 font-bold tabular-nums text-sm sm:text-base ml-2">
                    {player.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SLiveMatchPage;
