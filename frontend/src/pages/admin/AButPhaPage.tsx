/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { AlarmClockCheck, Calculator, Eye, Power, RefreshCw, Play } from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
const logger = createLogger("AButPha");
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";


const TIME_LIMIT = 30;
const MAX_QUESTION_INDEX = 5;
const QUESTION_PREFIX = "OC3_Q_BP"; // Bứt Phá question naming convention.


const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};




const AButPhaPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode") ?? "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	// Allow multi-selection in this page
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((code: string) => {
		setSelectedPlayerCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
	}, []);
	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);
	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const timerStartedAtRef = useRef<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	const computePlayersSnapshot = useCallback(
		(
			playersList: any[],
			scoreboard: any[] = [],
			profiles: any[] = [],
			previousPlayers: PlayerStatus[] = [],
		): PlayerStatus[] => buildPlayersSnapshot(playersList, scoreboard, profiles, previousPlayers),
		[],
	);

	const applyPlayersSnapshot = useCallback(
		(payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
			const playersList = Array.isArray(payload?.players) ? payload.players : [];
			const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
			const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
			setPlayers((prev) => computePlayersSnapshot(playersList, scoreboardList, profileList, prev));
		},
		[computePlayersSnapshot],
	);

	const loadPlayersState = useCallback(async () => {
		if (!currentMatchCode || !token) return;
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
			} catch (error) {
				logger.error("Failed to load scoreboard:", error);
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

			setPlayers((prev) => computePlayersSnapshot(playersList, scoreList, profiles, prev));

			// return payload useful for sendPlayersSnapshot
			return { playersList, scoreList, profiles };
		} catch (error) {
			logger.error("Failed to load players:", error);
		}
	}, [computePlayersSnapshot, currentMatchCode, token]);

	// Broadcast the current players/scoreboard/profiles snapshot to players via WS
	const sendPlayersSnapshot = useCallback(async () => {
		if (!currentMatchCode) return;
		logger.info("sendPlayersSnapshot: preparing to send snapshot");
		try {
			const payload = await loadPlayersState();
			if (!payload) {
				logger.warn("sendPlayersSnapshot: loadPlayersState returned no payload");
				return;
			}
			const { playersList, scoreList, profiles } = payload as any;

			// build a consolidated players array that includes cumulative score and position
			const mergedPlayers = (playersList ?? []).map((p: any) => {
				const userCode = String(p?.user_code ?? p?.playerCode ?? "");
				const profile = (profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {};
				const scoreEntry = (scoreList ?? []).find((s: any) => String(s?.user_code) === userCode) ?? {};

				const cumulativeScore =
					scoreEntry?.cumulative_score ?? scoreEntry?.cummulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;

				return {
					user_code: userCode,
					user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
					position: p?.position ?? p?.pos ?? undefined,
					cumulative_score: cumulativeScore,
				};
			});

			try {
				await sendMessage({ type: "send_players_info", players: mergedPlayers });
				logger.info("sendPlayersSnapshot: sent players snapshot via WS");
			} catch (err) {
				logger.error("Failed to broadcast players info via WS:", err);
			}
		} catch (err) {
			logger.error("Failed to prepare players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage]);

	const resolveQuestionCode = useCallback((questionIndex: number) => {
		return `${QUESTION_PREFIX}_${String(questionIndex)}`;
	}, []);

	const mapQuestionPayload = useCallback((payload: any, fallbackCode?: string): Question => {
		return {
			questionCode: payload?.question_code ?? fallbackCode ?? "",
			questionText: payload?.question?.content ?? payload?.question_content ?? "",
			questionAnswer: payload?.question?.correct_answers ?? payload?.correct_answer ?? "",
			questionExplanation: payload?.question?.explanation ?? payload?.question_explanation ?? "",
			questionMediaURL: payload?.question?.extra_info?.media_source ?? payload?.question_media_url ?? undefined,
		};
	}, []);

	const loadQuestion = useCallback(
		async (questionIndex: number): Promise<Question | undefined> => {
			if (!currentMatchCode || !token) return undefined;
			if (questionIndex <= 0) {
				setCurrentQuestion({ ...DEFAULT_QUESTION });
				return { ...DEFAULT_QUESTION };
			}

			const questionCode = resolveQuestionCode(questionIndex);

			try {
				const res = await fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const data = await res.json();
				const mapped = mapQuestionPayload(data.data, questionCode);
				setCurrentQuestion(mapped);
				return mapped;
			} catch (error) {
				logger.error("Failed to load question:", error);
				const mapped = mapQuestionPayload(null, questionCode);
				setCurrentQuestion(mapped);
				return mapped;
			}
		},
		[currentMatchCode, mapQuestionPayload, resolveQuestionCode, token],
	);

	const sendQuestionToplayers = useCallback(
		async (questionIndex: number, question?: Question) => {
			if (!currentMatchCode) return;
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
			const payloadQuestion = question ?? currentQuestion;

			try {
				await sendMessage({
					type: "send_question",
					user_code: "",
					question_code: questionCode,
					content: payloadQuestion.questionText ?? "",
					media_source: payloadQuestion.questionMediaURL ?? undefined,
				});
			} catch (error) {
				logger.error("Failed to broadcast question via WS:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, sendMessage, currentQuestion],
	);

	const clearQuestion = useCallback(async () => {
		if (!currentMatchCode) return;
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (error) {
			logger.error("Failed to clear question via WS:", error);
		}
	}, [currentMatchCode, sendMessage]);

	// Reset hasAddedScore whenever active question changes
	useEffect(() => { setHasAddedScore(false); }, [currentQuestionIndex]);

	const handleStartRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			// Navigate players to the player view first so that the subsequent snapshot is the most-recent message
			try {
				await sendMessage({ type: "round_start", round: "bp" });
				await sendMessage({ type: "navigate", user_code: "", path: `/player/bp` });
			} catch (err) {
				logger.error("Failed to navigate players to player view:", err);
			}

			// send current players snapshot to players when starting the round
			try {
				await sendPlayersSnapshot();
			} catch (err) {
				logger.error("Failed to send players snapshot on start:", err);
			}
		} catch (error) {
			logger.error("Failed to start round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage, sendPlayersSnapshot]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "round_end", round: "bp" });
			await sendMessage({ type: "navigate", user_code: "", path: `/player/waiting` });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const startTheClock = useCallback(
		async (questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			// prevent restarting while already counting down
			if (timer > 0) {
				logger.warn("startTheClock: timer already running, ignoring start request");
				return;
			}
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
			timerStartedAtRef.current = Date.now();
			setTimer(TIME_LIMIT);

			try {
				await sendMessage({ type: "start_the_timer", user_code: "", time_limit: TIME_LIMIT, question_code: questionCode, started_at: Date.now() });
			} catch (error) {
				logger.error("Failed to start the clock via WS:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, sendMessage, token, timer],
	);



	const showAnswers = useCallback(async () => {
		if (!canShowAnswers) return;
		const questionCode = currentQuestion.questionCode;
		const answersPayload: Array<{ user_code: string; content: string; timestamp: number }> = [];
		for (const player of players) {
			try {
				const url = `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(currentMatchCode!)}&user_code=${encodeURIComponent(player.playerCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) continue;
				const json = await res.json();
				const data = json.data;
				if (!data) continue;
				const answerObj = Array.isArray(data) ? data[0] : data;
				if (answerObj?.answer_text) {
					answersPayload.push({ user_code: player.playerCode, content: answerObj.answer_text, timestamp: answerObj.timestamp ?? 0 });
				}
			} catch (err) {
				logger.warn("showAnswers: failed for", player.playerCode, err);
			}
		}
		try {
			await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
		} catch (err) {
			logger.error("showAnswers: failed to broadcast:", err);
		}
	}, [canShowAnswers, currentMatchCode, token, currentQuestion, players, sendMessage]);

	const handleAddScore = useCallback(
		async (playerCode: string, delta: number, broadcast = true) => {
			if (!playerCode) return;
			setPlayers((prev) => prev.map((p) => p.playerCode === playerCode ? { ...p, playerScore: (p.playerScore ?? 0) + delta } : p));
			if (!currentMatchCode || !token) return;
			const questionCode = currentQuestion.questionCode;
			try {
				if (questionCode) {
					const recordRes = await fetch(`${API_BASE_URL}/records/`, {
						method: "POST",
						headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
						body: JSON.stringify({ user_code: playerCode, match_code: currentMatchCode, question_code: questionCode, points: delta }),
					});
					if (!recordRes.ok) logger.warn("handleAddScore: record POST failed", recordRes.status);
				}
			} catch (err) {
				logger.error("handleAddScore: record POST error:", err);
			}
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, { headers: { Authorization: `Bearer ${token}` } });
				const scoreJson: any = await scoreRes.json().catch(() => ({}));
				let scoreboardArr: any[] = [];
				if (Array.isArray(scoreJson.data)) scoreboardArr = scoreJson.data;
				else if (Array.isArray(scoreJson.data?.scoreboard)) scoreboardArr = scoreJson.data.scoreboard;
				else if (Array.isArray(scoreJson.scoreboard)) scoreboardArr = scoreJson.scoreboard;
				setPlayers((prev) => prev.map((p) => {
					const entry = scoreboardArr.find((item: any) => item.user_code === p.playerCode);
					const updated = entry?.cumulative_score ?? entry?.cummulative_score ?? entry?.total_score ?? entry?.score;
					return typeof updated === "number" ? { ...p, playerScore: updated } : p;
				}));
			} catch (err) {
				logger.error("handleAddScore: scoreboard refresh failed:", err);
			}
			if (broadcast) {
				try { await sendPlayersSnapshot(); } catch (err) { logger.error("handleAddScore: broadcast failed:", err); }
			}
		},
		[currentMatchCode, currentQuestion.questionCode, token, sendPlayersSnapshot],
	);

	const handleCalculateScore = useCallback(async () => {
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		setHasAddedScore(true);
		try {
			// Fetch the LAST answer timestamp for each selected player
			const playerAnswers: Array<{ playerCode: string; timestamp: number }> = [];
			for (const code of selectedPlayerCodes) {
				try {
					const url = `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(currentMatchCode!)}&user_code=${encodeURIComponent(code)}&question_code=${encodeURIComponent(currentQuestion.questionCode)}`;
					const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
					if (res.ok) {
						const json = await res.json();
						const data = json.data;
						if (data) {
							// Take the LAST answer submitted (highest timestamp)
							const answers = Array.isArray(data) ? data : [data];
							const last = answers.reduce((a: any, b: any) => (b.timestamp > a.timestamp ? b : a), answers[0]);
							playerAnswers.push({ playerCode: code, timestamp: last?.timestamp ?? Date.now() });
							continue;
						}
					}
				} catch (err) {
					logger.warn("handleCalculateScore: failed to fetch answer for", code, err);
				}
				// Fallback: use current time if fetch fails
				playerAnswers.push({ playerCode: code, timestamp: Date.now() });
			}

			// Sort ascending by timestamp to determine answer order
			playerAnswers.sort((a, b) => a.timestamp - b.timestamp);

			// Base points determined by the LAST correct answer's elapsed time
			const lastTimestamp = Math.max(...playerAnswers.map((p) => p.timestamp));
			const startedAt = timerStartedAtRef.current || (lastTimestamp - TIME_LIMIT * 1000);
			const elapsedSeconds = Math.max(0, (lastTimestamp - startedAt) / 1000);
			let basePoints: number;
			if (elapsedSeconds < 10) basePoints = 30;
			else if (elapsedSeconds < 20) basePoints = 20;
			else basePoints = 10;

			// Multipliers by answer order: 1st x2, 2nd x1.5, 3rd x1, 4th+ x0.5
			const ORDER_MULTIPLIERS = [2, 1.5, 1, 0.5];

			for (let i = 0; i < playerAnswers.length; i++) {
				const { playerCode } = playerAnswers[i];
				const multiplier = ORDER_MULTIPLIERS[Math.min(i, ORDER_MULTIPLIERS.length - 1)];
				const score = Math.round(basePoints * multiplier);
				logger.info(`handleCalculateScore: ${playerCode} rank=${i + 1} base=${basePoints} x${multiplier} = ${score}`);
				await handleAddScore(playerCode, score, false).catch((err) =>
					logger.error("Score failed for", playerCode, err),
				);
			}

			if (currentMatchCode) await sendPlayersSnapshot();
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("handleCalculateScore failed:", err);
			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, currentQuestion.questionCode, currentMatchCode, token, handleAddScore, sendPlayersSnapshot]);

	useEffect(() => {
		startTransition(() => {
			void loadPlayersState();
		});
	}, [loadPlayersState]);

	useEffect(() => { timerRef.current = timer; }, [timer]);

	useEffect(() => {
		if (timer <= 0) return;
		const intervalId = window.setInterval(() => {
			setTimer((prev) => {
				if (prev <= 1) {
					window.clearInterval(intervalId);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [timer]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;
		switch (msg?.type) {
			case "player_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});
					// Route the late-joining player directly to the current round
					(async () => {
						try {
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/bp" });
						} catch { /* best-effort */ }
						if (currentQuestion.questionCode) {
							try {
								await sendMessage({
									type: "send_question",
									user_code: "",
									question_code: currentQuestion.questionCode,
									content: currentQuestion.questionText ?? "",
									media_source: currentQuestion.questionMediaURL ?? undefined,
								});
							} catch { /* best-effort */ }
						}
						if (timerRef.current > 0 && currentQuestion.questionCode) {
							try {
								await sendMessage({ type: "start_the_timer", user_code: "", time_limit: timerRef.current, question_code: currentQuestion.questionCode, started_at: Date.now() });
							} catch { /* best-effort */ }
						}
						// Send players/scores last (requires API call) so game state appears first
						try {
							await sendPlayersSnapshot();
						} catch { /* best-effort */ }
					})();
				}
				break;
			}
			case "player_offline": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: false } : p)));
					});
				}
				break;
			}
			case "send_players_info": {
				startTransition(() => {
					applyPlayersSnapshot(msg);
				});
				break;
			}
			case "player_score_updated": {
				if (msg.user_code && typeof msg.new_total_score === "number") {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === msg.user_code
									? { ...player, playerScore: msg.new_total_score }
									: player,
							),
						);
					});
				}
				break;
			}
			case "clear_answers": {
				startTransition(() => {
					setPlayers((prev) =>
						prev.map((player) => ({
							...player,
							playerLastAnswer: undefined,
							playerTimestamp: undefined,
						})),
					);
				});
				break;
			}
			case "send_answers_to_players": {
				const answers = Array.isArray(msg.answers) ? msg.answers : [];
				startTransition(() => {
					setPlayers((prev) =>
						prev.map((player) => {
							const answer = answers.find((item: any) => item.user_code === player.playerCode);
							if (!answer) return player;
							return {
								...player,
								playerLastAnswer: answer.content ?? answer.answer_text ?? player.playerLastAnswer,
								playerTimestamp: answer.timestamp ?? player.playerTimestamp,
							};
						}),
					);
				});
				break;
			}

			case "answer": {
				// Real-time answer from player via WebSocket
				const { user_code, answer_text, timestamp } = msg;
				if (user_code && answer_text) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === user_code
									? {
										...player,
										playerLastAnswer: answer_text,
										playerTimestamp: timestamp ?? player.playerTimestamp,
									}
								: player,
							),
						);
					});
					logger.info("Received answer from", user_code, ":", answer_text);
				}
				break;
			}

			case "buzz": {
				// Buzz notification from player
				const { user_code } = msg;
				if (user_code) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === user_code
									? { ...player, playerHasBuzzed: true }
								: player,
							),
						);
					});
					logger.info("Player buzzed:", user_code);
				}
				break;
			}
			case "start_the_timer": {
				const timeLimit = Number(msg.time_limit);
				startTransition(() => {
					setTimer(Number.isFinite(timeLimit) && timeLimit > 0 ? timeLimit : TIME_LIMIT);
				});
				break;
			}
			default:
				break;
		}
	}, [applyPlayersSnapshot, currentQuestion, lastMessage, sendMessage, sendPlayersSnapshot]);

	const hasQuestionSelected = currentQuestionIndex > 0;
	const questionTitle = `BỨT PHÁ${hasQuestionSelected ? ` - CÂU HỎI SỐ ${currentQuestionIndex}` : ""}`;

	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			timerDuration={timer}
			controls={{
				variant: 'numbers',
				count: MAX_QUESTION_INDEX,
				activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
			}}
			controlsChildren={() => (
				<div className="flex gap-2">
					{Array.from({ length: MAX_QUESTION_INDEX }).map((_, idx) => {
						const isActive = currentQuestionIndex > 0 && currentQuestionIndex - 1 === idx;
						return (
							<button
								key={idx}
								type="button"
								disabled={timer > 0}
								aria-pressed={isActive}
								onClick={async () => {
									const qIndex = idx + 1;
									if (!isActive) {
											setCurrentQuestionIndex(qIndex);
											try {
												const q = await loadQuestion(qIndex);
												await sendQuestionToplayers(qIndex, q);
											} catch (err) {
												logger.error('Failed to load/send question:', err);
											}
										} else {
											setCurrentQuestionIndex(0);
											try {
												await clearQuestion();
											} catch (err) {
												logger.error('Failed to clear question:', err);
											}
										}
								}}
								className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${isActive ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white hover:bg-blue-700'}`}>
								{idx + 1}
							</button>
						);
					})}
				</div>
			)}
			topControlButtons={null}
			bottomActionButtons={
				<>
					<AControlButton
						onClick={() => {
							void handleStartRound();
						}}
					>
						<Play size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleEndRound();
						}}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}			playerSectionButtons={
				<>
					<AControlButton
						onClick={() => {
							if (!hasQuestionSelected) return;
							void startTheClock(currentQuestionIndex);
						}}
						disabled={!hasQuestionSelected || timer > 0}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleCalculateScore(); }}
						disabled={selectedPlayerCodes.length === 0 || hasAddedScore}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void showAnswers(); }}
						disabled={!canShowAnswers}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
					</AControlButton>
					<AControlButton onClick={() => { void loadPlayersState(); }}>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT</span>
					</AControlButton>
				</>
			}			renderPlayerList={() =>
				players.map((player) => (
					<div className="flex flex-col gap-3" key={player.playerCode}>
						<APlayerBar
							player={player}
							isActive={selectedPlayerCodes.includes(player.playerCode)}
							onClick={toggleSelectedPlayer}
							disabled={timer > 0}
						/>
					</div>
				))
			}
		/>
	);
};


export default AButPhaPage;
