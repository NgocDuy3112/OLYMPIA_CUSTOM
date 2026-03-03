/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { 
	AlarmClockCheck, 
	CheckCheck,
	Power, 
	RefreshCw, 
} from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AKhoiDongChung");


const TIME_LIMIT = 60;
const MAX_QUESTION_INDEX = 6;
const QUESTION_PREFIX = "KD_C"; // Matches the Khởi Động chung question naming convention.


const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};




const AKhoiDongChungPage = () => {
	// Prefer matchCode from localStorage, but fall back to URL path (e.g. /admin/kdc/OC3_M01T)
	const currentMatchCode = (() => {
		try {
			const stored = localStorage.getItem("matchCode");
			if (stored && stored.length > 0) return stored;
			const parts = window.location.pathname.split("/").filter(Boolean);
			const last = parts.length > 0 ? parts[parts.length - 1] : "";
			if (last && /^OC3_/.test(last)) {
				// persist for later navigations
				try {
					localStorage.setItem("matchCode", last);
				} catch (err) {
					logger.debug("Could not persist matchCode to localStorage:", err);
				}
				return last;
			}
			return "";
		} catch {
			return "";
		}
	})();
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	// allow multi-selection of players on this page
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) => (prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode]));
	}, []);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	// second attempt logic removed — always award full points

	// countdown running state & auto-advance interval ref
	const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
	const autoAdvanceRef = useRef<number | null>(null);

	// Track whether admin has already applied score for the current question
	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);

	const hasQuestionSelected = currentQuestionIndex > 0;
	const questionTitle = "KHỞI ĐỘNG - LƯỢT CHUNG";

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

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));
		} catch (error) {
			logger.error("Failed to load players:", error);
		}
	}, [currentMatchCode, token]);

	const resolveQuestionCode = useCallback((questionIndex: number) => {
		return `${QUESTION_PREFIX}_${String(questionIndex).padStart(2, "0")}`;
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
				const res = await fetch(`${API_BASE_URL}/questions/${currentMatchCode}/${questionCode}`, {
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

	const sendQuestionToContestants = useCallback(
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
			await sendMessage({ type: "navigate", user_code: "", path: `/contestant/kdc` });
		} catch (error) {
			logger.error("Failed to start round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "navigate", user_code: "", path: `/contestant/waiting` });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const startTheClock = useCallback(
		async (questionIndex: number) => {
			if (!currentMatchCode) return;

			// If no question selected, advance to the first question and broadcast it immediately
			if (questionIndex <= 0) {
				setCurrentQuestionIndex(1);
				try {
					const q = await loadQuestion(1);
					await sendQuestionToContestants(1, q);
				} catch (error) {
					logger.error("Failed to load/send initial question for countdown:", error);
				}
			}

			setTimer(TIME_LIMIT);
			setIsTimerRunning(true);

			const questionCode = resolveQuestionCode(questionIndex > 0 ? questionIndex : 1);
			try {
				await sendMessage({ type: "start_the_timer", user_code: "", time_limit: TIME_LIMIT, question_code: questionCode });
			} catch (error) {
				logger.error("Failed to start the clock via WS:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, sendMessage, loadQuestion, sendQuestionToContestants],
	);

	const handleAddScore = useCallback(
		async (playerCode: string, delta: number) => {
			if (!playerCode) return;
			setPlayers((prev) =>
				prev.map((player) =>
					player.playerCode === playerCode
						? { ...player, playerScore: (player.playerScore ?? 0) + delta }
						: player,
				),
			);

			if (!currentMatchCode || !token) return;

			const questionCode = currentQuestionIndex > 0 ? resolveQuestionCode(currentQuestionIndex) : undefined;

			try {
				await fetch(`${API_BASE_URL}/records/`, {
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

				const recentRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				});
				const recentJson = await recentRes.json();
				const scoreboard = recentJson.data ?? [];
				setPlayers((prev) =>
					prev.map((player) => {
						const updatedScore = scoreboard.find((item: any) => item.user_code === player.playerCode)?.cummulative_score;
						return typeof updatedScore === "number" ? { ...player, playerScore: updatedScore } : player;
					}),
				);
			} catch (error) {
				logger.error("Failed to update score:", error);
			}
		},
		[currentMatchCode, currentQuestionIndex, resolveQuestionCode, token],
	);

	const handleNextQuestion = useCallback(async () => {
		const nextIndex = currentQuestionIndex > 0 ? (currentQuestionIndex < MAX_QUESTION_INDEX ? currentQuestionIndex + 1 : currentQuestionIndex) : 1;
		if (nextIndex === currentQuestionIndex && currentQuestionIndex !== 0) return;

		setCurrentQuestionIndex(nextIndex);
		try {
			const q = await loadQuestion(nextIndex);
			await sendQuestionToContestants(nextIndex, q);
		} catch (err) {
			logger.error("Failed advancing to next question:", err);
		}
		// second attempt flag removed
	}, [currentQuestionIndex, loadQuestion, sendQuestionToContestants]);

	// Reset the "has added score" flag when advancing to a different question
	useEffect(() => {
		// schedule state update async to avoid cascading renders
		Promise.resolve().then(() => setHasAddedScore(false));
	}, [currentQuestionIndex]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		const score = 10; // always award 10 points
		setHasAddedScore(true);
		try {
			// Apply score sequentially to avoid race conditions updating scoreboard
			for (const code of selectedPlayerCodes) {
				await handleAddScore(code, score);
			}
			// Clear selection after awarding points
			setSelectedPlayerCodes([]);
			// Advance to next question after scoring
			await handleNextQuestion();
		} catch (err) {
			logger.error("Failed adding score to selected players:", err);
		}
	}, [selectedPlayerCodes, handleAddScore, handleNextQuestion]);

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

			// clear question on contestants (schedule async to avoid sync setState inside effect)
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
	}, [applyPlayersSnapshot, lastMessage]);

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
											await sendQuestionToContestants(qIndex, q);
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
								className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 ${isActive ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white hover:bg-blue-700'}`}>
								{idx + 1}
							</button>
						);
					})}
				</div>
			)}
			topControlButtons={
				<>
					<button
						onClick={() => {
							void startTheClock(currentQuestionIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-40 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={isTimerRunning}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</button>
					<button
						onClick={() => {
							void handleAddScoreToSelected();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-40 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasQuestionSelected || selectedPlayerCodes.length === 0 || hasAddedScore}
					>
						<CheckCheck size={18} />
						<span className="ml-2 font-bold">CỘNG ĐIỂM</span>
					</button>
				</>
			}
			bottomActionButtons={
				<>
					<button
						onClick={() => { handleStartRound() }}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-40 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU LƯỢT THI</span>
					</button>
					<button
						onClick={() => { loadPlayersState()}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-40 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT ĐIỂM SỐ</span>
					</button>
					<button
						onClick={() => {handleEndRound()}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-40 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC PHẦN THI</span>
					</button>
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
