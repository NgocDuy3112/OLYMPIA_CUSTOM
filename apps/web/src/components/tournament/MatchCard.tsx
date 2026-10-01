import React from "react";
import { Clock, ExternalLink } from "lucide-react";
import { MatchStatusBadge } from "@/components/shared/StatusBadges";
import { Button } from "@/components/ui/button";

interface MatchCardProps {
  id: string;
  matchSlug: string;
  matchPin?: string;
  matchName: string;
  matchStatus: string;
  tournamentFormat?: string;
  videoUrl?: string;
  createdAt: string;
  onWatch?: () => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  matchName,
  matchStatus,
  createdAt,
  onWatch,
}) => {
  const canWatch = matchStatus === "active" || matchStatus === "in_progress";
  const canReplay = matchStatus === "completed" || matchStatus === "finished";

  return (
    <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-white truncate">{matchName}</span>
          <MatchStatusBadge status={matchStatus} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={12} />
          <span>{new Date(createdAt).toLocaleDateString("vi-VN")}</span>
        </div>
      </div>

      {(canWatch || canReplay) && onWatch && (
        <Button
          variant="ghost"
          onClick={onWatch}
          className={`ml-4 gap-1 px-3 py-1.5 text-sm ${
            canWatch
              ? "bg-success hover:bg-success/90 text-success-foreground"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          }`}
        >
          <ExternalLink size={14} />
          <span>{canWatch ? "Xem" : "Xem lại"}</span>
        </Button>
      )}
    </div>
  );
};
