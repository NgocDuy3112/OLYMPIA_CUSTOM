import React from "react";
import { Users } from "lucide-react";
import { TournamentRoleBadge } from "@/components/shared/StatusBadges";

interface Player {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  role?: string;
  groupNumber?: string;
}

interface PlayerGridProps {
  players: Player[];
  showRole?: boolean;
  showGroup?: boolean;
}

export const PlayerGrid: React.FC<PlayerGridProps> = ({
  players,
  showRole = true,
  showGroup = true,
}) => {
  if (players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users size={40} className="mx-auto mb-3 opacity-50" />
        <p>Chưa có thí sinh nào</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {players.map((player, index) => (
        <div
          key={player.id}
          className="flex items-center gap-3 p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors"
        >
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center text-brand font-bold shrink-0">
            {index + 1}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-white truncate">
              {player.userName}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {showGroup && player.groupNumber && (
                <span>Nhóm {player.groupNumber}</span>
              )}
              {showRole && player.role && player.role !== "player" && (
                <TournamentRoleBadge role={player.role} />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
