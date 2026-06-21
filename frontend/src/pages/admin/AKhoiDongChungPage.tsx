/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
	AlarmClockCheck,
	Play,
	Calculator,
	Power,
	Eye,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { usePlayerLatency } from "@/hooks/usePlayerLatency";
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
	const navigate = useNavigate();
	const storedMatchCode = localStorage.getItem("matchCode");
	const currentMatchCode = urlMatchCode || storedMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	// Sync matchCode from URL to localStorage
	useEffect(() => {
		if (urlMatchCode && urlMatchCode !== storedMatchCode) {
			try {
				localStorage.setItem("matchCode", urlMatchCode);
			} catch {
				// ignore
			}
		}
	}, [urlMatchCode, storedMatchCode]);

	// Redirect to game managing page if no match code is available
	useEffect(() => {
		if (!currentMatchCode) {
			logger.warn("No match code available, redirecting to game managing page");
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	usePlayerLatency({ lastMessage, sendMessage, players, setPlayers });
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

	// countdown running state & auto-advance guard ref
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	// Tracks the last question index we auto-advanced to, so we don't re-advance
	// the same question on re-renders while the timer is still in the same 10s bucket.
	const lastAutoAdvancedIndexRef = useRef<number>(0);

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

		logger.info(`[KDC ANSWER SYNC] showAnswers: Fetching answers for question=${questionCode} players=${players.length}`);

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
					logger.info(`[KDC ANSWER SYNC] showAnswers: Fetched answer for player=${player.playerCode} answer=${answerObj.answer_text} ts=${answerObj.timestamp}`);
					answersPayload.push({
						user_code: player.playerCode,
						content: answerObj.answer_text,
						timestamp: answerObj.timestamp || 0,
					});
				} else {
					logger.warn(`[KDC ANSWER SYNC] showAnswers: No answer_text for player=${player.playerCode}`);
				}
			} catch (err) {
				logger.warn("showAnswers: failed to fetch answer for", player.playerCode, err);
			}
		}

		if (answersPayload.length === 0) {
			logger.warn("showAnswers: no answers retrieved from server; broadcasting empty reveal");
		} else {
			logger.info(`[KDC ANSWER SYNC] showAnswers: Broadcasting ${answersPayload.length} answers`);
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
					scoreEntry?.cumulative_score ?? scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;

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
		setIsTimerRunning(false);
		lastAutoAdvancedIndexRef.current = 0;
		await clearQuestion();

		if (!currentMatchCode) { return; }
		try {
			try {
				await sendMessage({ type: "round_start", round: "kdc" });
			} catch (err) {
				logger.error("Failed to start round via WS:", err);
			}

			try {
				await sendMessage({ type: "navigate", user_code: "", path: "/player/kdc" });
			} catch (err) {
				logger.error("Failed to send navigate on start:", err);
			}

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
		setIsTimerRunning(false);
		lastAutoAdvancedIndexRef.current = 0;
		await clearQuestion();

		if (!currentMatchCode) { return; }
		try {
			await sendMessage({ type: "round_end", round: "kdc" });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}
		// Removed navigate to waiting page - players and MC stay on KDC page to preserve score context
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
			// Mark question 1 as already active so the timer-driven effect doesn't re-advance
			lastAutoAdvancedIndexRef.current = targetIndex;

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

	/** Fetch the authoritative scoreboard from the server, update local state,
	 *  and broadcast player_score_updated + send_players_info to all clients. */
	const syncAndBroadcastScores = useCallback(async () => {
		if (!currentMatchCode || !token) return;

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
				logger.error("syncAndBroadcastScores: failed parsing scoreboard JSON:", e);
			}

			let scoreboardArr: any[] = [];
			if (Array.isArray(recentJson.data)) scoreboardArr = recentJson.data;
			else if (Array.isArray(recentJson.data?.scoreboard)) scoreboardArr = recentJson.data.scoreboard;
			else if (Array.isArray(recentJson.scoreboard)) scoreboardArr = recentJson.scoreboard;
			else if (Array.isArray(recentJson)) scoreboardArr = recentJson;
			else {
				logger.warn("syncAndBroadcastScores: unexpected scoreboard shape", recentJson);
				scoreboardArr = [];
			}

			// Update admin's local player scores from the authoritative scoreboard
			setPlayers((prev) =>
				prev.map((player) => {
					const entry = scoreboardArr.find((item: any) => item.user_code === player.playerCode);
					const updatedScore = entry?.cumulative_score ?? entry?.cumulative_score ?? entry?.total_score ?? entry?.score;
					return typeof updatedScore === "number" ? { ...player, playerScore: updatedScore } : player;
				}),
			);

			// Broadcast individual player_score_updated events so player clients
			// can update their own scoreboards in real-time without waiting for a
			// full send_players_info snapshot.
			for (const entry of scoreboardArr) {
				const userCode = String(entry?.user_code ?? "");
				const totalScore = entry?.cumulative_score ?? entry?.cumulative_score ?? entry?.total_score ?? entry?.score;
				if (userCode && typeof totalScore === "number") {
					void sendMessage({
						type: "player_score_updated",
						user_code: userCode,
						new_total_score: totalScore,
					});
				}
			}

			// Broadcast a consolidated players/scoreboard snapshot
			try {
				await sendPlayersSnapshot();
				logger.info("syncAndBroadcastScores: broadcasted players snapshot");
			} catch (err) {
				logger.error("Failed to broadcast players snapshot after score sync:", err);
			}
		} catch (err) {
			logger.error("syncAndBroadcastScores: failed to refresh scoreboard:", err);
		}
	}, [currentMatchCode, token, sendMessage, sendPlayersSnapshot]);

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

		// Optimistic local update for all selected players — will be corrected by scoreboard refresh
		setPlayers((prev) =>
			prev.map((player) =>
				selectedPlayerCodes.includes(player.playerCode)
					? { ...player, playerScore: (player.playerScore ?? 0) + score }
					: player,
			),
		);

		void sendMessage({ type: "kd_cong_diem" });

		if (!currentMatchCode || !token) return;
		const questionCode = resolveQuestionCode(currentQuestionIndex);

		try {
			// Post all records first (no scoreboard fetch per player)
			for (const code of selectedPlayerCodes) {
				try {
					if (!questionCode || String(questionCode).length === 0) {
						logger.warn("handleAddScoreToSelected: no question_code; skipping POST for", code);
					} else {
						const recordRes = await fetch(`${API_BASE_URL}/records/`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${token}`,
							},
							body: JSON.stringify({
								user_code: code,
								match_code: currentMatchCode,
								question_code: questionCode,
								points: score,
							}),
						});
						if (!recordRes.ok) {
							const txt = await recordRes.text().catch(() => "<no body>");
							logger.warn("handleAddScoreToSelected: record POST failed for", code, recordRes.status, txt);
						} else {
							logger.info("handleAddScoreToSelected: record created for", code, score);
						}
					}
				} catch (innerErr) {
					logger.error("handleAddScoreToSelected: failed posting record for", code, innerErr);
				}
			}

			// Single scoreboard fetch + broadcast after all records are posted
			await syncAndBroadcastScores();

			// Clear selection after awarding points
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("Failed adding score to selected players:", err);
			// revert hasAddedScore so UI remains usable
			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, currentMatchCode, currentQuestionIndex, resolveQuestionCode, token, syncAndBroadcastScores]);

	// Handle manual score editing from APlayerBar
	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		logger.info("handleEditScore: player=", playerCode, "newScore=", newScore);
		// Update local state immediately
		setPlayers((prev) =>
			prev.map((player) =>
				player.playerCode === playerCode
					? { ...player, playerScore: newScore }
					: player,
			),
		);
		// Refresh scoreboard from server to ensure consistency
		void syncAndBroadcastScores();
	}, [syncAndBroadcastScores]);

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
			// Timer finished — clear question and stop running state
			lastAutoAdvancedIndexRef.current = 0;
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

	// Auto-advance questions based on the countdown timer.
	// Each of the 6 questions gets a 10-second window:
	//   Q1: timer 60→51  (secondsRemaining 60-51)
	//   Q2: timer 50→41  (secondsRemaining 50-41)
	//   Q3: timer 40→31
	//   Q4: timer 30→21
	//   Q5: timer 20→11
	//   Q6: timer 10→1
	// When the timer crosses a 10-second boundary, we advance to the next question.
	useEffect(() => {
		if (!isTimerRunning || timer <= 0) return;

		// Derive which question should be active from the timer value
		const derivedIndex = Math.ceil((60 - timer + 1) / 10); // 1-based
		const targetIndex = Math.min(Math.max(derivedIndex, 1), MAX_QUESTION_INDEX);

		// Only advance if we haven't already advanced to this question
		if (targetIndex !== lastAutoAdvancedIndexRef.current) {
			lastAutoAdvancedIndexRef.current = targetIndex;
			setCurrentQuestionIndex(targetIndex);
			// Clear previous answers and reset selection state for the new question
			setSelectedPlayerCodes([]);
			setHasAddedScore(false);
			setPlayers((prev) =>
				prev.map((p) => ({
					...p,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				})),
			);
			// Notify players to clear their answers for the new question
			void sendMessage({ type: "clear_answers", user_code: "" });
			void loadQuestion(targetIndex)
				.then((q) => {
					if (q) {
						void sendQuestionToplayers(targetIndex, q).catch((err) =>
							logger.warn("Failed rebroadcasting auto-advanced question:", err),
						);
					}
				})
				.catch((err) => logger.error("Failed to load auto-advanced question:", err));
		}
	}, [isTimerRunning, timer, loadQuestion, sendQuestionToplayers, sendMessage]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;
		switch (msg?.type) {
			case "mc_online":
			case "mc_reconnected":
			case "player_reconnected":
			case "player_online": {
				if (msg.user_code) {
					const onlineCode = String(msg.user_code);
					startTransition(() => {
						setPlayers((prev) => {
							if (prev.some((p) => p.playerCode === onlineCode)) {
								return prev.map((p) => (p.playerCode === onlineCode ? { ...p, playerConnected: true } : p));
							}
							// Unknown player — add placeholder; name will be filled by heartbeat/API fetch
							return [...prev, { playerCode: onlineCode, playerName: "", playerScore: 0, playerConnected: true }];
						});
					});
					// when a player reconnects, navigate them to the current round
					try {
						void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/kdc" });
					} catch (err) {
						logger.error("Failed to navigate player on reconnect:", err);
					}
					// Fetch player name if they were added as a placeholder
					if (token) {
						void fetch(`${API_BASE_URL}/users/?user_code=${encodeURIComponent(onlineCode)}`, {
							headers: { Authorization: `Bearer ${token}` },
						})
							.then((r) => r.json())
							.then((json) => {
								const name: string = json?.data?.user_name ?? "";
								if (name) {
									startTransition(() => {
										setPlayers((prev) =>
											prev.map((p) =>
												p.playerCode === onlineCode && !p.playerName
													? { ...p, playerName: name }
													: p,
											),
										);
									});
								}
							})
							.catch((e) => logger.warn("player_online: failed to fetch profile", e));
					}
					(async () => {
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
			case "player_heartbeat": {
				// usePlayerPresence already marks connected, but we also need to
				// fetch the name for placeholder players added by that hook.
				const hbCode = String(msg.user_code ?? "");
				if (hbCode && token) {
					// Only fetch name if this player is in the list but has no name
					setPlayers((prev) => {
						const p = prev.find((x) => x.playerCode === hbCode);
						if (p && !p.playerName) {
							void fetch(`${API_BASE_URL}/users/?user_code=${encodeURIComponent(hbCode)}`, {
								headers: { Authorization: `Bearer ${token}` },
							})
								.then((r) => r.json())
								.then((json) => {
									const name: string = json?.data?.user_name ?? "";
									if (name) {
										startTransition(() => {
											setPlayers((prev2) =>
												prev2.map((x) =>
													x.playerCode === hbCode && !x.playerName
														? { ...x, playerName: name }
														: x,
												),
											);
										});
									}
								})
								.catch((e) => logger.warn("player_heartbeat: failed to fetch profile", e));
						}
						return prev;
					});
				}
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

			case "player_answer":
			case "answer": {
				// Real-time answer from player via WebSocket
				const { user_code, answer_text, timestamp } = msg;
				if (user_code && answer_text) {
					logger.info(`[KDC ANSWER SYNC] Received WebSocket answer from user=${user_code} answer=${answer_text} ts=${timestamp} question=${msg.question_code}`);
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
				} else {
					logger.warn(`[KDC ANSWER SYNC] Received empty answer event: user_code=${user_code} answer_text=${answer_text}`);
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
						disabled={isTimerRunning}
					>
						<Play size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>
					<AControlButton
						onClick={() => { handleEndRound() }}
						disabled={isTimerRunning}
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
						disabled={selectedPlayerCodes.length === 0 || hasAddedScore || isTimerRunning}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void showAnswers(); }}
						disabled={!canShowAnswers || isTimerRunning}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
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
							onEditScore={handleEditScore}
							token={token}
							matchCode={currentMatchCode}
							sendMessage={sendMessage}
						/>
					</div>
				))
			}
		/>
	);
};


export default AKhoiDongChungPage;
