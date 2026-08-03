
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, UserCheck, Trophy, Flag, CheckCircle } from "lucide-react";
import AControlButton from "@/components/admin/AControlButton";
import APlayerCard from "@/components/admin/APlayerCard";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { useWaitingState } from "@/hooks/useWaitingState";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import {
	buildWaitingBroadcastPlayers,
	finishMatch,
	loadWaitingSnapshot,
} from "@/api/waiting";

const logger = createLogger("AWaiting");
const PLAYER_COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

const AWaitingPage = () => {
	const navigate = useNavigate();
	const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
	const storedMatchCode = localStorage.getItem("matchCode");
	const currentMatchCode = urlMatchCode || storedMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useGameWebSocket();
	const [hoveredPlayerCode, setHoveredPlayerCode] = useState<string | null>(null);

	useEffect(() => {
		logger.info("AWaitingPage mounted:", { urlMatchCode, storedMatchCode, currentMatchCode });
	}, [urlMatchCode, storedMatchCode, currentMatchCode]);

	useEffect(() => {
		if (urlMatchCode && urlMatchCode !== storedMatchCode) {
			try {
				localStorage.setItem("matchCode", urlMatchCode);
				logger.info("Updated localStorage matchCode:", urlMatchCode);
			} catch (error) {
				logger.error("Failed to persist match code:", error);
			}
		}
	}, [urlMatchCode, storedMatchCode]);

	useEffect(() => {
		if (!currentMatchCode) {
			logger.warn("No match code available in waiting page, redirecting to manage");
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	const { players, setPlayers, matchFinished, setMatchFinished } = useWaitingState(lastMessage);
	usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });

	const [isOpeningMatch, setIsOpeningMatch] = useState(false);
	const [isIntroducingPlayers, setIsIntroducingPlayers] = useState(false);
	const [isShowingScoreboard, setIsShowingScoreboard] = useState(false);
	const [isEndingMatch, setIsEndingMatch] = useState(false);
	const [isFinishingMatch, setIsFinishingMatch] = useState(false);

	const sendPlayersSnapshot = useCallback(async () => {
		if (!currentMatchCode || !token) return;
		try {
			const snapshot = await loadWaitingSnapshot(currentMatchCode, token);
			setMatchFinished(snapshot.matchFinished);
			setPlayers((previous) => buildPlayersSnapshot(
				snapshot.players,
				snapshot.scoreboard,
				snapshot.profiles,
				previous,
			));
			await sendMessage({
				type: "send_players_info",
				players: buildWaitingBroadcastPlayers(snapshot),
				scoreboard: snapshot.scoreboard,
				profiles: snapshot.profiles,
			});
		} catch (error) {
			logger.error("Failed to load waiting snapshot:", error);
		}
	}, [currentMatchCode, sendMessage, setMatchFinished, setPlayers, token]);

	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		setPlayers((previous) => previous.map((player) =>
			player.playerCode === playerCode ? { ...player, playerScore: newScore } : player,
		));
		void sendPlayersSnapshot();
	}, [sendPlayersSnapshot, setPlayers]);

	useEffect(() => {
		void sendPlayersSnapshot();
	}, [sendPlayersSnapshot]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = lastMessage.message ?? lastMessage;

		queueMicrotask(() => {
		switch (msg.type) {
			case "user_online": {
				if (!msg.user_code) break;
				const pathByRole = {
					player: "/player/waiting",
					mc: "/mc/waiting",
					guest: "/guest/waiting",
				};
				const path = pathByRole[msg.role as keyof typeof pathByRole];
				if (!path) break;
				if (msg.role === "player") {
					setPlayers((prev) => prev.map((p) =>
						p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p,
					));
				}
				void sendMessage({ type: "navigate", user_code: msg.user_code, path });
				void sendPlayersSnapshot();
				break;
			}
		}
		});
	}, [lastMessage, sendPlayersSnapshot, sendMessage, setPlayers]);

	const handleOpenMatch = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsOpeningMatch(true);
		try {
			await sendMessage({ type: "match_state", state: "open" });
		} catch (err) {
			logger.error("Failed to send open_match:", err);
		} finally {
			setIsOpeningMatch(false);
		}
	}, [currentMatchCode, sendMessage]);

	const handleIntroducePlayers = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsIntroducingPlayers(true);
		try {
			await sendMessage({ type: "introduce_players" });
		} catch (err) {
			logger.error("Failed to send introduce_players:", err);
		} finally {
			setIsIntroducingPlayers(false);
		}
	}, [currentMatchCode, sendMessage]);

	const handleShowScoreboard = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsShowingScoreboard(true);
		try {
			await sendMessage({ type: "show_scoreboard" });
		} catch (err) {
			logger.error("Failed to send show_scoreboard:", err);
		} finally {
			setIsShowingScoreboard(false);
		}
	}, [currentMatchCode, sendMessage]);

	const handleEndMatch = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsEndingMatch(true);
		try {
			await sendMessage({ type: "match_state", state: "ended" });
			await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
			await sendPlayersSnapshot();
		} catch (err) {
			logger.error("Failed to send end_match:", err);
		} finally {
			setIsEndingMatch(false);
		}
	}, [currentMatchCode, sendMessage, sendPlayersSnapshot]);

	const handleFinishMatch = useCallback(async () => {
		if (!currentMatchCode || !token) return;
		const confirmed = window.confirm("Xác nhận hoàn thành trận đấu? Sau khi xác nhận, trận đấu sẽ chỉ có thể xem kết quả và không thể tương tác vòng thi nữa.");
		if (!confirmed) return;
		setIsFinishingMatch(true);
		try {
			await finishMatch(currentMatchCode, token);
			setMatchFinished(true);
			await sendMessage({ type: "match_state", state: "finished" });
			await sendPlayersSnapshot();
		} catch (error) {
			logger.error("Failed to finish match:", error);
			alert("Lỗi kết nối khi hoàn thành trận đấu");
		} finally {
			setIsFinishingMatch(false);
		}
	}, [currentMatchCode, sendMessage, sendPlayersSnapshot, setMatchFinished, token]);

	const broadcastNavigate = useCallback(
		(adminPath: string, playerPath: string, mcPath: string, guestPath: string) => {
			if (!currentMatchCode) return;
			navigate(`${adminPath}/${currentMatchCode}`);
			void sendMessage({ type: "navigate", user_code: "", path: `${playerPath}/${currentMatchCode}` });
			void sendMessage({ type: "navigate", user_code: "", path: `${mcPath}/${currentMatchCode}` });
			void sendMessage({ type: "navigate", user_code: "", path: `${guestPath}/${currentMatchCode}` });
		},
		[currentMatchCode, navigate, sendMessage],
	);

	const handleNavigateToKDC = useCallback(() => broadcastNavigate("/admin/kdc", "/player/kdc", "mc/kdc", "guest/kdc"), [broadcastNavigate]);
	const handleNavigateToKDR = useCallback(() => broadcastNavigate("/admin/kdr", "/player/kdr", "/mc/kdr", "/guest/kdr"), [broadcastNavigate]);
	const handleNavigateToBP = useCallback(() => broadcastNavigate("/admin/bp", "/player/bp", "/mc/bp", "/guest/bp"), [broadcastNavigate]);
	const handleNavigateToVDC = useCallback(() => broadcastNavigate("/admin/vdc/pick", "/player/vdc/pick", "/mc/vdc/pick", "/guest/vdc/pick"), [broadcastNavigate]);
	const handleNavigateToVDR = useCallback(() => broadcastNavigate("/admin/vdr/pick", "/player/vdr/pick", "/mc/vdr/pick", "/guest/vdr/pick"), [broadcastNavigate]);
	const handleNavigateToGM = useCallback(() => broadcastNavigate("/admin/gm", "/player/gm", "/mc/gm", "/guest/gm"), [broadcastNavigate]);
	const handleNavigateToWaiting = useCallback(() => broadcastNavigate("/admin/waiting", "/player/waiting", "/mc/waiting", "/guest/waiting"), [broadcastNavigate]);

	if (!currentMatchCode) {
		return null;
	}

	return (
		<div className="flex flex-col h-screen overflow-hidden">
			<AdminGameplayNavBar onNavigateToWaiting={handleNavigateToWaiting} />
			<div className="flex flex-col flex-1 items-center gap-6 p-6 overflow-y-auto">
				<h1 className="font-[SVN-Gratelos_Display] text-4xl xl:text-5xl font-bold text-white uppercase tracking-wide text-center">
					Sảnh Chờ
				</h1>

				<p className="text-blue-300 text-sm">Mã trận: <strong>{currentMatchCode}</strong></p>

				{}
				{players.length > 0 && (
					<div className="flex gap-4 max-w-7xl w-full justify-center">
						{players.map((player, index) => (
							<APlayerCard
								key={player.playerCode}
								player={player}
								onEditScore={handleEditScore}
								token={token}
								matchCode={currentMatchCode}
								sendMessage={sendMessage}
								isHovered={hoveredPlayerCode === player.playerCode}
								isDimmed={hoveredPlayerCode !== null && hoveredPlayerCode !== player.playerCode}
								onHover={setHoveredPlayerCode}
																accentColor={PLAYER_COLORS[index % PLAYER_COLORS.length]}
							/>
						))}
					</div>
				)}

				{}
				<div className="flex flex-col gap-4 w-full max-w-7xl">
					<div className="flex flex-wrap gap-4 items-center justify-center w-full">
						<AControlButton
							onClick={handleOpenMatch}
							disabled={isOpeningMatch || !currentMatchCode || matchFinished}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Play size={18} />
							{isOpeningMatch ? "Đang gửi..." : "Mở đầu trận đấu"}
						</AControlButton>

						<AControlButton
							onClick={handleIntroducePlayers}
							disabled={isIntroducingPlayers || !currentMatchCode || matchFinished}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<UserCheck size={18} />
							{isIntroducingPlayers ? "Đang gửi..." : "Giới thiệu thí sinh"}
						</AControlButton>

						<AControlButton
							onClick={handleShowScoreboard}
							disabled={isShowingScoreboard || !currentMatchCode || matchFinished}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Trophy size={18} />
							{isShowingScoreboard ? "Đang gửi..." : "Tổng kết điểm số"}
						</AControlButton>

						<AControlButton
							onClick={handleEndMatch}
							disabled={isEndingMatch || !currentMatchCode || matchFinished}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Flag size={18} />
							{isEndingMatch ? "Đang gửi..." : "Kết thúc trận đấu"}
						</AControlButton>

						<AControlButton
							onClick={handleFinishMatch}
							disabled={isFinishingMatch || !currentMatchCode || matchFinished}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center bg-green-600 hover:bg-green-500 disabled:bg-green-800"
						>
							<CheckCircle size={18} />
							{isFinishingMatch ? "Đang xác nhận..." : matchFinished ? "Đã hoàn thành" : "Xác nhận hoàn thành"}
						</AControlButton>

					</div>
				</div>

				{}
				<div className="flex flex-col gap-4 w-full max-w-7xl">
				<p className="text-white/60 text-xs uppercase tracking-widest text-center">Vòng chơi</p>
				<div className={`flex flex-wrap gap-4 items-center justify-center${matchFinished ? " pointer-events-none opacity-50" : ""}`}>
						<AControlButton
							onClick={handleNavigateToKDR}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Khởi Động Riêng
						</AControlButton>
						<AControlButton
							onClick={handleNavigateToKDC}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Khởi Động Chung
						</AControlButton>

						<AControlButton
							onClick={handleNavigateToGM}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Giải Mã
						</AControlButton>
						<AControlButton
							onClick={handleNavigateToBP}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Bứt Phá
						</AControlButton>
						<AControlButton
							onClick={handleNavigateToVDC}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Về Đích Chung
						</AControlButton>
						<AControlButton
							onClick={handleNavigateToVDR}
							disabled={!currentMatchCode}
							className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
						>
							Về Đích Riêng
						</AControlButton>
					</div>
				</div>

			</div>
		</div>
	);
};

export default AWaitingPage;