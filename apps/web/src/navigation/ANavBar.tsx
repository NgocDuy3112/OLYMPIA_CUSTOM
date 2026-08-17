import { useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { HeaderBar } from "@/components/layouts/HeaderBar";

interface AdminGameplayNavBarProps {
	onNavigateToWaiting?: () => void;
}

const AdminGameplayNavBar: React.FC<AdminGameplayNavBarProps> = ({ onNavigateToWaiting }) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { isConnected, sendMessage } = useGameWebSocket();

	const handleLogout = async () => {
		// Call logout API to clear cookie
		try {
			await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
		} catch {
			// Ignore error
		}
		// Clear local storage
		localStorage.removeItem("matchCode");
		navigate("/login");
	};

	const matchCode = localStorage.getItem("matchCode") || "";

	// Extract current phase from URL
	const extractPhase = () => {
		const path = location.pathname;
		if (path.includes("/kdc")) return "kdc";
		if (path.includes("/kdr")) return "kdr";
		if (path.includes("/bp")) return "bp";
		if (path.includes("/vdc")) return "vdc";
		if (path.includes("/vdr")) return "vdr";
		if (path.includes("/gm")) return "gm";
		if (path.includes("/vl")) return "vl";
		if (path.includes("/waiting")) return "waiting";
		return "";
	};

	const currentPhase = extractPhase();

	const handleWaitingClick = () => {
		if (!matchCode) return;
		const target = `/admin/waiting/${matchCode}`;
		void sendMessage({ type: "navigate", user_code: "", path: `/player/waiting/${matchCode}` });
		window.setTimeout(() => window.location.assign(target), 50);
	};

	// Center content: navigation tabs
	const centerContent = (
		<div className="flex items-center gap-1 sm:gap-2">
			{/* Waiting room button */}
			<button
				onClick={() => onNavigateToWaiting ? onNavigateToWaiting() : handleWaitingClick()}
				className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${
					location.pathname.includes("/waiting")
						? "bg-white/20 text-white"
						: "text-white/80 hover:text-white hover:bg-white/10"
				}`}
			>
				Sảnh Chờ
			</button>

			{/* Tournaments button */}
			<button
				onClick={() => navigate("/admin/tournaments")}
				className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${
					location.pathname.includes("/tournaments")
						? "bg-white/20 text-white"
						: "text-white/80 hover:text-white hover:bg-white/10"
				}`}
			>
				Giải Đấu
			</button>

			{/* Management button */}
			<button
				onClick={() => navigate("/admin/game-managing")}
				className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${
					location.pathname.includes("/game-managing")
						? "bg-white/20 text-white"
						: "text-white/80 hover:text-white hover:bg-white/10"
				}`}
			>
				Quản lý
			</button>
		</div>
	);

	// Right content: logout button
	const rightContent = (
		<button
			onClick={handleLogout}
			className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-xs sm:text-sm font-medium text-white transition-colors flex items-center gap-1.5"
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

export default AdminGameplayNavBar;
