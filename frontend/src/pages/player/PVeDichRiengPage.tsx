/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";


const PVeDichRiengPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, start } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [hasPinged, setHasPinged] = useState(false);
	const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
	const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);

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

				const finalPlayers: PlayerStatus[] = (playersList ?? []).map((p: any) => {
					const code = String(p?.user_code ?? "");

					// resolve name: prefer player object, then profiles, then scoreboard entry
					let name = "";
					if (p?.user_name) name = p.user_name;
					else {
						const prof = (profiles ?? []).find((pr: any) => String(pr?.user_code) === code);
						if (prof) name = prof.user_name ?? "";
						else {
							const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
							name = scoreEntry?.user_name ?? "";
						}
					}

					// resolve score: prefer player.cumulative_score then scoreboard lookup; accept legacy spelling
					let scoreVal = 0;
					if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else if (typeof p?.cummulative_score === "number") scoreVal = p.cummulative_score;
					else {
						const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
						if (scoreEntry) scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.cummulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;
					}

					return {
						playerCode: code,
						playerName: name,
						playerScore: scoreVal,
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
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				setBlockedPlayerCode(null);
				start(Number(msg.time_limit ?? 0));
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "buzzer_winner": {
				const winner = msg.user_code;
				setBuzzerWinnerCode(winner ?? null);
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
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "blocked_buzz": {
				if (msg.user_code) setBlockedPlayerCode(msg.user_code);
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

		try {
			await fetch(`${API_BASE_URL}/answers/`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					user_code: playerCode,
					match_code: matchCode,
					question_code: currentQuestion.questionCode,
					has_buzzed: true,
				}),
			});
		} catch (err) {
			console.warn("Failed to POST buzz:", err);
		}

		const success = await sendMessage({ type: "buzz", user_code: playerCode, question_code: currentQuestion.questionCode, has_buzzed: true });
		if (success) setHasPinged(true);
	}, [buzzerWinnerCode, currentQuestion.questionCode, hasPinged, isConnected, playerCode, sendMessage, timer, token, matchCode]);

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
		>
			<>
				<PQuestionBoard
					title="VẾ DỊCH - LƯỢT CÁ NHÂN"
					question={currentQuestion}
					timerDuration={timer}
					controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
				/>

				<div className="p-3">
					<PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} />
				</div>
			</>
		</PBasePageLayout>
	);
};

export default PVeDichRiengPage;
