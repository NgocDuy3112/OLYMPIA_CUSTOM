/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	AlarmClockCheck,
	Calculator,
	ListRestart,
	Power,
	RefreshCw,
	Eye,
	Play,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, getVeDichMeta } from "@/utils/veDichGrid";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AVeDichChung");


const getTimeLimitForPoints = (points: number): number => {
	switch (points) {
		case 20: return 15;
		case 30: return 20;
		case 40: return 30;
		case 50: return 45;
		default: return 30;
	}
};

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

const AVeDichChungPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();
	const navigate = useNavigate();

	// ─── Player state ────────────────────────────────────────────────────────────
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) =>
			prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode],
		);
	}, []);

	// ─── Question state ───────────────────────────────────────────────────────────
	const [questions, setQuestions] = useState<Question[]>([]);
	const [questionCategories, setQuestionCategories] = useState<string[]>([]);
	const [questionPoints, setQuestionPoints] = useState<number[]>([]);
	const [questionStates, setQuestionStates] = useState<
		Record<string, "answered" | "answered-wrong" | "available">
	>(() => {
		if (!currentMatchCode) return {};
		try {
			const stored = localStorage.getItem(`veDich_chung_states_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as Record<string, "answered" | "answered-wrong" | "available">) : {};
		} catch { return {}; }
	});
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	// The 4 questions locked in for this round — set via WS from the pick page.
	// Persisted in localStorage so navigating to this page after confirming still shows them.
	const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => {
		if (!currentMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_chung_codes_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});

	// ─── Timer state ──────────────────────────────────────────────────────────────
	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0); // mirrors timer for use in effects without adding timer to deps
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);

	// ─── Score state ──────────────────────────────────────────────────────────────

	const questionTitle = "VỀ ĐÍCH - LƯỢT CHUNG";
	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	// Point value of the currently active question
	const currentPoints = (() => {
		if (!currentQuestion.questionCode) return 0;
		const idx = questions.findIndex((q) => q.questionCode === currentQuestion.questionCode);
		return questionPoints[idx] || 0;
	})();

	// Persist questionStates for CHỌN LẠI within this round, and accumulate answered codes
	// into a unified cross-round key so the Lượt CÁ NHÂN pick page can also see them as used.
	useEffect(() => {
		if (!currentMatchCode) return;
		// Per-round state (used by CHỌN LẠI to restore board)
		localStorage.setItem(`veDich_chung_states_${currentMatchCode}`, JSON.stringify(questionStates));
		// Cross-round: accumulate all answered codes into unified list
		const answeredCodes = Object.entries(questionStates)
			.filter(([, v]) => v === "answered")
			.map(([k]) => k);
		if (answeredCodes.length > 0) {
			try {
				const existing = JSON.parse(
					localStorage.getItem(`veDich_used_codes_${currentMatchCode}`) ?? "[]"
				) as string[];
				localStorage.setItem(
					`veDich_used_codes_${currentMatchCode}`,
					JSON.stringify([...new Set([...existing, ...answeredCodes])]),
				);
			} catch { /* ignore */ }
		}
	}, [questionStates, currentMatchCode]);

	// ─── Players helpers ──────────────────────────────────────────────────────────
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
			} catch (err) {
				logger.error("Failed to load scoreboard:", err);
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
		} catch (err) {
			logger.error("Failed to load players:", err);
			return undefined;
		}
	}, [currentMatchCode, token]);

	const sendPlayersSnapshot = useCallback(async () => {
		if (!currentMatchCode) return;
		try {
			const payload = await loadPlayersState();
			if (!payload) return;
			const { playersList, scoreList, profiles } = payload;

			const mergedPlayers = (playersList ?? []).map((p: any) => {
				const userCode = String(p?.user_code ?? p?.playerCode ?? "");
				const profile = (profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {};
				const scoreEntry =
					(scoreList ?? []).find((s: any) => String(s?.user_code) === userCode) ?? {};
				const cumulativeScore =
					scoreEntry?.cumulative_score ??
					scoreEntry?.cummulative_score ??
					scoreEntry?.total_score ??
					scoreEntry?.score ??
					0;
				return {
					user_code: userCode,
					user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
					position: p?.position ?? p?.pos ?? undefined,
					cumulative_score: cumulativeScore,
				};
			});

			await sendMessage({ type: "send_players_info", players: mergedPlayers });
		} catch (err) {
			logger.error("Failed to send players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage]);

	// ─── Question fetch ───────────────────────────────────────────────────────────
	useEffect(() => {
		const fetchQuestions = async () => {
			if (!currentMatchCode || !token) return;
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`;
				const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!response.ok) return;

				const result = await response.json();
				const rawQuestions = Array.isArray(result.data)
					? result.data
					: [result.data].filter(Boolean);

				const veDichRaw = rawQuestions.filter(
					(q: any) =>
						q.question_code?.includes("_VD_") || q.question_code?.startsWith("OC3_Q_VD"),
				);

				const mapped: Question[] = veDichRaw.map((q: any) => ({
					questionCode: q.question_code,
					questionText: q.content,
					questionAnswer: q.answer,
					questionExplanation: q.explanation ?? "",
					questionMediaURL: q.media_url ?? undefined,
				}));
				mapped.sort((a, b) => compareVeDichCodes(a.questionCode, b.questionCode));

				const cats = mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).category);
				const pts  = mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).points);

				setQuestions(mapped);
				setQuestionCategories(cats);
				setQuestionPoints(pts);
			} catch (err) {
				logger.error("Failed to fetch questions:", err);
			}
		};
		fetchQuestions();
	}, [currentMatchCode, token]);

	useEffect(() => {
		startTransition(() => {
			void sendPlayersSnapshot();
		});
	}, [sendPlayersSnapshot]);

	// Broadcast round question metadata so players can render the 4 question cards
	useEffect(() => {
		if (!currentMatchCode || questions.length === 0 || roundQuestionCodes.length === 0) return;
		const metadata = roundQuestionCodes.map((code) => {
			const idx = questions.findIndex((q) => q.questionCode === code);
			const rawCategory = questionCategories[idx] || "Unknown";
			const pts = questionPoints[idx] || 0;
			const [catPrimary] = rawCategory.split("|").map((s) => s?.trim());
			return { code, category: catPrimary || rawCategory, points: pts };
		});
		void sendMessage({ type: "veDich_questions_meta", match_code: currentMatchCode, question_metadata: metadata });
	}, [questions, roundQuestionCodes, questionCategories, questionPoints, currentMatchCode, sendMessage]);


	const mapQuestionPayload = useCallback(
		(payload: any, fallbackCode?: string): Question => ({
			questionCode:
				payload?.question_code ?? payload?.question?.question_code ?? fallbackCode ?? "",
			questionText:
				payload?.question?.content ?? payload?.question_content ?? payload?.content ?? "",
			questionAnswer:
				payload?.question?.correct_answers ??
				payload?.question?.correct_answer ??
				payload?.answer ??
				payload?.correct_answer ??
				"",
			questionExplanation: payload?.question?.explanation ?? payload?.explanation ?? "",
			questionMediaURL:
				payload?.question?.extra_info?.media_source ?? payload?.media_url ?? undefined,
		}),
		[],
	);

	const clearQuestion = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setVideoPlayState(null);
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (err) {
			logger.error("Failed to clear question:", err);
		}
	}, [sendMessage]);

	const handleQuestionActivate = useCallback(
		async (questionCode: string) => {
			if (isTimerRunning) return;

			// Toggle: clicking the active question clears it
			if (currentQuestion.questionCode === questionCode) {
				setSelectedPlayerCodes([]);
				await clearQuestion();
				return;
			}

			setSelectedPlayerCodes([]);
			setVideoPlayState(null);
			setPlayers((prev) =>
				prev.map((p) => ({
					...p,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				})),
			);

			// Set fallback immediately for responsive UI
			const fallback: Question = { ...DEFAULT_QUESTION, questionCode };
			setCurrentQuestion(fallback);

			if (currentMatchCode) {
				void sendMessage({ type: "clear_answers", user_code: "" });
				void sendMessage({
					type: "send_question",
					user_code: "",
					question_code: questionCode,
					content: "",
					media_source: undefined,
				});
			}

			// Fetch full details in background and re-broadcast
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode ?? "")}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				let q: Question;
				if (res.ok) {
					const data = await res.json();
					let payload: any = null;
					if (Array.isArray(data.data)) {
						payload =
							data.data.find((item: any) => String(item?.question_code) === String(questionCode)) ??
							data.data[0] ??
							null;
					} else {
						payload = data.data ?? null;
					}
					q = mapQuestionPayload(payload, questionCode);
				} else {
					q = { ...DEFAULT_QUESTION, questionCode };
				}
				setCurrentQuestion(q);
				if (currentMatchCode) {
					void sendMessage({
						type: "send_question",
						user_code: "",
						question_code: questionCode,
						content: q.questionText ?? "",
						media_source: q.questionMediaURL ?? undefined,
					});
				}
			} catch (err) {
				logger.error("handleQuestionActivate: failed to load question:", err);
			}
		},
		[isTimerRunning, currentQuestion.questionCode, clearQuestion, currentMatchCode, token, sendMessage, mapQuestionPayload],
	);

	// ─── Timer ───────────────────────────────────────────────────────────────────
	const startTheClock = useCallback(() => {
		if (!currentQuestion.questionCode || isTimerRunning) return;
		const timeLimit = getTimeLimitForPoints(currentPoints);
		setTimer(timeLimit);
		setIsTimerRunning(true);
		if (currentMatchCode) {
			void sendMessage({
				type: "start_the_timer",
				user_code: "",
				phase: "vdc",
				time_limit: timeLimit,
				question_code: currentQuestion.questionCode,
				started_at: Date.now(),
			});
			if (currentQuestion.questionMediaURL) {
				void sendMessage({ type: "play_video" });
				setVideoPlayState("playing");
			}
		}
	}, [currentQuestion.questionCode, currentQuestion.questionMediaURL, isTimerRunning, currentPoints, currentMatchCode, sendMessage]);

	useEffect(() => {
		timerRef.current = timer;
	}, [timer]);

	useEffect(() => {
		if (timer <= 0) return;
		const intervalId = window.setInterval(() => {
			setTimer((prev) => {
				const next = prev <= 1 ? 0 : prev - 1;
				timerRef.current = next;
				if (next === 0) window.clearInterval(intervalId);
				return next;
			});
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [timer]);

	// Stop running state when timer expires
	useEffect(() => {
		if (timer !== 0 || !isTimerRunning) return;
		startTransition(() => setIsTimerRunning(false));
	}, [timer, isTimerRunning]);

	// Reset score flag when active question changes
	// (no-op placeholder kept for diff clarity)

	// ─── Show answers ─────────────────────────────────────────────────────────────
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
				const answerObj = Array.isArray(data) ? data.reduce((a: any, b: any) => (b.timestamp > a.timestamp ? b : a), data[0]) : data;
				if (answerObj?.answer_text) {
					answersPayload.push({
						user_code: player.playerCode,
						content: answerObj.answer_text,
						timestamp: answerObj.timestamp ?? 0,
					});
				}
			} catch (err) {
				logger.warn("showAnswers: failed for", player.playerCode, err);
			}
		}

		try {
			await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
		} catch (err) {
			logger.error("showAnswers: broadcast failed", err);
		}
	}, [canShowAnswers, currentMatchCode, token, currentQuestion, players, sendMessage]);

	// ─── Score management ─────────────────────────────────────────────────────────
	const handleAddScore = useCallback(
		async (playerCode: string, delta: number, broadcast = true) => {
			if (!playerCode) return;
			setPlayers((prev) =>
				prev.map((p) =>
					p.playerCode === playerCode ? { ...p, playerScore: (p.playerScore ?? 0) + delta } : p,
				),
			);
			if (!currentMatchCode || !token) return;
			const questionCode = currentQuestion.questionCode;

			try {
				if (questionCode) {
					const recordRes = await fetch(`${API_BASE_URL}/records/`, {
						method: "POST",
						headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
						body: JSON.stringify({
							user_code: playerCode,
							match_code: currentMatchCode,
							question_code: questionCode,
							points: delta,
						}),
					});
					if (!recordRes.ok) {
						logger.warn("handleAddScore: record POST failed", recordRes.status);
					}
				}

				try {
					const recentRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
						headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
					});
					if (recentRes.ok) {
						const recentJson = await recentRes.json();
						let scoreboardArr: any[] = [];
						if (Array.isArray(recentJson.data)) scoreboardArr = recentJson.data;
						else if (Array.isArray(recentJson.data?.scoreboard))
							scoreboardArr = recentJson.data.scoreboard;
						else if (Array.isArray(recentJson.scoreboard)) scoreboardArr = recentJson.scoreboard;

						setPlayers((prev) =>
							prev.map((player) => {
								const entry = scoreboardArr.find(
									(item: any) => item.user_code === player.playerCode,
								);
								const updatedScore =
									entry?.cumulative_score ??
									entry?.cummulative_score ??
									entry?.total_score ??
									entry?.score;
								return typeof updatedScore === "number"
									? { ...player, playerScore: updatedScore }
									: player;
							}),
						);
					}
				} catch (err) {
					logger.error("handleAddScore: scoreboard refresh failed:", err);
				}

				if (broadcast) {
					await sendPlayersSnapshot();
				}
			} catch (err) {
				logger.error("handleAddScore failed:", err);
			}
		},
		[currentMatchCode, currentQuestion.questionCode, token, sendPlayersSnapshot],
	);

	// Calculate score: if there are selected players, award them and deduct 50% from everyone;
	// if no one is selected, deduct 50% from all players (Lượt Chung special rule).
	const handleCalculateScore = useCallback(async () => {
		if (!currentQuestion.questionCode) return;
		const points = currentPoints;
		const deduction = -Math.floor(points * 0.5);
		// Mark question as answered on the board
		setQuestionStates((prev) => ({ ...prev, [currentQuestion.questionCode]: "answered" }));
		// Broadcast so player chips update too
		void sendMessage({ type: "veDich_question_state", question_code: currentQuestion.questionCode, state: "answered" });

		try {
			if (selectedPlayerCodes.length === 0) {
				// No correct answers: apply deduction to all players
				for (const player of players) {
					await handleAddScore(player.playerCode, deduction, false);
				}
			} else {
				// Add points to selected players
				for (const playerCode of selectedPlayerCodes) {
					await handleAddScore(playerCode, points, false);
				}

				// Deduct 50% from non-selected players only
				for (const player of players) {
					if (!selectedPlayerCodes.includes(player.playerCode)) {
						await handleAddScore(player.playerCode, deduction, false);
					}
				}
			}

			if (currentMatchCode) {
				await sendPlayersSnapshot();
			}
			setSelectedPlayerCodes([]);
		} catch (err: any) {
			logger.error("handleCalculateScore failed:", err);
		}
	}, [
		selectedPlayerCodes,
		currentQuestion.questionCode,
		currentPoints,
		players,
		handleAddScore,
		sendPlayersSnapshot,
		currentMatchCode,
		sendMessage,
	]);

	// ─── Round control ────────────────────────────────────────────────────────────
	const handleStartRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "round_start", round: "vdc" });
		await sendMessage({ type: "navigate", user_code: "", path: "/player/vdc" });
			await sendPlayersSnapshot();
		} catch (err) {
			logger.error("handleStartRound failed:", err);
		}
	}, [currentMatchCode, sendMessage, sendPlayersSnapshot]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "round_end", round: "vdc" });
		await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [currentMatchCode, sendMessage]);

	// ─── WebSocket message handling ───────────────────────────────────────────────
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "veDich_questions_selected": {
				// Receive the 4 question codes confirmed from the pick page
				if (Array.isArray(msg.selected_question_codes)) {
					if (currentMatchCode) {
						localStorage.setItem(`veDich_chung_codes_${currentMatchCode}`, JSON.stringify(msg.selected_question_codes));
					}
					startTransition(() => {
						setRoundQuestionCodes(msg.selected_question_codes);
					});
				}
				break;
			}
			case "player_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p,
							),
						);
					});
					(async () => {
						// Route the late-joining player directly to the current round
						try {
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/vdc" });
						} catch { /* best-effort */ }
						// Resend board metadata so the player can see the 4 question cards
						if (roundQuestionCodes.length > 0 && questions.length > 0 && currentMatchCode) {
							try {
								const metadata = roundQuestionCodes.map((code) => {
									const idx = questions.findIndex((q) => q.questionCode === code);
									const rawCategory = questionCategories[idx] || "Unknown";
									const pts = questionPoints[idx] || 0;
									const [catPrimary] = rawCategory.split("|").map((s) => s?.trim());
									return { code, category: catPrimary || rawCategory, points: pts };
								});
								await sendMessage({ type: "veDich_questions_meta", match_code: currentMatchCode, question_metadata: metadata });
							} catch { /* best-effort */ }
						}
						// Resend answered question states so the board chips reflect reality
						for (const [code, state] of Object.entries(questionStates)) {
							if (state === "answered" || state === "answered-wrong") {
								try {
									await sendMessage({ type: "veDich_question_state", question_code: code, state });
								} catch { /* best-effort */ }
							}
						}
						if (currentQuestion.questionCode) {
							try {
								await sendMessage({
									type: "send_question",
									user_code: "",
									question_code: currentQuestion.questionCode,
									content: currentQuestion.questionText ?? "",
									media_source: currentQuestion.questionMediaURL ?? undefined,
								});
							} catch { /* best-effort on reconnect */ }
						}
						if (timerRef.current > 0 && currentQuestion.questionCode) {
							try {
								await sendMessage({
									type: "start_the_timer",
									user_code: "",
									phase: "vdc",
									time_limit: timerRef.current,
									question_code: currentQuestion.questionCode,
									started_at: Date.now(),
								});
							} catch { /* best-effort on reconnect */ }
						}
						// Send players/scores last (requires API call) so game state appears first
						try {
							await sendPlayersSnapshot();
						} catch { /* best-effort on reconnect */ }
					})();
				}
				break;
			}
			case "player_offline": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === msg.user_code ? { ...p, playerConnected: false } : p,
							),
						);
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
							prev.map((p) =>
								p.playerCode === msg.user_code
									? { ...p, playerScore: msg.new_total_score }
									: p,
							),
						);
					});
				}
				break;
			}
			case "clear_answers": {
				startTransition(() => {
					setPlayers((prev) =>
						prev.map((p) => ({ ...p, playerLastAnswer: undefined, playerTimestamp: undefined })),
					);
				});
				break;
			}
			case "send_answers_to_players": {
				const answers = Array.isArray(msg.answers) ? msg.answers : [];
				startTransition(() => {
					setPlayers((prev) =>
						prev.map((player) => {
							const answer = answers.find(
								(item: any) => item.user_code === player.playerCode,
							);
							if (!answer) return player;
							return {
								...player,
								playerLastAnswer:
									answer.content ?? answer.answer_text ?? player.playerLastAnswer,
								playerTimestamp: answer.timestamp ?? player.playerTimestamp,
							};
						}),
					);
				});
				break;
			}
			case "answer": {
				const { user_code, answer_text, timestamp } = msg;
				if (user_code && answer_text) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code
									? { ...p, playerLastAnswer: answer_text, playerTimestamp: timestamp ?? p.playerTimestamp }
									: p,
							),
						);
					});
				}
				break;
			}
			case "buzz": {
				const { user_code } = msg;
				if (user_code) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p,
							),
						);
					});
				}
				break;
			}
			case "start_the_timer": {
				const timeLimit = Number(msg.time_limit);
				startTransition(() => {
					setTimer(Number.isFinite(timeLimit) && timeLimit > 0 ? timeLimit : 30);
				});
				break;
			}
			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, currentQuestion, sendMessage, currentMatchCode, questionCategories, questionPoints, questionStates, questions, roundQuestionCodes]);

	// ─── Board rendering helpers ──────────────────────────────────────────────────
	const getQuestionMeta = (questionCode: string) => {
		const idx = questions.findIndex((q) => q.questionCode === questionCode);
		const rawCategory = questionCategories[idx] || "Unknown";
		const pts = questionPoints[idx] || 0;
		const [catPrimary, catSecondary] = (rawCategory || "").split("|").map((s) => s?.trim());
		return { catPrimary: catPrimary || rawCategory, catSecondary, pts };
	};

	// ─── Render ───────────────────────────────────────────────────────────────────
	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			videoPlayState={videoPlayState}
			timerDuration={timer}
			controlsChildren={() => (
				<div className="flex gap-3 overflow-x-auto">
					{Array.from({ length: Math.max(roundQuestionCodes.length, players.length) }).map((_, i) => {
						const code = roundQuestionCodes[i];
						if (!code) {
							return (
								<div key={`rq-empty-${i}`} className="w-55 shrink-0 h-20">
									<VeDichQuestionCard placeholder category="" disabled />
								</div>
							);
						}
						const { catPrimary, catSecondary, pts } = getQuestionMeta(code);
						const state = questionStates[code] || "available";
						const isActive = currentQuestion.questionCode === code;
						return (
							<div key={`rq-${code}`} className="w-55 shrink-0 h-20">
								<VeDichQuestionCard
									category={catPrimary}
									subcategory={catSecondary}
									points={pts}
									state={state}
									isSelected={isActive}
									disabled={state !== "available"}
									onClick={() => {
										if (state === "available" && !isTimerRunning) {
											void handleQuestionActivate(code);
										}
									}}
								/>
							</div>
						);
					})}
				</div>
			)}
			topControlButtons={null}
			playerSectionButtons={
				<>
					<AControlButton
						onClick={startTheClock}
						disabled={!currentQuestion.questionCode || isTimerRunning}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleCalculateScore().catch((err) => {
								logger.error("TÍNH ĐIỂM handler failed:", err);
							});
						}}
						disabled={!currentQuestion.questionCode || isTimerRunning}
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
						onClick={() => { void loadPlayersState(); }}
					>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT</span>
					</AControlButton>
				</>
			}
			bottomActionButtons={
				<>
					<AControlButton						
						onClick={() => navigate(`/admin/vdc/pick/${currentMatchCode ?? ""}`)}
						disabled={isTimerRunning}
					>
						<ListRestart size={18} />
						<span className="ml-2 font-bold">CHỌN LẠI</span>
					</AControlButton>

					<AControlButton						
						onClick={() => { void handleStartRound(); }}
					>
						<Play size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>

					<AControlButton
						onClick={() => { void handleEndRound(); }}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
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

export default AVeDichChungPage;
