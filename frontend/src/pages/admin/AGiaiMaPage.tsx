/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	AlarmClockCheck,
	Calculator,
	Power,
	RefreshCw,
	Eye,
	EyeOff,
	Lightbulb,
	KeyRound,
	SendToBack,
	Play,
} from "lucide-react";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AGiaiMa");

const TIME_LIMIT = 15; // 15s per clue question per rules
const CLUE_COUNT = 8; // 2 hàng × 4 cột
const CLUE_QUESTION_PREFIX = "OC3_Q_GM_";
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY"; // holds the keyword answer

const DEFAULT_QUESTION: Question = {
	questionCode: "",
	questionText: "",
	questionAnswer: "",
	questionExplanation: "",
	questionMediaURL: undefined,
};

type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

function buildKeywordBanner(answer: string): string {
	const trimmedLen = answer.replace(/\s/g, '').length;
	const noSpaceAnswer = answer.replace(/\s/g, '');
	if (/^[A-ZÀ-Ỹa-zà-ỹ]+$/u.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ CÁI`;
	if (/^\d+$/.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ SỐ`;
	return `TỪ KHOÁ GỒM CÓ ${trimmedLen} KÝ TỰ`;
}

// ─── Clue Card component ──────────────────────────────────────────────────────

interface ClueCardProps {
	index: number; // 1-based
	state: ClueState;
	onClick: () => void;
	disabled?: boolean;
	hintContent?: RevealedHint;
}

const ClueCard: React.FC<ClueCardProps> = ({ index, state, onClick, disabled, hintContent }) => {
	const base =
		"flex-1 h-40 lg:h-48 xl:h-60 flex items-center justify-center rounded-xl font-bold cursor-pointer transition-all duration-200 select-none border-2";
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
						<span className="text-2xl font-bold text-center leading-snug">{hintContent!.text}</span>
					)}
				</div>
			) : (
				<span className="font-[SVN-Gratelos_Display] text-[50pt] lg:text-[65pt] xl:text-[80pt]">{index}</span>
			)}
		</button>
	);
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AGiaiMaPage = () => {
	const navigate = useNavigate();
	const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
	const storedMatchCode = localStorage.getItem("matchCode");
	const currentMatchCode = urlMatchCode || storedMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";

	// Sync matchCode from URL to localStorage
	useEffect(() => {
		if (urlMatchCode && urlMatchCode !== storedMatchCode) {
			try {
				localStorage.setItem("matchCode", urlMatchCode);
			} catch {
				// ignore
			}
		}
	}, [urlMatchCode, storedMatchCode]);

	// Redirect to game managing page if no match code is available
	useEffect(() => {
		if (!currentMatchCode) {
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);
	const { lastMessage, sendMessage } = useAdminWebSocket();

	// ─── Player state ─────────────────────────────────────────────────────────
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	usePlayerPresence({ lastMessage, setPlayers });
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
	const [hasAddedKeywordScore, setHasAddedKeywordScore] = useState(false);

	// ─── Hint reveal state ────────────────────────────────────────────────────
	const [shownHintContent, setShownHintContent] = useState<string | null>(null);
	const [hintHidden, setHintHidden] = useState(false);
	const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
	const [, setCorrectClues] = useState<Set<number>>(new Set());
	const [pendingClueAction, setPendingClueAction] = useState(false);
	
	// ─── Keyword tracking state ───────────────────────────────────────────────
	const [keywordSubmissions, setKeywordSubmissions] = useState<
		Record<string, { text: string; timestamp: number }>
	>({});
	const [keywordAnswerRevealed, setKeywordAnswerRevealed] = useState(false);
	const [keywordQuestion, setKeywordQuestion] = useState<Question | null>(null);
	const [keywordRevealedCodes, setKeywordRevealedCodes] = useState<Set<string>>(new Set());
	const keywordLockedSentRef = useRef(false);

	// ─── Keyword phase activation ─────────────────────────────────────────────
	const [keywordPhaseActive, setKeywordPhaseActive] = useState(false);
	const [keywordTimerRunning, setKeywordTimerRunning] = useState(false);
	const keywordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// ─── Keyword info banner ──────────────────────────────────────────────────
	const [keyInfo, setKeyInfo] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");

	const questionTitle = "GIẢI MÃ";
	const canShowAnswers = !!currentQuestion.questionCode && !!currentMatchCode && !!token;

	// Reset per-clue state when active clue changes
	useEffect(() => {
		Promise.resolve().then(() => {
			setHasAddedScore(false);
			setShownHintContent(null);
			setHintHidden(false);
		});
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

	// Load keyword question (OC3_Q_GM_KEY) which holds the correct keyword answer
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
					const q = mapQuestionPayload(payload, KEYWORD_QUESTION_CODE);
					setKeywordQuestion(q);
					const answer: string = q.questionAnswer ?? "";
					if (answer) setKeyInfo(buildKeywordBanner(answer));
				}
			} catch (err) {
				logger.error("fetchKeywordQ failed:", err);
			}
		};
		void fetchKeywordQ();
	}, [currentMatchCode, token, mapQuestionPayload]);

	// ─── Reveal a clue: send to players, update local state ───────────────────
	const handleRevealClue = useCallback(
		async (clueIndex: number) => {
			const q = clueQuestions[clueIndex];
			if (!q) return;

			// Compute next states explicitly to detect all-clues-opened in the same tick
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

			const allOpened = nextStates.every((s) => s !== "idle");

			try {
				await sendMessage({
					type: "send_question",
					user_code: "",
					question_code: q.questionCode,
					content: q.questionText,
					media_source: q.questionMediaURL ?? undefined,
				});
				if (allOpened && !keywordLockedSentRef.current) {
					keywordLockedSentRef.current = true;
					await sendMessage({ type: "keyword_locked" });
				}
			} catch (err) {
				logger.error("handleRevealClue: failed to send question via WS:", err);
			}
		},
		[activeClueIndex, clueQuestions, clueStates, sendMessage],
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

	// ─── WS message handler ───────────────────────────────────────────────────
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "mc_online":
			case "player_online": {
				if (msg.user_code) {
					startTransition(() => {
						setPlayers((prev) => prev.map((p) => (p.playerCode === msg.user_code ? { ...p, playerConnected: true } : p)));
					});
					// Route the late-joining player directly to the current round
					try {
						void sendMessage({ type: "navigate", user_code: msg.user_code, path: "/player/gm" });
					} catch (err) {
						logger.error("Failed to navigate player on reconnect:", err);
					}
					(async () => {
						if (currentQuestion.questionCode) {
							try {
								await sendMessage({
									type: "send_question",
									user_code: "",
									question_code: currentQuestion.questionCode,
									content: currentQuestion.questionText ?? "",
									media_source: currentQuestion.questionMediaURL ?? undefined,
								});
							} catch { /* best-effort */ }
						}
						if (isTimerRunning && timerRef.current > 0) {
							try {
								await sendMessage({ type: "start_the_timer", user_code: "", phase: "gm", time_limit: timerRef.current, question_code: currentQuestion.questionCode, started_at: Date.now() });
							} catch { /* best-effort */ }
						}
						// Send players/scores last (requires API call) so game state appears first
						try {
							await sendPlayersSnapshot();
						} catch { /* best-effort */ }
					})();
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
				const { user_code, keyword_text, timestamp } = msg;
				logger.info("ADMIN received keyword_submit:", { user_code, keyword_text, timestamp });
				if (user_code && keyword_text) {
					startTransition(() => {
						setKeywordSubmissions((prev) => ({
							...prev,
							[user_code]: { text: keyword_text, timestamp: timestamp ?? 0 },
						}));
						// Update player list to show key icon immediately
						setPlayers((prev) =>
							prev.map((p) =>
								p.playerCode === user_code ? { ...p, playerHasSubmittedKeyword: true } : p,
							),
						);
					});
					// NOTE: Backend already broadcasts to all players via Valkey pub/sub
					// No need to forward manually - players receive directly from backend
				} else {
					logger.warn("ADMIN received invalid keyword_submit:", { user_code, keyword_text, timestamp });
				}
				break;
			}
	
			default:
				break;
		}
	}, [applyPlayersSnapshot, lastMessage, sendMessage, sendPlayersSnapshot]);

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

	// Auto-lock keyword when all players have submitted their keyword
	useEffect(() => {
		if (players.length === 0 || keywordLockedSentRef.current) return;
		const allSubmitted = players.every((p) => !!keywordSubmissions[p.playerCode]);
		if (allSubmitted) {
			keywordLockedSentRef.current = true;
			void sendMessage({ type: "keyword_locked" });
		}
	}, [keywordSubmissions, players, sendMessage]);

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
		setRevealedHints({});
		setCorrectClues(new Set());
		setPendingClueAction(false);
		setSelectedPlayerCodes([]);
		setKeywordSubmissions({});
		setKeywordAnswerRevealed(false);
		setKeywordRevealedCodes(new Set());
		setHasAddedKeywordScore(false);
		setKeywordPhaseActive(false);
		keywordLockedSentRef.current = false;
		await clearQuestion();
		if (!currentMatchCode) { return; }
		try {
			await sendMessage({ type: "round_start", round: "gm" });
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
		if (keywordTimerRef.current) {
			clearTimeout(keywordTimerRef.current);
			keywordTimerRef.current = null;
		}
		setKeywordTimerRunning(false);
		await clearQuestion();
		if (!currentMatchCode) { return; }
		try {
			await sendMessage({ type: "round_end", round: "gm" });
			// Removed navigate to waiting page - players and MC stay on GM page to preserve score context
		} catch (err) {
			logger.error("handleEndRound failed:", err);
		}
	}, [clearQuestion, currentMatchCode, sendMessage]);

	const startTheClock = useCallback(async () => {
		setSelectedPlayerCodes([]);
		setHasAddedScore(false);
		setKeywordRevealedCodes(new Set());
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
				phase: "gm",
				time_limit: TIME_LIMIT,
				question_code: currentQuestion.questionCode,
				started_at: Date.now(),
			});
		}
	}, [currentMatchCode, currentQuestion.questionCode, sendMessage]);

	const startKeywordTimer = useCallback(async () => {
		if (!keywordPhaseActive || keywordTimerRunning || !currentMatchCode) return;
		
		setKeywordTimerRunning(true);
		
		// Send WebSocket message to players
		await sendMessage({
			type: "start_keyword_timer",
			user_code: "",
			time_limit: 15,
			started_at: Date.now(),
		});

		// Set timer to lock keywords after 15s
		keywordTimerRef.current = setTimeout(() => {
			setKeywordTimerRunning(false);
			// Send keyword_locked to lock all players
			void sendMessage({ type: "keyword_locked" });
		}, 15000);
	}, [keywordPhaseActive, keywordTimerRunning, currentMatchCode, sendMessage]);

	const showAnswers = useCallback(async () => {
		if (!canShowAnswers) return;
		// Lọc chỉ hiển thị đáp án của câu hỏi thường (không phải từ khoá)
		const answersPayload = players
			.filter((p) => {
				// Chỉ hiển thị nếu có đáp án VÀ không phải là submission từ khoá
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
		const hint = currentQuestion.questionExplanation || currentQuestion.questionAnswer;
		if (!hint && !currentQuestion.questionMediaURL) return;
		setPendingClueAction(false);
		setShownHintContent(hint);
		if (activeClueIndex !== null) {
			const idx = activeClueIndex;
			setRevealedHints((prev) => {
				const next: Record<number, RevealedHint> = { ...prev };
				next[idx] = { text: hint || undefined, mediaUrl: currentQuestion.questionMediaURL || undefined };
				return next;
			});
		}
		try {
			await sendMessage({
				type: "show_hint",
				user_code: "",
				hint_content: hint,
				hint_media_source: currentQuestion.questionMediaURL ?? undefined,
				target_players: selectedPlayerCodes,
			});
		} catch (err) {
			logger.error("handleShowHint failed:", err);
		}
	}, [currentQuestion, selectedPlayerCodes, sendMessage]);

	const handleHideHint = useCallback(async () => {
		setPendingClueAction(false);
		setHintHidden(true);
		try {
			await sendMessage({ type: "hide_hint", user_code: "" });
		} catch (err) {
			logger.error("handleHideHint failed:", err);
		}
	}, [sendMessage]);

	const handleRevealKeywordAnswer = useCallback(async () => {
		const answer = keywordQuestion?.questionAnswer;
		if (!answer) return;
		setKeywordAnswerRevealed(true);
		try {
			await sendMessage({ type: "reveal_keyword_answer", answer });
		} catch (err) {
			logger.error("handleRevealKeywordAnswer failed:", err);
		}
	}, [keywordQuestion, sendMessage]);

	const handleShowKeywordAnswers = useCallback(async () => {
		const answer = keywordQuestion?.questionAnswer;
		if (!answer) return;
		// Reveal keyword answer if not already done
		if (!keywordAnswerRevealed) {
			setKeywordAnswerRevealed(true);
			try {
				await sendMessage({ type: "reveal_keyword_answer", answer });
			} catch (err) {
				logger.error("handleShowKeywordAnswers: reveal failed:", err);
			}
		}
		// Update admin's local player bars with submitted keyword text
		setKeywordRevealedCodes(new Set(Object.keys(keywordSubmissions)));
		setPlayers((prev) =>
			prev.map((p) => ({
				...p,
				playerLastAnswer: keywordSubmissions[p.playerCode]?.text ?? p.playerLastAnswer,
			})),
		);
		const answers = Object.entries(keywordSubmissions).map(([user_code, { text, timestamp }]) => ({
			user_code,
			content: text,
			timestamp,
		}));
		try {
			await sendMessage({ type: "send_keyword_answers", answers });
		} catch (err) {
			logger.error("handleShowKeywordAnswers failed:", err);
		}
	}, [keywordAnswerRevealed, keywordQuestion, keywordSubmissions, sendMessage]);

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

	// Handle manual score editing from APlayerBar
	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		logger.info("handleEditScore: player=", playerCode, "newScore=", newScore);
		// Update local state immediately
		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerScore: newScore }
					: p,
			),
		);
		// Refresh scoreboard from server to ensure consistency
		void sendPlayersSnapshot();
	}, [sendPlayersSnapshot]);

	const handleAddScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		if (!currentQuestion.questionCode) {
			logger.warn("handleAddScoreToSelected: no active question");
			return;
		}
		const score = 10;
		setHasAddedScore(true);
		if (activeClueIndex !== null) {
			setCorrectClues((prev) => new Set([...prev, activeClueIndex]));
		}
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

	// Score = 100 - 10 * (number of clues opened so far)
	const handleAddKeywordScoreToSelected = useCallback(async () => {
		if (selectedPlayerCodes.length === 0) return;
		const openedCount = clueStates.filter((s) => s !== "idle").length;
		const score = Math.max(0, 100 - 10 * openedCount);
		setHasAddedKeywordScore(true);
		try {
			for (const code of selectedPlayerCodes) {
				await handleAddScore(code, score, false).catch((err) =>
					logger.error("Keyword score failed for", code, err),
				);
			}
			if (currentMatchCode) await sendPlayersSnapshot();
			setSelectedPlayerCodes([]);
		} catch (err) {
			logger.error("handleAddKeywordScoreToSelected failed:", err);
			setHasAddedKeywordScore(false);
		}
	}, [selectedPlayerCodes, clueStates, handleAddScore, sendPlayersSnapshot, currentMatchCode]);

	// ─── Clue grid (2 rows × 4 columns) ──────────────────────────────────────
	const clueGrid = (
		<div className="flex flex-col gap-3 w-full">
			{/* Keyword info banner — click to activate keyword phase */}
			<button
				type="button"
				onClick={() => setKeywordPhaseActive((prev) => !prev)}
				className={`w-full rounded-xl px-6 py-6 text-center font-[SVN-Gratelos_Display] text-5xl font-bold text-white uppercase shadow border-2 transition-colors duration-200 cursor-pointer select-none ${keywordPhaseActive ? "bg-blue-500 border-blue-300 ring-2 ring-blue-300" : "bg-blue-900 border-blue-600 hover:bg-blue-800"}`}
			>
				{keyInfo}
			</button>
			{/* Grid */}
			<div className="grid grid-cols-4 gap-3 w-full">
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

	// ─── Render ───────────────────────────────────────────────────────────────
	return (
		<ABasePageLayout
			questionTitle={questionTitle}
			question={{ ...currentQuestion, questionMediaURL: undefined }}
			timerDuration={timer}
			aboveQuestionBoard={clueGrid}
			boardHeightClass="h-[30vh]"
			answerBoxHeightClass="min-h-[4rem]"
			controlsChildren={() => null}
			topControlButtons={null}
			bottomActionButtons={
				<>
					<AControlButton onClick={() => { void handleStartRound(); }}>
						<Play size={18} />
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
						onClick={() => { void startKeywordTimer(); }}
						disabled={!keywordPhaseActive || keywordTimerRunning || !currentQuestion.questionCode}
					>
						<AlarmClockCheck size={18} />
						<span className="ml-2 font-bold">BẮT ĐẦU TỪ KHOÁ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void showAnswers(); }}
						disabled={!canShowAnswers}
					>
						<Eye size={18} />
						<span className="ml-2 font-bold">HIỆN TRẢ LỜI</span>
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
						<span className="ml-2 font-bold">TÍNH GỢI Ý</span>
					</AControlButton>
					<AControlButton
						onClick={() => {
							void handleAddKeywordScoreToSelected().catch((err) =>
								logger.error("AddKeywordScore button failed:", err),
							);
						}}
						disabled={selectedPlayerCodes.length === 0 || hasAddedKeywordScore}
					>
						<Calculator size={18} />
						<span className="ml-2 font-bold">TÍNH TỪ KHOÁ</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleShowHint(); }}
						disabled={!currentQuestion.questionCode || shownHintContent !== null}
					>
						<Lightbulb size={18} />
						<span className="ml-2 font-bold">MỞ GỢI Ý</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleHideHint(); }}
						disabled={!currentQuestion.questionCode || hintHidden}
					>
						<EyeOff size={18} />
						<span className="ml-2 font-bold">KHOÁ GỢI Ý</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleRevealKeywordAnswer(); }}
						disabled={!keywordPhaseActive || keywordAnswerRevealed}
					>
						<KeyRound size={18} />
						<span className="ml-2 font-bold">MỞ ĐÁP ÁN</span>
					</AControlButton>
					<AControlButton
						onClick={() => { void handleShowKeywordAnswers(); }}
						disabled={!keywordPhaseActive}
					>
						<SendToBack size={18} />
						<span className="ml-2 font-bold">HIỆN TỪ KHOÁ</span>
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
							hasKeywordSubmission={!!keywordSubmissions[player.playerCode]}
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

export default AGiaiMaPage;
