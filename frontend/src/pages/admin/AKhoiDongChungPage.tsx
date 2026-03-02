/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useState } from "react";
import { 
	AlarmClockCheck, 
	CheckCheck,
	Check, 
	Power, 
	RefreshCw, 
	CircleX, 
	ArrowRightFromLine 
} from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { createLogger } from "@/utils/logger";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AKhoiDongChung");


const TIME_LIMIT = 5;
const MAX_QUESTION_INDEX = 6;
const QUESTION_PREFIX = "KD_C"; // Matches the Khởi Động chung question naming convention.


const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};


function unwrapWsMessage(message: any): any {
	if (message && typeof message === "object" && "message" in message) {
		return message.message;
	}
	return message;
}


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
	const { lastMessage, sendMessage } = useWebSocket(currentMatchCode);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	const [isSecondAttempt, setIsSecondAttempt] = useState<boolean>(false);

	const hasQuestionSelected = currentQuestionIndex > 0;
	const questionTitle = `KHỞI ĐỘNG - LƯỢT CHUNG${hasQuestionSelected ? ` - CÂU HỎI SỐ ${currentQuestionIndex}` : ""}`;

	const buildPlayersSnapshot = useCallback(
		(
			playersList: any[],
			scoreboard: any[],
			profiles: any[],
			previousPlayers: PlayerStatus[],
		): PlayerStatus[] => {
			if (!playersList?.length) {
				return previousPlayers;
			}

			const toMap = (collection: any[]) => {
				const map = new Map<string, any>();
				collection?.forEach((item) => {
					if (item && item.user_code) {
						map.set(String(item.user_code), item);
					}
				});
				return map;
			};

			const scoreMap = toMap(scoreboard ?? []);
			const profileMap = toMap(profiles ?? []);

			return playersList
				.map((entry: any) => {
					const code = String(entry?.user_code ?? "");
					if (!code) return null;

					const previous = previousPlayers.find((p) => p.playerCode === code);
					const profile = profileMap.get(code) ?? {};
					const scoreInfo = scoreMap.get(code) ?? {};

					const resolvedScore =
						typeof scoreInfo.cummulative_score === "number"
							? scoreInfo.cummulative_score
							: typeof scoreInfo.new_total_score === "number"
								? scoreInfo.new_total_score
								: previous?.playerScore ?? 0;

					return {
						playerCode: code,
						playerName: profile.user_name ?? previous?.playerName ?? "",
						playerScore: resolvedScore,
						playerLastAnswer: previous?.playerLastAnswer,
						playerTimestamp: previous?.playerTimestamp,
						playerHasBuzzed: previous?.playerHasBuzzed ?? false,
					};
				})
				.filter(Boolean) as PlayerStatus[];
		},
		[],
	);

	const applyPlayersSnapshot = useCallback(
		(payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
			const playersList = Array.isArray(payload?.players) ? payload.players : [];
			const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
			const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreboardList, profileList, prev));
		},
		[buildPlayersSnapshot],
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

			const profiles = playersList.map((index: number) => ({
				playerCode: profileResponses[index]?.data?.user_code ?? "",
				playerName: profileResponses[index]?.data?.user_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));
		} catch (error) {
			logger.error("Failed to load players:", error);
		}
	}, [buildPlayersSnapshot, currentMatchCode, token]);

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
		async (questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (questionIndex <= 0) {
				setCurrentQuestion({ ...DEFAULT_QUESTION });
				return;
			}

			const questionCode = resolveQuestionCode(questionIndex);

			try {
				const res = await fetch(`${API_BASE_URL}/questions/${currentMatchCode}/${questionCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const data = await res.json();
				setCurrentQuestion(mapQuestionPayload(data.data, questionCode));
			} catch (error) {
				logger.error("Failed to load question:", error);
				setCurrentQuestion(mapQuestionPayload(null, questionCode));
			}
		},
		[currentMatchCode, mapQuestionPayload, resolveQuestionCode, token],
	);

	const sendQuestionToContestants = useCallback(
		async (questionIndex: number) => {
			if (!currentMatchCode) return;
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);

			try {
				await sendMessage({
					type: "send_question",
					user_code: "",
					question_code: questionCode,
					content: currentQuestion.questionText ?? "",
					media_source: currentQuestion.questionMediaURL ?? undefined,
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
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
			setTimer(TIME_LIMIT);

			try {
				await sendMessage({ type: "start_the_timer", user_code: "", time_limit: TIME_LIMIT, question_code: questionCode });
			} catch (error) {
				logger.error("Failed to start the clock via WS:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, sendMessage],
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
						d_score_earned: delta,
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

	const handleNextQuestion = useCallback(() => {
		const nextIndex = currentQuestionIndex > 0 ? (currentQuestionIndex < MAX_QUESTION_INDEX ? currentQuestionIndex + 1 : currentQuestionIndex) : 1;
		if (nextIndex === currentQuestionIndex && currentQuestionIndex !== 0) return;
		
		setCurrentQuestionIndex(nextIndex);
		void loadQuestion(nextIndex);
		void sendQuestionToContestants(nextIndex);
		setIsSecondAttempt(false);
	}, [currentQuestionIndex, loadQuestion, sendQuestionToContestants]);

	useEffect(() => {
		startTransition(() => {
			void loadPlayersState();
		});
	}, [loadPlayersState]);

	useEffect(() => {
		if (timer <= 0) return;
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
	}, [timer]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = unwrapWsMessage(lastMessage);
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
			topControlButtons={
				<>
					<button
						onClick={() => {
							if (!hasQuestionSelected) return;
							void startTheClock(currentQuestionIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasQuestionSelected}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU ĐẾM GIỜ</span>
					</button>
					<button
						onClick={() => {
							const activePlayer = players.find((p) => p.playerHasBuzzed);
							if (!activePlayer) return;
							const score = !isSecondAttempt ? 10 : 5;
							void handleAddScore(activePlayer.playerCode, score);
							handleNextQuestion();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasQuestionSelected || !players.some(p => p.playerHasBuzzed)}
					>
						{!isSecondAttempt ? <CheckCheck size={18} /> : <Check size={18} />}
						<span className="ml-2 font-bold">{!isSecondAttempt ? "CỘNG 10 ĐIỂM" : "CỘNG 5 ĐIỂM"}</span>
					</button>
					<button
						onClick={() => {
							if (!isSecondAttempt) {
								setIsSecondAttempt(true);
							} else {
								handleNextQuestion();
							}
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasQuestionSelected || !players.some(p => p.playerHasBuzzed)}
					>
						<CircleX size={18} />
						<span className="ml-2 font-bold">{!isSecondAttempt ? "SAI LẦN 1" : "SAI LẦN 2"}</span>
					</button>
					<button
						onClick={() => {
							handleNextQuestion();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasQuestionSelected || !players.some(p => p.playerHasBuzzed)}
					>
						<ArrowRightFromLine size={18} />
						<span className="ml-2 font-bold">BỎ QUA</span>
					</button>
				</>
			}
			bottomActionButtons={
				<>
					<button
						onClick={() => { handleStartRound() }}
						className="bg-blue-900 ring-blue-600 ring-3 w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU LƯỢT THI</span>
					</button>
					<button
						onClick={() => { loadPlayersState()}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT ĐIỂM SỐ</span>
					</button>
					<button
						onClick={() => {handleEndRound()}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC PHẦN THI</span>
					</button>
				</>
			}
			renderPlayerList={() =>
				players.map((player) => (
					<div className="flex flex-col gap-3" key={player.playerCode}>
						<APlayerBar player={player} isActive={false} />
					</div>
				))
			}
		/>
	);
};


export default AKhoiDongChungPage;
