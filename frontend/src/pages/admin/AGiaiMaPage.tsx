
import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	Calculator,
	Power,
	Eye,
	EyeOff,
	Lightbulb,
	KeyRound,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { buildKeywordBanner } from "@/utils/keywordBanner";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";

const logger = createLogger("AGiaiMa");

const TIME_LIMIT = 15;
const CLUE_COUNT = 8;
const CLUE_QUESTION_PREFIX = "OC3_Q_GM_";
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY";

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

interface ClueCardProps {
	index: number;
	state: ClueState;
	onClick: () => void;
	disabled?: boolean;
	hintContent?: RevealedHint;
}

const ClueCard: React.FC<ClueCardProps> = ({ index, state, onClick, disabled, hintContent }) => {
	const base =
		"flex-1 h-24 sm:h-28 lg:h-36 xl:h-44 flex items-center justify-center rounded-xl font-bold cursor-pointer transition-all duration-200 select-none border-2";
	const styles: Record<ClueState, string> = {
		idle: "bg-blue-900 border-blue-600 text-white hover:bg-blue-700 shadow",
		active: "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
		used: "bg-blue-700 border-blue-500 text-white cursor-default",
	};
	const showHint = (state === "active" || state === "used") && !!(hintContent?.text || hintContent?.mediaUrl);
	return (
		<button
			type="button"
			onClick={state === "used" || disabled ? undefined : onClick}
			disabled={disabled && state !== "active"}
			className={`${base} ${styles[state]}`}
			aria-pressed={state === "active"}
			aria-label={`Gợi ý ${index}`}
		>
			{showHint ? (
				<div className="flex items-center justify-center w-full h-full p-3">
					{hintContent!.mediaUrl ? (
						<RenderMedia mediaUrl={hintContent!.mediaUrl} />
					) : (
						<span className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-center leading-snug">{hintContent!.text}</span>
					)}
				</div>
			) : (
				<span className="font-[SVN-Gratelos_Display] text-2xl sm:text-[30pt] lg:text-[40pt] xl:text-[50pt]">{index}</span>
			)}
		</button>
	);
};

