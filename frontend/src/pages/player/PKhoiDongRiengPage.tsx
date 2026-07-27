

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";

const PKhoiDongRiengPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { lastMessage } = usePlayerWebSocket();
	const { timer, startSynced } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		if (!matchCode || !token) return;
		let mounted = true;
		const fetchScores = async () => {
			try {
				const res = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!res.ok) return;
				const json = await res.json();
				const scoreboardList: any[] = json.data?.scoreboard ?? [];
				if (mounted && scoreboardList.length > 0) {
					setPlayers((prev) =>
						prev.map((p) => {
							const scoreEntry = scoreboardList.find((s) => s.user_code === p.playerCode);
							if (scoreEntry) {
								const newScore = scoreEntry.cumulative_score ?? scoreEntry.cumulative_score ?? scoreEntry.total_score ?? scoreEntry.score ?? 0;
								return { ...p, playerScore: newScore };
							}
							return p;
						}),
					);
				}
			} catch (err) {
				console.warn("Failed to fetch scoreboard on mount:", err);
			}
		};
		void fetchScores();
		return () => { mounted = false; };
	}, [matchCode, token]);

	useEffect(() => {
		return () => { audioRef.current?.pause(); };
	}, []);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info": {

				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = playersList.map((p: any) => {
					const code = String(p.user_code ?? "");
					const profile = profiles.find((prof: any) => prof.user_code === code);
					const score = scoreboard.find((s: any) => s.user_code === code);
					return {
						playerCode: code,
						playerName: p?.user_name ?? profile?.user_name ?? "",
						playerScore: p?.cumulative_score ?? p?.cumulative_score ?? score?.cumulative_score ?? score?.cumulative_score ?? 0,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: false,
						playerIsTurn: (p as any)?.is_current ?? false,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				audioRef.current?.pause();
				audioRef.current = new Audio('/audios/bgm/kd_60s.mp3');
				audioRef.current.play().catch(() => {});
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

			case "clear_buzz": {
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "player_wrong_attempt": {
				const { user_code, attempt_count } = msg ?? {};
				if (user_code && attempt_count) {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code
								? { ...p, playerWrongAttempts: attempt_count }
								: p,
						),
					);
					console.info("Player wrong attempt:", user_code, "count:", attempt_count);
				}
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced]);

	useEffect(() => {
		setPlayers((prev) =>
			prev.map((p) => ({ ...p, playerWrongAttempts: undefined })),
		);
	}, [currentQuestionIndex]);

	const hasPlayerWithSecondAttempt = players.some((p) => p.playerWrongAttempts === 1);

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
		>
			<PQuestionBoard
				title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
				question={currentQuestion}
				timerDuration={timer}
				controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
			>
				{}
				{hasPlayerWithSecondAttempt && (
					<div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold shrink-0 animate-pulse">
						Trả lời lần 2
					</div>
				)}
			</PQuestionBoard>
		</PBasePageLayout>
	);
};

export default PKhoiDongRiengPage;

