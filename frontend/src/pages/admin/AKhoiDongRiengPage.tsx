/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useState } from "react";
import { AlarmClockCheck, ArrowLeftToLine, ArrowRightToLine, Plus, Power, RefreshCw } from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";


const TIME_LIMIT = 5;
const MAX_QUESTION_INDEX = 4;
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


const AKhoiDongRiengPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode") ?? "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useWebSocket(currentMatchCode);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [timer, setTimer] = useState<number>(0);
	const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
	const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);

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
					if (item && item.player_code) {
						map.set(String(item.player_code), item);
					}
				});
				return map;
			};

			const scoreMap = toMap(scoreboard ?? []);
			const profileMap = toMap(profiles ?? []);

			return playersList
				.map((entry: any) => {
					const code = String(entry?.player_code ?? "");
					if (!code) return null;

					const previous = previousPlayers.find((p) => p.playerCode === code);
					const profile = profileMap.get(code) ?? {};
					const scoreInfo = scoreMap.get(code) ?? {};

					const resolvedScore =
						typeof scoreInfo.total_d_score === "number"
							? scoreInfo.total_d_score
							: typeof scoreInfo.new_total_score === "number"
								? scoreInfo.new_total_score
								: previous?.playerScore ?? 0;

					return {
						playerCode: code,
						playerName: profile.player_name ?? previous?.playerName ?? "",
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
			const playersList = playersJson.response?.data?.players ?? [];

			let scoreList: any[] = [];
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const scoreJson = await scoreRes.json();
				scoreList = scoreJson.response?.data?.scoreboard ?? [];
			} catch (error) {
				console.error("Failed to load scoreboard:", error);
			}

			const profileResponses = await Promise.all(
				playersList.map((entry: any) =>
					fetch(`${API_BASE_URL}/players/${entry.player_code}`, {
						headers: { Authorization: `Bearer ${token}` },
					})
						.then((res) => res.json())
						.catch(() => null),
				),
			);

			const profiles = playersList.map((entry: any, index: number) => ({
				player_code: entry.player_code,
				player_name: profileResponses[index]?.response?.data?.player_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));
		} catch (error) {
			console.error("Failed to load players:", error);
		}
	}, [buildPlayersSnapshot, currentMatchCode, token]);

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
		async (playerIndex: number, questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (playerIndex <= 0 || questionIndex <= 0) {
				setCurrentQuestion({ ...DEFAULT_QUESTION });
				return;
			}

			const questionCode = `LN_R${playerIndex}_${String(questionIndex).padStart(2, "0")}`;

			try {
				const res = await fetch(`${API_BASE_URL}/questions/${currentMatchCode}/${questionCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const data = await res.json();
				setCurrentQuestion(mapQuestionPayload(data.response?.data, questionCode));
			} catch (error) {
				console.error("Failed to load question:", error);
				setCurrentQuestion(mapQuestionPayload(null, questionCode));
			}
		},
		[currentMatchCode, mapQuestionPayload, token],
	);

	const sendQuestionToContestants = useCallback(
		async (playerIndex: number, questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (playerIndex <= 0 || questionIndex <= 0) return;

			const questionCode = `LN_R${playerIndex}_${String(questionIndex).padStart(2, "0")}`;
			const endpoint = `${API_BASE_URL}/controller/send_question/${currentMatchCode}/${questionCode}`;

			try {
				await fetch(endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				});
			} catch (error) {
				console.error("Failed to broadcast question:", error);
			}
		},
		[currentMatchCode, token],
	);

	const clearQuestion = useCallback(async () => {
		if (!currentMatchCode || !token) return;
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		try {
			await fetch(`${API_BASE_URL}/controller/clear_question/${currentMatchCode}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
			});
		} catch (error) {
			console.error("Failed to clear question:", error);
		}
	}, [currentMatchCode, token]);

	const resetBuzz = useCallback(async () => {
		setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
		if (!currentMatchCode || !token) return;
		try {
			await fetch(`${API_BASE_URL}/controller/clear_buzz/${currentMatchCode}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
		} catch (error) {
			console.error("Failed to reset buzz state:", error);
		}
	}, [currentMatchCode, token]);

	const handleStartTurn = useCallback(async () => {
		await resetBuzz();
		setCurrentPlayerIndex(0);
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setBuzzerWinnerCode(null);
		setBlockedPlayerCode(null);
		await clearQuestion();

		if (!currentMatchCode || !token) return;
		try {
			await fetch(`${API_BASE_URL}/controller/navigate/${currentMatchCode}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ path: `/contestant/lncn` }),
			});
		} catch (error) {
			console.error("Failed to start turn:", error);
		}
	}, [clearQuestion, currentMatchCode, resetBuzz, token]);


	const handleEndTurn = useCallback(async () => {
		await resetBuzz();
		setCurrentPlayerIndex(0);
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setBuzzerWinnerCode(null);
		setBlockedPlayerCode(null);
		await clearQuestion();

		if (!currentMatchCode || !token) return;
		try {
			await fetch(`${API_BASE_URL}/controller/navigate/${currentMatchCode}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ path: `/contestant/waiting` }),
			});
		} catch (error) {
			console.error("Failed to end turn:", error);
		}
	}, [clearQuestion, currentMatchCode, resetBuzz, token]);

	const startTheClock = useCallback(
		async (playerIndex: number, questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (playerIndex <= 0 || questionIndex <= 0) return;

			const questionCode = `LN_R${playerIndex}_${String(questionIndex).padStart(2, "0")}`;
			const endpoint = `${API_BASE_URL}/controller/start_clock/${currentMatchCode}/${questionCode}`;
			setTimer(TIME_LIMIT);

			try {
				await fetch(endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ time_limit: TIME_LIMIT }),
				});
			} catch (error) {
				console.error("Failed to start the clock:", error);
			}
		},
		[currentMatchCode, token],
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

			const questionCode =
				currentPlayerIndex > 0 && currentQuestionIndex > 0
					? `LN_R${currentPlayerIndex}_${String(currentQuestionIndex).padStart(2, "0")}`
					: undefined;

			try {
				await fetch(`${API_BASE_URL}/records/`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						player_code: playerCode,
						match_code: currentMatchCode,
						question_code: questionCode,
						d_score_earned: delta,
					}),
				});

				const recentRes = await fetch(`${API_BASE_URL}/scoreboard/recent/${currentMatchCode}`, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
				});
				const recentJson = await recentRes.json();
				const scoreboard = recentJson.response?.data ?? [];
				setPlayers((prev) =>
					prev.map((player) => {
						const updatedScore = scoreboard.find((item: any) => item.player_code === player.playerCode)?.total_d_score;
						return typeof updatedScore === "number"
							? { ...player, playerScore: updatedScore }
							: player;
					}),
				);
			} catch (error) {
				console.error("Failed to update score:", error);
			}
		},
		[currentMatchCode, currentPlayerIndex, currentQuestionIndex, token],
	);

	const handleStartPlayer = useCallback(
		async (playerIndex: number) => {
			if (playerIndex <= 0 || playerIndex > players.length) return;
			const targetPlayer = players[playerIndex - 1];

			setCurrentPlayerIndex(playerIndex);
			const initialQuestionIndex = 1;
			setCurrentQuestionIndex(initialQuestionIndex);
			setCurrentQuestion({ ...DEFAULT_QUESTION });
			setBuzzerWinnerCode(null);
			setBlockedPlayerCode(targetPlayer.playerCode);

			await resetBuzz();
			await clearQuestion();
			void sendMessage({ type: "blocked_buzz", player_code: targetPlayer.playerCode });
			void loadQuestion(playerIndex, initialQuestionIndex);

			setPlayers((prev) =>
				prev.map((player, idx) => ({
					...player,
					playerHasBuzzed: false,
					playerLastAnswer: idx + 1 === playerIndex ? player.playerLastAnswer : player.playerLastAnswer,
				})),
			);
		},
		[clearQuestion, loadQuestion, players, resetBuzz, sendMessage],
	);

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
				if (msg.player_code && typeof msg.new_total_score === "number") {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === msg.player_code
									? { ...player, playerScore: msg.new_total_score }
									: player,
							),
						);
					});
				}
				break;
			}
			case "buzzer_winner": {
				const winner = msg.player_code ?? null;
				startTransition(() => {
					setBuzzerWinnerCode(winner);
				});
				startTransition(() => {
					setPlayers((prev) =>
						prev.map((player) => ({
							...player,
							playerHasBuzzed: winner ? player.playerCode === winner : false,
						})),
					);
				});
				break;
			}
			case "clear_buzz": {
				startTransition(() => {
					setBuzzerWinnerCode(null);
				});
				startTransition(() => {
					setPlayers((prev) => prev.map((player) => ({ ...player, playerHasBuzzed: false })));
				});
				break;
			}
			case "blocked_buzz": {
				startTransition(() => {
					setBlockedPlayerCode(msg.player_code ?? null);
				});
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
							const answer = answers.find((item: any) => item.player_code === player.playerCode);
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

	const hasActivePlayer = currentPlayerIndex > 0 && currentPlayerIndex <= players.length;
	const questionTitle = `LÀM NÓNG - LƯỢT CÁ NHÂN${
		hasActivePlayer ? ` THỨ ${currentPlayerIndex}` : ""
	}${currentQuestionIndex > 0 ? ` - CÂU HỎI SỐ ${currentQuestionIndex}` : ""}`;

	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			timerDuration={timer}
			topControlButtons={
				<>
					<button
						onClick={() => {
							if (!hasActivePlayer) return;
							void resetBuzz();
							const questionIndex = currentQuestionIndex > 0 ? currentQuestionIndex : 1;
							setCurrentQuestionIndex(questionIndex);
							void startTheClock(currentPlayerIndex, questionIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasActivePlayer}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU ĐẾM GIỜ</span>
					</button>
					<button
						onClick={() => {
							if (!hasActivePlayer) return;
							void resetBuzz();
							const prevIndex = currentQuestionIndex > 1 ? currentQuestionIndex - 1 : 1;
							setCurrentQuestionIndex(prevIndex);
							void loadQuestion(currentPlayerIndex, prevIndex);
							void sendQuestionToContestants(currentPlayerIndex, prevIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasActivePlayer || currentQuestionIndex <= 1}
					>
						<ArrowLeftToLine size={18} />
						<span className="ml-2 font-bold">CÂU HỎI TRƯỚC ĐÓ</span>
					</button>
					<button
						onClick={() => {
							if (!hasActivePlayer) return;
							void resetBuzz();
							const nextIndex = Math.min(MAX_QUESTION_INDEX, currentQuestionIndex + 1 || 1);
							setCurrentQuestionIndex(nextIndex);
							void loadQuestion(currentPlayerIndex, nextIndex);
							void sendQuestionToContestants(currentPlayerIndex, nextIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={!hasActivePlayer || currentQuestionIndex >= MAX_QUESTION_INDEX}
					>
						<ArrowRightToLine size={18} />
						<span className="ml-2 font-bold">CÂU HỎI TIẾP THEO</span>
					</button>
				</>
			}
			bottomActionButtons={
				<>
					<button
						onClick={() => {
							void handleStartTurn();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU LƯỢT THI</span>
					</button>
					<button
						onClick={() => {
							void loadPlayersState();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT ĐIỂM SỐ</span>
					</button>
					<button
						onClick={() => {
							void handleEndTurn();
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC PHẦN THI</span>
					</button>
				</>
			}
			statusMessages={
				<>
					{blockedPlayerCode && (
						<p className="text-white text-lg font-semibold">
							Đang khóa quyền chuông của thí sinh: {blockedPlayerCode}
						</p>
					)}
					{buzzerWinnerCode && (
						<p className="text-green-200 text-lg font-semibold">
							Người bấm chuông nhanh nhất: {buzzerWinnerCode}
						</p>
					)}
				</>
			}
			renderPlayerList={() =>
				players.map((player, index) => (
					<div className="flex flex-col gap-3" key={player.playerCode}>
						<APlayerBar player={player} isActive={index + 1 === currentPlayerIndex} isCurrent={player.playerCode === blockedPlayerCode} />
						<div className="flex flex-row pt-3 gap-3 justify-center">
							<button
								onClick={() => {
									void resetBuzz();
									void handleAddScore(player.playerCode, 10);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-35 h-12 text-[18px] flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Plus size={18} />
								<span className="ml-2 font-bold">CỘNG 10</span>
							</button>
							<button
								onClick={() => {
									void resetBuzz();
									void handleAddScore(player.playerCode, 5);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-35 h-12 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Plus size={18} />
								<span className="ml-2 font-bold">CỘNG 5</span>
							</button>
							<button
								onClick={() => {
									void resetBuzz();
									void handleStartPlayer(index + 1);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-45 h-12 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Power size={18} />
								<span className="ml-2 font-bold">BẮT ĐẦU THI</span>
							</button>
						</div>
					</div>
				))
			}
		/>
	);
};


export default AKhoiDongRiengPage;
