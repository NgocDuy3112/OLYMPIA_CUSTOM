/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	AlarmClockCheck,
	ListRestart,
	Power,
	RefreshCw,
	Play,
	Zap,
	Plus,
	Minus,
	Star,
	Shield,
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

const logger = createLogger("AVeDichRieng");

const ROUND_QUESTION_COUNT = 3; // Lượt CÁ NHÂN: 3 questions

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

const AVeDichRiengPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();
	const navigate = useNavigate();

	// ─── Player state ────────────────────────────────────────────────────────────
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	const [isRoundStarting, setIsRoundStarting] = useState(false);
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
			const stored = localStorage.getItem(`veDich_rieng_states_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as Record<string, "answered" | "answered-wrong" | "available">) : {};
		} catch { return {}; }
	});
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	// The 3 questions locked in for this round — set via WS from the pick page.
	// Persisted in localStorage so navigating to this page after confirming still shows them.
	const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => {
		if (!currentMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_rieng_codes_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});
	// The player whose Lượt CÁ NHÂN it is — persisted from the pick page.
	const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(() => {
		if (!currentMatchCode) return null;
		try {
			return localStorage.getItem(`veDich_rieng_selected_player_${currentMatchCode}`) || null;
		} catch { return null; }
	});

	// ─── Power state ─────────────────────────────────────────────────────────────
	// Track which power each player has used (one per player: star OR shield). Persisted across navigation.
	const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => {
		if (!currentMatchCode) return {};
		try {
			const stored = localStorage.getItem(`veDich_powers_${currentMatchCode}`);
			if (!stored) return {};
			const parsed = JSON.parse(stored);
			// Migrate from old format { star: boolean, shield: boolean } → string | null
			const migrated: Record<string, string | null> = {};
			for (const [code, val] of Object.entries(parsed)) {
				if (typeof val === "string" || val === null) {
					migrated[code] = val;
				} else if (typeof val === "object" && val !== null) {
					migrated[code] = (val as any).star ? "star" : (val as any).shield ? "shield" : null;
				} else {
					migrated[code] = null;
				}
			}
			return migrated;
		} catch { return {}; }
	});
	// Active power for the current question (cleared after scoring or question change)
	const [activePower, setActivePower] = useState<'star' | 'shield' | null>(null);

	// ─── Timer state ──────────────────────────────────────────────────────────────
	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0); // mirrors timer for use in effects without adding timer to deps
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
	const wasTimerRunningRef = useRef<boolean>(false); // Track state transitions to prevent premature window activation

	// ─── Score state ──────────────────────────────────────────────────────────────

	const questionTitle = "VỀ ĐÍCH - LƯỢT CÁ NHÂN";

	// Point value of the currently active question
	const currentPoints = (() => {
		if (!currentQuestion.questionCode) return 0;
		const idx = questions.findIndex((q) => q.questionCode === currentQuestion.questionCode);
		return questionPoints[idx] || 0;
	})();

	// Persist questionStates for CHỌN LẠI within this round, and accumulate answered codes
	// into the unified cross-round key so future rounds cannot re-select these questions.
	useEffect(() => {
		if (!currentMatchCode) return;
		// Per-round state (used by CHỌN LẠI to restore board)
		localStorage.setItem(`veDich_rieng_states_${currentMatchCode}`, JSON.stringify(questionStates));
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

	// Persist usedPowers to localStorage whenever it changes
	useEffect(() => {
		if (!currentMatchCode) return;
		localStorage.setItem(`veDich_powers_${currentMatchCode}`, JSON.stringify(usedPowers));
	}, [usedPowers, currentMatchCode]);

	// Reset activePower whenever the active question changes
	useEffect(() => {
		setActivePower(null);
	}, [currentQuestion.questionCode]);

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
					is_current: Array.isArray(selectedPlayerCodes) ? selectedPlayerCodes.includes(String(userCode)) : false,
				};
			});

			await sendMessage({ type: "send_players_info", players: mergedPlayers });
		} catch (err) {
			logger.error("Failed to send players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage, selectedPlayerCodes]);

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

	// Broadcast round question metadata whenever questions + roundQuestionCodes are both ready.
	// This fires after the async question fetch completes, ensuring players who arrived before
	// the fetch finished will receive the 3 question cards as soon as data is available.
	useEffect(() => {
		if (!currentMatchCode || questions.length === 0 || roundQuestionCodes.length === 0) return;
		const metadata = roundQuestionCodes.map((code) => {
			const idx = questions.findIndex((q) => q.questionCode === code);
			return {
				code,
				category: questionCategories[idx] ?? "",
				points: questionPoints[idx] ?? 0,
			};
		});
		void sendMessage({ type: "veDich_rieng_questions_meta", question_metadata: metadata });
	}, [questions, roundQuestionCodes, questionCategories, questionPoints, currentMatchCode, sendMessage]);

	// ─── Question activation ──────────────────────────────────────────────────────
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
		setTimer(0);
		setAnsweringWindowTimer(0); // Reset answering window
		setIsTimerRunning(false);
		setVideoPlayState(null);
		wasTimerRunningRef.current = false; // Reset state transition tracker
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
		setAnsweringWindowTimer(0); // Reset answering window when starting new question
		setIsTimerRunning(true);
		if (currentMatchCode) {
			if (currentQuestion.questionMediaURL) {
				void sendMessage({ type: "play_video" });
				setVideoPlayState("playing");
			}
			void sendMessage({
				type: "start_the_timer",
				user_code: "",
				phase: "vdr",
				time_limit: timeLimit,
				question_code: currentQuestion.questionCode,
				started_at: Date.now(),
			});
		}
	}, [currentQuestion.questionCode, isTimerRunning, currentPoints, currentMatchCode, sendMessage]);

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

	// Track isTimerRunning state transitions
	useEffect(() => {
		wasTimerRunningRef.current = isTimerRunning;
	}, [isTimerRunning]);

	// Wait 5 seconds after timer expires, then start answering window countdown
	// Only trigger when isTimerRunning transitions from true → false (timer actually finished running)
	useEffect(() => {
		if (isTimerRunning || answeringWindowTimer !== 0) return; // Skip if timer still running or window already started
		if (!wasTimerRunningRef.current) return; // Skip if timer was never running (initial state)
		
		const waitTimeoutId = setTimeout(() => {
			setAnsweringWindowTimer(5);
		}, 5000);
		return () => clearTimeout(waitTimeoutId);
	}, [isTimerRunning, answeringWindowTimer]);

	// Countdown answering window timer (5 → 0)
	useEffect(() => {
		if (answeringWindowTimer <= 0) return;
		const intervalId = window.setInterval(() => {
			setAnsweringWindowTimer((prev) => {
				const next = prev <= 1 ? 0 : prev - 1;
				return next;
			});
		}, 1000);
		return () => window.clearInterval(intervalId);
	}, [answeringWindowTimer]);

	// Broadcast answering window activation when countdown starts (transition to 5)
	useEffect(() => {
		if (answeringWindowTimer !== 5 || !currentMatchCode) return;
		void sendMessage({
			type: "answering_window_activated",
			countdown: 5,
		});
	}, [answeringWindowTimer, currentMatchCode, sendMessage]);

	
	// Broadcast power state whenever activePower changes
	useEffect(() => {
		if (!currentMatchCode) return;
		void sendMessage({ type: "veDich_power_activated", power: activePower ?? null });
	}, [activePower, currentMatchCode, sendMessage]);

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

	// Lượt CÁ NHÂN: individual round — only the selected player(s) get +points.
	// Calculate score: add to selected players only (Lượt CÁ NHÂN logic)

	// Add points: +100% default, +150% with star (turn player only), +50% with shield (turn player only)
	const handleAddPoints = useCallback(async () => {
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		const answeredCode = currentQuestion.questionCode;
		setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
		void sendMessage({ type: "veDich_question_state", question_code: answeredCode, state: "answered" });
		void sendMessage({ type: "answer", phase: "vdr" });

		try {
			for (const playerCode of selectedPlayerCodes) {
				let points: number;
				if (playerCode === currentTurnPlayerCode && activePower === 'star')
					points = Math.round(currentPoints * 1.5);
				else if (playerCode === currentTurnPlayerCode && activePower === 'shield')
					points = Math.round(currentPoints * 0.5);
				else
					points = currentPoints;
				await handleAddScore(playerCode, points, false);
			}
			if (currentMatchCode) await sendPlayersSnapshot();
			// Mark power as consumed for the turn player (one power per player)
			if (activePower && currentTurnPlayerCode) {
				setUsedPowers((prev) => ({
					...prev,
					[currentTurnPlayerCode]: activePower,
				}));
			}
			setActivePower(null);
			setSelectedPlayerCodes([]);
		} catch (err: any) {
			logger.error("handleAddPoints failed:", err);
		}
	}, [
		selectedPlayerCodes,
		currentQuestion.questionCode,
		currentPoints,
		activePower,
		currentTurnPlayerCode,
		handleAddScore,
		sendPlayersSnapshot,
		sendMessage,
		currentMatchCode,
	]);

	// Subtract points: -50% default, -100% with star, 0 with shield
	const handleSubtractPoints = useCallback(async () => {
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		const answeredCode = currentQuestion.questionCode;
		setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
		void sendMessage({ type: "veDich_question_state", question_code: answeredCode, state: "answered" });
		void sendMessage({ type: "wrong", phase: "vdr" });

		try {
			for (const playerCode of selectedPlayerCodes) {
				const isCurrentTurnPlayer = playerCode === currentTurnPlayerCode;
				// Shield (turn player only): no deduction
				if (isCurrentTurnPlayer && activePower === 'shield') continue;
				const points = (isCurrentTurnPlayer && activePower === 'star')
					? -currentPoints
					: Math.floor(currentPoints * -0.5);
				await handleAddScore(playerCode, points, false);
			}
			if (currentMatchCode) await sendPlayersSnapshot();
			// Mark power as consumed for the turn player (one power per player)
			if (activePower && currentTurnPlayerCode) {
				setUsedPowers((prev) => ({
					...prev,
					[currentTurnPlayerCode]: activePower,
				}));
			}
			setActivePower(null);
			setSelectedPlayerCodes([]);
		} catch (err: any) {
			logger.error("handleSubtractPoints failed:", err);
		}
	}, [
		selectedPlayerCodes,
		currentQuestion.questionCode,
		currentPoints,
		activePower,
	[currentTurnPlayerCode],
		handleAddScore,
		sendPlayersSnapshot,
		sendMessage,
		currentMatchCode,
	]);

	// Manually open buzzer window (skip 5s wait)
	const handleOpenBuzzer = useCallback(async () => {
		if (timer !== 0) return; // Only allow when main timer is finished
		setAnsweringWindowTimer(5);
		if (currentMatchCode) {
			void sendMessage({
				type: "answering_window_activated",
				countdown: 5,
			});
		}
	}, [timer, currentMatchCode, sendMessage]);

	// ─── Round control ────────────────────────────────────────────────────────────
	const handleStartRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		setIsRoundStarting(true);
		if (!currentMatchCode) { setIsRoundStarting(false); return; }
		try {
			await sendMessage({ type: "round_start", round: "vdr" });
			await sendMessage({ type: "navigate", user_code: "", path: "/player/vdr" });
			await sendPlayersSnapshot();
		} catch (err) {
			logger.error("handleStartRound failed:", err);
		}
		setTimeout(() => setIsRoundStarting(false), 10000);
	}, [currentMatchCode, sendMessage, sendPlayersSnapshot]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		setIsRoundStarting(true);
		if (!currentMatchCode) { setIsRoundStarting(false); return; }
		try {
			await sendMessage({ type: "round_end", round: "vdr" });
			await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
		setTimeout(() => setIsRoundStarting(false), 10000);
	}, [currentMatchCode, sendMessage]);

	// ─── WebSocket message handling ───────────────────────────────────────────────
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "veDich_questions_selected": {
				// Receive the 3 question codes confirmed from the pick page (CÁ NHÂN round)
				if (Array.isArray(msg.selected_question_codes) && msg.round === "rieng") {
					if (currentMatchCode) {
						localStorage.setItem(`veDich_rieng_codes_${currentMatchCode}`, JSON.stringify(msg.selected_question_codes));
					}
					startTransition(() => {
						setRoundQuestionCodes(msg.selected_question_codes);
					});
				}
				// Track which player's turn it is
				if (msg.selected_player_code) {
					startTransition(() => setCurrentTurnPlayerCode(msg.selected_player_code));
					if (currentMatchCode) {
						localStorage.setItem(`veDich_rieng_selected_player_${currentMatchCode}`, msg.selected_player_code);
					}
				}
				break;
			}
			case "mc_online":
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
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/vdr" });
						} catch { /* best-effort */ }
						// Resend board metadata (3 question cards)
						if (roundQuestionCodes.length > 0 && questions.length > 0) {
							const metadata = roundQuestionCodes.map((code) => {
								const idx = questions.findIndex((q) => q.questionCode === code);
								return {
									code,
									category: questionCategories[idx] ?? "",
									points: questionPoints[idx] ?? 0,
								};
							});
							try {
								await sendMessage({ type: "veDich_rieng_questions_meta", question_metadata: metadata });
							} catch { /* best-effort */ }
							// Resend answered question states
							for (const [code, qState] of Object.entries(questionStates)) {
								if (qState === "answered" || qState === "answered-wrong") {
									try {
										await sendMessage({ type: "veDich_question_state", question_code: code, state: qState });
									} catch { /* best-effort */ }
								}
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
									phase: "vdr",
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
					// Broadcast to all players so their screens show the buzzer icon
					void sendMessage({ type: "buzzer_winner", user_code, match_code: currentMatchCode });
				}
				break;
			}
			case "navigate_audio_done": {
				setIsRoundStarting(false);
				break;
			}
			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, currentQuestion, sendMessage, currentMatchCode, roundQuestionCodes, questions, questionCategories, questionPoints, questionStates]);

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
					{Array.from({ length: ROUND_QUESTION_COUNT }).map((_, i) => {
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
			topControlButtons={
				<>
					<div className="flex items-center justify-center gap-3 flex-wrap w-full">
						<AControlButton
							onClick={() => setActivePower((prev) => (prev === 'star' ? null : 'star'))}
							disabled={!currentTurnPlayerCode || !!usedPowers[currentTurnPlayerCode!]}
							title={usedPowers[currentTurnPlayerCode!] ? `Đã dùng: ${usedPowers[currentTurnPlayerCode!] === 'star' ? 'Ngôi sao hy vọng' : 'Bảo hộ miễn trừ'}` : 'Trả lời đúng: +150% điểm. Trả lời sai: -100% điểm'}
							className={activePower === 'star' ? 'bg-yellow-500 ring-yellow-400 text-blue-900' : undefined}
						>
							<Star size={18} />
							<span className="ml-2 font-bold">NGÔI SAO HY VỌNG</span>
						</AControlButton>
						<AControlButton
							onClick={() => setActivePower((prev) => (prev === 'shield' ? null : 'shield'))}
							disabled={!currentTurnPlayerCode || !!usedPowers[currentTurnPlayerCode!]}
							title={usedPowers[currentTurnPlayerCode!] ? `Đã dùng: ${usedPowers[currentTurnPlayerCode!] === 'star' ? 'Ngôi sao hy vọng' : 'Bảo hộ miễn trừ'}` : 'Trả lời đúng: +50% điểm. Trả lời sai: không trừ điểm'}
							className={activePower === 'shield' ? 'bg-blue-500 ring-blue-400 text-blue-900' : undefined}
						>
							<Shield size={18} />
							<span className="ml-2 font-bold">BẢO HỘ MIỄN TRỪ</span>
						</AControlButton>
					</div>
				</>
			}
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
						onClick={handleOpenBuzzer}
						disabled={timer > 0 || answeringWindowTimer > 0}
					>
						<Zap size={18} />
						<span className="ml-2 font-bold">MỞ CHUÔNG</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddPoints().catch((err) => {
								logger.error("Cộng điểm handler failed:", err);
							});
						}}
						disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode}
					>
						<Plus size={18} />
						<span className="ml-2 font-bold">CỘNG ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleSubtractPoints().catch((err) => {
								logger.error("Trừ điểm handler failed:", err);
							});
						}}
						disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode}
					>
						<Minus size={18} />
						<span className="ml-2 font-bold">TRỪ ĐIỂM</span>
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
						onClick={() => { void handleStartRound(); }}
						disabled={isRoundStarting}
					>
						<Play size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>
					<AControlButton
						onClick={() => navigate(`/admin/vdr/pick/${currentMatchCode ?? ""}`)}
						disabled={isTimerRunning}
					>
						<ListRestart size={18} />
						<span className="ml-2 font-bold">CHỌN LẠI</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleEndRound(); }}
						disabled={isRoundStarting}
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
							isCurrent={player.playerCode === currentTurnPlayerCode}
							onClick={toggleSelectedPlayer}
							disabled={timer > 0}
						/>
					</div>
				))
			}
		/>
	);
};

export default AVeDichRiengPage;
