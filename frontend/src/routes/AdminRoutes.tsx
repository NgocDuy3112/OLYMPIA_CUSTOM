import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import ButPhaPage from "@/pages/game/ButPhaPage";
import KhoiDongChungPage from "@/pages/game/KhoiDongChungPage";
import KhoiDongRiengPage from "@/pages/game/KhoiDongRiengPage";
import GiaiMaPage from "@/pages/game/GiaiMaPage";
import VeDichChungPage from "@/pages/game/VeDichChungPage";
import VeDichRiengPage from "@/pages/game/VeDichRiengPage";
import WaitingPage from "@/pages/game/WaitingPage";
import VeDichPickPage from "@/pages/game/VeDichPickPage";
import AGameManagingPage from "@/pages/admin/AGameManagingPage";
import TournamentListPage from "@/pages/admin/tournament/TournamentListPage";
import TournamentFormPage from "@/pages/admin/tournament/TournamentFormPage";
import TournamentDetailPage from "@/pages/admin/tournament/TournamentDetailPage";
import { GameWebSocketProvider } from "@/contexts/GameWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { VeDichRound } from "@/types/veDich";

const AdminAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage, sendMessage } = useGameWebSocket();
    const matchCode = localStorage.getItem("matchCode") || "";
    useEffect(() => {
        const msg = (lastMessage?.message ?? lastMessage) as { type?: string; path?: unknown } | null;
        if (msg?.type !== "navigate" || typeof msg.path !== "string" || !matchCode) return;

        const path = msg.path.endsWith("/") ? msg.path.slice(0, -1) : msg.path;
        const adminPath = path.startsWith("/player/")
            ? path.replace("/player/", "/admin/")
            : path.startsWith("/admin/")
                ? path
                : null;
        if (!adminPath) return;

        if (adminPath.startsWith("/admin/vl")) return;

        const target = adminPath.endsWith(`/${matchCode}`) ? adminPath : `${adminPath}/${matchCode}`;
        if (location.pathname === target) return;

        navigate(target, { replace: true });
    }, [lastMessage, location.pathname, matchCode, navigate, sendMessage]);

    return null;
};

const AdminRoutes = () => {
    const location = useLocation();
    const stored = localStorage.getItem("matchCode") || "";
    const fromPath = (() => {
        try {
            const m = location.pathname.match(/OC3_[A-Za-z0-9_-]+/);
            return m ? m[0] : "";
        } catch {
            return "";
        }
    })();
    const matchCode = stored || fromPath;

    return (
        <AuthGuard requiredRole="admin">
            <GameWebSocketProvider
                config={{
                    role: "admin",
                    matchCode,
                }}
            >
                <AdminAutoNavigator />
                <Routes>
                    <Route path="/" element={
                        <Navigate to={stored ? `/admin/waiting/${stored}` : "/admin/manage"} replace />
                    } />
                    <Route path="/waiting/:matchCode" element={<WaitingPage />} />
                    <Route path="/kdc/:matchCode?" element={<KhoiDongChungPage />} />
                    <Route path="/kdr/:matchCode?" element={<KhoiDongRiengPage />} />
                    <Route path="/bp/:matchCode?" element={<ButPhaPage />} />
                    <Route path="/vdc/pick/:matchCode?" element={<VeDichPickPage round={VeDichRound.CHUNG} />} />
                    <Route path="/vdr/pick/:matchCode?" element={<VeDichPickPage round={VeDichRound.RIENG} />} />
                    <Route path="/vdc/:matchCode?" element={<VeDichChungPage />} />
                    <Route path="/vdr/:matchCode?" element={<VeDichRiengPage />} />
                    <Route path="/gm/:matchCode?" element={<GiaiMaPage />} />
                    <Route path="/game-managing" element={<AGameManagingPage />} />
                    {/* Tournament management routes */}
                    <Route path="/tournaments" element={<TournamentListPage />} />
                    <Route path="/tournaments/create" element={<TournamentFormPage />} />
                    <Route path="/tournaments/:code" element={<TournamentDetailPage />} />
                    <Route path="/tournaments/:code/edit" element={<TournamentFormPage />} />
                </Routes>
            </GameWebSocketProvider>
        </AuthGuard>
    );
}

export default AdminRoutes;
