/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { Music, Users, Play, UserCheck, Trophy, Flag } from "lucide-react";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AWaiting");

const AWaitingPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });

	const [isNavigating, setIsNavigating] = useState(false);
	const [isPlayingMusic, setIsPlayingMusic] = useState(false);
	const [isOpeningMatch, setIsOpeningMatch] = useState(false);
	const [isIntroducingPlayers, setIsIntroducingPlayers] = useState(false);
	const [isShowingScoreboard, setIsShowingScoreboard] = useState(false);
	const [isEndingMatch, setIsEndingMatch] = useState(false);

	const applyPlayersSnapshot = useCallback(
		(payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
			const playersList = Array.isArray(payload?.players) ? payload.players : [];
			const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
			const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreboardList, profileList, prev));
		},
		[],
	);

	const loadPlayersState = useCallback(async () => {
		if (!currentMatchCode || !token) return undefined;
		try {
			const playersRes = await fetch(`${API_BASE_URL}/matches/${currentMatchCode}/players`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			const playersJson = await playersRes.json();
			const playersList = playersJson.data?.players ?? [];

			let scoreList: any[] = [];
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const scoreJson = await scoreRes.json();
				scoreList = scoreJson.data?.scoreboard ?? [];
			} catch (err) {
				logger.error("Failed to load scoreboard:", err);
			}

			const profileResponses = await Promise.all(
				playersList.map((entry: any) =>
					fetch(`${API_BASE_URL}/users/?user_code=${entry.user_code}`, {
						headers: { Authorization: `Bearer ${token}` },
					})
						.then((res) => res.json())
						.catch(() => null),
				),
			);
			const profiles = playersList.map((entry: any, index: number) => ({
				user_code: entry.user_code,
				user_name: profileResponses[index]?.data?.user_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));
			return { playersList, scoreList, profiles };
		} catch (err) {
			logger.error("Failed to load players:", err);
			return undefined;
		}
	}, [currentMatchCode, token]);

	const sendPlayersSnapshot = useCallback(async () => {
		if (!currentMatchCode) return;
		try {
			const payload = await loadPlayersState();
			if (!payload) return;
			const { playersList, scoreList, profiles } = payload;
			const mergedPlayers = (playersList ?? []).map((p: any) => {
				const userCode = String(p?.user_code ?? p?.playerCode ?? "");
				const profile = (profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {};
				const scoreEntry = (scoreList ?? []).find((s: any) => String(s?.user_code) === userCode) ?? {};
				const cumulativeScore = scoreEntry?.cumulative_score ?? scoreEntry?.cummulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;
				return {
					user_code: userCode,
					user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
					position: p?.position ?? p?.pos ?? undefined,
					cumulative_score: cumulativeScore,
				};
			});
			await sendMessage({ type: "send_players_info", players: mergedPlayers });
		} catch (err) {
			logger.error("Failed to send players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage]);

	useEffect(() => {
		void loadPlayersState();
	}, [loadPlayersState]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = (lastMessage as any)?.message ?? lastMessage;

		switch (msg?.type) {
			case "send_players_info": {
				applyPlayersSnapshot(msg);
				break;
			}
			case "player_score_updated": {
				if (msg.user_code && typeof msg.new_total_score === "number") {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
						),
					);
				}
				break;
			}
			case "player_online": {
				if (msg.user_code) {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p,
						),
					);
					(async () => {
						await sendPlayersSnapshot();
						await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/waiting" });
					})();
				}
				break;
			}
			case "mc_online": {
				if (msg.user_code) {
					(async () => {
						await sendPlayersSnapshot();
						await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/waiting" });
					})();
				}
				break;
			}
		}
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, sendMessage]);

	const handleNavigateToWaiting = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsNavigating(true);
		try {
			await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
		} catch (err) {
			logger.error("Failed to navigate to waiting:", err);
		} finally {
			setIsNavigating(false);
		}
	}, [currentMatchCode, sendMessage]);

	const handlePlayWaitingMusic = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsPlayingMusic(true);
		try {
			await sendMessage({ type: "play_bgm", phase: "waiting" });
		} catch (err) {
			logger.error("Failed to send play_bgm:", err);
		} finally {
			setIsPlayingMusic(false);
		}
	}, [currentMatchCode, sendMessage]);

	const handleOpenMatch = useCallback(async () => {
		if (!currentMatchCode) return;
		setIsOpeningMatch(true);
		try {
			await sendMessage({ type: "open_match" });
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
			await sendMessage({ type: "end_match" });
			await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
		} catch (err) {
			logger.error("Failed to send end_match:", err);
		} finally {
			setIsEndingMatch(false);
		}
	}, [currentMatchCode, sendMessage]);

	return (
		<div className="flex flex-col h-screen overflow-hidden">
			<AdminGameplayNavBar />
			<div className="flex flex-col flex-1 items-center gap-6 p-6 overflow-y-auto">
				<h1 className="font-[SVN-Gratelos_Display] text-4xl xl:text-5xl font-bold text-white uppercase tracking-wide text-center">
					Sảnh Chờ
				</h1>

				{currentMatchCode ? (
					<p className="text-blue-300 text-sm">Mã trận: <strong>{currentMatchCode}</strong></p>
				) : (
					<p className="text-yellow-400 text-sm">Chưa chọn trận đấu</p>
				)}

				{/* Player list */}
				{players.length > 0 && (
					<div className="flex flex-col gap-3 w-full max-w-2xl">
						<p className="text-white/60 text-xs uppercase tracking-widest">Thí sinh</p>
						{players.map((player) => (
							<APlayerBar
								key={player.playerCode}
								player={player}
								isActive={false}
							/>
						))}
					</div>
				)}

				{/* Ceremony controls */}
				<div className="flex flex-col gap-4 w-full max-w-2xl">
					<p className="text-white/60 text-xs uppercase tracking-widest text-center">Điều hành lễ</p>
					<div className="flex flex-wrap gap-4 items-center justify-center">
						<AControlButton
							onClick={handleOpenMatch}
							disabled={isOpeningMatch || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Play size={18} />
							{isOpeningMatch ? "Đang gửi..." : "Mở đầu trận đấu"}
						</AControlButton>

						<AControlButton
							onClick={handleIntroducePlayers}
							disabled={isIntroducingPlayers || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<UserCheck size={18} />
							{isIntroducingPlayers ? "Đang gửi..." : "Giới thiệu thí sinh"}
						</AControlButton>

						<AControlButton
							onClick={handleShowScoreboard}
							disabled={isShowingScoreboard || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Trophy size={18} />
							{isShowingScoreboard ? "Đang gửi..." : "Tổng kết điểm số"}
						</AControlButton>

						<AControlButton
							onClick={handleEndMatch}
							disabled={isEndingMatch || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Flag size={18} />
							{isEndingMatch ? "Đang gửi..." : "Kết thúc trận đấu"}
						</AControlButton>
					</div>
				</div>

				{/* Navigation + audio controls */}
				<div className="flex flex-col gap-4 w-full max-w-2xl">
					<p className="text-white/60 text-xs uppercase tracking-widest text-center">Điều hướng & Âm thanh</p>
					<div className="flex flex-wrap gap-6 items-center justify-center">
						<AControlButton
							onClick={handleNavigateToWaiting}
							disabled={isNavigating || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Users size={18} />
							{isNavigating ? "Đang chuyển..." : "Chuyển Player & MC về Chờ"}
						</AControlButton>

						<AControlButton
							onClick={handlePlayWaitingMusic}
							disabled={isPlayingMusic || !currentMatchCode}
							className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
						>
							<Music size={18} />
							{isPlayingMusic ? "Đang phát..." : "Phát Nhạc Chờ (Bot)"}
						</AControlButton>
					</div>
				</div>
			</div>
		</div>
	);
};

export default AWaitingPage;