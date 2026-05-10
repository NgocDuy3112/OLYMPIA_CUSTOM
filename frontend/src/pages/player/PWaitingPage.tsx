import React, { useEffect, useState, useContext } from "react";
import { useParams } from "react-router-dom";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";
import { PlayerWebSocketContext } from "@/contexts/playerWsImpl";

interface RoomPlayer {
	user_code: string;
	user_name: string;
	position: number;
}

const PWaitingPage: React.FC = () => {
	const { matchCode: matchCodeParam } = useParams<{ matchCode: string }>();
	const matchCode = matchCodeParam ?? sessionStorage.getItem("matchCode") ?? "";
	const playerCode = sessionStorage.getItem("playerCode") ?? "";
	const token = sessionStorage.getItem("jwtToken_player") ?? "";

	const [matchName, setMatchName] = useState<string>("");
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [loaded, setLoaded] = useState(false);

	const wsCtx = useContext(PlayerWebSocketContext);
	const lastMessage = wsCtx?.lastMessage ?? null;

	useEffect(() => {
		if (!matchCode || !token) {
			setLoaded(true);
			return;
		}
		fetch(`${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}/room`, {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then((res) => res.json())
			.then((json) => {
				const data = json?.data ?? {};
				setMatchName(data.match_name ?? "");
				const roomPlayers: RoomPlayer[] = data.players ?? [];
				setPlayers(
					roomPlayers.map((p) => ({
						playerCode: p.user_code,
						playerName: p.user_name,
						playerScore: 0,
					})),
				);
			})
			.catch(() => {})
			.finally(() => setLoaded(true));
	}, [matchCode, token]);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	useEffect(() => {
		if (!lastMessage) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const raw = lastMessage as any;
		const msg = raw?.message ?? raw;

		if (msg?.type === "send_players_info") {
			const list: unknown[] = msg?.players ?? [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			setPlayers(list.map((p: any) => ({
				playerCode: String(p?.user_code ?? ""),
				playerName: p?.user_name ?? "",
				playerScore:
					typeof p?.cumulative_score === "number" ? p.cumulative_score :
					typeof p?.cummulative_score === "number" ? p.cummulative_score : 0,
			})));
		} else if (msg?.type === "player_score_updated") {
			if (msg?.user_code && typeof msg?.new_total_score === "number") {
				setPlayers((prev) =>
					prev.map((p) =>
						p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
					),
				);
			}
		}
	}, [lastMessage]);

	return (
		<div className="flex flex-col justify-start items-center h-screen overflow-hidden p-4">
			{/* Match name banner */}
			<div className="mt-8 text-center">
				<h1 className="font-[SVN-Gratelos_Display] text-5xl font-bold text-white uppercase tracking-wide">
					OLYMPIA CUSTOM 3
				</h1>
				{loaded && matchName && (
					<p className="mt-2 text-2xl font-semibold text-blue-300 uppercase">{matchName}</p>
				)}
				{loaded && !matchName && matchCode && (
					<p className="mt-2 text-lg text-blue-300">Mã trận: <strong>{matchCode}</strong></p>
				)}
			</div>

			{/* Player cards */}
			{loaded && players.length > 0 && (
				<div className="flex gap-4 max-w-7xl w-full justify-center mt-8">
					{players.map((p) => (
						<PPlayerRec
							key={p.playerCode}
							player={p}
							isCurrent={p.playerCode === playerCode}
						/>
					))}
				</div>
			)}

			{/* Status */}
			<p className="mt-8 text-sm text-white/60 text-center">
				Vui lòng đợi — hệ thống sẽ đưa bạn vào lượt khi trận đấu bắt đầu.
			</p>
		</div>
	);
};

export default PWaitingPage;
