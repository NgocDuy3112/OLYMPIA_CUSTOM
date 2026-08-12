
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, Calculator, Eye, Power } from "lucide-react";
import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useQuestionTimerLock } from "@/hooks/useQuestionTimerLock";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
const logger = createLogger("AButPha");
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";

const TIME_LIMIT = 30;
const MAX_QUESTION_INDEX = 5;
const QUESTION_PREFIX = "OC3_Q_BP";

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

const AButPhaPage = () => {
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
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((code: string) => {
		setSelectedPlayerCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
	}, []);
	const [hasAddedScore, setHasAddedScore] = useState<boolean>(false);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const timerStartedAtRef = useRef<number>(0);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
	const hasQuestionSelected = currentQuestionIndex > 0;

	const isValidBpTimestamp = useCallback((p: PlayerStatus): boolean => {
		if (!hasQuestionSelected) return false;
		if (timer > 0) {

			if (!p.playerLastAnswer) return false;
			const ts = p.playerTimestamp;
			return typeof ts === "number" && ts >= 0 && ts <= 3600;
		}

		const ts = p.playerTimestamp;
		return typeof ts === "number" && ts > 0 && ts <= 3600;
	}, [hasQuestionSelected, timer]);

	useEffect(() => {
		setSelectedPlayerCodes((prev) => {
			if (prev.length === 0) return prev;
			const stillValid = prev.filter((code) => {
				const p = players.find((pl) => pl.playerCode === code);
				return p ? isValidBpTimestamp(p) : false;
			});
			return stillValid.length === prev.length ? prev : stillValid;
		});
	}, [players, isValidBpTimestamp]);

	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;
	const computePlayersSnapshot = useCallback(
		(
			playersList: any[],
			scoreboard: any[] = [],
			profiles: any[] = [],
			previousPlayers: PlayerStatus[] = [],
		): PlayerStatus[] => buildPlayersSnapshot(playersList, scoreboard, profiles, previousPlayers),
		[],
	);

	const applyPlayersSnapshot = useCallback(
		(payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
			const playersList = Array.isArray(payload?.players) ? payload.players : [];
			const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
			const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
			setPlayers((prev) => computePlayersSnapshot(playersList, scoreboardList, profileList, prev));
		},
		[computePlayersSnapshot],
	);

	const loadPlayersState = useCallback(async () => {
		if (!currentMatchCode || !token) return;
		try {
			const snapshot = await loadAdminPlayersSnapshot(currentMatchCode, token);
			const playersList = snapshot.players;
			const scoreList = snapshot.scoreboard;
			const profiles = snapshot.profiles;
			setPlayers((prev) => computePlayersSnapshot(playersList, scoreList, profiles, prev));

			return { playersList, scoreList, profiles };
		} catch (error) {
			logger.error("Failed to load players:", error);
		}
	}, [computePlayersSnapshot, currentMatchCode, token]);

	const sendPlayersSnapshot = useCallback(async () => {
		if (!currentMatchCode) return;
		logger.info("sendPlayersSnapshot: preparing to send snapshot");
		try {
			const payload = await loadPlayersState();
			if (!payload) {
				logger.warn("sendPlayersSnapshot: loadPlayersState returned no payload");
				return;
			}
			const { playersList, scoreList, profiles } = payload as any;

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

	const loadQuestion = useCallback(
		async (questionIndex: number): Promise<Question | undefined> => {
			if (!currentMatchCode || !token) return undefined;
			if (questionIndex <= 0) {
				setCurrentQuestion({ ...DEFAULT_QUESTION });
				return { ...DEFAULT_QUESTION };
			}

			const questionCode = resolveQuestionCode(questionIndex);

			try {
				const res = await fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!res.ok) {
					logger.warn(`loadQuestion: server returned ${res.status} for ${questionCode}`);
					const mapped = mapQuestionApiPayload(null, questionCode);
					setCurrentQuestion(mapped);
					return mapped;
				}
				const data = await res.json();
				let payload: any = null;
				if (Array.isArray(data.data)) {
					payload = data.data.find((q: any) => String(q?.question_code) === questionCode) ?? data.data[0] ?? null;
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

	const sendSpecificRoundSnapshot = useCallback(async () => {
		if (currentQuestion.questionCode) {
			await sendMessage({
				type: "send_question",
				user_code: "",
				question_code: currentQuestion.questionCode,
				content: currentQuestion.questionText ?? "",
				media_source: currentQuestion.questionMediaURL ?? undefined,
			});
		}
		if (timerRef.current > 0 && currentQuestion.questionCode) {
			await sendStartTimer({ sendMessage, phase: "bp", timeLimit: timerRef.current, questionCode: currentQuestion.questionCode });
			if (videoPlayState === "playing") await sendMessage({ type: "media_control", action: "play" });
		}
	}, [currentQuestion, sendMessage, videoPlayState]);

	const sendRoundSnapshot = useCallback(async () => {
		await sendPlayersSnapshot();
		await sendSpecificRoundSnapshot();
	}, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

	const clearQuestion = useCallback(async () => {
		if (!currentMatchCode) return;
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setVideoPlayState(null);
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (error) {
			logger.error("Failed to clear question via WS:", error);
		}
	}, [currentMatchCode, sendMessage]);

	useEffect(() => { setHasAddedScore(false); }, [currentQuestionIndex]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestionIndex(0);
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		await clearQuestion();

		if (!currentMatchCode) { return; }
		try {
			await endRoundAndReturnToWaiting({ currentMatchCode, navigate, round: "bp", sendMessage });
		} catch (error) {
			logger.error("Failed to end round via WS:", error);
		}

	}, [clearQuestion, currentMatchCode, navigate, sendMessage]);

	const { isLocked: isTimerLocked, lock: lockTimer } = useQuestionTimerLock(currentQuestion.questionCode);

	const startTheClock = useCallback(
		async (questionIndex: number) => {
			if (!currentMatchCode || !token || isTimerLocked) return;
			lockTimer();
			if (timer > 0) {
				logger.warn("startTheClock: timer already running, ignoring start request");
				return;
			}
			if (questionIndex <= 0) return;

			const questionCode = resolveQuestionCode(questionIndex);
			const startedAt = Date.now();
			timerStartedAtRef.current = startedAt;
			setTimer(TIME_LIMIT);
			setPlayers((prev) =>
				prev.map((p) => ({
					...p,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				})),
			);

			try {
				await sendStartTimer({ sendMessage, phase: "bp", timeLimit: TIME_LIMIT, questionCode, startedAt });
			} catch (error) {
				logger.error("Failed to start the clock via WS:", error);
			}
			try {
				await sendMessage({ type: "media_control", action: "play" });
				setVideoPlayState("playing");
			} catch (error) {
				logger.error("Failed to send play_video via WS:", error);
			}
		},
		[currentMatchCode, resolveQuestionCode, sendMessage, token, timer, isTimerLocked, lockTimer],
	);

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
					const ts = answerObj.timestamp || 0;
					answersPayload.push({ user_code: player.playerCode, content: answerObj.answer_text, timestamp: ts });
				}
			} catch (err) {
				logger.warn("showAnswers: failed for", player.playerCode, err);
			}
		}
		try {
			await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
		} catch (err) {
			logger.error("showAnswers: failed to broadcast:", err);
		}
	}, [canShowAnswers, currentMatchCode, token, currentQuestion, players, sendMessage]);


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
		if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return;
		setHasAddedScore(true);
		void sendMessage({ type: "bp_dung" });
		try {
			const response = await fetch(`${API_BASE_URL}/scoreboard/calculate`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					match_code: currentMatchCode,
					question_code: currentQuestion.questionCode,
					action: "bp_resolve",
					user_codes: selectedPlayerCodes,
				}),
			});
			if (!response.ok) throw new Error("Không thể tính điểm Bứt phá");
			await sendPlayersSnapshot();
			setSelectedPlayerCodes([]);
			return;

		} catch (err) {
			logger.error("handleCalculateScore failed:", err);
			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, currentQuestion.questionCode, currentMatchCode, token, sendPlayersSnapshot, sendMessage]);

	useEffect(() => {
		startTransition(() => {
			void loadPlayersState();
		});
	}, [loadPlayersState]);

	useEffect(() => { timerRef.current = timer; }, [timer]);

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
		const msg: any = lastMessage;
		switch (msg?.type) {
			case "player_reconnected": {

				const user_code = msg.user_code;
				logger.info(`[BP RECONNECT] Player ${user_code} reconnected, resending state...`);

				if (currentQuestion.questionCode) {
					void sendMessage({
						type: "send_question",
						user_code: "",
						question_code: currentQuestion.questionCode,
						content: currentQuestion.questionText ?? "",
						media_source: currentQuestion.questionMediaURL ?? undefined,
					});
					logger.info(`[BP RECONNECT] Resent question to ${user_code}`);
				}

				if (timerRef.current > 0 && timerStartedAtRef.current) {
					void sendStartTimer({ sendMessage, phase: "bp", timeLimit: TIME_LIMIT, questionCode: currentQuestion.questionCode, startedAt: timerStartedAtRef.current });
					logger.info(`[BP RECONNECT] Resent timer to ${user_code} (started_at=${timerStartedAtRef.current})`);
				}

				void sendRoundSnapshot();
				logger.info(`[BP RECONNECT] Resent round snapshot to ${user_code}`);
				break;
			}
			case "mc_reconnected":
			case "user_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});

					try {
						void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/bp" });
					} catch (err) {
						logger.error("Failed to navigate player on reconnect:", err);
					}
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
								playerTimestamp: answer.timestamp || player.playerTimestamp,
							};
						}),
					);
				});
				break;
			}

			case "player_answer":
			case "answer": {

				const { user_code, answer_text, timestamp, question_code } = msg;
				if (user_code && answer_text) {
					logger.info(`[BP ANSWER SYNC] Admin received WebSocket answer: user=${user_code} answer=${answer_text} ts=${timestamp} question=${question_code}`);
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((player) =>
								player.playerCode === user_code
									? {
										...player,
										playerLastAnswer: answer_text,
										playerTimestamp: timestamp || player.playerTimestamp,
									}
									: player,
							),
						);
					});
					logger.info("Received answer from", user_code, ":", answer_text);
				} else {
					logger.warn(`[BP ANSWER SYNC] Admin received empty answer: user_code=${user_code} answer_text=${answer_text} msg=${JSON.stringify(msg)}`);
				}
				break;
			}

			case "buzz":
				break;

			case "buzzer_winner": {
				const winner = msg.user_code ?? "";
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

			default:
				break;
		}
	}, [applyPlayersSnapshot, currentQuestion, lastMessage, sendMessage, sendRoundSnapshot]);

	const questionTitle = `BỨT PHÁ`;

	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			timerDuration={timer}
			videoPlayState={videoPlayState}
			hideMediaUntilPlayed
			controls={{
				variant: 'numbers',
				count: MAX_QUESTION_INDEX,
				activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
			}}
			controlsChildren={() => (
				<div className="flex gap-2">
					{Array.from({ length: MAX_QUESTION_INDEX }).map((_, idx) => {
						const isActive = currentQuestionIndex > 0 && currentQuestionIndex - 1 === idx;
						return (
							<button
								key={idx}
								type="button"
								disabled={timer > 0}
								aria-pressed={isActive}
								onClick={async () => {
									const qIndex = idx + 1;
									if (!isActive) {
										setCurrentQuestionIndex(qIndex);
										setVideoPlayState(null);
										try {
											await sendMessage({ type: "bp_chon_cau_hoi" });
											const q = await loadQuestion(qIndex);
											await sendQuestionToplayers(qIndex, q);
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
								className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${isActive ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white hover:bg-blue-700'}`}>
								{idx + 1}
							</button>
						);
					})}
				</div>
			)}
			underQuestionBoard={null}
			topControlButtons={null}
			bottomActionButtons={
				<>
					<AControlButton
						onClick={() => {
							void handleEndRound();
						}}
						disabled={timer > 0}
					>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			} playerSectionButtons={
				<>
					<AControlButton
						onClick={() => {
							if (!hasQuestionSelected) return;
							void startTheClock(currentQuestionIndex);
						}}
						disabled={!hasQuestionSelected || timer > 0 || isTimerLocked}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleCalculateScore(); }}
						disabled={selectedPlayerCodes.length === 0 || hasAddedScore || timer > 0}
						title={selectedPlayerCodes.length === 0 ? "Chọn ít nhất 1 player có timestamp hợp lệ" : undefined}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void showAnswers(); }}
						disabled={!canShowAnswers || timer > 0}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
					</AControlButton>
				</>
			} renderPlayerList={() =>
				players.map((player) => {
					const validTs = isValidBpTimestamp(player);
					const disableReason = hasQuestionSelected && !validTs
						? (!player.playerLastAnswer
							? "Chưa có câu trả lời từ player"
							: "Chưa bấm HIỆN TRẢ LỜI hoặc timestamp không hợp lệ")
						: undefined;
					return (
						<div className="flex flex-col gap-3" key={player.playerCode}>
							<APlayerBar
								player={player}
								isActive={selectedPlayerCodes.includes(player.playerCode)}
								onClick={toggleSelectedPlayer}
								disabled={timer > 0 || !validTs}
								disableReason={disableReason}
								onEditScore={handleEditScore}
								token={token}
								matchCode={currentMatchCode}
								sendMessage={sendMessage}
							/>
						</div>
					);
				})
			}
		/>
	);
};

export default AButPhaPage;
