
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	Calculator,
	ListRestart,
	RefreshCw,
	Eye,
	Power,
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

const logger = createLogger("AVeDichChung");

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

const AVeDichChungPage = () => {
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
			const stored = localStorage.getItem(`veDich_chung_states_${currentMatchCode}`);
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
		logger.info(`[VDC] Broadcasting full question + play_video for ${questionCode}`);
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
			const stored = localStorage.getItem(`veDich_chung_codes_${currentMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});

	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);

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

	const [playerPowers, setPlayerPowers] = useState<Record<string, "star" | "shield" | null>>({});

	useEffect(() => {
		if (!currentMatchCode) return;
		localStorage.setItem(`veDich_powers_${currentMatchCode}`, JSON.stringify(usedPowers));
	}, [usedPowers, currentMatchCode]);

	useEffect(() => {
		setPlayerPowers({});
	}, [currentQuestion.questionCode]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = lastMessage as Record<string, any> | null;
		if (msg?.type === "vd_power_window_closed") {

			broadcastPendingVeDichQuestion();
		}
	}, [lastMessage, broadcastPendingVeDichQuestion]);

	const questionTitle = "VỀ ĐÍCH - LƯỢT CHUNG";
	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	const currentPoints = (() => {
		if (!currentQuestion.questionCode) return 0;
		const idx = questions.findIndex((q) => q.questionCode === currentQuestion.questionCode);
		return questionPoints[idx] || 0;
	})();

	useEffect(() => {
		if (!currentMatchCode) return;

		localStorage.setItem(`veDich_chung_states_${currentMatchCode}`, JSON.stringify(questionStates));

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
					(q: any) => q.question_code?.startsWith("OC3_Q_VD"),
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
			const rawCategory = questionCategories[idx] || "Unknown";
			const pts = questionPoints[idx] || 0;
			const [catPrimary] = rawCategory.split("|").map((s) => s?.trim());
			return { code, category: catPrimary || rawCategory, points: pts };
		});
		void sendMessage({ type: "vdc_questions_meta", match_code: currentMatchCode, question_metadata: metadata });
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
				setPlayerPowers({});
				setUsedPowers({});
				await clearQuestion();
				return;
			}

			setSelectedPlayerCodes([]);
			setPlayerPowers({});
			setUsedPowers({});
			setVideoPlayState(null);
			setPlayers((prev) =>
				prev.map((p) => ({
					...p,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				})),
			);

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
				logger.info(`[VDC] Question ${questionCode} fetched, waiting for power window to close`);

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
						timestamp: answerObj.timestamp || 0,
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

	const handleCalculateScore = useCallback(async () => {
		if (!currentQuestion.questionCode) return;
		const points = currentPoints;

		setQuestionStates((prev) => ({ ...prev, [currentQuestion.questionCode]: "answered" }));

		void sendMessage({ type: "vdc_question_state", question_code: currentQuestion.questionCode, state: "answered" });
		void sendMessage({ type: selectedPlayerCodes.length > 0 ? "vd_dung" : "wrong", phase: "vdc" });

		try {
			if (selectedPlayerCodes.length === 0) {

				for (const player of players) {
					const power = playerPowers[player.playerCode];
					if (power === 'shield') {

						continue;
					}
					const deduction = power === 'star'
						? -points
						: -Math.floor(points * 0.5);
					await handleAddScore(player.playerCode, deduction, false);
				}
			} else {

				for (const playerCode of selectedPlayerCodes) {
					const power = playerPowers[playerCode];
					let awarded: number;
					if (power === 'star') awarded = Math.round(points * 1.5);
					else if (power === 'shield') awarded = Math.round(points * 0.5);
					else awarded = points;
					await handleAddScore(playerCode, awarded, false);
				}

				for (const player of players) {
					if (!selectedPlayerCodes.includes(player.playerCode)) {
						const power = playerPowers[player.playerCode];
						if (power === 'shield') {

							continue;
						}
						const deduction = power === 'star'
							? -points
							: -Math.floor(points * 0.5);
						await handleAddScore(player.playerCode, deduction, false);
					}
				}
			}

			const newUsedPowers = { ...usedPowers };
			for (const [code, power] of Object.entries(playerPowers)) {
				if (power) newUsedPowers[code] = power;
			}
			setUsedPowers(newUsedPowers);

			void sendMessage({ type: "vd_powers_used", used_powers: newUsedPowers });

			if (currentMatchCode) {
				await sendPlayersSnapshot();
			}
			setSelectedPlayerCodes([]);
			setPlayerPowers({});
		} catch (err: any) {
			logger.error("handleCalculateScore failed:", err);
		}
	}, [
		selectedPlayerCodes,
		currentQuestion.questionCode,
		currentPoints,
		players,
		playerPowers,
		usedPowers,
		handleAddScore,
		sendPlayersSnapshot,
		currentMatchCode,
		sendMessage,
	]);

	const handleEndRound = useCallback(async () => {

		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		if (!currentMatchCode) return;
		try {

			await sendMessage({ type: "round_end", round: "vdc" });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [currentMatchCode, sendMessage]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "vd_questions_selected": {
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
					try {
						void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/vdc" });
					} catch {  }
					(async () => {

						if (roundQuestionCodes.length > 0 && questions.length > 0 && currentMatchCode) {
							try {
								const metadata = roundQuestionCodes.map((code) => {
									const idx = questions.findIndex((q) => q.questionCode === code);
									const rawCategory = questionCategories[idx] || "Unknown";
									const pts = questionPoints[idx] || 0;
									const [catPrimary] = rawCategory.split("|").map((s) => s?.trim());
									return { code, category: catPrimary || rawCategory, points: pts };
								});
								await sendMessage({ type: "vdc_questions_meta", match_code: currentMatchCode, question_metadata: metadata });
							} catch {  }
						}

						for (const [code, state] of Object.entries(questionStates)) {
							if (state === "answered" || state === "answered-wrong") {
								try {
									await sendMessage({ type: "vdc_question_state", question_code: code, state });
								} catch {  }
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
									phase: "vdc",
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
			case "vd_questions_meta_request": {

				if (msg.match_code === currentMatchCode && roundQuestionCodes.length > 0 && questions.length > 0) {
					const metadata = roundQuestionCodes.map((code) => {
						const idx = questions.findIndex((q) => q.questionCode === code);
						const rawCategory = questionCategories[idx] || "Unknown";
						const pts = questionPoints[idx] || 0;
						const [catPrimary] = rawCategory.split("|").map((s) => s?.trim());
						return { code, category: catPrimary || rawCategory, points: pts };
					});
					void sendMessage({ type: "vdc_questions_meta", match_code: currentMatchCode, question_metadata: metadata });
				}
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

			case "vd_player_power": {

				const { user_code, power } = msg;
				if (user_code && (power === "star" || power === "shield") && !usedPowers[user_code]) {
					logger.info(`[VDC POWER] Player ${user_code} activated ${power}`);
					startTransition(() => {
						setPlayerPowers((prev) => ({ ...prev, [user_code]: power }));
					});
					if (Object.keys(playerPowers).length === 0) {
						void sendMessage({ type: "vd_power_activated", power });
					}
				}
				break;
			}
			case "vd_powers_used": {

				if (msg.used_powers) {
					startTransition(() => {
						setUsedPowers(msg.used_powers);
					});
				}
				break;
			}

			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendPlayersSnapshot, currentQuestion, sendMessage, currentMatchCode, questionCategories, questionPoints, questionStates, questions, roundQuestionCodes]);

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
					{Array.from({ length: Math.max(roundQuestionCodes.length, players.length) }).map((_, i) => {
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
								<div key={`rq-${code}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
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
						disabled={!canShowAnswers || isTimerRunning}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void loadPlayersState(); }}
						disabled={isTimerRunning}
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
						onClick={() => { void handleEndRound(); }}
						disabled={isTimerRunning}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}
			topControlButtons={null}
			renderPlayerList={() =>
				players.map((player) => (
					<APlayerBar
						key={player.playerCode}
						player={player}
						isActive={selectedPlayerCodes.includes(player.playerCode)}
						isCurrent={selectedPlayerCodes.includes(player.playerCode)}
						playerPower={(playerPowers[player.playerCode] || usedPowers[player.playerCode]) as "star" | "shield" | undefined}
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

export default AVeDichChungPage;
