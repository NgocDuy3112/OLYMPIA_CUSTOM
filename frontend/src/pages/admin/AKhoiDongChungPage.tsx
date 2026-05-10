/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	Play,
	Calculator,
	Power,
	RefreshCw,
	Eye,
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

const logger = createLogger("AKhoiDongChung");


const TIME_LIMIT = 60;
const MAX_QUESTION_INDEX = 6;
const QUESTION_PREFIX = "OC3_Q_KD_C"; // Matches the Khởi Động chung question naming convention.


const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};




const AKhoiDongChungPage = () => {
	const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
	const currentMatchCode = urlMatchCode ?? localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	// allow multi-selection of players on this page
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) => (prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode]));
	}, []);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	// second attempt logic removed — always award full points
	// second attempt logic removed — always award full points

	// countdown running state & auto-advance interval ref
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const autoAdvanceRef = useRef<number | null>(null);

	// Track whether admin has already applied score for the current question
	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);


	const questionTitle = "KHỞI ĐỘNG - LƯỢT CHUNG";

	// Nút "Hiện trả lời" chỉ sáng khi đã chọn một câu hỏi (currentQuestionIndex > 0)
	const canShowAnswers = currentQuestionIndex > 0 && !!currentMatchCode && !!token;

	const showAnswers = useCallback(async () => {
		if (!canShowAnswers) return;
		if (!currentQuestion?.questionCode) {
			logger.warn("showAnswers: no question code available");
			return;
		}

		const questionCode = currentQuestion.questionCode;
		const answersPayload: Array<{ user_code: string; content: string; timestamp: number }> = [];

		// Lấy đáp án từng player qua GET /answers/
		for (const player of players) {
			try {
				const url = `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(currentMatchCode)}&user_code=${encodeURIComponent(player.playerCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) continue;
				const json = await res.json();
				// GET trả về BaseResponse; data có thể là object hoặc array
				const data = json.data;
				if (!data) continue;
				// chuẩn hóa thành một object answer
				const answerObj = Array.isArray(data) ? data.reduce((a: any, b: any) => (b.timestamp > a.timestamp ? b : a), data[0]) : data;
				if (answerObj?.answer_text) {
					answersPayload.push({
						user_code: player.playerCode,
						content: answerObj.answer_text,
						timestamp: answerObj.timestamp ?? 0,
					});
				}
			} catch (err) {
				logger.warn("showAnswers: failed to fetch answer for", player.playerCode, err);
			}
		}

		if (answersPayload.length === 0) {
			logger.warn("showAnswers: no answers retrieved from server; broadcasting empty reveal");
		}

		try {
			await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
			logger.info("showAnswers: broadcasted answers count=", answersPayload.length);
		} catch (err) {
			logger.error("showAnswers: failed to broadcast answers", err);
		}
	}, [canShowAnswers, currentMatchCode, token, currentQuestion, players, sendMessage]);

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
				// send a single, consolidated players array to the players client
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

	const handleStartRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			// Navigate players to the player view first so that the subsequent snapshot is the most-recent message
			// (clients that mount after navigation will see the players snapshot as lastMessage).
			try {
				await sendMessage({ type: "round_start", round: "kdc" });
				await sendMessage({ type: "navigate", user_code: "", path: `/player/kdc` });
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
			await sendMessage({ type: "round_end", round: "kdc" });
			await sendMessage({ type: "navigate", user_code: "", path: `/player/waiting` });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

		const startTheClock = useCallback(async () => {
			// Always target question 1 when starting the timer
			const targetIndex = 1;

			// Reset selection / answers locally so admin sees a fresh state
			setSelectedPlayerCodes([]);
			setHasAddedScore(false);
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
				void sendMessage({ type: "start_the_timer", user_code: "", phase: "kdc", time_limit: TIME_LIMIT, question_code: fallbackQuestion.questionCode, started_at: Date.now() });
			}

			// Fetch the authoritative question in background and re-broadcast when ready
			void loadQuestion(targetIndex)
				.then((q) => {
					if (q) {
						setCurrentQuestion(q);
						if (currentMatchCode) {
							void sendQuestionToplayers(targetIndex, q).catch((err) => logger.warn("Failed rebroadcasting loaded question:", err));
						}
					}
				})
				.catch((err) => logger.error("Failed to load question in background:", err));
		}, [currentMatchCode, resolveQuestionCode, sendMessage, loadQuestion, sendQuestionToplayers]);

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

	const handleNextQuestion = useCallback(async () => {
		const nextIndex = currentQuestionIndex > 0 ? (currentQuestionIndex < MAX_QUESTION_INDEX ? currentQuestionIndex + 1 : currentQuestionIndex) : 1;
		if (nextIndex === currentQuestionIndex && currentQuestionIndex !== 0) return;

		setCurrentQuestionIndex(nextIndex);
		try {
			const q = await loadQuestion(nextIndex);
			await sendQuestionToplayers(nextIndex, q);
		} catch (err) {
			logger.error("Failed advancing to next question:", err);
		}
		// second attempt flag removed
	}, [currentQuestionIndex, loadQuestion, sendQuestionToplayers]);

	// Reset the "has added score" flag when advancing to a different question
	useEffect(() => {
		// schedule state update async to avoid cascading renders
		Promise.resolve().then(() => setHasAddedScore(false));
	}, [currentQuestionIndex]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		// CHỈ cho phép tính điểm khi có câu hỏi đang hoạt động (index > 0)
		if (currentQuestionIndex <= 0) {
			logger.warn("handleAddScoreToSelected: No active question selected (index 0). Aborting score award.");
			return;
		}
		const score = 10; // always award 10 points
		logger.info("handleAddScoreToSelected: starting for players=", selectedPlayerCodes);
		setHasAddedScore(true);
		void sendMessage({ type: "kd_cong_diem" });
		try {
			// Apply score sequentially to avoid race conditions updating scoreboard
			for (const code of selectedPlayerCodes) {
				try {
					// avoid broadcasting for every individual update; broadcast once after loop
					await handleAddScore(code, score, false);
					logger.info("handleAddScoreToSelected: applied", code, score);
				} catch (innerErr) {
					logger.error("handleAddScoreToSelected: failed applying score to", code, innerErr);
				}
			}
			// Broadcast a single consolidated players snapshot (safe: check matchCode/token)
			if (currentMatchCode) {
				try {
					await sendPlayersSnapshot();
					logger.info("handleAddScoreToSelected: broadcasted players snapshot");
				} catch (err) {
					logger.error("Failed broadcasting players snapshot after group scoring:", err);
				}
			} else {
				logger.warn("handleAddScoreToSelected: no currentMatchCode, skipping broadcast");
			}
			// Clear selection after awarding points
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("Failed adding score to selected players:", err);
			// revert hasAddedScore so UI remains usable
			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, handleAddScore, sendPlayersSnapshot, currentMatchCode, currentQuestionIndex]);

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

	// auto-advance every 10s while the timer is running
	useEffect(() => {
		if (!isTimerRunning) return;

		autoAdvanceRef.current = window.setInterval(() => {
			void handleNextQuestion();
		}, 10000);

		return () => {
			if (autoAdvanceRef.current) {
				window.clearInterval(autoAdvanceRef.current);
				autoAdvanceRef.current = null;
			}
		};
	}, [isTimerRunning, handleNextQuestion]);

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
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/kdc" });
						} catch { /* best-effort */ }

						// resend current question if active
						if (currentQuestionIndex > 0) {
							try {
								await sendQuestionToplayers(currentQuestionIndex);
								logger.info("Resent question to players after player_online for", msg.user_code);
							} catch (err) {
								logger.error("Failed to resend question on player_online:", err);
							}
						}

						// if a timer is running, send remaining time so reconnecting client can resume countdown
						if (timer > 0 && currentQuestionIndex > 0) {
							try {
								const questionCode = resolveQuestionCode(currentQuestionIndex);
								await sendMessage({ type: "start_the_timer", user_code: "", phase: "kdc", time_limit: timer, question_code: questionCode, started_at: Date.now() });
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
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, sendQuestionToplayers, currentQuestionIndex, timer, sendMessage, resolveQuestionCode]);

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
											await sendQuestionToplayers(qIndex, q);
										} catch (err) {
											logger.error('Failed to load/send question:', err);
										}
									} else {
										// If it's the active question, trigger point award for selected players
										if (selectedPlayerCodes.length > 0 && !hasAddedScore) {
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
							// call and catch to avoid unhandled promise rejections causing app-level errors
							void handleAddScoreToSelected().catch((err) => {
								logger.error("AddScore button handler failed:", err);
								// best-effort UI recovery
								setHasAddedScore(false);
							});
						}}
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
							isActive={selectedPlayerCodes.includes(player.playerCode)}
							isCurrent={selectedPlayerCodes.includes(player.playerCode)}
							onClick={toggleSelectedPlayer}
							disabled={timer > 0}
						/>
					</div>
				))
			}
		/>
	);
};


export default AKhoiDongChungPage;
