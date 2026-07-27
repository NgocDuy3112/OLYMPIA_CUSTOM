
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	ListRestart,
	Power,
	Zap,
	Plus,
	Minus,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { usePlayerLatency } from "@/hooks/usePlayerLatency";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, getVeDichMeta } from "@/utils/veDichGrid";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AVeDichRieng");

const ROUND_QUESTION_COUNT = 3;

const getTimeLimitForPoints = (points: number): number => {
	switch (points) {
		case 20: return 15;
		case 30: return 20;
		case 40: return 30;
		case 50: return 45;
		default: return 0;
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
	const navigate = useNavigate();
	const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
	const storedMatchCode = localStorage.getItem("matchCode");
	const currentMatchCode = urlMatchCode || storedMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";

	useEffect(() => {
		if (urlMatchCode && urlMatchCode !== storedMatchCode) {
			try {
				localStorage.setItem("matchCode", urlMatchCode);
			} catch {

			}
		}
	}, [urlMatchCode, storedMatchCode]);

	useEffect(() => {
		if (!currentMatchCode) {
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
	usePlayerLatency({ lastMessage, sendMessage, players, setPlayers });
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) =>
			prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode],
		);
	}, []);

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

	const pendingQuestionRef = useRef<{ questionCode: string; question: Question } | null>(null);

	const pendingBroadcastTimerRef = useRef<number | null>(null);
	const clearPendingBroadcastTimer = useCallback(() => {
		if (pendingBroadcastTimerRef.current != null) {
			window.clearTimeout(pendingBroadcastTimerRef.current);
			pendingBroadcastTimerRef.current = null;
		}
	}, []);

	const broadcastPendingVeDichQuestion = useCallback(() => {
		const pending = pendingQuestionRef.current;
		if (!pending || !currentMatchCode) return;
		const { questionCode, question } = pending;
		logger.info(`[VDR] Broadcasting full question + play_video for ${questionCode}`);
		void sendMessage({
			type: "send_question",
			user_code: "",
			question_code: questionCode,
			content: question.questionText ?? "",
			media_source: question.questionMediaURL ?? undefined,
		});
		if (question.questionMediaURL) {
			void sendMessage({ type: "play_video" });
			setVideoPlayState("playing");
		}
		pendingQuestionRef.current = null;
		clearPendingBroadcastTimer();
	}, [currentMatchCode, sendMessage, clearPendingBroadcastTimer]);

	const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => {
		if (!currentMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_rieng_codes_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});

	const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(() => {
		if (!currentMatchCode) return null;
		try {
			return localStorage.getItem(`veDich_rieng_selected_player_${currentMatchCode}`) || null;
		} catch { return null; }
	});

	const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => {
		if (!currentMatchCode) return {};
		try {
			const stored = localStorage.getItem(`veDich_powers_${currentMatchCode}`);
			if (!stored) return {};
			const parsed = JSON.parse(stored);

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

	const [activePower, setActivePower] = useState<'star' | 'shield' | null>(null);

	const lastBuzzerQuestionRef = useRef<string | null>(null);

	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
	const wasTimerRunningRef = useRef<boolean>(false);

	const questionTitle = "VỀ ĐÍCH - LƯỢT CÁ NHÂN";

	const currentPoints = (() => {
		if (!currentQuestion.questionCode) return 0;
		const idx = questions.findIndex((q) => q.questionCode === currentQuestion.questionCode);
		return questionPoints[idx] || 0;
	})();

	useEffect(() => {
		if (!currentMatchCode) return;

		localStorage.setItem(`veDich_rieng_states_${currentMatchCode}`, JSON.stringify(questionStates));

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
			} catch {  }
		}
	}, [questionStates, currentMatchCode]);

	useEffect(() => {
		if (!currentMatchCode) return;
		localStorage.setItem(`veDich_powers_${currentMatchCode}`, JSON.stringify(usedPowers));
	}, [usedPowers, currentMatchCode]);

	useEffect(() => {
		setActivePower(null);
		if (currentMatchCode) {
			void sendMessage({ type: "vd_power_activated", power: null });
		}
	}, [currentQuestion.questionCode, currentMatchCode, sendMessage]);

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

			const profiles = playersList.map((entry: any) => ({
				user_code: entry.user_code,
				user_name: entry.user_name ?? "",
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
					scoreEntry?.cumulative_score ??
					scoreEntry?.total_score ??
					scoreEntry?.score ??
					0;

				const isAdminCode = currentTurnPlayerCode?.startsWith("ADMIN") ?? false;
				const isCurrent = !isAdminCode && currentTurnPlayerCode === userCode;
				return {
					user_code: userCode,
					user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "",
					position: p?.position ?? p?.pos ?? undefined,
					cumulative_score: cumulativeScore,
					is_current: isCurrent,
				};
			});

			logger.info(`Sending players snapshot: currentTurnPlayerCode=${currentTurnPlayerCode}, isAdmin=${currentTurnPlayerCode?.startsWith("ADMIN")}`);
			await sendMessage({ type: "send_players_info", players: mergedPlayers });
		} catch (err) {
			logger.error("Failed to send players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage, selectedPlayerCodes, currentTurnPlayerCode]);

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
		void sendMessage({ type: "vdr_questions_meta", question_metadata: metadata });
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
		setTimer(0);
		setAnsweringWindowTimer(0);
		setIsTimerRunning(false);
		setVideoPlayState(null);
		wasTimerRunningRef.current = false;

		pendingQuestionRef.current = null;
		clearPendingBroadcastTimer();
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (err) {
			logger.error("Failed to clear question:", err);
		}
	}, [sendMessage, clearPendingBroadcastTimer]);

	const handleQuestionActivate = useCallback(
		async (questionCode: string) => {
			if (isTimerRunning) return;

			if (currentQuestion.questionCode === questionCode) {
				setSelectedPlayerCodes([]);
				setUsedPowers({});
				await clearQuestion();
				return;
			}

			setSelectedPlayerCodes([]);
			setUsedPowers({});
			setVideoPlayState(null);

			lastBuzzerQuestionRef.current = null;
			setPlayers((prev) =>
				prev.map((p) => ({
					...p,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				})),
			);

			if (currentMatchCode) {
				void sendMessage({ type: "clear_buzz" });
			}

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

				void sendMessage({ type: "vd_power_window_open", duration: 5 });
			}

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

				pendingQuestionRef.current = { questionCode, question: q };
				logger.info(`[VDR] Question ${questionCode} fetched, waiting for power window to close`);

			clearPendingBroadcastTimer();
			pendingBroadcastTimerRef.current = window.setTimeout(() => {
				pendingBroadcastTimerRef.current = null;
				broadcastPendingVeDichQuestion();
			}, 5500);
		} catch (err) {
			logger.error("handleQuestionActivate: failed to load question:", err);
		}
	},
	[isTimerRunning, currentQuestion.questionCode, clearQuestion, currentMatchCode, token, sendMessage, mapQuestionPayload, clearPendingBroadcastTimer, broadcastPendingVeDichQuestion],
	);

	const startTheClock = useCallback(() => {
		if (!currentQuestion.questionCode || isTimerRunning) return;
		const timeLimit = getTimeLimitForPoints(currentPoints);
		setTimer(timeLimit);
		setAnsweringWindowTimer(0);

		lastBuzzerQuestionRef.current = null;
		setIsTimerRunning(true);
		if (currentMatchCode) {

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

	useEffect(() => {
		if (timer !== 0 || !isTimerRunning) return;
		startTransition(() => setIsTimerRunning(false));
	}, [timer, isTimerRunning]);

	useEffect(() => {
		wasTimerRunningRef.current = isTimerRunning;
	}, [isTimerRunning]);

	useEffect(() => {
		if (isTimerRunning || answeringWindowTimer !== 0) return;
		if (!wasTimerRunningRef.current) return;

		const waitTimeoutId = setTimeout(() => {
			setAnsweringWindowTimer(5);
		}, 5000);
		return () => clearTimeout(waitTimeoutId);
	}, [isTimerRunning, answeringWindowTimer]);

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

	useEffect(() => {
		if (answeringWindowTimer !== 5 || !currentMatchCode) return;
		void sendMessage({
			type: "answering_window_activated",
			countdown: 5,
		});
	}, [answeringWindowTimer, currentMatchCode, sendMessage]);

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
									entry?.cumulative_score ??
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

	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		logger.info("handleEditScore: player=", playerCode, "newScore=", newScore);

		setPlayers((prev) =>
			prev.map((player) =>
				player.playerCode === playerCode
					? { ...player, playerScore: newScore }
					: player,
			),
		);

		void sendPlayersSnapshot();
	}, [sendPlayersSnapshot]);

	const handleAddPoints = useCallback(async () => {
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		const answeredCode = currentQuestion.questionCode;
		setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
		void sendMessage({ type: "vdr_question_state", question_code: answeredCode, state: "answered" });
		void sendMessage({ type: "vd_dung", phase: "vdr" });

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

			if (activePower && currentTurnPlayerCode) {
				setUsedPowers((prev) => ({
					...prev,
					[currentTurnPlayerCode]: activePower,
				}));
			}
			setActivePower(null);

			void sendMessage({ type: "vd_power_activated", power: null });
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

	const handleSubtractPoints = useCallback(async () => {
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		const answeredCode = currentQuestion.questionCode;
		setQuestionStates((prev) => ({ ...prev, [answeredCode]: "answered" }));
		void sendMessage({ type: "vdr_question_state", question_code: answeredCode, state: "answered" });
		void sendMessage({ type: "wrong", phase: "vdr" });

		try {
			for (const playerCode of selectedPlayerCodes) {
				const isCurrentTurnPlayer = playerCode === currentTurnPlayerCode;

				if (isCurrentTurnPlayer && activePower === 'shield') continue;
				const points = (isCurrentTurnPlayer && activePower === 'star')
					? -currentPoints
					: Math.floor(currentPoints * -0.5);
				await handleAddScore(playerCode, points, false);
			}
			if (currentMatchCode) await sendPlayersSnapshot();

			if (activePower && currentTurnPlayerCode) {
				setUsedPowers((prev) => ({
					...prev,
					[currentTurnPlayerCode]: activePower,
				}));
			}
			setActivePower(null);

			void sendMessage({ type: "vd_power_activated", power: null });
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

	const handleOpenBuzzer = useCallback(async () => {
		if (timer !== 0) return;
		setAnsweringWindowTimer(5);
		lastBuzzerQuestionRef.current = null;
		setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
		if (currentMatchCode) {
			void sendMessage({ type: "clear_buzz" });
			void sendMessage({
				type: "answering_window_activated",
				countdown: 5,
			});
		}
	}, [timer, currentMatchCode, sendMessage]);

	const handleStartRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);

		lastBuzzerQuestionRef.current = null;
		setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "round_start", round: "vdr" });
			await sendMessage({ type: "navigate", user_code: "", path: "/player/vdr" });
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
			await sendMessage({ type: "round_end", round: "vdr" });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [currentMatchCode, sendMessage]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "vd_questions_selected": {

				if (Array.isArray(msg.selected_question_codes) && msg.round === "rieng") {
					if (currentMatchCode) {
						localStorage.setItem(`veDich_rieng_codes_${currentMatchCode}`, JSON.stringify(msg.selected_question_codes));
					}
					startTransition(() => {
						setRoundQuestionCodes(msg.selected_question_codes);

						lastBuzzerQuestionRef.current = null;
					});
				}

				if (msg.selected_player_code) {

					const isAdminCode = String(msg.selected_player_code).startsWith("ADMIN");
					if (isAdminCode) {
						logger.warn(`[VDR ADMIN] Rejecting selected_player_code because it's an admin code: ${msg.selected_player_code}`);
					} else {
						logger.info(`[VDR ADMIN] Setting current turn player: ${msg.selected_player_code}`);
						startTransition(() => setCurrentTurnPlayerCode(msg.selected_player_code));
						if (currentMatchCode) {
							localStorage.setItem(`veDich_rieng_selected_player_${currentMatchCode}`, msg.selected_player_code);
						}
					}
				}
				break;
			}
			case "mc_online":
			case "mc_reconnected":
			case "player_reconnected":
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

						try {
							await sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/vdr" });
						} catch {  }

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
								await sendMessage({ type: "vdr_questions_meta", question_metadata: metadata });
							} catch {  }

							for (const [code, qState] of Object.entries(questionStates)) {
								if (qState === "answered" || qState === "answered-wrong") {
									try {
										await sendMessage({ type: "vdr_question_state", question_code: code, state: qState });
									} catch {  }
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
							} catch {  }
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
							} catch {  }

							if (currentQuestion.questionMediaURL) {
								try {
									await sendMessage({ type: "play_video" });
								} catch {  }
							}
						}

						try {
							await sendPlayersSnapshot();
						} catch {  }

						if (Object.keys(usedPowers).length > 0) {
							try {
								await sendMessage({ type: "vd_powers_used", used_powers: usedPowers });
							} catch {  }
						}
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
			case "player_answer":
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

			case "buzzer_winner": {
				const { user_code, question_code } = msg;

				if (user_code && question_code !== lastBuzzerQuestionRef.current) {
					console.info(`[VDR ADMIN] Received buzzer_winner: user_code=${user_code}, question=${question_code}`);
					lastBuzzerQuestionRef.current = question_code;

					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p,
							),
						);
					});

					console.info(`[VDR ADMIN] Locking all buzzers after winner: ${user_code}`);
					void sendMessage({ type: "blocked_buzz", user_code: null });
				}
				break;
			}

			case "clear_buzz": {

				lastBuzzerQuestionRef.current = null;
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "vd_player_power": {

				const { user_code, power } = msg;
				if (user_code && (power === "star" || power === "shield") && !usedPowers[user_code]) {
					logger.info(`[VDR POWER] Player ${user_code} activated ${power}`);

					const nextUsedPowers: Record<string, string | null> = {
						...usedPowers,
						[user_code]: power,
					};
					startTransition(() => {
						setUsedPowers(nextUsedPowers);
					});
					try {
						localStorage.setItem(
							`veDich_powers_${currentMatchCode}`,
							JSON.stringify(nextUsedPowers),
						);
					} catch {  }

					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code
									? { ...p, playerPower: power as "star" | "shield" }
									: p,
							),
						);
					});

					void sendMessage({
						type: "vd_powers_used",
						used_powers: nextUsedPowers,
					});

					if (user_code === currentTurnPlayerCode) {
						startTransition(() => {
							setActivePower(power as "star" | "shield");
						});
						void sendMessage({
							type: "vd_power_activated",
							power,
						});
					}
				}
				break;
			}

			case "vd_powers_used": {
				if (msg.used_powers) {
					startTransition(() => {
						setUsedPowers(msg.used_powers);
					});
					try { localStorage.setItem(`veDich_powers_${currentMatchCode}`, JSON.stringify(msg.used_powers)); } catch {  }

					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) => {
								const power = msg.used_powers[p.playerCode];
								return power ? { ...p, playerPower: power as "star" | "shield" } : p;
							}),
						);
					});
				}
				break;
			}

			case "vd_power_window_closed": {
				broadcastPendingVeDichQuestion();
				break;
			}

			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, currentQuestion, sendMessage, currentMatchCode, roundQuestionCodes, questions, questionCategories, questionPoints, questionStates, broadcastPendingVeDichQuestion]);

	const getQuestionMeta = (questionCode: string) => {
		const idx = questions.findIndex((q) => q.questionCode === questionCode);
		const rawCategory = questionCategories[idx] || "Unknown";
		const pts = questionPoints[idx] || 0;
		const [catPrimary, catSecondary] = (rawCategory || "").split("|").map((s) => s?.trim());
		return { catPrimary: catPrimary || rawCategory, catSecondary, pts };
	};

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
								<div key={`rq-empty-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
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
											handleQuestionActivate(code);
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
						disabled={!currentQuestion.questionCode || isTimerRunning || !currentTurnPlayerCode}
						title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={handleOpenBuzzer}
						disabled={timer > 0 || answeringWindowTimer > 0 || !currentTurnPlayerCode}
						title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}
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
						disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode || !currentTurnPlayerCode || isTimerRunning}
						title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}
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
						disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode || !currentTurnPlayerCode || isTimerRunning}
						title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}
					>
						<Minus size={18} />
						<span className="ml-2 font-bold">TRỪ ĐIỂM</span>
					</AControlButton>
				</>
			}
			bottomActionButtons={
				<>
					<AControlButton
						onClick={() => { void handleStartRound(); }}
						disabled={isTimerRunning}
					>
						<Power size={18} />
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
						disabled={isTimerRunning}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}
			renderPlayerList={() =>
				players.map((player) => (
					<APlayerBar
						key={player.playerCode}
						player={player}
						isActive={selectedPlayerCodes.includes(player.playerCode)}
						isCurrent={player.playerCode === currentTurnPlayerCode}
						playerPower={usedPowers[player.playerCode] as "star" | "shield" | undefined}
						onClick={toggleSelectedPlayer}
						disabled={timer > 0}
						onEditScore={handleEditScore}
						token={token}
						matchCode={currentMatchCode}
						sendMessage={sendMessage}
					/>
				))
			}
		/>
	);
};

export default AVeDichRiengPage;
