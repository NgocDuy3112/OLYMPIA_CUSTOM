
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	Plus,
	Power,
	X,
	SkipForward,
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
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";

const logger = createLogger("AKhoiDongRieng");

const TIME_LIMIT = 40;
const QUESTION_PREFIX = "OC3_Q_KD";

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

const AKhoiDongRiengPage = () => {
	const navigate = useNavigate();
	const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
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
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });
	const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});

	const [selectedPlayerCode, setSelectedPlayerCode] = useState<string | null>(null);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const [hasStartedRoundTimer, setHasStartedRoundTimer] = useState(false);
	const autoAdvanceRef = useRef<number | null>(null);

	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);
	const [isSkipping, setIsSkipping] = useState<boolean>(false);
	const [isAdvancing, setIsAdvancing] = useState<boolean>(false);

	const [attempts, setAttempts] = useState<Record<string, number>>({});

	const [isPlayerLocked, setIsPlayerLocked] = useState<boolean>(false);

	const hasPlayerWithSecondAttempt = Object.values(attempts).some(count => count === 1);

	useEffect(() => {
		logger.info("DEBUG: attempts=", attempts, "hasPlayerWithSecondAttempt=", hasPlayerWithSecondAttempt);
	}, [attempts, hasPlayerWithSecondAttempt]);

	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
	}, []);

	const questionTitle = "KHỞI ĐỘNG - LƯỢT CÁ NHÂN";

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
			const snapshot = await loadAdminPlayersSnapshot(currentMatchCode, token);
			const playersList = snapshot.players;
			const scoreList = snapshot.scoreboard;
			const profiles = snapshot.profiles;
			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));

			const positions: Record<string, number> = {};
			for (const entry of playersList) {
				if (entry.user_code && typeof entry.position === "number") positions[String(entry.user_code)] = entry.position;
			}
			setPlayerPositions(positions);

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
					is_current: selectedPlayerCode ? selectedPlayerCode === String(userCode) : false,
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
	}, [currentMatchCode, loadPlayersState, sendMessage, selectedPlayerCode]);

	useEffect(() => {
		if (selectedPlayerCode !== null) {
			const timer = setTimeout(() => {
				void sendPlayersSnapshot();
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [selectedPlayerCode, sendPlayersSnapshot]);

	const resolveQuestionCode = useCallback((questionIndex: number) => {
		const playerIndex = selectedPlayerCode ? (playerPositions[selectedPlayerCode] ?? 0) : 0;
		if (!playerIndex) return "";
		return `${QUESTION_PREFIX}_${playerIndex}_${questionIndex}`;
	}, [selectedPlayerCode, playerPositions]);

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
					const mappedFallback = mapQuestionApiPayload(null, questionCode);
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
				const mapped = mapQuestionApiPayload(payload, questionCode);
				setCurrentQuestion(mapped);
				return mapped;
			} catch (error) {
				logger.error("Failed to load question:", error);
				const mapped = mapQuestionApiPayload(null, questionCode);
				setCurrentQuestion(mapped);
				return mapped;
			}
		},
		[currentMatchCode, mapQuestionApiPayload, resolveQuestionCode, token],
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

	const sendSpecificRoundSnapshot = useCallback(async () => {
		if (currentQuestionIndex > 0) {
			await sendQuestionToPlayers(currentQuestionIndex);
		}
		if (timer > 0 && currentQuestionIndex > 0) {
			await sendStartTimer({ sendMessage, phase: "kdr", timeLimit: timer, questionCode: resolveQuestionCode(currentQuestionIndex) });
		}
	}, [currentQuestionIndex, resolveQuestionCode, sendMessage, sendPlayersSnapshot, sendQuestionToPlayers, timer]);

	const sendRoundSnapshot = useCallback(async () => {
		await sendPlayersSnapshot();
		await sendSpecificRoundSnapshot();
	}, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

	const clearQuestion = useCallback(async () => {
		if (!currentMatchCode) return;
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (error) {
			logger.error("Failed to clear question via WS:", error);
		}
	}, [currentMatchCode, sendMessage]);

	const handleEndTurn = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setSelectedPlayerCode(null);
		setIsPlayerLocked(false);
		setIsTimerRunning(false);
		setHasStartedRoundTimer(false);
		await clearQuestion();
	}, [clearQuestion]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setSelectedPlayerCode(null);
		setIsPlayerLocked(false);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			await endRoundAndReturnToWaiting({ currentMatchCode, navigate, round: "kdr", sendMessage });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}

	}, [clearQuestion, currentMatchCode, navigate, sendMessage]);

	const startTheClock = useCallback(async () => {
		if (hasStartedRoundTimer || isTimerRunning) return;
		setHasStartedRoundTimer(true);

		const targetIndex = 1;

		setIsPlayerLocked(true);

		setHasAddedScore(false);

		setAttempts({});
		setPlayers((prev) => prev.map((p) => ({
			...p,
			playerLastAnswer: undefined,
			playerTimestamp: undefined,
			playerHasBuzzed: undefined,
		})));

		setCurrentQuestionIndex(targetIndex);

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
			void sendStartTimer({ sendMessage, phase: "kdr", timeLimit: TIME_LIMIT, questionCode: fallbackQuestion.questionCode });
		}

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
	}, [currentMatchCode, resolveQuestionCode, sendMessage, loadQuestion, sendQuestionToPlayers, hasStartedRoundTimer, isTimerRunning]);

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

				try {
					if (!questionCode || String(questionCode).length === 0) {
						logger.warn("handleAddScore: no question_code available; skipping POST to /records");
					} else {
						const recordRes = await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
							method: "PATCH",
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
				} catch (err) {
					logger.error("handleAddScore: failed to refresh scoreboard:", err);
				}

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
		[currentMatchCode, currentQuestionIndex, resolveQuestionCode, token, sendPlayersSnapshot, sendMessage],
	);
	void handleAddScore;

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
	const handleNextQuestion = useCallback(async (fromIndex: number) => {
		const nextIndex = fromIndex < 6 ? fromIndex + 1 : fromIndex;
		if (nextIndex === fromIndex) return;
		setCurrentQuestionIndex(nextIndex);
		try {
			const q = await loadQuestion(nextIndex);
			await sendQuestionToPlayers(nextIndex, q);
		} catch (err) {
			logger.error("Failed advancing to next question:", err);
		}
	}, [loadQuestion, sendQuestionToPlayers]);

	useEffect(() => {
		if (currentQuestionIndex > 0) {

			Promise.resolve().then(() => {
				setHasAddedScore(false);
				setIsSkipping(false);
				setIsAdvancing(false);

				setAttempts({});
			});
		}
	}, [currentQuestionIndex]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (!selectedPlayerCode) return;

		if (currentQuestionIndex <= 0) {
			logger.warn("handleAddScoreToSelected: No active question selected (index 0). Aborting score award.");
			return;
		}

		setHasAddedScore(true);

		try {
			if (!currentQuestion.questionCode) throw new Error("Không có mã câu hỏi");
			void sendMessage({ type: "kd_cong_diem" });
			await calculateScore(token, currentMatchCode, currentQuestion.questionCode, "kdr_correct", [selectedPlayerCode]);
			await sendPlayersSnapshot();

			if (timer <= 0) {
				await clearQuestion();
			} else if (currentQuestionIndex > 0) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				handleNextQuestion(currentQuestionIndex);
			}
		} catch (err) {
			logger.error("Failed adding score to selected player:", err);
			setHasAddedScore(false);
		}
	}, [selectedPlayerCode, currentQuestionIndex, currentQuestion.questionCode, currentMatchCode, token, handleNextQuestion, clearQuestion, timer, sendMessage, sendPlayersSnapshot]);

	const handleMarkWrong = useCallback(async () => {
		if (!selectedPlayerCode) {
			logger.warn("handleMarkWrong: No selected player");
			return;
		}
		if (currentQuestionIndex <= 0) {
			logger.warn("handleMarkWrong: No active question (index=", currentQuestionIndex, ")");
			return;
		}

		const currentAttempts = attempts[selectedPlayerCode] ?? 0;
		const nextCount = currentAttempts + 1;
		const exhausted = nextCount >= 2;

		logger.info("handleMarkWrong: player=", selectedPlayerCode, "currentAttempts=", currentAttempts, "nextCount=", nextCount);

		setAttempts((prev) => {
			const updated = { ...prev, [selectedPlayerCode]: nextCount };
			logger.info("handleMarkWrong: updated attempts=", updated);
			return updated;
		});

		if (currentQuestion.questionCode) {
			try {
				await calculateScore(token, currentMatchCode, currentQuestion.questionCode, "kdr_wrong", [selectedPlayerCode]);
			} catch (err) {
				logger.error("Không thể lưu lượt trả lời sai:", err);
				return;
			}
		}

		if (nextCount === 1) {
			logger.info("handleMarkWrong: sending player_wrong_attempt for", selectedPlayerCode);
			void sendMessage({ type: "player_wrong_attempt", user_code: selectedPlayerCode, attempt_count: 1, phase: "kdr" });
		} else {
			logger.info("handleMarkWrong: sending wrong (exhausted) for", selectedPlayerCode);
			void sendMessage({ type: "wrong", user_code: selectedPlayerCode, phase: "kdr" });
		}

		if (exhausted) {
			setIsAdvancing(true);

			if (timer <= 0) {
				await clearQuestion();
			} else if (currentQuestionIndex > 0) {
				await new Promise(resolve => setTimeout(resolve, 1000));
				handleNextQuestion(currentQuestionIndex);
			}
		}
	}, [selectedPlayerCode, currentQuestionIndex, currentQuestion.questionCode, currentMatchCode, token, attempts, handleNextQuestion, sendMessage, clearQuestion, timer]);

	const handleSkip = useCallback(async () => {
		if (!selectedPlayerCode) return;
		if (currentQuestionIndex <= 0) return;
		setIsSkipping(true);

		setAttempts((prev) => ({ ...prev, [selectedPlayerCode]: 2 }));
		void sendMessage({ type: "skip", user_code: selectedPlayerCode, phase: "kdr" });

		if (timer <= 0) {
			await clearQuestion();
		} else if (currentQuestionIndex > 0) {
			await new Promise(resolve => setTimeout(resolve, 1000));
			handleNextQuestion(currentQuestionIndex);
		}
	}, [selectedPlayerCode, currentQuestionIndex, handleNextQuestion, sendMessage, clearQuestion, timer]);

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

			if (autoAdvanceRef.current) {
				window.clearInterval(autoAdvanceRef.current);
				autoAdvanceRef.current = null;
			}

			startTransition(() => {
				setIsTimerRunning(false);
				setCurrentQuestionIndex(0);
				setCurrentQuestion({ ...DEFAULT_QUESTION });
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
		if (!lastMessage) return;
		const msg: any = lastMessage;
		switch (msg?.type) {
			case "mc_reconnected":
			case "guest_online":
			case "player_reconnected":
			case "user_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});
					void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/kdr" });
					void sendRoundSnapshot();
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
							playerWrongAttempts: undefined,
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

			case "player_wrong_attempt": {
				const { user_code, attempt_count } = msg;
				if (user_code && attempt_count) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === user_code
									? { ...player, playerWrongAttempts: attempt_count }
									: player,
							),
						);
					});
					logger.info("Player wrong attempt:", user_code, "count:", attempt_count);
				}
				break;
			}
			case "player_answer":
			case "answer": {

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
			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendMessage, sendRoundSnapshot]);

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
			controlsChildren={(api) => (
				<div className="flex gap-2 items-center">
					{}
					{hasPlayerWithSecondAttempt && (
						<div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold shrink-0 animate-pulse">
							Trả lời lần 2
						</div>
					)}
					{Array.from({ length: 6 }).map((_, idx) => {
						const isActive = api.activeIndices.includes(idx);
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
						onClick={() => { void handleEndTurn(); }}
						disabled={isTimerRunning || !selectedPlayerCode}
					>
						<SkipForward size={18} />
						<span className="ml-2 font-bold">HẾT LƯỢT</span>
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
			playerSectionButtons={
				<>
					<AControlButton
						onClick={() => {
							void startTheClock();
						}}
						disabled={isTimerRunning || hasStartedRoundTimer}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddScoreToSelected();
						}}
						disabled={!selectedPlayerCode || isSkipping || isAdvancing}
					>
						<Plus size={18} />
						<span className="ml-2 font-bold">CỘNG ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleMarkWrong(); }}
						disabled={!selectedPlayerCode || isAdvancing || (selectedPlayerCode ? (attempts[selectedPlayerCode] ?? 0) >= 2 : false)}
					>
						<X size={18} />
						<span className="ml-2 font-bold">
							{selectedPlayerCode && (attempts[selectedPlayerCode] ?? 0) >= 1 ? 'SAI LẦN 2' : 'SAI LẦN 1'}
						</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleSkip(); }}
						disabled={!selectedPlayerCode || hasAddedScore || isAdvancing}
					>
						<SkipForward size={18} />
						<span className="ml-2 font-bold">BỎ QUA</span>
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

export default AKhoiDongRiengPage;
