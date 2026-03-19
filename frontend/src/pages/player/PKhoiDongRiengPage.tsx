
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";


const PKhoiDongRiengPage = () => {
	const { playerCode } = usePlayerSession();
	const { lastMessage } = usePlayerWebSocket();
	const { timer, start } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		// Debug logs to help verify payloads
		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		// Handles send_question/clear_question
		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info": {
				// Receive player information through WebSocket instead of API
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
						playerScore: p?.cumulativeScore ?? score?.cumulative_score ?? score?.cummulative_score ?? score?.new_total_score ?? 0,
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
				start(Number(msg.time_limit ?? 0));
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "buzzer_winner": {
				const winner = msg.user_code;
				setPlayers((prev) =>
					prev.map((p) => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false })),
				);
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

			case "blocked_buzz": {
				// blocked_buzz handling removed - state not used
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, start]);


	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
		>
			<>
				<PQuestionBoard
					title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
					question={currentQuestion}
					timerDuration={timer}
					controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
				/>

			</>
		</PBasePageLayout>
	);
};

export default PKhoiDongRiengPage;

