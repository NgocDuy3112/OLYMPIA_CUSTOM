/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";
import { Star, Shield } from "lucide-react";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";



const PVeDichChungPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);

	type RoundQuestion = { code: string; category: string; points: number };
	const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(() => {
		if (!matchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_chung_meta_${matchCode}`);
			return stored ? (JSON.parse(stored) as RoundQuestion[]) : [];
		} catch { return []; }
	});
	const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [answer, setAnswer] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);

	// ─── Power state ─────────────────────────────────────────────────────────────
	const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => {
		if (!matchCode) return {};
		try {
			const stored = localStorage.getItem(`veDich_powers_${matchCode}`);
			return stored ? JSON.parse(stored) : {};
		} catch { return {}; }
	});
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
	}, [matchCode, token]);

	// Request question metadata from admin if not available in localStorage
	useEffect(() => {
		if (!matchCode || !isConnected) return;
		if (roundQuestionsData.length === 0) {
			// Request metadata from admin
			sendMessage({ type: "vd_questions_meta_request", match_code: matchCode });
		}
	}, [matchCode, isConnected, roundQuestionsData.length, sendMessage]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		// Debug logs to help verify payloads
		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		// Let the question hook handle send_question/clear_question
		applyWsMessage(msg);
		if (msg?.type === "send_question" || msg?.type === "clear_question") setVideoPlayState(null);

		switch (msg?.type) {
			case "send_players_info": {
				// Receive player information through WebSocket; support both old (players+scoreboard+profiles)
				// and new (players[] where each player already contains cumulative_score/user_name) shapes.
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
						playerHasBuzzed: undefined,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setAnswer("");
				setShowAnswers(false);
				break;
			}

			case "play_video":
				setVideoPlayState("playing");
				break;

			case "pause_video":
				setVideoPlayState("paused");
				break;

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

			case "clear_answers": {
				setPlayers((prev) =>
					prev.map((p) => ({
						...p,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					})),
				);
				setAnswer("");
				setShowAnswers(false);
				break;
			}

			case "send_answers_to_players": {
				const answers = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const ans = answers.find((a: any) => a.user_code === p.playerCode);
						if (!ans) return p;
						return {
							...p,
							playerLastAnswer: ans.content,
							playerTimestamp: ans.timestamp || p.playerTimestamp,
						};
					}),
				);
				setShowAnswers(true);
				break;
			}

			case "buzz": {
				// Buzz notification from another player
				const { user_code } = msg;
				if (user_code && user_code !== playerCode) {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p,
						),
					);
					console.info("Player received buzz from", user_code);
				}
				break;
			}

			case "vdc_question_state": {
				const { question_code, state: qState } = msg;
				if (question_code && qState) {
					setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
				}
				break;
			}

			case "vd_questions_selected":
			case "vdc_questions_meta": {
				const metadata: RoundQuestion[] = msg.question_metadata ?? [];
				if (metadata.length > 0) {
					setRoundQuestionsData(metadata);
					try { localStorage.setItem(`veDich_chung_meta_${matchCode}`, JSON.stringify(metadata)); } catch { /* ignore */ }
				}
				break;
			}

			case "vd_power_window_open": {
				// 5s window to choose a power
				if (usedPowers[playerCode]) break; // already used a power
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
						// Persist immediately so the choice survives navigation to VDR
						// and page reloads (admin may not have broadcast vd_powers_used yet).
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
				// Sync used powers from admin
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

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced, playerCode, usedPowers, matchCode]);

	// Power window countdown
	useEffect(() => {
		if (!powerWindowOpen || powerWindowCountdown <= 0) return;
		powerWindowTimerRef.current = window.setInterval(() => {
			setPowerWindowCountdown((prev) => {
				if (prev <= 1) {
					setPowerWindowOpen(false);
					// Notify admin that power window has closed
					void sendMessage({ type: "vd_power_window_closed", user_code: playerCode });
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => {
			if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current);
		};
	}, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);

	// Auto-submit power when countdown reaches 0 or player selects
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

	const handleSubmitAnswer = useCallback(async () => {
		const trimmed = answer.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (timer <= 0) return;
		if (!currentQuestion.questionCode) return;

		const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerLastAnswer: trimmed, playerTimestamp: Number(ts.toFixed(3)) }
					: p,
			),
		);

		try {
			// Persist answer via REST
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
					answer_text: trimmed,
					has_buzzed: false,
					timestamp: ts,
				}),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				console.warn("Failed to POST answer:", res.status, body);
			}
		} catch (err) {
			console.warn("Failed to POST answer:", err);
		}

		// Send real-time frame
		await sendMessage({
			type: "player_answer",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			answer_text: trimmed,
			timestamp: ts,
		});
		setAnswer("");
	}, [answer, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendMessage, timeLimit, timer, token, matchCode]);

	const isSubmissionDisabled = !isConnected || timer <= 0;

	// Always show the current player's own answer; hide others until admin reveals
	const displayPlayers = players.map((p) =>
		showAnswers || p.playerCode === playerCode ? p : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
	);

	return (
		<PBasePageLayout
			players={displayPlayers}
			currentPlayerCode={playerCode}
		>
			<>
				<PQuestionBoard
					title="VỀ ĐÍCH - LƯỢT CHUNG"
					question={currentQuestion}
					timerDuration={timer}
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
							: Array.from({ length: players.length || 4 }).map((_, i) => (
								<div key={`ph-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
									<VeDichQuestionCard placeholder category="" disabled />
								</div>
							))}
					</div>
				</PQuestionBoard>

				{/* Power selection window */}
				{powerWindowOpen && !usedPowers[playerCode] && (
					<div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-4 flex flex-col items-center gap-3">
						<p className="text-white font-bold text-lg">Chọn quyền năng ({powerWindowCountdown}s)</p>
						<div className="flex gap-4">
							<button
								onClick={() => { void handleSelectPower('star'); }}
								className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${
									selectedPower === 'star'
										? 'bg-white-500 text-blue-900 ring-2 ring-white-300'
										: 'bg-white-500/20 text-white-300 border-2 border-white-500/50 hover:bg-white-500/40'
								}`}
							>
								<Star size={20} />
								<span>Ngôi Sao Hy Vọng</span>
							</button>
							<button
								onClick={() => { void handleSelectPower('shield'); }}
								className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${
									selectedPower === 'shield'
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

				<PAnswerBox
					answer={answer}
					setAnswer={setAnswer}
					isDisabled={isSubmissionDisabled}
					onSubmit={handleSubmitAnswer}
					placeholderString={timer <= 0 ? "Bạn không thể nhập đáp án tại thời điểm này" : "Nhập đáp án và nhấn Enter"}
				/>

				{/* Power already used indicator */}
				{!powerWindowOpen && usedPowers[playerCode] && (
					<div className="bg-blue-900/60 border-2 border-blue-400 rounded-xl p-3 flex items-center gap-2 font-bold text-sm text-blue-100">
						{usedPowers[playerCode] === 'star' ? <Star size={18} className="shrink-0" /> : <Shield size={18} className="shrink-0" />}
						<span>
							Bạn đã dùng Quyền năng {usedPowers[playerCode] === 'star' ? 'Ngôi Sao Hy Vọng' : 'Bảo Hộ Miễn Trừ'}.
							Bạn KHÔNG THỂ sử dụng Quyền năng trong phần còn lại của vòng thi.
						</span>
					</div>
				)}

				
			</>
		</PBasePageLayout>
	);
};

export default PVeDichChungPage;
