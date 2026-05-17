/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { Star, Shield } from "lucide-react";
import { API_BASE_URL } from "@/configs";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";

type RoundQuestion = { code: string; category: string; points: number };

const PVeDichRiengPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, startSynced } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
	const [activePower, setActivePower] = useState<"star" | "shield" | null>(null);
	const [hasPinged, setHasPinged] = useState(false);
	const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
	const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);
	const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(null);
	const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
	const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
	const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});

	// Auto-fetch scoreboard on mount to ensure accurate initial scores
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
	}, [matchCode, token]);;

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		// Debug logs to help verify payloads
		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		// Handles send_question/clear_question
		applyWsMessage(msg);
		if (msg?.type === "send_question" || msg?.type === "clear_question") setVideoPlayState(null);

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
					else if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else {
						const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
						if (scoreEntry) scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;
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
				setAnsweringWindowTimer(0); // Reset answering window when new timer starts
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "play_video":
				setVideoPlayState("playing");
				break;

			case "pause_video":
				setVideoPlayState("paused");
				break;

			case "veDich_power_activated":
				setActivePower((msg.power as "star" | "shield") ?? null);
				break;

			case "buzz": {
				// Don't show lightning icon yet — wait for admin's buzzer_winner broadcast
				// so only the fastest buzzer gets the icon
				console.info(`[VDR PLAYER] Received buzz: user_code=${msg.user_code}`);
				break;
			}

			case "buzzer_winner": {
				// Admin broadcasted the winner - show lightning icon for them
				const winner = msg.user_code;
				console.info(`[VDR PLAYER] Received buzzer_winner: winner=${winner}, myCode=${playerCode}, current=${buzzerWinnerCode}`);
				// Only accept the first buzzer_winner to avoid overriding
				if (winner && !buzzerWinnerCode) {
					setBuzzerWinnerCode(winner);
					setPlayers((prev) =>
						prev.map((p) => ({ ...p, playerHasBuzzed: p.playerCode === winner })),
					);
				}
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
				// msg.user_code may be null/empty to clear the blocked player
				setBlockedPlayerCode(msg.user_code ?? null);
				break;
			}

			case "veDich_questions_selected":
			case "veDich_rieng_questions_meta": {
				const metadata: RoundQuestion[] = msg.question_metadata ?? [];
				if (metadata.length > 0) setRoundQuestionsData(metadata);
				// Track whose turn it is (only for CÁ NHÂN round)
				if (msg.round === "rieng" && msg.selected_player_code) {
					setCurrentTurnPlayerCode(msg.selected_player_code);
				}
				// Reset buzz state when new question is selected so players can buzz again
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "veDich_question_state": {
				const { question_code, state: qState } = msg;
				if (question_code && qState) {
					setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
				}
				break;
			}
			case "answering_window_activated": {
				// Start the answering window countdown for other players
				const countdown = msg.countdown ?? 5;
				setAnsweringWindowTimer(countdown);
				break;
			}
			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced]);

	const handlePing = useCallback(async () => {
		console.info(`[VDR BUZZ] handlePing called: connected=${isConnected}, hasPinged=${hasPinged}, buzzerWinner=${buzzerWinnerCode}, answeringWindow=${answeringWindowTimer}`);
		if (!isConnected) {
			console.warn("[VDR BUZZ] Not connected");
			return;
		}
		if (hasPinged) {
			console.warn("[VDR BUZZ] Already pinged");
			return;
		}
		if (buzzerWinnerCode) {
			console.warn("[VDR BUZZ] Buzzer winner already exists");
			return;
		}
		if (blockedPlayerCode === playerCode) {
			console.warn("[VDR BUZZ] Player is blocked");
			return;
		}
		if (currentTurnPlayerCode === playerCode) {
			console.warn("[VDR BUZZ] Current turn player cannot buzz");
			return;
		}
		if (!currentQuestion.questionCode) {
			console.warn("[VDR BUZZ] No question selected");
			return;
		}
		// Only allow buzz when answering window is active (admin clicked "Mở chuông")
		if (answeringWindowTimer <= 0) {
			console.warn(`[VDR BUZZ] Cannot buzz: answeringWindow=${answeringWindowTimer}`);
			return;
		}

		try {
			const res = await fetch(`${API_BASE_URL}/answers/`, {
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
			if (!res.ok) {
				console.warn("Failed to POST buzz:", res.status);
			}
		} catch (err) {
			console.warn("Failed to POST buzz:", err);
		}

		// Only broadcast buzz if persisted (or if offline, still broadcast for real-time)
		const success = await sendMessage({ type: "buzz", user_code: playerCode, question_code: currentQuestion.questionCode, has_buzzed: true });
		console.info(`[VDR BUZZ] Buzz sent: success=${success}`);
		if (success) setHasPinged(true);
	}, [buzzerWinnerCode, currentQuestion.questionCode, hasPinged, isConnected, playerCode, sendMessage, token, matchCode, blockedPlayerCode, currentTurnPlayerCode, answeringWindowTimer]);

	const isPingDisabled =
		hasPinged ||
		!isConnected ||
		!!buzzerWinnerCode ||
		blockedPlayerCode === playerCode ||
		currentTurnPlayerCode === playerCode || // Current turn player cannot buzz (already has the floor)
		answeringWindowTimer <= 0; // Can only buzz when answering window is active (admin clicked "Mở chuông")

	// Debug logging
	console.info(`[VDR BUZZ DEBUG] isPingDisabled=${isPingDisabled}, hasPinged=${hasPinged}, connected=${isConnected}, buzzerWinner=${buzzerWinnerCode}, blocked=${blockedPlayerCode}, currentTurn=${currentTurnPlayerCode}, timer=${timer}, answeringWindow=${answeringWindowTimer}`);

	// Countdown answering window timer
	useEffect(() => {
		if (answeringWindowTimer <= 0) return;
		const intervalId = window.setInterval(() => {
			setAnsweringWindowTimer((prev) => (prev <= 1 ? 0 : prev - 1));
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [answeringWindowTimer]);

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
			buzzerWinnerCode={buzzerWinnerCode}
		>
			<>
				<PQuestionBoard
					title="VỀ ĐÍCH - LƯỢT CÁ NHÂN"
					question={currentQuestion}
					timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer}
					videoPlayState={videoPlayState}
				>
					<div className="flex gap-1 overflow-x-auto">
						{roundQuestionsData.length > 0
							? roundQuestionsData.map((q) => {
									const qState = questionStates[q.code] ?? "available";
									const isActive = currentQuestion.questionCode === q.code;
									return (
										<div key={q.code} className="w-55 shrink-0 h-20">
											<VeDichQuestionCard
												category={q.category}
												points={q.points}
												state={qState}
												isSelected={isActive}
												disabled={qState !== "available"}
											/>
										</div>
									);
								})
							: Array.from({ length: 3 }).map((_, i) => (
									<div key={`ph-${i}`} className="w-55 shrink-0 h-20">
										<VeDichQuestionCard placeholder category="" disabled />
									</div>
								))}
						</div>
					</PQuestionBoard>

				{activePower && (
					<div className="mx-3 mt-2 p-3 bg-blue-800 border-2 border-blue-400 rounded-xl flex items-center gap-3">
						{activePower === 'star' ? (
							<>
								<Star size={20} className="text-yellow-400 shrink-0" />
								<span className="font-bold text-yellow-300 uppercase tracking-wide">Ngôi sao hy vọng</span>
								<span className="text-yellow-200 text-sm">Đúng: +150% · Sai: -100%</span>
							</>
						) : (
							<>
								<Shield size={20} className="text-blue-400 shrink-0" />
								<span className="font-bold text-blue-300 uppercase tracking-wide">Bảo hộ miễn trừ</span>
								<span className="text-blue-200 text-sm">Đúng: +50% · Sai: không trừ</span>
							</>
						)}
					</div>
				)}

				<div className="p-3">
					<PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} />
				</div>
			</>
		</PBasePageLayout>
	);
};

export default PVeDichRiengPage;
