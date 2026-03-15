/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
	AlarmClockCheck,
	Calculator,
	Power,
	RefreshCw,
	Eye,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AGiaiMa");

const TIME_LIMIT = 90;
const CLUE_COUNT = 8; // 2 hàng × 4 cột
const CLUE_QUESTION_PREFIX = "OC3_Q_GM_";

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

type ClueState = "idle" | "active" | "used";

// ─── Clue Card component ──────────────────────────────────────────────────────

interface ClueCardProps {
	index: number; // 1-based
	state: ClueState;
	onClick: () => void;
	disabled?: boolean;
}

const ClueCard: React.FC<ClueCardProps> = ({ index, state, onClick, disabled }) => {
	const base =
		"flex-1 h-60 flex items-center justify-center rounded-xl font-bold font-[SVN-Gratelos_Display] text-[80pt] cursor-pointer transition-all duration-200 select-none border-2";
	const styles: Record<ClueState, string> = {
		idle: "bg-blue-900 border-blue-600 text-white hover:bg-blue-700 shadow",
		active: "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
		used: "bg-slate-700 border-slate-500 text-slate-400 cursor-default",
	};
	return (
		<button
			type="button"
			onClick={state === "used" || disabled ? undefined : onClick}
			disabled={disabled && state !== "active"}
			className={`${base} ${styles[state]}`}
			aria-pressed={state === "active"}
			aria-label={`Gợi ý ${index}`}
		>
			{index}
		</button>
	);
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AGiaiMaPage = () => {
	const currentMatchCode = localStorage.getItem("matchCode");
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	// ─── Player state ─────────────────────────────────────────────────────────
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) =>
			prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode],
		);
	}, []);

	// ─── Question / clue state ────────────────────────────────────────────────
	const [clueQuestions, setClueQuestions] = useState<(Question | null)[]>(
		() => Array(CLUE_COUNT).fill(null),
	);
	const [clueStates, setClueStates] = useState<ClueState[]>(
		() => Array(CLUE_COUNT).fill("idle"),
	);
	const [activeClueIndex, setActiveClueIndex] = useState<number | null>(null); // 0-based
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	// ─── Timer state ──────────────────────────────────────────────────────────
	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const [isTimerRunning, setIsTimerRunning] = useState(false);

	// ─── Score state ──────────────────────────────────────────────────────────
	const [hasAddedScore, setHasAddedScore] = useState(false);

	// ─── Keyword info banner ──────────────────────────────────────────────────
	const keyInfo = "MẬT MÃ GỒM CÓ ... CHỮ CÁI";

	const questionTitle = "GIẢI MÃ";
	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	// Reset hasAddedScore when active clue changes
	useEffect(() => {
		Promise.resolve().then(() => setHasAddedScore(false));
	}, [activeClueIndex]);

	// ─── Map API payload → Question shape ─────────────────────────────────────
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
			questionExplanation:
				payload?.question?.explanation ?? payload?.question_explanation ?? payload?.explanation ?? "",
			questionMediaURL:
				payload?.question?.extra_info?.media_source ??
				payload?.question_media_url ??
				payload?.media_url ??
				undefined,
		}),
		[],
	);

	// ─── Load a single clue question from the API ──────────────────────────────
	const loadClueQuestion = useCallback(
		async (clueIndex: number): Promise<Question | undefined> => {
			// clueIndex is 0-based; question codes are 1-based
			if (!currentMatchCode || !token) return undefined;
			const questionCode = `${CLUE_QUESTION_PREFIX}${clueIndex + 1}`;
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					logger.warn(`loadClueQuestion: server returned ${res.status} for ${questionCode}`);
					return mapQuestionPayload(null, questionCode);
				}
				const data = await res.json();
				let payload: any = null;
				if (Array.isArray(data.data)) {
					payload =
						data.data.find((q: any) => String(q?.question_code) === questionCode) ??
						data.data[0] ??
						null;
				} else {
					payload = data.data ?? null;
				}
				return mapQuestionPayload(payload, questionCode);
			} catch (err) {
				logger.error("loadClueQuestion failed:", err);
				return mapQuestionPayload(null, questionCode);
			}
		},
		[currentMatchCode, mapQuestionPayload, token],
	);

	// Pre-load all clue questions on mount
	useEffect(() => {
		const fetchAll = async () => {
			const results = await Promise.all(
				Array.from({ length: CLUE_COUNT }, (_, i) => loadClueQuestion(i)),
			);
			setClueQuestions(results.map((q) => q ?? null));
		};
		void fetchAll();
	}, [loadClueQuestion]);

	// ─── Reveal a clue: send to players, update local state ───────────────────
	const handleRevealClue = useCallback(
		async (clueIndex: number) => {
			const q = clueQuestions[clueIndex];
			if (!q) return;

			// Mark previous active as used
			setClueStates((prev) => {
				const next = [...prev];
				if (activeClueIndex !== null && activeClueIndex !== clueIndex) {
					next[activeClueIndex] = "used";
				}
				next[clueIndex] = "active";
				return next;
			});
			setActiveClueIndex(clueIndex);
			setCurrentQuestion(q);
			setSelectedPlayerCodes([]);

			try {
				await sendMessage({
					type: "send_question",
					user_code: "",
					question_code: q.questionCode,
					content: q.questionText,
					media_source: q.questionMediaURL ?? undefined,
				});
			} catch (err) {
				logger.error("handleRevealClue: failed to send question via WS:", err);
			}
		},
		[activeClueIndex, clueQuestions, sendMessage],
	);

	// ─── Players helpers ──────────────────────────────────────────────────────
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
				const profile =
					(profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {};
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
				};
			});

			await sendMessage({
				type: "send_players_info",
				user_code: "",
				players: mergedPlayers,
				scoreboard: scoreList ?? [],
				profiles: profiles ?? [],
			});
		} catch (err) {
			logger.error("Failed to send players snapshot:", err);
		}
	}, [currentMatchCode, loadPlayersState, sendMessage]);

	// ─── WS message handler ───────────────────────────────────────────────────
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "send_players_info": {
				startTransition(() => { applyPlayersSnapshot(msg); });
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
			case "answer": {
				const { user_code, answer_text, timestamp } = msg;
				if (user_code && answer_text) {
					startTransition(() => {
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code
									? {
											...p,
											playerLastAnswer: answer_text,
											playerTimestamp: timestamp ?? p.playerTimestamp,
										}
									: p,
							),
						);
					});
				}
				break;
			}
			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage]);

	// ─── Timer countdown ──────────────────────────────────────────────────────
	useEffect(() => {
		if (!isTimerRunning) return;
		const id = window.setInterval(() => {
			setTimer((prev) => {
				const next = Math.max(0, prev - 1);
				timerRef.current = next;
				if (next === 0) {
					setIsTimerRunning(false);
					window.clearInterval(id);
				}
				return next;
			});
		}, 1000);
		return () => window.clearInterval(id);
	}, [isTimerRunning]);

	// Load players on mount
	useEffect(() => {
		startTransition(() => { void loadPlayersState(); });
	}, [loadPlayersState]);

	// ─── Control handlers ─────────────────────────────────────────────────────
	const clearQuestion = useCallback(async () => {
		if (!currentMatchCode) return;
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		try {
			await sendMessage({ type: "clear_question", user_code: "" });
		} catch (err) {
			logger.error("clearQuestion failed:", err);
		}
	}, [currentMatchCode, sendMessage]);

	const handleStartRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		setActiveClueIndex(null);
		setClueStates(Array(CLUE_COUNT).fill("idle"));
		setSelectedPlayerCodes([]);
		await clearQuestion();
		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "navigate", user_code: "", path: "/player/gm" });
			await sendPlayersSnapshot();
		} catch (err) {
			logger.error("handleStartRound failed:", err);
		}
	}, [clearQuestion, currentMatchCode, sendMessage, sendPlayersSnapshot]);

	const handleEndRound = useCallback(async () => {
		setCurrentQuestion({ ...DEFAULT_QUESTION });
		setTimer(0);
		setIsTimerRunning(false);
		setActiveClueIndex(null);
		setClueStates(Array(CLUE_COUNT).fill("idle"));
		await clearQuestion();
		if (!currentMatchCode) return;
		try {
			await sendMessage({ type: "navigate", user_code: "", path: "/player/waiting" });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const startTheClock = useCallback(async () => {
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

		setTimer(TIME_LIMIT);
		setIsTimerRunning(true);

		if (currentMatchCode) {
			void sendMessage({ type: "clear_answers", user_code: "" });
			void sendMessage({
				type: "start_the_timer",
				user_code: "",
				time_limit: TIME_LIMIT,
				question_code: currentQuestion.questionCode,
				started_at: Date.now(),
			});
		}
	}, [currentMatchCode, currentQuestion.questionCode, sendMessage]);

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
				const answerObj = Array.isArray(data) ? data[0] : data;
				if (answerObj?.answer_text) {
					answersPayload.push({
						user_code: player.playerCode,
						content: answerObj.answer_text,
						timestamp: answerObj.timestamp ?? 0,
					});
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

	const handleAddScore = useCallback(
		async (playerCode: string, delta: number, broadcast = true) => {
			if (!playerCode) return;
			setPlayers((prev) =>
				prev.map((p) =>
					p.playerCode === playerCode
						? { ...p, playerScore: (p.playerScore ?? 0) + delta }
						: p,
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
						const txt = await recordRes.text().catch(() => "");
						logger.warn("handleAddScore: record POST failed", recordRes.status, txt);
					}
				}
			} catch (err) {
				logger.error("handleAddScore: record POST error:", err);
			}
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const scoreJson: any = await scoreRes.json().catch(() => ({}));
				let scoreboardArr: any[] = [];
				if (Array.isArray(scoreJson.data)) scoreboardArr = scoreJson.data;
				else if (Array.isArray(scoreJson.data?.scoreboard)) scoreboardArr = scoreJson.data.scoreboard;
				else if (Array.isArray(scoreJson.scoreboard)) scoreboardArr = scoreJson.scoreboard;
				setPlayers((prev) =>
					prev.map((p) => {
						const entry = scoreboardArr.find((item: any) => item.user_code === p.playerCode);
						const updated =
							entry?.cumulative_score ?? entry?.cummulative_score ?? entry?.total_score ?? entry?.score;
						return typeof updated === "number" ? { ...p, playerScore: updated } : p;
					}),
				);
			} catch (err) {
				logger.error("handleAddScore: scoreboard refresh failed:", err);
			}
			if (broadcast) {
				try {
					await sendPlayersSnapshot();
				} catch (err) {
					logger.error("handleAddScore: broadcast failed:", err);
				}
			}
		},
		[currentMatchCode, currentQuestion.questionCode, token, sendPlayersSnapshot],
	);

	const handleAddScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		if (!currentQuestion.questionCode) {
			logger.warn("handleAddScoreToSelected: no active question");
			return;
		}
		const score = 10;
		setHasAddedScore(true);
		try {
			for (const code of selectedPlayerCodes) {
				await handleAddScore(code, score, false).catch((err) =>
					logger.error("Score failed for", code, err),
				);
			}
			if (currentMatchCode) await sendPlayersSnapshot();
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("handleAddScoreToSelected failed:", err);
			setHasAddedScore(false);
		}
	}, [selectedPlayerCodes, handleAddScore, sendPlayersSnapshot, currentMatchCode, currentQuestion.questionCode]);

	// ─── Clue grid (2 rows × 4 columns) ──────────────────────────────────────
	const clueGrid = (
		<div className="flex flex-col gap-3 w-full">
			{/* Keyword info banner */}
			<div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-6 py-6 text-center font-[SVN-Gratelos_Display] text-5xl font-bold text-white uppercase shadow">
				{keyInfo}
			</div>
			{/* Grid */}
			<div className="grid grid-cols-4 gap-3 w-full">
				{Array.from({ length: CLUE_COUNT }, (_, i) => (
					<ClueCard
						key={i}
						index={i + 1}
						state={clueStates[i]}
						onClick={() => { void handleRevealClue(i); }}
						disabled={isTimerRunning}
					/>
				))}
			</div>
		</div>
	);

	// ─── Render ───────────────────────────────────────────────────────────────
	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={currentQuestion}
			timerDuration={timer}
			aboveQuestionBoard={clueGrid}
			boardHeightClass="h-[30vh]"
			answerBoxHeightClass="h-25"
			controlsChildren={() => null}
			topControlButtons={null}
			bottomActionButtons={
				<>
					<AControlButton onClick={() => { void handleStartRound(); }}>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU</span>
					</AControlButton>
					<AControlButton onClick={() => { void handleEndRound(); }}>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}
			playerSectionButtons={
				<>
					<AControlButton
						onClick={() => { void startTheClock(); }}
						disabled={isTimerRunning || !currentQuestion.questionCode}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddScoreToSelected().catch((err) =>
								logger.error("AddScore button failed:", err),
							);
						}}
						disabled={selectedPlayerCodes.length === 0 || hasAddedScore}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH ĐIỂM</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void showAnswers(); }}
						disabled={!canShowAnswers}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
					</AControlButton>
					<AControlButton onClick={() => { void loadPlayersState(); }}>
						<RefreshCw size={18} />
						<span className="ml-2 font-bold">CẬP NHẬT</span>
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
						/>
					</div>
				))
			}
		/>
	);
};

export default AGiaiMaPage;
