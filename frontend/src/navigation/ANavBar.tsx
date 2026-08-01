import { useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
interface AdminGameplayNavBarProps {
	onNavigateToWaiting?: () => void;
}

const AdminGameplayNavBar: React.FC<AdminGameplayNavBarProps> = ({ onNavigateToWaiting }) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { sendMessage } = useGameWebSocket();

	const handleLogout = () => {
		localStorage.removeItem("jwtToken_admin");
		localStorage.removeItem("matchCode");
		navigate("/login");
	};

	const isActive = (path: string) => {
		return location.pathname === path || location.pathname.startsWith(path + "/");
	};

	const matchCode = localStorage.getItem("matchCode") || "";

	const handleWaitingClick = () => {
		if (!matchCode) return;
		navigate(`/admin/waiting/${matchCode}`);
		void sendMessage({ type: "navigate", user_code: "", path: `/player/waiting/${matchCode}` });
		void sendMessage({ type: "navigate", user_code: "", path: `/mc/waiting/${matchCode}` });
		void sendMessage({ type: "navigate", user_code: "", path: `/guest/waiting/${matchCode}` });
	};

	return (
		<nav className="bg-blue-900 bg-opacity-90 text-white shadow-lg sticky top-0 z-50">
			<div className="px-4 py-3 flex justify-between items-center">
				{}
				<div
					className="flex items-center gap-2 cursor-pointer"
					onClick={() => navigate("/admin/game-managing")}
				>
					<span className="text-[18px] tablet:text-[20px] xl:text-[32px] font-bold font-[SVN-Gratelos_Display]">
						OLYMPIA CUSTOM 3
					</span>

				</div>

				{}
				<div className="hidden md:flex items-center gap-6">
					{}
					<button
						onClick={() => onNavigateToWaiting ? onNavigateToWaiting() : handleWaitingClick()}
						className={`px-2 py-1.5 tablet:px-3 tablet:py-2 rounded transition-all duration-200 font-medium text-sm tablet:text-base`}
					>
						Sảnh Chờ
					</button>

					{}
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