import React, { useState } from "react";
import { API_BASE_URL } from "@/configs";
import { UserCog, Loader2 } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";

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
  { value: "player", label: "Thí sinh", color: "bg-success" },
  { value: "mc", label: "MC", color: "bg-pink-500" },
  { value: "controller", label: "Điều hành", color: "bg-purple" },
  { value: "qauthor", label: "Soạn câu hỏi", color: "bg-warning" },
  { value: "spectator", label: "Khán giả", color: "bg-muted-foreground" },
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
        <UserCog size={18} className="text-brand" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Quản lý quyền
        </h3>
      </div>

      {error && (
        <div className="p-2 bg-destructive/20 border border-destructive rounded text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.userId}
            className="flex items-center justify-between p-3 bg-accent/50 rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-brand text-sm font-bold shrink-0">
                {player.userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {player.userName}
                </div>
                <div className="text-xs text-muted-foreground">{player.userCode}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {updatingUserId === player.userId ? (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              ) : (
                <NativeSelect
                  size="sm"
                  value={player.role || "player"}
                  onChange={(e) =>
                    handleRoleChange(player.userId, e.target.value)
                  }
                  disabled={player.userId === currentUserId}
                  className="min-w-[7rem]"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
