/**
 * WaitingPage — Unified page for the waiting/lobby screen.
 *
 * Admin: game management buttons, player cards, round navigation.
 * MC: read-only waiting view.
 * Player: waiting view with player info.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, UserCheck, Trophy, Flag, CheckCircle } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerProtection } from "@/hooks/usePlayerProtection";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useWaitingState } from "@/hooks/useWaitingState";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { buildWaitingBroadcastPlayers, finishMatch, loadWaitingSnapshot } from "@/api/waiting";

import AControlButton from "@/components/admin/AControlButton";
import APlayerCard from "@/components/admin/APlayerCard";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import { WaitingView } from "@/components/shared/WaitingView";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const logger = createLogger("WaitingPage");
const PLAYER_COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminWaitingView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const storedMatchCode = localStorage.getItem("matchCode");
  const currentMatchCode = urlMatchCode || storedMatchCode || "";

  const { lastMessage, sendMessage } = useGameWebSocket();
  const [hoveredPlayerCode, setHoveredPlayerCode] = useState<string | null>(null);

  useEffect(() => { if (urlMatchCode && urlMatchCode !== storedMatchCode) { try { localStorage.setItem("matchCode", urlMatchCode); } catch {} } }, [urlMatchCode, storedMatchCode]);
  useEffect(() => { if (!currentMatchCode) navigate("/admin/manage"); }, [currentMatchCode, navigate]);

  const { players, setPlayers, matchFinished, setMatchFinished } = useWaitingState(lastMessage);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });

  const [isOpeningMatch, setIsOpeningMatch] = useState(false);
  const [isIntroducingPlayers, setIsIntroducingPlayers] = useState(false);
  const [isShowingScoreboard, setIsShowingScoreboard] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [isFinishingMatch, setIsFinishingMatch] = useState(false);

  const sendPlayersSnapshot = useCallback(async () => { if (!currentMatchCode) return; try { const snapshot = await loadWaitingSnapshot(currentMatchCode); setMatchFinished(snapshot.matchFinished); setPlayers(prev => buildPlayersSnapshot(snapshot.players, snapshot.scoreboard, snapshot.profiles, prev)); await sendMessage({ type: "send_players_info", players: buildWaitingBroadcastPlayers(snapshot), scoreboard: snapshot.scoreboard, profiles: snapshot.profiles }); } catch (error) { logger.error("Failed to load waiting snapshot:", error); } }, [currentMatchCode, sendMessage, setMatchFinished, setPlayers]);

  const handleEditScore = useCallback((playerCode: string, newScore: number) => { setPlayers(prev => prev.map(p => p.playerCode === playerCode ? { ...p, playerScore: newScore } : p)); void sendPlayersSnapshot(); }, [sendPlayersSnapshot, setPlayers]);

  const sendRoundSnapshot = useCallback(async () => { await sendPlayersSnapshot(); }, [sendPlayersSnapshot]);

  useEffect(() => { void sendPlayersSnapshot(); }, [sendPlayersSnapshot]);

  useEffect(() => { if (!lastMessage) return; const msg = lastMessage.message ?? lastMessage; queueMicrotask(() => { switch (msg.type) { case "user_online": { if (!msg.user_code) break; const pathByRole = { player: "/player/waiting", mc: "/mc/waiting" }; const path = pathByRole[msg.role as keyof typeof pathByRole]; if (!path) break; if (msg.role === "player") { setPlayers(prev => prev.map(p => p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)); } void sendMessage({ type: "navigate", user_code: msg.user_code, path }); void sendRoundSnapshot(); break; } } }); }, [lastMessage, sendMessage, sendRoundSnapshot, setPlayers]);

  const handleOpenMatch = useCallback(async () => { if (!currentMatchCode) return; setIsOpeningMatch(true); try { await sendMessage({ type: "match_state", state: "open" }); } catch {} finally { setIsOpeningMatch(false); } }, [currentMatchCode, sendMessage]);
  const handleIntroducePlayers = useCallback(async () => { if (!currentMatchCode) return; setIsIntroducingPlayers(true); try { await sendMessage({ type: "introduce_players" }); } catch {} finally { setIsIntroducingPlayers(false); } }, [currentMatchCode, sendMessage]);
  const handleShowScoreboard = useCallback(async () => { if (!currentMatchCode) return; setIsShowingScoreboard(true); try { await sendMessage({ type: "show_scoreboard" }); } catch {} finally { setIsShowingScoreboard(false); } }, [currentMatchCode, sendMessage]);
  const handleEndMatch = useCallback(async () => { if (!currentMatchCode) return; setIsEndingMatch(true); try { await sendMessage({ type: "match_state", state: "ended" }); await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" }); await sendPlayersSnapshot(); } catch {} finally { setIsEndingMatch(false); } }, [currentMatchCode, sendMessage, sendPlayersSnapshot]);
  const handleFinishMatch = useCallback(async () => { if (!currentMatchCode) return; const confirmed = window.confirm("Xác nhận hoàn thành trận đấu?"); if (!confirmed) return; setIsFinishingMatch(true); try { await finishMatch(currentMatchCode); setMatchFinished(true); await sendMessage({ type: "match_state", state: "finished" }); await sendPlayersSnapshot(); } catch { alert("Lỗi kết nối khi hoàn thành trận đấu"); } finally { setIsFinishingMatch(false); } }, [currentMatchCode, sendMessage, sendPlayersSnapshot, setMatchFinished]);

  const broadcastNavigate = useCallback(async (adminPath: string, playerPath: string, round: string) => { if (!currentMatchCode) return; await sendMessage({ type: "round_start", round }); await sendMessage({ type: "clear_question", user_code: "" }); navigate(`${adminPath}/${currentMatchCode}`); await sendMessage({ type: "navigate", user_code: "", path: `${playerPath}/${currentMatchCode}` }); await sendRoundSnapshot(); }, [currentMatchCode, navigate, sendMessage, sendRoundSnapshot]);

  const handleNavigateToKDC = useCallback(() => { void broadcastNavigate("/admin/kdc", "/player/kdc", "kdc"); }, [broadcastNavigate]);
  const handleNavigateToKDR = useCallback(() => { void broadcastNavigate("/admin/kdr", "/player/kdr", "kdr"); }, [broadcastNavigate]);
  const handleNavigateToBP = useCallback(() => { void broadcastNavigate("/admin/bp", "/player/bp", "bp"); }, [broadcastNavigate]);
  const handleNavigateToVDC = useCallback(() => { void broadcastNavigate("/admin/vdc/pick", "/player/vdc/pick", "vdc"); }, [broadcastNavigate]);
  const handleNavigateToVDR = useCallback(() => { void broadcastNavigate("/admin/vdr/pick", "/player/vdr/pick", "vdr"); }, [broadcastNavigate]);
  const handleNavigateToGM = useCallback(() => { void broadcastNavigate("/admin/gm", "/player/gm", "gm"); }, [broadcastNavigate]);
  const handleNavigateToWaiting = useCallback(() => { void broadcastNavigate("/admin/waiting", "/player/waiting", "waiting"); }, [broadcastNavigate]);

  if (!currentMatchCode) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AdminGameplayNavBar onNavigateToWaiting={handleNavigateToWaiting} />
      <div className="flex flex-col flex-1 items-center gap-6 p-6 overflow-y-auto">
        <h1 className="font-[SVN-Gratelos_Display] text-4xl xl:text-5xl font-bold text-white uppercase tracking-wide text-center">Sảnh Chờ</h1>
        <p className="text-blue-300 text-sm">Mã trận: <strong>{currentMatchCode}</strong></p>
        {players.length > 0 && (
          <div className="flex gap-4 max-w-7xl w-full justify-center">
            {players.map((player, index) => (
              <APlayerCard key={player.playerCode} player={player} onEditScore={handleEditScore} matchCode={currentMatchCode} sendMessage={sendMessage} isHovered={hoveredPlayerCode === player.playerCode} isDimmed={hoveredPlayerCode !== null && hoveredPlayerCode !== player.playerCode} onHover={setHoveredPlayerCode} accentColor={PLAYER_COLORS[index % PLAYER_COLORS.length]} />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4 w-full max-w-7xl">
          <div className="flex flex-wrap gap-4 items-center justify-center w-full">
            <AControlButton onClick={handleOpenMatch} disabled={isOpeningMatch || !currentMatchCode || matchFinished} className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"><Play size={18} />{isOpeningMatch ? "Đang gửi..." : "Mở đầu trận đấu"}</AControlButton>
            <AControlButton onClick={handleIntroducePlayers} disabled={isIntroducingPlayers || !currentMatchCode || matchFinished} className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"><UserCheck size={18} />{isIntroducingPlayers ? "Đang gửi..." : "Giới thiệu thí sinh"}</AControlButton>
            <AControlButton onClick={handleShowScoreboard} disabled={isShowingScoreboard || !currentMatchCode || matchFinished} className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"><Trophy size={18} />{isShowingScoreboard ? "Đang gửi..." : "Tổng kết điểm số"}</AControlButton>
            <AControlButton onClick={handleEndMatch} disabled={isEndingMatch || !currentMatchCode || matchFinished} className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"><Flag size={18} />{isEndingMatch ? "Đang gửi..." : "Kết thúc trận đấu"}</AControlButton>
            <AControlButton onClick={handleFinishMatch} disabled={isFinishingMatch || !currentMatchCode || matchFinished} className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center bg-green-600 hover:bg-green-500 disabled:bg-green-800"><CheckCircle size={18} />{isFinishingMatch ? "Đang xác nhận..." : matchFinished ? "Đã hoàn thành" : "Xác nhận hoàn thành"}</AControlButton>
          </div>
        </div>
        <div className="flex flex-col gap-4 w-full max-w-7xl">
          <p className="text-white/60 text-xs uppercase tracking-widest text-center">Vòng chơi</p>
          <div className={`flex flex-wrap gap-4 items-center justify-center${matchFinished ? " pointer-events-none opacity-50" : ""}`}>
            <AControlButton onClick={handleNavigateToKDR} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Khởi Động Riêng</AControlButton>
            <AControlButton onClick={handleNavigateToKDC} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Khởi Động Chung</AControlButton>
            <AControlButton onClick={handleNavigateToGM} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Giải Mã</AControlButton>
            <AControlButton onClick={handleNavigateToBP} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Bứt Phá</AControlButton>
            <AControlButton onClick={handleNavigateToVDC} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Về Đích Chung</AControlButton>
            <AControlButton onClick={handleNavigateToVDR} disabled={!currentMatchCode} className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center">Về Đích Riêng</AControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCWaitingView = () => {
  const { matchCode } = useRoleSession("mc");
  const { lastMessage } = useGameWebSocket();
  const state = useWaitingState(lastMessage);
  return <WaitingView {...state} matchCode={matchCode} finishedMessage="Các vòng thi đã kết thúc. Chỉ có thể xem kết quả." />;
};

// ─── Player View ────────────────────────────────────────────────────────────
const PlayerWaitingView = () => {
  usePlayerProtection(true);
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const playerCode = sessionStorage.getItem("playerCode") ?? "";
  const { lastMessage } = useGameWebSocket();
  const state = useWaitingState(lastMessage);
  return <WaitingView {...state} matchCode={routeMatchCode ?? ""} currentPlayerCode={playerCode} finishedMessage="Các vòng thi đã kết thúc. Bạn chỉ có thể xem kết quả." />;
};

// ─── Main Page ──────────────────────────────────────────────────────────────
const WaitingPage = () => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminWaitingView />;
  if (role === "mc") return <MCWaitingView />;
  return <PlayerWaitingView />;
};

export default WaitingPage;
