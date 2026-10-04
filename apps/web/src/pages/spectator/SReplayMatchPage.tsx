import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ApiError, apiGet } from "@/api/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    if (!matchCode) return;

    const fetchMatchInfo = async () => {
      try {
        const data = await apiGet<MatchInfo>(`/matches/${matchCode}`).catch(
          (err) => {
            if (err instanceof ApiError) return null;
            throw err;
          },
        );

        if (data?.data) {
          setMatchInfo(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch match info:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatchInfo();
  }, [matchCode]);

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
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

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
          <p className="text-xs sm:text-sm text-muted-foreground">Xem lại trận đấu</p>
        </div>
        <div className="w-16 sm:w-20" /> {}
      </div>

      <div className="flex flex-col items-center p-3 sm:p-4 gap-4">
        {}
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
          <div className="w-full max-w-5xl aspect-video bg-background/80 rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground text-sm sm:text-base">
              Không có video replay
            </p>
          </div>
        )}

        {}
        <div className="w-full max-w-5xl bg-background/30 rounded-lg p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-bold text-foreground mb-2">
            Thông tin trận đấu
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
            <div>
              <span className="text-muted-foreground">Mã trận:</span>
              <span className="ml-2 text-foreground ">{matchCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Trạng thái:</span>
              <span className="ml-2 text-success">Hoàn thành</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SReplayMatchPage;
