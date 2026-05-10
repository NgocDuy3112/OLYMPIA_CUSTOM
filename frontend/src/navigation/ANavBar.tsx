/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { LogOut, ChevronDown } from "lucide-react";


const AdminGameplayNavBar: React.FC = () => {
    const {matchCode} = useParams<{matchCode: string}>();
    const [isVongThiOpen, setIsVongThiOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent | TouchEvent) => {
            if (navRef.current && !navRef.current.contains(e.target as Node))
                setIsVongThiOpen(false);
        };
        document.addEventListener("mousedown", handler);
        document.addEventListener("touchstart", handler);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("touchstart", handler);
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("jwtToken_admin");
        localStorage.removeItem("matchCode");
        navigate("/login");
    };

    const isActive = (path: string) => {
        return location.pathname === path || location.pathname.startsWith(path + "/");
    };

    const vongThiItems = [
        { label: "Khởi động (Cá nhân)", path: `/admin/kdr/${matchCode}` },
        { label: "Khởi động (Chung)",   path: `/admin/kdc/${matchCode}` },
        { label: "Giải mã",             path: `/admin/gm/${matchCode}` },
        { label: "Bứt phá",             path: `/admin/bp/${matchCode}` },
        { label: "Về đích (Chung)",     path: `/admin/vdc/pick/${matchCode}` },
        { label: "Về đích (Cá nhân)",   path: `/admin/vdr/pick/${matchCode}` },
    ];

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
                </div>

                {/* Desktop Navigation only */}
                <div className="hidden md:flex items-center gap-6">
                    {/* Vòng thi dropdown */}
                    <div
                        className="relative"
                        ref={navRef}
                    >
                        <button
                            className="px-2 py-1.5 tablet:px-3 tablet:py-2 rounded transition-all duration-200 font-medium text-sm tablet:text-base text-blue-100 hover:bg-blue-800 hover:text-white flex items-center gap-1"
                            onClick={() => setIsVongThiOpen(prev => !prev)}
                        >
                            Vòng thi
                            <ChevronDown size={18} className={`transition-transform duration-200 ${isVongThiOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isVongThiOpen && (
                            <div className="absolute left-0 mt-0 bg-blue-800 rounded shadow-lg border border-blue-700">
                                {vongThiItems.map((item, index) => (
                                    <button
                                        key={item.path}
                                        onClick={() => {
                                            navigate(item.path);
                                            setIsVongThiOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 hover:bg-blue-700 transition-all duration-200 text-blue-100 hover:text-white font-medium whitespace-nowrap ${index === 0 ? "rounded-t" : ""} ${index === vongThiItems.length - 1 ? "rounded-b" : ""} ${isActive(item.path) ? "bg-blue-700 text-white" : ""}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quản lý */}
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
