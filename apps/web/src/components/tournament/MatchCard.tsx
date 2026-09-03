import React from "react";
import { Clock, ExternalLink } from "lucide-react";
import { MatchStatusBadge } from "../shared/ui/Badge";

interface MatchCardProps {
  id: string;
  matchCode: string;
  matchName: string;
  matchStatus: string;
  createdAt: string;
  onWatch?: () => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  id,
  matchCode,
  matchName,
  matchStatus,
  createdAt,
  onWatch,
}) => {
  const canWatch = matchStatus === "active" || matchStatus === "in_progress";
  const canReplay = matchStatus === "completed" || matchStatus === "finished";

  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-medium text-white truncate">{matchName}</span>
          <MatchStatusBadge status={matchStatus} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock size={12} />
          <span>{new Date(createdAt).toLocaleDateString("vi-VN")}</span>
        </div>
      </div>

      {(canWatch || canReplay) && onWatch && (
        <button
          onClick={onWatch}
          className={`
            flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ml-4
            ${
              canWatch
                ? "bg-green-600 hover:bg-green-500 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }
          `}
        >
          <ExternalLink size={14} />
          <span>{canWatch ? "Xem" : "Xem lại"}</span>
        </button>
      )}
    </div>
  );
};
