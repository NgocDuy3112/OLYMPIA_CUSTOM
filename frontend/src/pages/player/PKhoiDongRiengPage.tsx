
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { PlayerStatus } from "@/types/player";

function unwrapWsMessage(message: any): any {
	if (message && typeof message === "object" && "message" in message) {
		return message.message;
	}
	return message;
}

const PKhoiDongRiengPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendBuzz } = useWebSocket(matchCode);
	const { timer, start } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [hasPinged, setHasPinged] = useState(false);
	const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
	const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = unwrapWsMessage(lastMessage);

		// Handles send_question/clear_question
		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info": {
				// Receive player information through WebSocket instead of API
				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = playersList.map((p: any) => {
					const code = String(p.player_code ?? "");
					const profile = profiles.find((prof: any) => prof.player_code === code);
					const score = scoreboard.find((s: any) => s.player_code === code);
					return {
						playerCode: code,
						playerName: profile?.player_name ?? "",
						playerScore: score?.total_d_score ?? score?.new_total_score ?? 0,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: false,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "start_the_timer": {
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				setBlockedPlayerCode(null);
				start(Number(msg.time_limit ?? 0));
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "buzzer_winner": {
				const winner = msg.player_code;
				setBuzzerWinnerCode(winner ?? null);
				setPlayers((prev) =>
					prev.map((p) => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false })),
				);
				break;
			}

			case "player_score_updated": {
				if (msg.player_code && typeof msg.new_total_score === "number") {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === msg.player_code ? { ...p, playerScore: msg.new_total_score } : p,
						),
					);
				}
				break;
			}

			case "clear_buzz": {
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "blocked_buzz": {
				if (msg.player_code) setBlockedPlayerCode(msg.player_code);
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, start]);

	const handlePing = useCallback(async () => {
		if (!isConnected) return;
		if (hasPinged) return;
		if (timer <= 0) return;
		if (buzzerWinnerCode) return;
		if (!currentQuestion.questionCode) return;

		const success = await sendBuzz(playerCode, currentQuestion.questionCode, token);
		if (success) setHasPinged(true);
	}, [buzzerWinnerCode, currentQuestion.questionCode, hasPinged, isConnected, playerCode, sendBuzz, timer, token]);

	const isPingDisabled =
		hasPinged ||
		timer <= 0 ||
		!isConnected ||
		!!buzzerWinnerCode ||
		blockedPlayerCode === playerCode;

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
			title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
			currentQuestion={currentQuestion}
			timerDuration={timer}
		>
			<div className="p-3">
				<PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} />
			</div>
		</PBasePageLayout>
	);
};

export default PKhoiDongRiengPage;

