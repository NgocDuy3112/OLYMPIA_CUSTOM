import React, { useState } from "react";
import { API_BASE_URL } from "@/configs";
import { UserCog, Loader2, Check, X } from "lucide-react";
import { TournamentRoleBadge } from "../shared/ui/Badge";

interface Player {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  role?: string;
  groupNumber?: string;
}

interface RoleManagerProps {
  tournamentCode: string;
  players: Player[];
  currentUserId?: string;
  isController?: boolean;
  onRoleUpdated?: (userId: string, newRole: string) => void;
}

const ROLES = [
  { value: "player", label: "Thí sinh", color: "bg-green-500" },
  { value: "mc", label: "MC", color: "bg-pink-500" },
  { value: "controller", label: "Điều hành", color: "bg-purple-500" },
  { value: "spectator", label: "Khán giả", color: "bg-gray-500" },
];

export const RoleManager: React.FC<RoleManagerProps> = ({
  tournamentCode,
  players,
  currentUserId,
  isController = false,
  onRoleUpdated,
}) => {
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isController) return;

    setUpdatingUserId(userId);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/tournaments/${tournamentCode}/players/${userId}/role`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role: newRole }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update role");
      }

      onRoleUpdated?.(userId, newRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (!isController) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <UserCog size={18} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Quản lý quyền
        </h3>
      </div>

      {error && (
        <div className="p-2 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.userId}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-sm font-bold shrink-0">
                {player.userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {player.userName}
                </div>
                <div className="text-xs text-gray-400">{player.userCode}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {updatingUserId === player.userId ? (
                <Loader2 size={16} className="animate-spin text-gray-400" />
              ) : (
                <select
                  value={player.role || "player"}
                  onChange={(e) =>
                    handleRoleChange(player.userId, e.target.value)
                  }
                  disabled={player.userId === currentUserId}
                  className="px-2 py-1 bg-white/10 border border-white/20 rounded text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
