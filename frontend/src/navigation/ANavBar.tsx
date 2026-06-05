import { useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";

const ADMIN_TO_PLAYER_NAV: Record<string, string> = {
	"/admin/waiting": "/player/waiting",
	"/admin/kdr": "/player/kdr",
	"/admin/kdc": "/player/kdc",
	"/admin/gm": "/player/gm",
	"/admin/bp": "/player/bp",
	"/admin/vdc/pick": "/player/vdc/pick",
	"/admin/vdc": "/player/vdc",
	"/admin/vdr/pick": "/player/vdr/pick",
	"/admin/vdr": "/player/vdr",
};

const AdminGameplayNavBar: React.FC = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { sendMessage } = useAdminWebSocket();

	const handleLogout = () => {
		localStorage.removeItem("jwtToken_admin");
		localStorage.removeItem("matchCode");
		navigate("/login");
	};

	const isActive = (path: string) => {
		return location.pathname === path || location.pathname.startsWith(path + "/");
	};

	const navigateAndBroadcast = (adminPath: string) => {
		navigate(adminPath);
		const normalized = adminPath.endsWith("/") ? adminPath.slice(0, -1) : adminPath;
		const matchedPrefix = Object.keys(ADMIN_TO_PLAYER_NAV)
			.sort((a, b) => b.length - a.length)
			.find((prefix) => normalized === prefix || normalized.startsWith(prefix + "/"));
		if (matchedPrefix) {
			void sendMessage({ type: "navigate", user_code: "", path: ADMIN_TO_PLAYER_NAV[matchedPrefix] });
		}
	};

	return (
		<nav className="bg-blue-900 bg-opacity-90 text-white shadow-lg sticky top-0 z-50">
			<div className="px-4 py-3 flex justify-between items-center">
				{/* Logo */}
				<div
					className="flex items-center gap-2 cursor-pointer"
					onClick={() => navigate("/admin/game-managing")}
				>
					<span className="text-[18px] tablet:text-[20px] xl:text-[32px] font-bold font-[SVN-Gratelos_Display]">
						OLYMPIA CUSTOM 3
					</span>
					<span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg">
						BETA
					</span>
				</div>

				{/* Desktop Navigation only */}
				<div className="hidden md:flex items-center gap-6">
					{/* Sảnh chờ */}
					<button
						onClick={() => navigateAndBroadcast("/admin/waiting")}
						className={`px-2 py-1.5 tablet:px-3 tablet:py-2 rounded transition-all duration-200 font-medium text-sm tablet:text-base ${isActive("/admin/waiting") ? "bg-blue-700 text-white" : "text-blue-100 hover:bg-blue-800 hover:text-white"}`}
					>
						Sảnh Chờ
					</button>

					{/* Quản lý — no broadcast, admin-only page */}
					<button
						onClick={() => navigate("/admin/game-managing")}
						className={`px-2 py-1.5 tablet:px-3 tablet:py-2 rounded transition-all duration-200 font-medium text-sm tablet:text-base ${isActive("/admin/game-managing") || isActive("/admin/setup") ? "bg-blue-700 text-white" : "text-blue-100 hover:bg-blue-800 hover:text-white"}`}
					>
						Quản lý
					</button>

					<button
						onClick={handleLogout}
						className="ml-2 tablet:ml-4 px-3 py-1.5 tablet:px-4 tablet:py-2 bg-blue-600 hover:bg-blue-500 rounded transition-all duration-200 flex items-center gap-2 font-medium text-sm tablet:text-base"
					>
						<LogOut size={18} />
						Đăng Xuất
					</button>
				</div>
			</div>
		</nav>
	);
};

export default AdminGameplayNavBar;