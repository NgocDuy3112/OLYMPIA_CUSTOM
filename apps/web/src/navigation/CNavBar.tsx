import { useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { HeaderBar } from "@/components/layout";
import { getPhaseFromPath } from "@/utils/phase";
import { getMatchCode, removeMatchCode } from "@/utils/storage";

interface ControllerGameplayNavBarProps {
  onNavigateToWaiting?: () => void;
}

const ControllerGameplayNavBar: React.FC<ControllerGameplayNavBarProps> = ({
  onNavigateToWaiting,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected, sendMessage } = useGameWebSocket();

  const handleLogout = async () => {
    // Call logout API to clear cookie
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore error
    }
    // Clear local storage
    removeMatchCode();
    navigate("/login");
  };

  const matchCode = getMatchCode();
  const currentPhase = getPhaseFromPath(location.pathname);

  const handleWaitingClick = () => {
    if (!matchCode) return;
    const target = `/operator/controller/waiting/${matchCode}`;
    void sendMessage({
      type: "navigate",
      user_code: "",
      path: `/player/waiting/${matchCode}`,
    });
    window.setTimeout(() => window.location.assign(target), 50);
  };

  // Center content: navigation tabs (controller live only — no admin CRUD links)
  const centerContent = (
    <div className="flex items-center gap-1 sm:gap-2">
      {/* Waiting room button */}
      <button
        onClick={() =>
          onNavigateToWaiting ? onNavigateToWaiting() : handleWaitingClick()
        }
        className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${
          location.pathname.includes("/waiting")
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:text-foreground hover:bg-accent/50"
        }`}
      >
        Sảnh Chờ
      </button>

      {/* Live overview button */}
      <button
        onClick={() => navigate("/operator/controller/overview")}
        className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${
          location.pathname.includes("/overview")
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:text-foreground hover:bg-accent/50"
        }`}
      >
        Tổng quan
      </button>
    </div>
  );

  // Right content: logout button
  const rightContent = (
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 bg-destructive hover:bg-destructive/85 rounded text-xs sm:text-sm font-medium text-destructive-foreground transition-colors flex items-center gap-1.5"
    >
      <LogOut size={14} />
      <span className="hidden sm:inline">Đăng Xuất</span>
    </button>
  );

  return (
    <HeaderBar
      matchCode={matchCode}
      phase={currentPhase}
      isConnected={isConnected}
      centerContent={centerContent}
      rightContent={rightContent}
    />
  );
};

export default ControllerGameplayNavBar;
