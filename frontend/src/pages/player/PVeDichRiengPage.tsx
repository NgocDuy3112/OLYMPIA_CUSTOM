/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
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
	const lastBuzzerQuestionRef = useRef<string | null>(null);
	const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);
	const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(null);
	const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
	const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
	const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});
	const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => {
		if (!matchCode) return {};
		try {
			const stored = localStorage.getItem(`veDich_powers_${matchCode}`);
			return stored ? JSON.parse(stored) : {};
		} catch { return {}; }
	});

	// ─── Power window state (mirrors VDC behaviour) ────────────────────────────
	const [powerWindowOpen, setPowerWindowOpen] = useState(false);
	const [powerWindowCountdown, setPowerWindowCountdown] = useState(0);
	const [selectedPower, setSelectedPower] = useState<"star" | "shield" | null>(null);
	const powerWindowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
				// Also reset the buzzer-question ref so the next `buzzer_winner`
				// for a fresh timer is accepted even if the previous buzz was
				// for the same `question_code`. Without this, an admin who
				// re-uses the previous question (no fresh `clear_buzz` between
				// rounds) would have the new winner dropped by the guard.
				lastBuzzerQuestionRef.current = null;
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

			case "vd_power_activated":
				setActivePower((msg.power as "star" | "shield") ?? null);
				break;

			case "vd_power_window_open": {
				// Server is the source of truth: if it attached an explicit
				// eligible list, drop the message when we're not on it. This
				// also implicitly handles "already used a power" because the
				// server's `compute_eligible_user_codes` filters out players
				// in the used-powers HASH. We deliberately do NOT consult the
				// local `usedPowers` cache here — a stale localStorage entry
				// (e.g. from a previous match that reused the same matchCode)
				// would otherwise block the panel forever.
				const eligible = msg.eligible_user_codes;
				if (Array.isArray(eligible) && eligible.length > 0 && !eligible.includes(playerCode ?? "")) {
					console.info("[VDR] Ignoring vd_power_window_open: not in eligible_user_codes", { eligible, me: playerCode });
					break;
				}
				const duration = Number(msg.duration ?? 5);
				setPowerWindowOpen(true);
				setPowerWindowCountdown(duration);
				setSelectedPower(null);
				break;
			}

			case "vd_player_power": {
				// Player activated a power (star/shield) during the 5s window
				const { user_code, power } = msg;
				if (user_code && (power === "star" || power === "shield")) {
					// Update usedPowers state
					setUsedPowers((prev) => {
						const next = { ...prev, [user_code]: power };
						// Persist immediately so the choice survives page reloads
						// (admin may not have broadcast vd_powers_used yet).
						try { localStorage.setItem(`veDich_powers_${matchCode}`, JSON.stringify(next)); } catch { /* ignore */ }
						return next;
					});
					// Update playerPower in players array for display
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code ? { ...p, playerPower: power as "star" | "shield" } : p,
						),
					);
				}
				break;
			}

			case "vd_powers_used": {
				if (msg.used_powers) {
					setUsedPowers(msg.used_powers);
					try { localStorage.setItem(`veDich_powers_${matchCode}`, JSON.stringify(msg.used_powers)); } catch { /* ignore */ }
					// Update playerPower in players array for display
					setPlayers((prev) =>
						prev.map((p) => {
							const power = msg.used_powers[p.playerCode];
							return power ? { ...p, playerPower: power as "star" | "shield" } : p;
						}),
					);
				}
				break;
			}

			case "buzzer_winner": {
				// Admin broadcasted the winner - show lightning icon for them
				const winner = msg.user_code;
				const winnerQuestion = msg.question_code;
				if (winner && (winnerQuestion !== lastBuzzerQuestionRef.current)) {
					setBuzzerWinnerCode(winner);
					lastBuzzerQuestionRef.current = winnerQuestion;
					setPlayers((prev) => {
						const updated = prev.map((p) => ({ ...p, playerHasBuzzed: p.playerCode === winner }));
						return updated;
					});
				} else {
					console.warn(`[VDR PLAYER] Ignoring buzzer_winner: winner=${winner}, existing=${buzzerWinnerCode}`);
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
				lastBuzzerQuestionRef.current = null;
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}
			case "blocked_buzz": {
				// msg.user_code may be null/empty to block all players or clear the blocked player
				if (msg.user_code === null || msg.user_code === undefined) {
					// Block all players - no one can buzz anymore
					console.info("[VDR PLAYER] Blocking all buzzers");
					setBlockedPlayerCode("*ALL*");
				} else if (msg.user_code === "") {
					// Clear blocked player
					setBlockedPlayerCode(null);
				} else {
					// Block specific player
					setBlockedPlayerCode(msg.user_code);
				}
				break;
			}

			case "vd_questions_selected":
			case "vdr_questions_meta": {
				const metadata: RoundQuestion[] = msg.question_metadata ?? [];
				if (metadata.length > 0) setRoundQuestionsData(metadata);
				if (msg.round === "rieng" && msg.selected_player_code) {
					setCurrentTurnPlayerCode(msg.selected_player_code);
				}
				// Reset buzz state when new question is selected so players can buzz again
				setHasPinged(false);
				setBuzzerWinnerCode(null);
				lastBuzzerQuestionRef.current = null;
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}
			case "vdr_question_state": {
				const { question_code, state: qState } = msg;
				if (question_code && qState) {
					setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
				}
				break;
			}
			case "answering_window_activated": {
				const countdown = 5;
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

		// Track whether we WON the buzzer race server-side. Only set hasPinged
		// if we won, otherwise the player will be wrongly marked as already-
		// buzzed on the client and unable to retry after admin reopens the
		// answering window (e.g. buzzed-wrong → clear_buzz → Mở Chuông again).
		let wonBuzzer = false;
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
			if (res.status === 201 || res.status === 200) {
				wonBuzzer = true;
			} else if (res.status === 409) {
				console.info("[VDR BUZZ] Lost buzzer race (409); another player won. Waiting for blocked_buzz event to disable button.");
			} else {
				console.warn("[VDR BUZZ] Failed to POST buzz:", res.status);
			}
		} catch (err) {
			console.warn("[VDR BUZZ] Failed to POST buzz:", err);
		}

		const wsEchoOk = await sendMessage({
			type: "buzz",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			has_buzzed: true
		});

		if (wonBuzzer && wsEchoOk) {
			setHasPinged(true);
		}
	}, [buzzerWinnerCode, currentQuestion.questionCode, hasPinged, isConnected, playerCode, sendMessage, token, matchCode, blockedPlayerCode, currentTurnPlayerCode, answeringWindowTimer]);

	const isPingDisabled =
		hasPinged ||
		!isConnected ||
		!!buzzerWinnerCode ||
		blockedPlayerCode === playerCode ||
		currentTurnPlayerCode === playerCode ||
		answeringWindowTimer <= 0;

	// Countdown answering window timer
	useEffect(() => {
		if (answeringWindowTimer <= 0) return;
		const intervalId = window.setInterval(() => {
			setAnsweringWindowTimer((prev) => (prev <= 1 ? 0 : prev - 1));
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [answeringWindowTimer]);

	// Power window countdown (mirrors VDC behaviour)
	useEffect(() => {
		if (!powerWindowOpen || powerWindowCountdown <= 0) return;
		powerWindowTimerRef.current = window.setInterval(() => {
			setPowerWindowCountdown((prev) => {
				if (prev <= 1) {
					setPowerWindowOpen(false);
					// Notify admin that power window has closed
					void sendMessage({
						type: "vd_power_window_closed",
						user_code: playerCode
					}
					);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => {
			if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current);
		};
	}, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);


	const handleSelectPower = useCallback(async (power: "star" | "shield") => {
		if (!powerWindowOpen || usedPowers[playerCode]) return;
		setSelectedPower(power);
		setPowerWindowOpen(false);
		// Send to admin via WS
		try {
			await sendMessage({
				type: "vd_player_power",
				user_code: playerCode,
				power,
			});
		} catch (err) {
			console.warn("Failed to send power selection:", err);
		}
	}, [powerWindowOpen, usedPowers, playerCode, sendMessage]);

	// Cleanup power window on unmount
	useEffect(() => {
		return () => {
			if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current);
		};
	}, []);

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
			currentTurnPlayerCode={currentTurnPlayerCode}
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
									<div key={q.code} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
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
								<div key={`ph-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
									<VeDichQuestionCard placeholder category="" disabled />
								</div>
							))}
					</div>
				</PQuestionBoard>

				{/* Power selection window */}
				{powerWindowOpen && !usedPowers[playerCode ?? ''] && (
					<div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-4 flex flex-col items-center gap-3">
						<p className="text-white font-bold text-lg">Chọn quyền năng ({powerWindowCountdown}s)</p>
						<div className="flex gap-4">
							<button
								onClick={() => { void handleSelectPower('star'); }}
								className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${selectedPower === 'star'
										? 'bg-white-500 text-blue-900 ring-2 ring-white-300'
										: 'bg-white-500/20 text-white-300 border-2 border-white-500/50 hover:bg-white-500/40'
									}`}
							>
								<Star size={20} />
								<span>Ngôi Sao Hy Vọng</span>
							</button>
							<button
								onClick={() => { void handleSelectPower('shield'); }}
								className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${selectedPower === 'shield'
										? 'bg-blue-500 text-blue-900 ring-2 ring-blue-300'
										: 'bg-blue-500/20 text-blue-300 border-2 border-blue-500/50 hover:bg-blue-500/40'
									}`}
							>
								<Shield size={20} />
								<span>Bảo Hộ Miễn Trừ</span>
							</button>
						</div>
						<p className="text-blue-300 text-sm">Chỉ được dùng 1 lần xuyên suốt VĐC & VĐR</p>
					</div>
				)}

				{/* Power just selected indicator */}
				{selectedPower && !powerWindowOpen && !usedPowers[playerCode ?? ''] && (
					<div className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm ${selectedPower === 'star'
							? 'bg-white-500/20 text-white-300 border border-white-500/50'
							: 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
						}`}>
						{selectedPower === 'star' ? <Star size={16} /> : <Shield size={16} />}
						<span>Đã chọn {selectedPower === 'star' ? 'Ngôi Sao Hy Vọng' : 'Bảo Hộ Miễn Trừ'}</span>
					</div>
				)}

				<div className="p-3">
					<PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} />
				</div>

				{activePower && (
					<div className="mx-3 mt-2 p-3 bg-blue-800 border-2 border-blue-400 rounded-xl flex items-center gap-3">
						{activePower === 'star' ? (
							<>
								<Star size={20} className="text-white-400 shrink-0" />
								<span className="font-bold text-white-300 uppercase tracking-wide">Ngôi sao hy vọng</span>
								<span className="text-white-200 text-sm">Đúng: +150% · Sai: -100%</span>
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

				{!activePower && usedPowers[playerCode ?? ''] && (
					<div className="mx-3 mt-2 p-3 bg-blue-900/60 border-2 border-blue-400 rounded-xl flex items-center gap-2 font-bold text-sm text-blue-100">
						{usedPowers[playerCode ?? ''] === 'star' ? <Star size={18} className="shrink-0" /> : <Shield size={18} className="shrink-0" />}
						<span>
							Bạn đã dùng Quyền năng {usedPowers[playerCode ?? ''] === 'star' ? 'Ngôi Sao Hy Vọng' : 'Bảo Hộ Miễn Trừ'}.
							Bạn KHÔNG THỂ sử dụng Quyền năng trong phần còn lại của vòng thi.
						</span>
					</div>
				)}


			</>
		</PBasePageLayout>
	);
};

export default PVeDichRiengPage;
