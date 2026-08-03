
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
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";
import { calculateScore } from "@/api/scores";

const logger = createLogger("AKhoiDongChung");

const TIME_LIMIT = 60;
const MAX_QUESTION_INDEX = 6;
const QUESTION_PREFIX = "OC3_Q_KD_C";

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
	const { lastMessage, sendMessage } = useGameWebSocket();

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
			logger.warn("No match code available, redirecting to game managing page");
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });

	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) => (prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode]));
	}, []);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

	const lastAutoAdvancedIndexRef = useRef<number>(0);

	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);

	const questionTitle = "KHỞI ĐỘNG - LƯỢT CHUNG";

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

		for (const player of players) {
			try {
				const url = `${API_BASE_URL}/answers/?match_code=${encodeURIComponent(currentMatchCode)}&user_code=${encodeURIComponent(player.playerCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) continue;
				const json = await res.json();

				const data = json.data;
				if (!data) continue;

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

			const profiles = playersList.map((entry: any) => ({
				user_code: entry.user_code,
				user_name: entry.user_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));

			return { playersList, scoreList, profiles };
		} catch (error) {
			logger.error("Failed to load players:", error);
			return undefined;
		}
	}, [currentMatchCode, token]);

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

				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					logger.warn(`loadQuestion: server returned ${res.status} for ${questionCode}`);
					const mappedFallback = mapQuestionPayload(null, questionCode);
					setCurrentQuestion(mappedFallback);
					return mappedFallback;
				}
				const data = await res.json();

				let payload: any = null;
				if (Array.isArray(data.data)) {

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

	}, [clearQuestion, currentMatchCode, sendMessage]);

		const startTheClock = useCallback(async () => {

			const targetIndex = 1;

			setSelectedPlayerCodes([]);
			setHasAddedScore(false);
			setPlayers((prev) => prev.map((p) => ({
				...p,
				playerLastAnswer: undefined,
				playerTimestamp: undefined,
				playerHasBuzzed: undefined,
			})));

			setCurrentQuestionIndex(targetIndex);

			lastAutoAdvancedIndexRef.current = targetIndex;

			const fallbackQuestion: Question = {
				questionCode: resolveQuestionCode(targetIndex),
				questionText: `Câu hỏi ${targetIndex}`,
				questionAnswer: "",
				questionExplanation: "",
				questionMediaURL: undefined,
			};
			setCurrentQuestion(fallbackQuestion);

			setTimer(TIME_LIMIT);
			setIsTimerRunning(true);

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

			setPlayers((prev) =>
				prev.map((player) => {
					const entry = scoreboardArr.find((item: any) => item.user_code === player.playerCode);
					const updatedScore = entry?.cumulative_score ?? entry?.cumulative_score ?? entry?.total_score ?? entry?.score;
					return typeof updatedScore === "number" ? { ...player, playerScore: updatedScore } : player;
				}),
			);

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

	useEffect(() => {

		Promise.resolve().then(() => setHasAddedScore(false));
	}, [currentQuestionIndex]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;

		if (currentQuestionIndex <= 0) {
			logger.warn("handleAddScoreToSelected: No active question selected (index 0). Aborting score award.");
			return;
		}
		setHasAddedScore(true);
		void sendMessage({ type: "kd_cong_diem" });
		if (!currentMatchCode || !token) return;
		const questionCode = resolveQuestionCode(currentQuestionIndex);

		try {
			if (!questionCode) throw new Error("Không có mã câu hỏi");
			await calculateScore(token, currentMatchCode, questionCode, "kdc_correct", selectedPlayerCodes);
			await syncAndBroadcastScores();

			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("Failed adding score to selected players:", err);

			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, currentMatchCode, currentQuestionIndex, resolveQuestionCode, token, syncAndBroadcastScores, sendMessage]);

	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		logger.info("handleEditScore: player=", playerCode, "newScore=", newScore);

		setPlayers((prev) =>
			prev.map((player) =>
				player.playerCode === playerCode
					? { ...player, playerScore: newScore }
					: player,
			),
		);

		void syncAndBroadcastScores();
	}, [syncAndBroadcastScores]);

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

			lastAutoAdvancedIndexRef.current = 0;
			startTransition(() => {
				setIsTimerRunning(false);
				setCurrentQuestionIndex(0);
			});

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

	useEffect(() => {
		if (!isTimerRunning || timer <= 0) return;

		const derivedIndex = Math.ceil((60 - timer + 1) / 10);
		const targetIndex = Math.min(Math.max(derivedIndex, 1), MAX_QUESTION_INDEX);

		if (targetIndex !== lastAutoAdvancedIndexRef.current) {
			lastAutoAdvancedIndexRef.current = targetIndex;
			setCurrentQuestionIndex(targetIndex);

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
			case "mc_reconnected":
			case "guest_online":
			case "player_reconnected":
			case "user_online": {
				if (msg.user_code) {
					const onlineCode = String(msg.user_code);
					startTransition(() => {
						setPlayers((prev) => {
							if (prev.some((p) => p.playerCode === onlineCode)) {
								return prev.map((p) => (p.playerCode === onlineCode ? { ...p, playerConnected: true } : p));
							}

							return [...prev, { playerCode: onlineCode, playerName: "", playerScore: 0, playerConnected: true }];
						});
					});
					try {
						void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/kdc" });
					} catch (err) {
						logger.error("Failed to navigate player on reconnect:", err);
					}
					(async () => {

						if (currentQuestionIndex > 0) {
							try {
								await sendQuestionToplayers(currentQuestionIndex);
								logger.info("Resent question to players after user_online for", msg.user_code);
							} catch (err) {
								logger.error("Failed to resend question on user_online:", err);
							}
						}

						if (timer > 0 && currentQuestionIndex > 0) {
							try {
								const questionCode = resolveQuestionCode(currentQuestionIndex);
								await sendMessage({ type: "start_the_timer", user_code: "", phase: "kdc", time_limit: timer, question_code: questionCode, started_at: Date.now() });
								logger.info("Resent timer to players after user_online for", msg.user_code, "time_left=", timer);
							} catch (err) {
								logger.error("Failed to resend timer on user_online:", err);
							}
						}

						try {
							await sendPlayersSnapshot();
							logger.info("Resent players snapshot after user_online for", msg.user_code);
						} catch (err) {
							logger.error("Failed to resend players snapshot on user_online:", err);
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

			case "player_answer":
			case "answer": {

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

							void handleAddScoreToSelected().catch((err) => {
								logger.error("AddScore button handler failed:", err);

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
