import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { API_BASE_URL } from "@/configs";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { phaseLabel } from "@/lib/gameMeta";

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

const SLiveMatchPage: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const navigate = useNavigate();
  const { isConnected, lastMessage } = useWebSocket(matchCode || "");

  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [timer, setTimer] = useState<number | null>(null);
  const [actions, setActions] = useState<
    Array<{ text: string; timestamp: number }>
  >([]);

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
        const timeLimit =
          typeof msg.time_limit === "number" ? msg.time_limit : 30;
        setTimer(timeLimit);
        break;
      }
      case "timer_update": {
        const countdown =
          typeof msg.countdown === "number" ? msg.countdown : null;
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

  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? null;
  };

  const videoId = matchInfo?.videoUrl
    ? extractYouTubeId(matchInfo.videoUrl)
    : null;

  return (
    <div className="min-h-screen bg-background">
      {}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-background/50">
        <Button
          variant="ghost"
          onClick={() => navigate("/spectator")}
          className="gap-1 touch-target text-foreground hover:text-brand"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Quay lại</span>
        </Button>
        <div className="text-center flex-1 min-w-0 px-2">
          <h1 className="text-base sm:text-xl font-bold text-foreground truncate">
            {matchInfo?.matchName || matchCode}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {phaseLabel(currentPhase) ?? "Đang tải..."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-destructive"}`}
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {isConnected ? "Trực tiếp" : "Mất kết nối"}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4">
        {}
        <div className="flex-1 flex flex-col gap-3 sm:gap-4">
          {}
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
            <div className="aspect-video bg-background/80 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground text-sm sm:text-base">
                Không có video stream
              </p>
            </div>
          )}

          {}
          {question && (
            <div className="bg-primary/40 border-2 border-primary rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-brand font-bold text-xs sm:text-sm">
                  Câu hỏi hiện tại
                </span>
                {timer !== null && (
                  <span
                    className={`text-xl sm:text-2xl font-bold font-mono ${timer <= 5 ? "timer-danger" : timer <= 10 ? "timer-warning" : "text-foreground"}`}
                  >
                    {timer}
                  </span>
                )}
              </div>
              <p className="text-foreground text-sm sm:text-lg">{question}</p>
            </div>
          )}

          {}
          {actions.length > 0 && (
            <div className="bg-background/30 rounded-lg p-3">
              <h3 className="text-xs sm:text-sm text-muted-foreground mb-2">
                Diễn biến mới nhất
              </h3>
              <div className="space-y-1">
                {actions.map((action, i) => (
                  <div
                    key={action.timestamp + i}
                    className="text-xs sm:text-sm text-foreground/80"
                  >
                    • {action.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {}
        <div className="w-full lg:w-72 xl:w-80 bg-background/30 rounded-lg p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
            <span>🏆</span> Bảng xếp hạng
          </h2>

          {scores.length === 0 ? (
            <p className="text-muted-foreground text-xs sm:text-sm">
              Chưa có dữ liệu điểm
            </p>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {scores.map((player, index) => (
                <div
                  key={player.userCode}
                  className="flex items-center justify-between p-2 bg-accent/50 rounded"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm sm:text-lg">
                      {index === 0
                        ? "🥇"
                        : index === 1
                          ? "🥈"
                          : index === 2
                            ? "🥉"
                            : `${index + 1}.`}
                    </span>
                    <span className="text-foreground font-medium text-xs sm:text-sm truncate">
                      {player.userName}
                    </span>
                  </div>
                  <span className="text-brand font-bold tabular-nums text-sm sm:text-base ml-2">
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