const AGiaiMaPage = () => {
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
	const { lastMessage, sendMessage } = useGameWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });
	const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCodes((prev) =>
			prev.includes(playerCode) ? prev.filter((c) => c !== playerCode) : [...prev, playerCode],
		);
	}, []);

	const [clueQuestions, setClueQuestions] = useState<(Question | null)[]>(
		() => Array(CLUE_COUNT).fill(null),
	);
	const [clueStates, setClueStates] = useState<ClueState[]>(
		() => Array(CLUE_COUNT).fill("idle"),
	);
	const [activeClueIndex, setActiveClueIndex] = useState<number | null>(null);
	const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });

	const [timer, setTimer] = useState<number>(0);
	const timerRef = useRef<number>(0);
	const [isTimerRunning, setIsTimerRunning] = useState(false);

	const [hasAddedKeywordScore, setHasAddedKeywordScore] = useState(false);

	const [shownHintContent, setShownHintContent] = useState<string | null>(null);
	const [hintHidden, setHintHidden] = useState(false);
	const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
	const [, setCorrectClues] = useState<Set<number>>(new Set());
	const [pendingClueAction, setPendingClueAction] = useState(false);
	const [, setTotalOpenedCluesCount] = useState(0);

	const [hideQuestionContent, setHideQuestionContent] = useState(false);

	const [isKeywordTimerRunning, setIsKeywordTimerRunning] = useState(false);
	const [timedClueCodes, setTimedClueCodes] = useState<Set<string>>(new Set());
	const [keywordTimerStarted, setKeywordTimerStarted] = useState(false);

	const [keywordSubmissions, setKeywordSubmissions] = useState<
		Record<string, { text: string; cluesOpened?: number }>
	>({});
	const [keywordAnswerRevealed, setKeywordAnswerRevealed] = useState(false);
	const [keywordQuestion, setKeywordQuestion] = useState<Question | null>(null);
	const [keywordRevealedCodes, setKeywordRevealedCodes] = useState<Set<string>>(new Set());

	const [keywordPhaseActive, setKeywordPhaseActive] = useState(false);

	const [keywordCluesLocked, setKeywordCluesLocked] = useState(false);

	const [keyInfo, setKeyInfo] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");

	const questionTitle = "GIẢI MÃ";
	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	useEffect(() => {
		Promise.resolve().then(() => {
			setShownHintContent(null);
			setHintHidden(false);
		});
	}, [activeClueIndex]);

	const loadClueQuestion = useCallback(
		async (clueIndex: number): Promise<Question | undefined> => {

			if (!currentMatchCode || !token) return undefined;
			const questionCode = `${CLUE_QUESTION_PREFIX}${clueIndex + 1}`;
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(questionCode)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					logger.warn(`loadClueQuestion: server returned ${res.status} for ${questionCode}`);
					return mapQuestionApiPayload(null, questionCode);
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
				return mapQuestionApiPayload(payload, questionCode);
			} catch (err) {
				logger.error("loadClueQuestion failed:", err);
				return mapQuestionApiPayload(null, questionCode);
			}
		},
		[currentMatchCode, mapQuestionApiPayload, token],
	);

	useEffect(() => {
		if (!currentMatchCode || !token) return;
		let mounted = true;
		const fetchAdminState = async () => {
			try {
				const res = await fetch(
					`${API_BASE_URL}/gm/admin-state?match_code=${encodeURIComponent(currentMatchCode)}`,
					{ headers: { Authorization: `Bearer ${token}` } },
				);
				if (!res.ok) {
					logger.warn("[GM REHYDRATE] GET /gm/admin-state returned", res.status);
					return;
				}
				const json = await res.json();
				const snap = json?.data ?? {};
				if (!mounted || !snap || typeof snap !== "object") return;
				logger.info("[GM REHYDRATE] Applying snapshot", Object.keys(snap));
				startTransition(() => {

					if (Array.isArray(snap.clue_states) && snap.clue_states.length === CLUE_COUNT) {
						setClueStates(snap.clue_states as ClueState[]);
					}

					if (snap.revealed_hints && typeof snap.revealed_hints === "object") {
						const normalised: Record<number, RevealedHint> = {};
						for (const [k, v] of Object.entries(snap.revealed_hints as Record<string, any>)) {
							const idx = Number(k);
							if (!Number.isInteger(idx) || idx < 0 || idx >= CLUE_COUNT) continue;
							const payload = v ?? {};
							normalised[idx] = {
								text: payload.text || undefined,
								mediaUrl: payload.media_url || undefined,
							};
						}
						setRevealedHints(normalised);
					}

					if (snap.active_clue_index !== undefined && snap.active_clue_index !== null) {
						const idx = Number(snap.active_clue_index);
						if (Number.isInteger(idx) && idx >= 0 && idx < CLUE_COUNT) {
							setActiveClueIndex(idx);
						}
					}

					if (snap.current_question && typeof snap.current_question === "object") {
						const q = snap.current_question;
						if (q.question_code) {
							setCurrentQuestion({
								questionCode: String(q.question_code),
								questionText: String(q.content ?? ""),
								questionAnswer: "",
								questionExplanation: "",
								questionMediaURL: q.media_url || undefined,
							});
						}
					}

					if (typeof snap.timer === "number") {
						setTimer(snap.timer);
						timerRef.current = snap.timer;
					}
					if (typeof snap.is_keyword_timer_running === "boolean") {
						setIsKeywordTimerRunning(snap.is_keyword_timer_running);
					}

					if (typeof snap.total_opened_clues_count === "number") {
						setTotalOpenedCluesCount(snap.total_opened_clues_count);
					}

					if (typeof snap.keyword_phase_active === "boolean") {
						setKeywordPhaseActive(snap.keyword_phase_active);
					}
					if (typeof snap.keyword_clues_locked === "boolean") {
						setKeywordCluesLocked(snap.keyword_clues_locked);
					}
					if (typeof snap.keyword_answer_revealed === "boolean") {
						setKeywordAnswerRevealed(snap.keyword_answer_revealed);
					}

					if (typeof snap.keyword_banner === "string" && snap.keyword_banner) {
						setKeyInfo(snap.keyword_banner);
					}
					if (typeof snap.hidden_question_content === "boolean") {
						setHideQuestionContent(snap.hidden_question_content);
					}
					if (typeof snap.has_added_keyword_score === "boolean") {
						setHasAddedKeywordScore(snap.has_added_keyword_score);
					}
					if (typeof snap.pending_clue_action === "boolean") {
						setPendingClueAction(snap.pending_clue_action);
					}
					if (typeof snap.hint_hidden === "boolean") {
						setHintHidden(snap.hint_hidden);
					}
					if (snap.shown_hint_content !== undefined) {
						setShownHintContent(
							snap.shown_hint_content === null ? null : String(snap.shown_hint_content),
						);
					}

					if (snap.keyword_submissions && typeof snap.keyword_submissions === "object") {
						setKeywordSubmissions(snap.keyword_submissions as Record<
							string,
							{ text: string; cluesOpened?: number }
						>);
					}

					if (Array.isArray(snap.keyword_revealed_codes)) {
						setKeywordRevealedCodes(new Set(snap.keyword_revealed_codes as string[]));
					}

					if (Array.isArray(snap.correct_clues)) {
						setCorrectClues(new Set(snap.correct_clues as number[]));
					}
				});
			} catch (err) {
				logger.warn("[GM REHYDRATE] fetch failed:", err);
			}
		};
		void fetchAdminState();
		return () => {
			mounted = false;
		};
	}, [currentMatchCode, token]);

	useEffect(() => {
		const fetchAll = async () => {
			const results = await Promise.all(
				Array.from({ length: CLUE_COUNT }, (_, i) => loadClueQuestion(i)),
			);
			setClueQuestions(results.map((q) => q ?? null));
		};
		void fetchAll();
	}, [loadClueQuestion]);

	const broadcastKeywordInfo = useCallback(async () => {
		if (!currentMatchCode) return;
		try {
			await sendMessage({
				type: "send_keyword_info",
				user_code: "",
				banner: keyInfo,
			});
		} catch (err) {
			logger.error("broadcastKeywordInfo failed:", err);
		}
	}, [currentMatchCode, sendMessage, keyInfo]);

	useEffect(() => {
		const fetchKeywordQ = async () => {
			if (!currentMatchCode || !token) return;
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}&question_code=${encodeURIComponent(KEYWORD_QUESTION_CODE)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) return;
				const data = await res.json();
				let payload: any = null;
				if (Array.isArray(data.data)) {
					payload = data.data.find((q: any) => String(q?.question_code) === KEYWORD_QUESTION_CODE) ?? data.data[0] ?? null;
				} else {
					payload = data.data ?? null;
				}
				if (payload) {
					const q = mapQuestionApiPayload(payload, KEYWORD_QUESTION_CODE);
					setKeywordQuestion(q);
					const answer: string = q.questionAnswer ?? "";
					if (answer) {
						const banner = buildKeywordBanner(answer);
						setKeyInfo(banner);

						void sendMessage({
							type: "send_keyword_info",
							user_code: "",
							banner,
						});
					}
				}
			} catch (err) {
				logger.error("fetchKeywordQ failed:", err);
			}
		};
		void fetchKeywordQ();
	}, [currentMatchCode, token, mapQuestionApiPayload, sendMessage]);

	const handleRevealClue = useCallback(
		async (clueIndex: number) => {
			const q = clueQuestions[clueIndex];
			if (!q) return;

			const nextStates = clueStates.map((s, i) => {
				if (i === activeClueIndex && activeClueIndex !== clueIndex) return "used" as ClueState;
				if (i === clueIndex) return "active" as ClueState;
				return s;
			});
			setClueStates(nextStates);
			setActiveClueIndex(clueIndex);
			setCurrentQuestion({ ...q });
			setSelectedPlayerCodes([]);
			setPendingClueAction(true);
			setHideQuestionContent(false);

			setTotalOpenedCluesCount((prev) => {
				const wasAlreadyOpened = clueStates[clueIndex] !== "idle";
				return wasAlreadyOpened ? prev : prev + 1;
			});

			try {
				await sendMessage({
					type: "send_question",
					user_code: "",
					question_code: q.questionCode,
					content: q.questionText,
					media_source: q.questionMediaURL ?? undefined,
				});

				const wasAlreadyOpened = clueStates[clueIndex] !== "idle";
				if (!wasAlreadyOpened) {
					void sendMessage({ type: "gm_chon_goi_y", clue_index: clueIndex, question_code: q.questionCode });
				}
			} catch (err) {
				logger.error("handleRevealClue: failed to send question via WS:", err);
			}
		},
		[activeClueIndex, clueQuestions, clueStates, sendMessage],
	);

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

	const sendSpecificRoundSnapshot = useCallback(async () => {
		if (currentQuestion.questionCode) {
			await sendMessage({ type: "send_question", user_code: "", question_code: currentQuestion.questionCode, content: currentQuestion.questionText ?? "", media_source: currentQuestion.questionMediaURL ?? undefined });
		}
		if (isTimerRunning && timerRef.current > 0) {
			await sendStartTimer({ sendMessage, phase: isKeywordTimerRunning ? "gm_keyword" : "gm", timeLimit: timerRef.current, questionCode: currentQuestion.questionCode });
		}
		await broadcastKeywordInfo();
		for (let idx = 0; idx < CLUE_COUNT; idx++) {
			const state = clueStates[idx];
			const question = clueQuestions[idx];
			if (state === "idle" || !question) continue;
			await sendMessage({ type: "send_question", user_code: "", question_code: question.questionCode, content: question.questionText, media_source: question.questionMediaURL ?? undefined });
		}
		if (keywordCluesLocked) await sendMessage({ type: "keyword_clues_locked", user_code: "", total_clues: CLUE_COUNT });
	}, [broadcastKeywordInfo, clueQuestions, clueStates, currentQuestion, isKeywordTimerRunning, isTimerRunning, keywordCluesLocked, sendMessage]);

	const sendRoundSnapshot = useCallback(async () => {
		await sendPlayersSnapshot();
		await sendSpecificRoundSnapshot();
	}, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

	useEffect(() => {
		(async () => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "player_reconnected": {
				void sendRoundSnapshot();
				break;
			}
			case "mc_reconnected":
			case "guest_online":
			case "user_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});
					void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/gm" });
					void sendRoundSnapshot();
				}
				break;
			}
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
			case "player_answer":
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
			case "keyword_submit": {
				const { user_code, keyword_text, clues_opened } = msg;
				if (user_code && keyword_text) {
					startTransition(() => {
						setKeywordSubmissions((prev) => ({
							...prev,
							[user_code]: {
								text: keyword_text,
								cluesOpened: typeof clues_opened === "number" ? clues_opened : undefined,
							},
						}));
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code
									? {
											...p,
											playerHasSubmittedKeyword: true,
											playerKeywordCluesOpened: typeof clues_opened === "number" ? clues_opened : p.playerKeywordCluesOpened,
										}
									: p,
							),
						);
					});

				} else {
					logger.warn("ADMIN received invalid keyword_submit:", { user_code, keyword_text });
				}
				break;
			}

			case "keyword_clues_locked": {
				startTransition(() => { setKeywordCluesLocked(true); });
				break;
			}

			default:
				break;
		}
		})();
	}, [applyPlayersSnapshot, lastMessage, sendMessage, sendRoundSnapshot]);

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

	useEffect(() => {
		if (isTimerRunning) return;
		if (!isKeywordTimerRunning) return;
		setIsKeywordTimerRunning(false);
		void sendMessage({ type: "keyword_locked" });
	}, [isTimerRunning, isKeywordTimerRunning, sendMessage]);

	useEffect(() => {
		startTransition(() => { void loadPlayersState(); });
	}, [loadPlayersState]);

	const handleEndRound = useCallback(async () => {
		setTimer(0);
		setIsTimerRunning(false);
		setIsKeywordTimerRunning(false);
		if (!currentMatchCode) { return; }
		try {
			await endRoundAndReturnToWaiting({ currentMatchCode, navigate, round: "gm", sendMessage });
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [currentMatchCode, navigate, sendMessage]);

	const startTheClock = useCallback(async () => {
		if (!currentQuestion.questionCode || isTimerRunning || timedClueCodes.has(currentQuestion.questionCode)) return;
		setTimedClueCodes((prev) => new Set(prev).add(currentQuestion.questionCode));
		setSelectedPlayerCodes([]);
		setKeywordRevealedCodes(new Set());
		setIsKeywordTimerRunning(false);
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
			void sendStartTimer({ sendMessage, phase: "gm", timeLimit: TIME_LIMIT, questionCode: currentQuestion.questionCode });
		}
	}, [currentMatchCode, currentQuestion.questionCode, isTimerRunning, sendMessage, timedClueCodes]);

	const startKeywordTimer = useCallback(async () => {
		if (!keywordPhaseActive || isTimerRunning || isKeywordTimerRunning || keywordTimerStarted || !currentMatchCode) return;
		setKeywordTimerStarted(true);
		setIsKeywordTimerRunning(true);
		setTimer(15);
		setIsTimerRunning(true);

		await sendStartTimer({ sendMessage, phase: "gm_keyword", timeLimit: 15, questionCode: KEYWORD_QUESTION_CODE });

		await sendMessage({
			type: "keyword_clues_locked",
			user_code: "",
			total_clues: CLUE_COUNT,
		});
	}, [keywordPhaseActive, isTimerRunning, isKeywordTimerRunning, keywordTimerStarted, currentMatchCode, sendMessage]);

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
					const recordRes = await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
						method: "PATCH",
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
						const updated = entry?.cumulative_score ?? entry?.cumulative_score ?? entry?.total_score ?? entry?.score;
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
	void handleAddScore;

	const showAnswers = useCallback(async () => {
		if (!canShowAnswers) return;
		const answersPayload = players
			.filter((p) => {
				const isKeywordSubmission = keywordSubmissions[p.playerCode] !== undefined;
				return p.playerLastAnswer && !keywordRevealedCodes.has(p.playerCode) && !isKeywordSubmission;
			})
			.map((p) => ({
				user_code: p.playerCode,
				content: p.playerLastAnswer!,
				timestamp: p.playerTimestamp ?? 0,
			}));
		try {
			await sendMessage({ type: "send_answers_to_players", answers: answersPayload });
		} catch (err) {
			logger.error("showAnswers: failed to broadcast:", err);
		}
	}, [canShowAnswers, keywordRevealedCodes, keywordSubmissions, players, sendMessage]);

	const handleShowHint = useCallback(async () => {
		const explanation = currentQuestion.questionExplanation ?? "";
		const hintText = explanation;
		const hintMediaUrl: string | undefined = undefined;

		if (!hintText && !hintMediaUrl) return;
		const codeMatch = String(currentQuestion.questionCode ?? "").match(/(\d+)\s*$/);
		const codeIndex = codeMatch ? Number(codeMatch[1]) - 1 : null;
		const clueIndexForHint = activeClueIndex !== null ? activeClueIndex : Number.isInteger(codeIndex) && codeIndex !== null && codeIndex >= 0 && codeIndex < CLUE_COUNT ? codeIndex : null;
		setPendingClueAction(false);
		setShownHintContent(hintText);
		setHideQuestionContent(true);
		if (clueIndexForHint !== null) {
			const idx = clueIndexForHint;
			setActiveClueIndex(idx);
			setRevealedHints((prev) => {
				const next: Record<number, RevealedHint> = { ...prev };
				next[idx] = { text: hintText || undefined, mediaUrl: hintMediaUrl || undefined };
				return next;
			});
		}
		try {
			await sendMessage({
				type: "show_hint",
				user_code: "",
				hint_content: hintText,
				hint_media_source: hintMediaUrl ?? undefined,
				target_players: selectedPlayerCodes,
				audience_visible: selectedPlayerCodes.length > 0,
				...(clueIndexForHint !== null ? { clue_index: clueIndexForHint, question_code: currentQuestion.questionCode } : {}),
			});

			sendMessage({ type: "gm_dung" });

			if (selectedPlayerCodes.length > 0 && currentQuestion.questionCode) {
				if (clueIndexForHint !== null) {
					setCorrectClues((prev) => new Set([...prev, clueIndexForHint]));
				}
				await calculateScore(token, currentMatchCode, currentQuestion.questionCode, "gm_clue_correct", selectedPlayerCodes);

				if (currentMatchCode) {
					try {
						await sendPlayersSnapshot();
					} catch (err) {
						logger.error("handleShowHint: sendPlayersSnapshot failed:", err);
					}
				}
			}
		} catch (err) {
			logger.error("handleShowHint failed:", err);
		}
	}, [currentQuestion.questionExplanation, currentQuestion.questionCode, activeClueIndex, sendMessage, selectedPlayerCodes, currentMatchCode, token, sendPlayersSnapshot]);

	const handleHideHint = useCallback(async () => {
		setPendingClueAction(false);
		setHintHidden(true);
		setHideQuestionContent(true);
		try {
			await sendMessage({
				type: "hide_hint",
				user_code: "",
				...(activeClueIndex !== null ? { clue_index: activeClueIndex } : {}),
			});
		} catch (err) {
			logger.error("handleHideHint failed:", err);
		}
	}, [activeClueIndex, sendMessage]);

	const handleRevealKeywordAnswer = useCallback(async () => {
		const answer = keywordQuestion?.questionAnswer;
		if (!answer) return;
		setKeywordAnswerRevealed(true);

		const buildHintFor = (q: Question) => {
			const explanation = q.questionExplanation ?? "";
			return { text: explanation, mediaUrl: undefined as string | undefined };
		};

		const newHints: Record<number, RevealedHint> = {};
		for (let i = 0; i < CLUE_COUNT; i++) {
			const question = clueQuestions[i];
			if (!question) continue;
			const { text, mediaUrl } = buildHintFor(question);
			if (text || mediaUrl) {
				newHints[i] = { text: text || undefined, mediaUrl: mediaUrl || undefined };
			}
		}
		setRevealedHints(newHints);

		setClueStates(Array(CLUE_COUNT).fill("used"));
		setActiveClueIndex(null);

		setTotalOpenedCluesCount(CLUE_COUNT);
		setPendingClueAction(false);

		try {

			await sendMessage({
				type: "reveal_keyword_answer",
				answer,
				keyword_banner: buildKeywordBanner(answer),
			});

			for (let i = 0; i < CLUE_COUNT; i++) {
				const question = clueQuestions[i];
				if (!question) continue;
				const { text, mediaUrl } = buildHintFor(question);
				if (!text && !mediaUrl) continue;
				try {
					await sendMessage({
						type: "show_hint",
						user_code: "",
						hint_content: text,
						hint_media_source: mediaUrl ?? undefined,
						target_players: [],
						audience_visible: true,
						clue_index: i,
					});
				} catch (err) {
					logger.error("handleRevealKeywordAnswer: show_hint failed for clue", i + 1, err);
				}
			}
		} catch (err) {
			logger.error("handleRevealKeywordAnswer failed:", err);
		}
	}, [clueQuestions, keywordQuestion?.questionAnswer, sendMessage]);

	const canShowKeywordAnswers = keywordPhaseActive && Object.keys(keywordSubmissions).length > 0 && keywordRevealedCodes.size === 0;

	const handleShowKeywordAnswers = useCallback(async () => {
		const answer = keywordQuestion?.questionAnswer;
		if (!answer) return;

		if (!keywordAnswerRevealed) {
			setKeywordAnswerRevealed(true);
			try {
				await sendMessage({
					type: "reveal_keyword_answer",
					answer,
					keyword_banner: buildKeywordBanner(answer)
				});
			} catch (err) {
				logger.error("handleShowKeywordAnswers: reveal failed:", err);
			}
		}

		setKeywordRevealedCodes(new Set(Object.keys(keywordSubmissions)));
		setPlayers((prev) =>
			prev.map((p) => ({
				...p,
				playerLastAnswer: keywordSubmissions[p.playerCode]?.text ?? p.playerLastAnswer,
			})),
		);

		const answers = Object.entries(keywordSubmissions).map(([user_code, { text, cluesOpened }]) => ({
			user_code,
			content: text,
			clues_opened: cluesOpened,
		}));
		try {
			await sendMessage({ type: "send_keyword_answers", answers });
		} catch (err) {
			logger.error("handleShowKeywordAnswers failed:", err);
		}
	}, [keywordAnswerRevealed, keywordQuestion, keywordSubmissions, sendMessage]);


	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		logger.info("handleEditScore: player=", playerCode, "newScore=", newScore);

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerScore: newScore }
					: p,
			),
		);

		void sendPlayersSnapshot();
	}, [sendPlayersSnapshot]);

	const handleAddKeywordScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		setHasAddedKeywordScore(true);

		void sendMessage({ type: "gm_dung_tu_khoa" });
		try {
			for (const code of selectedPlayerCodes) {
				const submission = keywordSubmissions[code];
				if (!submission) {
					logger.info("handleAddKeywordScoreToSelected: skipping", code, "(no submission)");
					continue;
				}
				await calculateScore(token, currentMatchCode, KEYWORD_QUESTION_CODE, "gm_keyword_correct", [code]);
			}
			if (currentMatchCode) await sendPlayersSnapshot();
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("handleAddKeywordScoreToSelected failed:", err);
			setHasAddedKeywordScore(false);
		}
	}, [selectedPlayerCodes, sendMessage, currentMatchCode, token, sendPlayersSnapshot, keywordSubmissions]);

	const clueGrid = (
		<div className="flex flex-col gap-2 sm:gap-3 w-full">
			{}
			<button
				type="button"
				onClick={() => setKeywordPhaseActive((prev) => !prev)}
				className={`w-full rounded-xl px-3 sm:px-6 py-3 sm:py-6 text-center font-[SVN-Gratelos_Display] text-2xl sm:text-3xl lg:text-5xl font-bold text-white uppercase shadow border-2 transition-colors duration-200 cursor-pointer select-none ${keywordPhaseActive ? "bg-blue-500 border-blue-300 ring-2 ring-blue-300" : "bg-blue-900 border-blue-600 hover:bg-blue-800"}`}
			>
				{keywordAnswerRevealed && keywordQuestion?.questionAnswer ? `${keywordQuestion.questionAnswer}` : keyInfo}
			</button>
			{}
			<div className="grid grid-cols-4 gap-2 sm:gap-3 w-full">
				{Array.from({ length: CLUE_COUNT }, (_, i) => (
					<ClueCard
						key={i}
						index={i + 1}
						state={clueStates[i]}
						onClick={() => { void handleRevealClue(i); }}
						disabled={isTimerRunning || (pendingClueAction && clueStates[i] !== "active")}
						hintContent={revealedHints[i]}
					/>
				))}
			</div>
		</div>
	);

	const questionToShow = isKeywordTimerRunning
		? { ...currentQuestion, questionText: keyInfo, questionMediaURL: undefined }
		: currentQuestion;

	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={questionToShow}
			timerDuration={timer}
			aboveQuestionBoard={clueGrid}
			boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
			hideQuestionContent={hideQuestionContent || isKeywordTimerRunning}
			controlsChildren={() => null}
			topControlButtons={null}
			bottomActionButtons={
				<>
					<AControlButton onClick={() => { void handleEndRound(); }} disabled={isTimerRunning || isKeywordTimerRunning}>
						<Power size={18} />
						<span className="ml-2 font-bold">KẾT THÚC</span>
					</AControlButton>
				</>
			}
			playerSectionButtons={
				<>
					<AControlButton
						onClick={() => { void (keywordPhaseActive ? startKeywordTimer() : startTheClock()); }}
						disabled={isTimerRunning || (keywordPhaseActive ? keywordTimerStarted : !currentQuestion.questionCode || timedClueCodes.has(currentQuestion.questionCode))}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">ĐẾM GIỜ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void (keywordPhaseActive ? handleShowKeywordAnswers() : showAnswers()); }}
						disabled={(keywordPhaseActive ? !canShowKeywordAnswers : !canShowAnswers) || isTimerRunning || isKeywordTimerRunning}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleShowHint();
						}}
						disabled={!currentQuestion.questionCode || shownHintContent !== null || selectedPlayerCodes.length === 0 || isTimerRunning || isKeywordTimerRunning}
					>
						<Lightbulb size={18} />
						<span className="ml-2 font-bold">MỞ GỢI Ý</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleHideHint(); }}
						disabled={!currentQuestion.questionCode || hintHidden || isTimerRunning || isKeywordTimerRunning}
					>
						<EyeOff size={18} />
						<span className="ml-2 font-bold">KHOÁ GỢI Ý</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddKeywordScoreToSelected().catch((err) =>
								logger.error("AddKeywordScore button failed:", err),
							);
						}}
						disabled={selectedPlayerCodes.length === 0 || hasAddedKeywordScore || isTimerRunning || isKeywordTimerRunning}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH TỪ KHOÁ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleRevealKeywordAnswer(); }}
						disabled={!keywordPhaseActive || keywordAnswerRevealed || isTimerRunning || isKeywordTimerRunning}
					>
						<KeyRound size={18} />
						<span className="ml-2 font-bold">HIỆN TỪ KHOÁ</span>
					</AControlButton>
				</>
			}
			renderPlayerList={() => {
				const keywordPhaseRevealed = keywordRevealedCodes.size > 0;
				return players.map((player) => {
					const submittedKeyword = !!keywordSubmissions[player.playerCode];
					const isDisabledByKeywordReveal =
						keywordPhaseRevealed && !keywordRevealedCodes.has(player.playerCode);
					return (
						<div className="flex flex-col gap-3" key={player.playerCode}>
							<APlayerBar
								player={player}
								isActive={selectedPlayerCodes.includes(player.playerCode)}
								isCurrent={selectedPlayerCodes.includes(player.playerCode)}
								hasKeywordSubmission={submittedKeyword}
								cluesOpened={keywordSubmissions[player.playerCode]?.cluesOpened}
								showClueCount={keywordRevealedCodes.has(player.playerCode) || keywordAnswerRevealed}
								onClick={toggleSelectedPlayer}
								disabled={timer > 0 || isDisabledByKeywordReveal}
								disableReason={isDisabledByKeywordReveal ? "Thí sinh chưa nộp từ khoá" : undefined}
								onEditScore={handleEditScore}
								token={token}
								matchCode={currentMatchCode}
								sendMessage={sendMessage}
							/>
						</div>
					);
				});
			}}
		/>
	);
};

export default AGiaiMaPage;
