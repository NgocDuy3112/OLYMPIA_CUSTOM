/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
	Play,
	AlarmClockCheck,
	Plus,
	Power,
	RefreshCw,
	X,
	SkipForward,
} from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AKhoiDongRieng");


const TIME_LIMIT = 30;
const QUESTION_PREFIX = "OC3_Q_KD"; // Matches the Khởi Động CÁ NHÂN question naming convention.


const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};




const AKhoiDongRiengPage = () => {
	// Prefer matchCode from localStorage, but fall back to URL path (e.g. /admin/kdr/OC3_M01T)
	const currentMatchCode = localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});
	// Solo round: allow only ONE player to be selected at a time
	const [selectedPlayerCode, setSelectedPlayerCode] = useState<string | null>(null);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
	}, []);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	// countdown running state & auto-advance interval ref
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const autoAdvanceRef = useRef<number | null>(null);

	// Track whether admin has already applied score for the current question
	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);
	const [isSkipping, setIsSkipping] = useState<boolean>(false);

	// Track per-player attempt counts for the current question (0 = not attempted, 1 = one wrong, 2 = exhausted)
	const [attempts, setAttempts] = useState<Record<string, number>>({});

	// Lock in the selected player when round starts — cannot switch to another player
	const [isPlayerLocked, setIsPlayerLocked] = useState<boolean>(false);


	const questionTitle = "KHỞI ĐỘNG - LƯỢT CÁ NHÂN";

	// use shared helper for mapping players + profiles + scoreboard into PlayerStatus[]
	// keep the same pure function semantics as before

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

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));

			const positions: Record<string, number> = {};
			for (const entry of playersList) {
				if (entry.user_code && entry.position) positions[String(entry.user_code)] = entry.position;
			}
			setPlayerPositions(positions);

			return { playersList, scoreList, profiles };
		} catch (error) {
			logger.error("Failed to load players:", error);
			return undefined;
		}
	}, [currentMatchCode, token]);

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
			const { playersList, scoreList, profiles } = payload;

			// build a consolidated players array that includes cumulative score and position
			// include `is_current` flag for the player currently selected for the solo turn
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
					cumulativeScore: cumulativeScore,
					is_current: selectedPlayerCode ? selectedPlayerCode === String(userCode) : false,
				};
			});

			try {
				// send a single, consolidated players array to the players client
				await sendMessage({ type: "send_players_info", players: mergedPlayers });
				logger.info("sendPlayersSnapshot: sent players snapshot via WS");
			} catch (err) {
				logger.error("Failed to broadcast players info via WS:", err);
			}
		} catch (err) {
			logger.error("Failed to prepare players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage, selectedPlayerCode]);

	const resolveQuestionCode = useCallback((questionIndex: number) => {
		const playerIndex = selectedPlayerCode ? (playerPositions[selectedPlayerCode] ?? 0) : 0;
		if (!playerIndex) return "";
		return `${QUESTION_PREFIX}_${playerIndex}_${questionIndex}`;
	}, [selectedPlayerCode, playerPositions]);

	const mapQuestionPayload = useCallback((payload: any, fallbackCode?: string): Question => {
		// Support multiple possible shapes returned by different endpoints
		return {
			questionCode: payload?.question_code ?? payload?.question?.question_code ?? fallbackCode ?? "",
			questionText:
				payload?.question?.content ?? payload?.question_content ?? payload?.content ?? "",
			questionAnswer:
				payload?.question?.correct_answers ?? payload?.question?.correct_answer ?? payload?.answer ?? payload?.correct_answer ?? "",
			questionExplanation:
				payload?.question?.explanation ?? payload?.question_explanation ?? payload?.explanation ?? "",
			questionMediaURL:
				payload?.question?.extra_info?.media_source ?? payload?.question_media_url ?? payload?.media_url ?? payload?.media_url ?? undefined,
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
				// Use query endpoint which the backend exposes for fetching questions
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					logger.warn(`loadQuestion: server returned ${res.status} for ${questionCode}`);
					const mappedFallback = mapQuestionPayload(null, questionCode);
					setCurrentQuestion(mappedFallback);
					return mappedFallback;
				}
				const data = await res.json();
				// backend returns BaseResponse with data being either a dict or list; normalize to single payload
				let payload: any = null;
				if (Array.isArray(data.data)) {
					// try to find the exact question in the returned list (some endpoints return list even when queried)
					if (questionCode) {
						payload = data.data.find((q: any) => String(q?.question_code) === String(questionCode)) ?? data.data[0] ?? null;
						if (!payload) logger.warn(`loadQuestion: could not find question_code=${questionCode} in returned data, falling back to first item`);
					} else {
						payload = data.data[0] ?? null;
					}
				} else {
					payload = data.data ?? null;
				}
				const mapped = mapQuestionPayload(payload, questionCode);
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

	const sendQuestionToPlayers = useCallback(
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

	const handleStartRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsPlayerLocked(false); // allow selecting a player before the round starts
		setSelectedPlayerCode(null);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			// Navigate players to the player view first so that the subsequent snapshot is the most-recent message
			// (clients that mount after navigation will see the players snapshot as lastMessage).
			try {
				await sendMessage({ type: "round_start", round: "kdr" });
				await sendMessage({ type: "navigate", user_code: "", path: `/player/kdr` });
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
		setSelectedPlayerCode(null);
		setIsPlayerLocked(false); // unlock so next round can pick a different player
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "round_end", round: "kdr" });
			await sendMessage({ type: "navigate", user_code: "", path: `/player/waiting` });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const startTheClock = useCallback(async () => {
		// Always target question 1 when starting the timer
		const targetIndex = 1;

		// Lock in the selected player when the timer starts
		setIsPlayerLocked(true);

		// Reset answers/attempts
		setHasAddedScore(false);
		// reset per-player attempts for this question
		setAttempts({});
		setPlayers((prev) => prev.map((p) => ({
			...p,
			playerLastAnswer: undefined,
			playerTimestamp: undefined,
			playerHasBuzzed: undefined,
		})));

		setCurrentQuestionIndex(targetIndex);

		// Immediately show a fallback question on admin so UI is responsive
		const fallbackQuestion: Question = {
			questionCode: resolveQuestionCode(targetIndex),
			questionText: `Câu hỏi ${targetIndex}`,
			questionAnswer: "",
			questionExplanation: "",
			questionMediaURL: undefined,
		};
		setCurrentQuestion(fallbackQuestion);

		// start local timer immediately (do this before fire-and-forget network calls)
		setTimer(TIME_LIMIT);
		setIsTimerRunning(true);

		// Notify players ASAP: clear previous answers, send fallback question and start timer
		if (currentMatchCode) {
			void sendMessage({ type: "clear_answers", user_code: "" });
			void sendMessage({
				type: "send_question",
				user_code: "",
				question_code: fallbackQuestion.questionCode,
				content: fallbackQuestion.questionText,
				media_source: fallbackQuestion.questionMediaURL,
			});
			void sendMessage({ type: "start_the_timer", user_code: "", phase: "kdr", time_limit: TIME_LIMIT, question_code: fallbackQuestion.questionCode, started_at: Date.now() });
		}

		// Fetch the authoritative question in background and re-broadcast when ready
		void loadQuestion(targetIndex)
			.then((q) => {
				if (q) {
					setCurrentQuestion(q);
					if (currentMatchCode) {
						void sendQuestionToPlayers(targetIndex, q).catch((err) => logger.warn("Failed rebroadcasting loaded question:", err));
					}
				}
			})
			.catch((err) => logger.error("Failed to load question in background:", err));
	}, [currentMatchCode, resolveQuestionCode, sendMessage, loadQuestion, sendQuestionToPlayers]);

	const handleAddScore = useCallback(
		async (playerCode: string, delta: number, broadcast = true) => {
			logger.info("handleAddScore: player=", playerCode, "delta=", delta, "broadcast=", broadcast);
			if (!playerCode) return;
			setPlayers((prev) =>
				prev.map((player) =>
					player.playerCode === playerCode
						? { ...player, playerScore: (player.playerScore ?? 0) + delta }
						: player,
				),
			);

			if (!currentMatchCode || !token) return;

			const questionCode = resolveQuestionCode(currentQuestionIndex);

			try {
				// create record (may return 4xx). If we don't have a valid question_code, skip the POST
				try {
					if (!questionCode || String(questionCode).length === 0) {
						logger.warn("handleAddScore: no question_code available; skipping POST to /records");
					} else {
						const recordRes = await fetch(`${API_BASE_URL}/records/`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${token}`,
							},
							body: JSON.stringify({
								user_code: playerCode,
								match_code: currentMatchCode,
								question_code: questionCode,
								points: delta,
							}),
						});
						if (!recordRes.ok) {
							const txt = await recordRes.text().catch(() => "<no body>");
							logger.warn("handleAddScore: record POST failed", recordRes.status, txt);
						} else {
							logger.info("handleAddScore: record created for", playerCode, delta);
						}
					}
				} catch (postErr) {
					logger.error("handleAddScore: error posting record:", postErr);
				}

				// Refresh scoreboard and guard against unexpected shapes (server may return object)
				try {
					const recentRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
						method: "GET",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`,
						},
					});
					let recentJson: any = {};
					try {
						recentJson = await recentRes.json();
					} catch (e) {
						logger.error("handleAddScore: failed parsing scoreboard JSON:", e);
					}

					let scoreboardArr: any[] = [];
					if (Array.isArray(recentJson.data)) scoreboardArr = recentJson.data;
					else if (Array.isArray(recentJson.data?.scoreboard)) scoreboardArr = recentJson.data.scoreboard;
					else if (Array.isArray(recentJson.scoreboard)) scoreboardArr = recentJson.scoreboard;
					else if (Array.isArray(recentJson)) scoreboardArr = recentJson;
					else {
						logger.warn("handleAddScore: unexpected scoreboard shape", recentJson);
						scoreboardArr = [];
					}

					setPlayers((prev) =>
						prev.map((player) => {
							const entry = scoreboardArr.find((item: any) => item.user_code === player.playerCode);
							const updatedScore = entry?.cumulative_score ?? entry?.cummulative_score ?? entry?.total_score ?? entry?.score;
							return typeof updatedScore === "number" ? { ...player, playerScore: updatedScore } : player;
						}),
					);
				} catch (err) {
					logger.error("handleAddScore: failed to refresh scoreboard:", err);
				}

				// broadcast updated players/scoreboard after applying score
				if (broadcast) {
					try {
						await sendPlayersSnapshot();
						logger.info("handleAddScore: broadcasted players snapshot for", playerCode);
					} catch (err) {
						logger.error("Failed to broadcast players snapshot after score update:", err);
					}
				}
			} catch (error) {
				logger.error("Failed to update score:", error);
			}
		},
		[currentMatchCode, currentQuestionIndex, resolveQuestionCode, token, sendPlayersSnapshot],
	);

	const handleNextQuestion = useCallback(async (fromIndex: number) => {
		const nextIndex = fromIndex < 6 ? fromIndex + 1 : fromIndex;
		if (nextIndex === fromIndex) return; // already at last question
		setCurrentQuestionIndex(nextIndex);
		try {
			const q = await loadQuestion(nextIndex);
			await sendQuestionToPlayers(nextIndex, q);
		} catch (err) {
			logger.error("Failed advancing to next question:", err);
		}
	}, [loadQuestion, sendQuestionToPlayers]);

	// Reset the "has added score" flag and attempts when advancing to a different question
	useEffect(() => {
		if (currentQuestionIndex > 0) {
			// schedule state update async to avoid cascading renders
			Promise.resolve().then(() => {
				setHasAddedScore(false);
				setIsSkipping(false);
				// clear attempts for the new question
				setAttempts({});
			});
		}
	}, [currentQuestionIndex]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (!selectedPlayerCode) return;
		// CHỈ cho phép tính điểm khi có câu hỏi đang hoạt động (index > 0)
		if (currentQuestionIndex <= 0) {
			logger.warn("handleAddScoreToSelected: No active question selected (index 0). Aborting score award.");
			return;
		}

		setHasAddedScore(true);

		// Determine points based on attempt count: 0 -> first try (+10), 1 -> second try (+5), >=2 -> no points
		const attemptCount = attempts[selectedPlayerCode] ?? 0;
		let score = 0;
		if (attemptCount === 0) score = 10;
		else if (attemptCount === 1) score = 5;
		else score = 0;

		logger.info("handleAddScoreToSelected: starting for player=", selectedPlayerCode, "attempts=", attemptCount, "award=", score);

		try {
			if (score > 0) {
				void sendMessage({ type: "kd_cong_diem" });
				try {
					await handleAddScore(selectedPlayerCode, score, true);
					logger.info("handleAddScoreToSelected: applied", selectedPlayerCode, score);
				} catch (innerErr) {
					logger.error("handleAddScoreToSelected: failed applying score to", selectedPlayerCode, innerErr);
				}
			} else {
				logger.info("handleAddScoreToSelected: no points to award for", selectedPlayerCode);
			}
			// Tự chuyển câu sau 1s
			await new Promise(resolve => setTimeout(resolve, 1000));
			void handleNextQuestion(currentQuestionIndex);
		} catch (err) {
			logger.error("Failed adding score to selected player:", err);
			setHasAddedScore(false);
		}
	}, [selectedPlayerCode, handleAddScore, currentQuestionIndex, attempts, handleNextQuestion]);

	const handleMarkWrong = useCallback(async () => {
		if (!selectedPlayerCode) return;
		if (currentQuestionIndex <= 0) return;

		let exhausted = false;
		setAttempts((prev) => {
			const current = prev[selectedPlayerCode] ?? 0;
			const nextCount = current + 1;
			exhausted = nextCount >= 2;
			return { ...prev, [selectedPlayerCode]: nextCount };
		});

		if (exhausted) {
			// Sai lần 2: chuyển câu sau 1s
			await new Promise(resolve => setTimeout(resolve, 1000));
			void handleNextQuestion(currentQuestionIndex);
		}
	}, [selectedPlayerCode, currentQuestionIndex, handleNextQuestion]);

	const handleSkip = useCallback(async () => {
		if (!selectedPlayerCode) return;
		if (currentQuestionIndex <= 0) return;
		setIsSkipping(true);
		// Bỏ qua: chuyển câu sau 1s
		setAttempts((prev) => ({ ...prev, [selectedPlayerCode]: 2 }));
		await new Promise(resolve => setTimeout(resolve, 1000));
		void handleNextQuestion(currentQuestionIndex);
	}, [selectedPlayerCode, currentQuestionIndex, handleNextQuestion]);

	// Global error hooks to capture unexpected runtime errors for diagnostics
	useEffect(() => {
		const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
			logger.error("Unhandled promise rejection:", ev.reason ?? ev);
		};
		const onError = (ev: ErrorEvent) => {
			logger.error("Runtime error:", ev.error ?? ev.message ?? ev);
		};
		window.addEventListener("unhandledrejection", onUnhandledRejection);
		window.addEventListener("error", onError);
		return () => {
			window.removeEventListener("unhandledrejection", onUnhandledRejection);
			window.removeEventListener("error", onError);
		};
	}, []);

	useEffect(() => {
		startTransition(() => {
			void loadPlayersState();
		});
	}, [loadPlayersState]);

	useEffect(() => {
		if (timer <= 0) {
			// stop auto-advance and running state when timer reaches zero
			if (autoAdvanceRef.current) {
				window.clearInterval(autoAdvanceRef.current);
				autoAdvanceRef.current = null;
			}

			// clear highlighted question and stop running state
			startTransition(() => {
				setIsTimerRunning(false);
				setCurrentQuestionIndex(0);
			});

			// clear question on players (schedule async to avoid sync setState inside effect)
			Promise.resolve().then(() => void clearQuestion());
			return;
		}

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
	}, [timer, clearQuestion]);

	// Auto-advance disabled: admin now manually controls question progression

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;
		switch (msg?.type) {
			case "player_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});
					// when a player reconnects, proactively resend the current players snapshot and
					// the active question/timer so the reconnecting client can restore its UI state
					(async () => {
						// Route the late-joining player directly to the current round
						try {
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/kdr" });
						} catch { /* best-effort */ }

						// resend current question if active
						if (currentQuestionIndex > 0) {
							try {
								await sendQuestionToPlayers(currentQuestionIndex);
								logger.info("Resent question to players after player_online for", msg.user_code);
							} catch (err) {
								logger.error("Failed to resend question on player_online:", err);
							}
						}

						// if a timer is running, send remaining time so reconnecting client can resume countdown
						if (timer > 0 && currentQuestionIndex > 0) {
							try {
								const questionCode = resolveQuestionCode(currentQuestionIndex);
								await sendMessage({ type: "start_the_timer", user_code: "", phase: "kdr", time_limit: timer, question_code: questionCode, started_at: Date.now() });
								logger.info("Resent timer to players after player_online for", msg.user_code, "time_left=", timer);
							} catch (err) {
								logger.error("Failed to resend timer on player_online:", err);
							}
						}

						// Send players/scores last (requires API call) so game state appears first
						try {
							await sendPlayersSnapshot();
							logger.info("Resent players snapshot after player_online for", msg.user_code);
						} catch (err) {
							logger.error("Failed to resend players snapshot on player_online:", err);
						}
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
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, sendQuestionToPlayers, currentQuestionIndex, timer, sendMessage, resolveQuestionCode]);

	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			timerDuration={timer}
			controls={{
				variant: 'numbers',
				count: 6,
				activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
			}}
			controlsChildren={() => (
				<div className="flex gap-2">
					{Array.from({ length: 6 }).map((_, idx) => {
						const isActive = currentQuestionIndex > 0 && currentQuestionIndex - 1 === idx;
						return (
							<button
								key={idx}
								type="button"
								aria-pressed={isActive}
								disabled={isTimerRunning}
								onClick={async () => {
									if (isTimerRunning) return;
									const qIndex = idx + 1;
									if (!isActive) {
										setCurrentQuestionIndex(qIndex);
										try {
											const q = await loadQuestion(qIndex);
											await sendQuestionToPlayers(qIndex, q);
										} catch (err) {
											logger.error('Failed to load/send question:', err);
										}
									} else {
										// If it's the active question, trigger point award for selected player
										if (selectedPlayerCode && !hasAddedScore) {
											void handleAddScoreToSelected().catch((err) => {
												logger.error("Auto point award failed:", err);
											});
										} else {
											setCurrentQuestionIndex(0);
											try {
												await clearQuestion();
											} catch (err) {
												logger.error('Failed to clear question:', err);
											}
										}
									}
								}}
								className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 ${isActive ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white hover:bg-blue-700'}`}>
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
						onClick={() => { handleStartRound() }}
					>
						<Play size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>
					<AControlButton
						onClick={() => { handleEndRound() }}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}
			playerSectionButtons={
				<>
					<AControlButton
						onClick={() => {
							void startTheClock();
						}}
						disabled={isTimerRunning}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddScoreToSelected();
						}}
						disabled={!selectedPlayerCode || isSkipping}
					>
						<Plus size={18} />
						<span className="ml-2 font-bold">CỘNG ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleMarkWrong(); }}
						disabled={!selectedPlayerCode || (selectedPlayerCode ? (attempts[selectedPlayerCode] ?? 0) >= 2 : false)}
					>
						<X size={18} />
						<span className="ml-2 font-bold">
							{selectedPlayerCode && (attempts[selectedPlayerCode] ?? 0) >= 1 ? 'SAI LẦN 2' : 'SAI LẦN 1'}
						</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleSkip(); }}
						disabled={!selectedPlayerCode || hasAddedScore}
					>
						<SkipForward size={18} />
						<span className="ml-2 font-bold">BỎ QUA</span>
					</AControlButton>
					<AControlButton
						onClick={() => { loadPlayersState() }}
					>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT</span>
					</AControlButton>
				</>
			}
			renderPlayerList={() =>
				players.map((player) => (
					<div className="flex flex-col gap-3" key={player.playerCode}>
						<APlayerBar
							player={player}
							isActive={selectedPlayerCode === player.playerCode}
							isCurrent={selectedPlayerCode === player.playerCode}
							onClick={isPlayerLocked ? undefined : toggleSelectedPlayer}
							disabled={isPlayerLocked && selectedPlayerCode !== player.playerCode}
						/>
					</div>
				))
			}
		/>
	);
};


export default AKhoiDongRiengPage;
