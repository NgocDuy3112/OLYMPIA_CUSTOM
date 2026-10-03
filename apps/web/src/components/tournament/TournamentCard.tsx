import React from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TournamentStatusBadge } from "@/components/shared/StatusBadges";

interface TournamentCardProps {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  description?: string;
  tournamentFormat: string;
  startDate?: string;
  endDate?: string;
  status: string;
  venue?: string;
  playerCount?: number;
}

export const TournamentCard: React.FC<TournamentCardProps> = ({
  tournamentCode,
  tournamentName,
  description,
  tournamentFormat,
  startDate,
  endDate,
  status,
  venue,
  playerCount,
}) => {
  const navigate = useNavigate();

  return (
    <Card
      className="px-4 cursor-pointer hover:ring-primary transition-colors"
      onClick={() => navigate(`/tournament/${tournamentCode}`)}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        {}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
            <h3 className="text-lg sm:text-xl font-bold text-foreground truncate">
              {tournamentName}
            </h3>
            <TournamentStatusBadge status={status} />
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Trophy size={14} className="text-brand" />
              {tournamentFormat.toUpperCase()}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} className="text-brand" />
              {startDate || "Chưa đặt"} - {endDate || "Chưa đặt"}
            </span>
            {venue && (
              <span className="flex items-center gap-1">
                <MapPin size={14} className="text-brand" />
                {venue}
              </span>
            )}
            {playerCount !== undefined && (
              <span className="flex items-center gap-1">
                <Users size={14} className="text-brand" />
                {playerCount} thí sinh
              </span>
            )}
          </div>

          {description && (
            <p className="text-muted-foreground text-sm mt-2 line-clamp-2">
              {description}
            </p>
          )}
        </div>

        {}
        <div className="flex items-center gap-2 text-brand shrink-0">
          <span className="text-sm hidden sm:inline">Xem chi tiết</span>
          <ArrowRight size={16} />
        </div>
      </div>
    </Card>
  );
};
