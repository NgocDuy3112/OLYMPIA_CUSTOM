/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { LogOut, ChevronDown, ChevronRight } from "lucide-react";


const AdminGameplayNavBar: React.FC = () => {
    const {matchCode} = useParams<{matchCode: string}>();
    const [isVongThiOpen, setIsVongThiOpen] = useState(false);
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        localStorage.removeItem("jwtToken_admin");
        localStorage.removeItem("matchCode");
        navigate("/login");
    };

    const isActive = (path: string) => {
        return location.pathname === path || location.pathname.startsWith(path + "/");
    };

    const navLinks = [
        { label: "Tạo Trận", path: "/admin/setup" },
        { label: "Vào Phòng", path: "/admin/game-managing" },
    ];

    const vongThiItems = [
        {
            label: "KHỞI ĐỘNG",
            value: "khoiDong",
            subItems: [
                { label: "Chung", path: `/admin/kdc/${matchCode}` },
                    { label: "Cá nhân", path: `/admin/kdr/${matchCode}` },
            ],
        },
        { label: "GIẢI MÃ", path: `/admin/gm/${matchCode}` },
        { label: "BỨT PHÁ", path: `/admin/bp/${matchCode}` },
        {
            label: "VỀ ĐÍCH",
            value: "veDich",
            subItems: [
                { label: "Chung", path: `/admin/vdc/pick/${matchCode}` },
                { label: "Cá nhân", path: `/admin/vdr/pick/${matchCode}` },
            ],
        },
    ];

    return (
        <nav className="bg-blue-900 bg-opacity-90 text-white shadow-lg sticky top-0 z-50">
            <div className="px-4 py-3 flex justify-between items-center">
                {/* Logo */}
                <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => navigate("/admin/game-managing")}
                >
                    <span className="text-[32px] font-bold font-[SVN-Gratelos_Display]">
                        OLYMPIA CUSTOM 3
                    </span>
                </div>

                {/* Desktop Navigation only */}
                <div className="hidden md:flex items-center gap-6">
                    <div
                        className="relative"
                        onMouseEnter={() => setIsVongThiOpen(true)}
                        onMouseLeave={() => {
                            setIsVongThiOpen(false);
                            setHoveredItem(null);
                        }}
                    >
                        <button className="px-3 py-2 rounded transition-all duration-200 font-medium text-blue-100 hover:bg-blue-800 hover:text-white flex items-center gap-1">
                            Vòng thi
                            <ChevronDown size={18} className={`transition-transform duration-200 ${isVongThiOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isVongThiOpen && (
                            <div className="absolute left-0 mt-0 bg-blue-800 rounded shadow-lg border border-blue-700">
                                {vongThiItems.map((item, index) => (
                                    <div
                                        key={item.label}
                                        className="relative"
                                        onMouseEnter={() => setHoveredItem((item as any).value ?? item.label)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                    >
                                        <div className={`w-full text-left px-4 py-2 hover:bg-blue-700 transition-all duration-200 text-blue-100 hover:text-white font-medium flex items-center justify-between min-w-50 ${index === 0 ? "rounded-t" : ""} ${index === vongThiItems.length - 1 ? "rounded-b" : ""}`}>
                                            <button
                                                onClick={() => {
                                                    if ((item as any).path) {
                                                        navigate((item as any).path);
                                                        setIsVongThiOpen(false);
                                                    }
                                                }}
                                                className="text-left w-full"
                                            >
                                                {item.label}
                                            </button>

                                            {item.subItems && <ChevronRight size={16} />}

                                        </div>

                                        {/* Show sub-menu only when this item is hovered */}
                                        {item.subItems && hoveredItem === (item as any).value && (
                                            <div className="absolute left-full top-0 ml-0 flex flex-col bg-blue-800 rounded shadow-lg border border-blue-700 min-w-37.5">
                                                {item.subItems.map((subItem: any, subIndex: number) => (
                                                    <button
                                                        key={subItem.path}
                                                        onClick={() => {
                                                            navigate(subItem.path);
                                                            setIsVongThiOpen(false);
                                                            setHoveredItem(null);
                                                        }}
                                                        className={`text-left px-4 py-2 hover:bg-blue-700 transition-all duration-200 text-blue-100 hover:text-white font-medium w-full ${subIndex === 0 ? "rounded-t" : ""} ${subIndex === item.subItems!.length - 1 ? "rounded-b" : ""}`}
                                                    >
                                                        {subItem.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {navLinks.map((link) => (
                        <button
                            key={link.path}
                            onClick={() => navigate(link.path)}
                            className={`px-3 py-2 rounded transition-all duration-200 font-medium ${
                                isActive(link.path)
                                    ? "bg-blue-700 text-white"
                                    : "text-blue-100 hover:bg-blue-800 hover:text-white"
                            }`}
                        >
                            {link.label}
                        </button>
                    ))}
                    <button
                        onClick={handleLogout}
                        className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition-all duration-200 flex items-center gap-2 font-medium"
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