/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useState } from "react";
import { AlarmClockCheck, ArrowLeftToLine, ArrowRightToLine, Plus, Power, RefreshCw } from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { createLogger } from "@/utils/logger";
const logger = createLogger("AButPha");
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";


const TIME_LIMIT = 15;
const MAX_QUESTION_INDEX = 4;
const QUESTION_PREFIX = "BP"; // Bứt Phá question naming convention.


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


const AButPhaPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode") ?? "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage } = useWebSocket(currentMatchCode);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [timer, setTimer] = useState<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

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
			const playersList = playersJson.response?.data?.players ?? [];

			let scoreList: any[] = [];
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
headers: { Authorization: `Bearer ${token}` },
});
				const scoreJson = await scoreRes.json();
				scoreList = scoreJson.response?.data?.scoreboard ?? [];
			} catch (error) {
				logger.error("Failed to load scoreboard:", error);
			}

			const profileResponses = await Promise.all(
playersList.map((entry: any) =>
					fetch(`${API_BASE_URL}/players/${entry.user_code}`, {
headers: { Authorization: `Bearer ${token}` },
})
						.then((res) => res.json())
						.catch(() => null),
				),
			);

			const profiles = playersList.map((entry: any, index: number) => ({
user_code: entry.user_code,
user_name: profileResponses[index]?.response?.data?.user_name ?? "",
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
				setCurrentQuestion(mapQuestionPayload(data.response?.data, questionCode));
			} catch (error) {
				logger.error("Failed to load question:", error);
				setCurrentQuestion(mapQuestionPayload(null, questionCode));
			}
		},
		[currentMatchCode, mapQuestionPayload, resolveQuestionCode, token],
	);

	const sendQuestionToContestants = useCallback(
async (questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
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
				logger.error("Failed to broadcast question:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, token],
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
			logger.error("Failed to clear question:", error);
		}
	}, [currentMatchCode, token]);

	const handleStartRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode || !token) return;
		try {
			await fetch(`${API_BASE_URL}/controller/navigate/${currentMatchCode}`, {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${token}`,
},
body: JSON.stringify({ path: `/contestant/bp` }),
});
		} catch (error) {
			logger.error("Failed to start round:", error);
		}
	}, [clearQuestion, currentMatchCode, token]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
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
			logger.error("Failed to end round:", error);
		}
	}, [clearQuestion, currentMatchCode, token]);

	const startTheClock = useCallback(
async (questionIndex: number) => {
			if (!currentMatchCode || !token) return;
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
			setTimer(TIME_LIMIT);

			try {
				await fetch(`${API_BASE_URL}/controller/start_clock/${currentMatchCode}/${questionCode}`, {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${token}`,
},
body: JSON.stringify({ time_limit: TIME_LIMIT }),
});
			} catch (error) {
				logger.error("Failed to start the clock:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, token],
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

	const hasQuestionSelected = currentQuestionIndex > 0;
	const questionTitle = `BỨT PHÁ${hasQuestionSelected ? ` - CÂU HỎI SỐ ${currentQuestionIndex}` : ""}`;

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
							const prevIndex = Math.max(1, currentQuestionIndex - 1 || 1);
							setCurrentQuestionIndex(prevIndex);
							void loadQuestion(prevIndex);
							void sendQuestionToContestants(prevIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={currentQuestionIndex <= 1}
					>
						<ArrowLeftToLine size={18} />
						<span className="ml-2 font-bold">CÂU HỎI TRƯỚC ĐÓ</span>
					</button>
					<button
						onClick={() => {
							const nextIndex = currentQuestionIndex > 0 ? currentQuestionIndex + 1 : 1;
							if (nextIndex > MAX_QUESTION_INDEX) return;
							setCurrentQuestionIndex(nextIndex);
							void loadQuestion(nextIndex);
							void sendQuestionToContestants(nextIndex);
						}}
						className="bg-blue-900 ring-blue-600 ring-3 min-w-60 h-15 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:opacity-50"
						disabled={currentQuestionIndex >= MAX_QUESTION_INDEX}
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
							void handleStartRound();
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
							void handleEndRound();
						}}
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
						<div className="flex flex-row pt-3 gap-3 justify-center">
							<button
								onClick={() => {
									void handleAddScore(player.playerCode, 30);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-35 h-12 text-[18px] flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Plus size={18} />
								<span className="ml-2 font-bold">CỘNG 30</span>
							</button>
							<button
								onClick={() => {
									void handleAddScore(player.playerCode, 20);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-35 h-12 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Plus size={18} />
								<span className="ml-2 font-bold">CỘNG 20</span>
							</button>
							<button
								onClick={() => {
									void handleAddScore(player.playerCode, 10);
								}}
								className="bg-blue-900 ring-blue-600 ring-3 w-35 h-12 flex text-white items-center justify-center transition transform duration-200 hover:bg-blue-700 hover:scale-105 hover:shadow-lg"
							>
								<Plus size={18} />
								<span className="ml-2 font-bold">CỘNG 10</span>
							</button>
						</div>
					</div>
				))
			}
		/>
	);
};


export default AButPhaPage;
