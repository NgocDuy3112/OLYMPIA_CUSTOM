/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";

const CLUE_COUNT = 8;
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY";
type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

function isMediaFilename(value: string): boolean {
	return /\.(mp3|ogg|wav|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value.trim());
}

function buildKeywordBanner(answer: string): string {
	const trimmedLen = answer.replace(/\s/g, '').length;
	const noSpaceAnswer = answer.replace(/\s/g, '');
	if (/^[A-ZÀ-Ỹa-zà-ỹ]+$/u.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ CÁI`;
	if (/^\d+$/.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ SỐ`;
	return `TỪ KHOÁ GỒM CÓ ${trimmedLen} KÝ TỰ`;
}

interface PlayerClueCardProps {
	index: number;
	state: ClueState;
	hintContent?: RevealedHint;
}

const PlayerClueCard: React.FC<PlayerClueCardProps> = ({ index, state, hintContent }) => {
	const base = "flex-1 h-16 sm:h-20 lg:h-28 xl:h-36 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2";
	const styles: Record<ClueState, string> = {
		idle:   "bg-blue-900 border-blue-600 text-white",
		active: "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
		used:   "bg-blue-700 border-blue-500 text-white",
	};
	const showHint = (state === "active" || state === "used") && !!(hintContent?.text || hintContent?.mediaUrl);
	return (
		<div className={`${base} ${styles[state]}`} aria-label={`Gợi ý ${index}`}>
			{showHint ? (
				<div className="flex items-center justify-center w-full h-full p-2">
					{hintContent!.mediaUrl
						? <RenderMedia mediaUrl={hintContent!.mediaUrl} />
						: <span className="text-sm sm:text-base lg:text-lg xl:text-xl font-bold text-center leading-snug">{hintContent!.text}</span>
					}
				</div>
			) : (
				<span className="font-[SVN-Gratelos_Display] text-2xl sm:text-3xl lg:text-[40pt] xl:text-[50pt]">{index}</span>
			)}
		</div>
	);
};



const PGiaiMaPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [keywordSubmittedCodes, setKeywordSubmittedCodes] = useState<Set<string>>(new Set());
	const [questionAnswer, setQuestionAnswer] = useState("");
	const [keyword, setKeyword] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);
	const [hasSubmittedKeyword, setHasSubmittedKeyword] = useState(false);
	const [timerHasStarted, setTimerHasStarted] = useState(false);
	const [isKeywordLocked, setIsKeywordLocked] = useState(false);
	const [showKeywordConfirm, setShowKeywordConfirm] = useState(false);
	const [keywordToConfirm, setKeywordToConfirm] = useState("");
	const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
	const [clueStates, setClueStates] = useState<ClueState[]>(() => Array(CLUE_COUNT).fill("idle"));
	const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
	const [keywordBanner, setKeywordBanner] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");
	const activeClueIdxRef = useRef<number | null>(null);

	// Hide the question-board content when admin opens/locks the hint
	const [hideQuestionContent, setHideQuestionContent] = useState(false);
	// True while the QuestionBoard timer is the keyword phase (vs. the regular question timer)
	const [isKeywordPhase, setIsKeywordPhase] = useState(false);
	// True once the admin has pressed "ĐẾM GIỜ TỪ KHOÁ" — from this point on,
	// any keyword submission is scored as if all 8 clues were used (N = 8).
	const [isKeywordCluesLocked, setIsKeywordCluesLocked] = useState(false);

	// Auto-fetch scoreboard on mount to ensure accurate initial scores
	useEffect(() => {
		if (!matchCode || !token) return;
		let mounted = true;
		const fetchScores = async () => {
			try {
				const res = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!res.ok) return;
				const json = await res.json();
				const scoreboardList: any[] = json.data?.scoreboard ?? [];
				if (mounted && scoreboardList.length > 0) {
					setPlayers((prev) =>
						prev.map((p) => {
							const scoreEntry = scoreboardList.find((s) => s.user_code === p.playerCode);
							if (scoreEntry) {
								const newScore = scoreEntry.cumulative_score ?? scoreEntry.cumulative_score ?? scoreEntry.total_score ?? scoreEntry.score ?? 0;
								return { ...p, playerScore: newScore };
							}
							return p;
						}),
					);
				}
			} catch (err) {
				console.warn("Failed to fetch scoreboard on mount:", err);
			}
		};
		void fetchScores();
		return () => { mounted = false; };
	}, [matchCode, token]);

	useEffect(() => {
		if (!matchCode || !token) return;
		const fetchKeywordQ = async () => {
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}&question_code=${encodeURIComponent(KEYWORD_QUESTION_CODE)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) {
					console.warn("[KEYWORD BANNER] Fetch failed with status:", res.status);
					return;
				}
				const data = await res.json();
				let payload: any = null;
				if (Array.isArray(data.data)) {
					payload = data.data.find((q: any) => String(q?.question_code) === KEYWORD_QUESTION_CODE) ?? data.data[0] ?? null;
				} else {
					payload = data.data ?? null;
				}
				console.info("[KEYWORD BANNER] Raw payload:", payload);
				// Use same extraction logic as Admin
				const answer: string =
					payload?.question?.correct_answers ??
					payload?.question?.correct_answer ??
					payload?.answer ??
					payload?.correct_answer ??
					"";
				console.info("[KEYWORD BANNER] Extracted answer:", answer, "length:", answer.replace(/\s/g, '').length);
				if (answer) {
					const newBanner = buildKeywordBanner(answer);
					console.info("[KEYWORD BANNER] Setting banner:", newBanner);
					setKeywordBanner(newBanner);
				} else {
					console.warn("[KEYWORD BANNER] No answer found in payload");
				}
			} catch (err) {
				console.warn("[KEYWORD BANNER] Fetch error:", err);
				// keep default banner
			}
		};
		void fetchKeywordQ();
	}, [matchCode, token]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		// Debug logs to help verify payloads
		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		// Let the question hook handle send_question/clear_question
		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info": {
				// Receive player information through WebSocket; support both old (players+scoreboard+profiles)
				// and new (players[] where each player already contains cumulative_score/user_name) shapes.
				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = (playersList ?? []).map((p: any) => {
					const code = String(p?.user_code ?? "");

					// resolve name: prefer player object, then profiles, then scoreboard entry
					let name = "";
					if (p?.user_name) name = p.user_name;
					else {
						const prof = (profiles ?? []).find((pr: any) => String(pr?.user_code) === code);
						if (prof) name = prof.user_name ?? "";
						else {
							const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
							name = scoreEntry?.user_name ?? "";
						}
					}

					// resolve score: prefer player.cumulative_score then scoreboard lookup; accept legacy spelling
					let scoreVal = 0;
					if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else {
						const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
						if (scoreEntry) scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;
					}

					return {
						playerCode: code,
						playerName: name,
						playerScore: scoreVal,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "send_question": {
				const code: string = msg.question_code ?? "";
				const m = String(code).match(/(\d+)\s*$/);
				const newClueNumber = m ? Number(m[1]) : 0;
				if (newClueNumber >= 1 && newClueNumber <= CLUE_COUNT) {
					const newIdx = newClueNumber - 1;
					activeClueIdxRef.current = newIdx;
					setClueStates((prev) =>
						prev.map((s, i) => {
							if (i === newIdx) return "active";
							if (s === "active") return "used";
							return s;
						})
					);
				}
				// New clue means a fresh question text/media on the board — show it again.
				setHideQuestionContent(false);
				break;
			}

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setTimerHasStarted(true);
				setQuestionAnswer("");
				setKeyword("");
				// If the question-board timer is the keyword phase, set the flag so the input locks when it hits 0.
				setIsKeywordPhase(msg.phase === "gm_keyword");
				break;
			}

			case "clear_question": {
				setKeywordAnswer(null);
				setClueStates(Array(CLUE_COUNT).fill("idle"));
				setRevealedHints({});
				setKeywordSubmittedCodes(new Set());
				setShowAnswers(false);
				setHasSubmittedKeyword(false);
				setTimerHasStarted(false);
				setIsKeywordLocked(false);
				setHideQuestionContent(false);
				setIsKeywordPhase(false);
				setIsKeywordCluesLocked(false);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerKeywordCluesOpened: undefined })));
				activeClueIdxRef.current = null;
				break;
			}

			case "round_start": {
				setKeywordAnswer(null);
				setClueStates(Array(CLUE_COUNT).fill("idle"));
				setRevealedHints({});
				setKeywordSubmittedCodes(new Set());
				setShowAnswers(false);
				setHasSubmittedKeyword(false);
				setTimerHasStarted(false);
				setIsKeywordLocked(false);
				setHideQuestionContent(false);
				setIsKeywordPhase(false);
				setIsKeywordCluesLocked(false);
				setPlayers((prev) => prev.map((p) => ({ ...p, playerKeywordCluesOpened: undefined })));
				activeClueIdxRef.current = null;
				break;
			}

			case "show_hint": {
				const hintContent = msg.hint_content ?? "";
				const hintMediaSource = msg.hint_media_source ?? "";
				// If hint content itself is a media filename, swap roles
				const contentIsMedia = isMediaFilename(hintContent);
				const displayText = contentIsMedia ? hintMediaSource : hintContent;
				const displayMedia = contentIsMedia ? hintContent : hintMediaSource;
				setHideQuestionContent(true);

				// Two shapes of "show_hint" are supported:
				//   1. clue_index provided → admin is broadcasting a hint for a
				//      SPECIFIC card (used when admin reveals all clues at once).
				//      Show to ALL players; ignore `target_players` filter.
				//   2. clue_index absent → legacy per-active-clue hint, only
				//      players in `target_players` see it.
				const explicitIdx = Number(msg.clue_index);
				const hasExplicitIdx = Number.isInteger(explicitIdx) && explicitIdx >= 0 && explicitIdx < CLUE_COUNT;

				if (hasExplicitIdx) {
					const idx = explicitIdx;
					activeClueIdxRef.current = idx;
					setClueStates((prev) => {
						if (prev[idx] === "used") return prev;
						return prev.map((s, i) => (i === idx ? "used" : s));
					});
					setRevealedHints((prev) => ({
						...prev,
						[idx]: { text: displayText || undefined, mediaUrl: displayMedia || undefined },
					}));
				} else {
					const idx = activeClueIdxRef.current;
					if (idx !== null) {
						const targets: string[] = Array.isArray(msg.target_players) ? msg.target_players : [];
						// Chỉ thí sinh được admin chọn mới thấy gợi ý
						const isTargeted = targets.length > 0 && targets.includes(playerCode);
						if (isTargeted) {
							setRevealedHints((prev) => ({
								...prev,
								[idx]: { text: displayText || undefined, mediaUrl: displayMedia || undefined },
							}));
						}
					}
				}
				break;
			}

			case "hide_hint": {
				const idx = activeClueIdxRef.current;
				setHideQuestionContent(true);
				if (idx !== null) {
					setRevealedHints((prev) => {
						const next = { ...prev };
						delete next[idx];
						return next;
					});
				}
				break;
			}

			case "player_score_updated": {
				if (msg.user_code && typeof msg.new_total_score === "number") {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
						),
					);
				}
				break;
			}

			case "clear_answers": {
				setPlayers((prev) =>
					prev.map((p) => ({
						...p,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					})),
				);
				setTimerHasStarted(false);
				setQuestionAnswer("");
				setKeyword("");
				setShowAnswers(false);
				break;
			}

			case "buzz": {
				// Buzz notification from another player
				const { user_code } = msg;
				if (user_code && user_code !== playerCode) {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p,
						),
					);
					console.info("Player received buzz from", user_code);
				}
				break;
			}

			case "keyword_locked": {
				setIsKeywordLocked(true);
				break;
			}

			case "keyword_clues_locked": {
				// Admin pressed "ĐẾM GIỜ TỪ KHOÁ" — every keyword submission from
				// this point on is treated as having used all 8 clues.
				console.info("[KEYWORD CLUES LOCKED] All subsequent submissions will be N=8");
				setIsKeywordCluesLocked(true);
				break;
			}

			case "reveal_keyword_answer": {
				const answer = msg.answer ?? null;
				const banner = msg.keyword_banner ?? null;
				console.info("[KEYWORD REVEAL] Received answer:", answer, "banner:", banner);
				setKeywordAnswer(answer);
				if (answer) {
					const newBanner = banner || buildKeywordBanner(answer);
					console.info("[KEYWORD REVEAL] Setting banner:", newBanner);
					setKeywordBanner(newBanner);
				}
				break;
			}

			case "send_keyword_info": {
				// Admin broadcast — sync keyword-length banner from admin so player view matches
				// even if the local /questions/ fetch returned a different/empty payload.
				const banner = msg.banner;
				if (typeof banner === "string" && banner) {
					console.info("[KEYWORD INFO] Received banner from admin:", banner);
					setKeywordBanner(banner);
				}
				break;
			}

			case "keyword_submit": {
				const { user_code, clues_opened } = msg;
				if (user_code) {
					setKeywordSubmittedCodes((prev) => new Set([...prev, user_code as string]));
					// Update player list to show key icon AND the "Sau N gợi ý" badge immediately
					// (don't wait for admin's "HIỆN TỪ KHOÁ" — the clue count is known at submit time)
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code
								? {
										...p,
										playerHasSubmittedKeyword: true,
										playerKeywordCluesOpened:
											typeof clues_opened === "number" ? clues_opened : p.playerKeywordCluesOpened,
									}
								: p,
						),
					);
					console.info("Player received keyword_submit from", user_code, "clues_opened=", clues_opened);
				}
				break;
			}

			case "send_keyword_answers": {
				const answers: { user_code: string; content: string; timestamp?: number; clues_opened?: number }[] = msg.answers ?? [];
				console.info("[KEYWORD ANSWERS] Received answers:", answers.length, "submissions");
				setPlayers((prev) =>
					prev.map((p) => {
						const a = answers.find((x: any) => x.user_code === p.playerCode);
						if (!a) return p;
						return {
							...p,
							playerLastAnswer: a.content,
							// Admin sets timestamp: undefined for keyword answers so the
							// player card omits the timestamp next to the keyword text.
							// Only overwrite when the broadcast provides a numeric timestamp.
							playerTimestamp: typeof a.timestamp === "number" ? a.timestamp : p.playerTimestamp,
							playerKeywordCluesOpened:
								typeof a.clues_opened === "number" ? a.clues_opened : p.playerKeywordCluesOpened,
						};
					}),
				);
				setKeywordSubmittedCodes(new Set());
				break;
			}

			case "send_answers_to_players": {
				const answers = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const ans = answers.find((a: any) => a.user_code === p.playerCode);
						if (!ans) return p;
						return { ...p, playerLastAnswer: ans.content, playerTimestamp: ans.timestamp || p.playerTimestamp };
					}),
				);
				setShowAnswers(true);
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced, playerCode]);

	const handleSubmitQuestionAnswer = useCallback(async () => {
		const trimmed = questionAnswer.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (!currentQuestion.questionCode) return;

		const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		try {
			// Persist question answer via REST
			const res = await fetch(`${API_BASE_URL}/answers/`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					user_code: playerCode,
					match_code: matchCode,
					question_code: currentQuestion.questionCode,
					answer_text: trimmed,
					has_buzzed: false,
					timestamp: ts,
				}),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				console.warn("Failed to POST question answer:", res.status, body);
			}
		} catch (err) {
			console.warn("Failed to POST question answer:", err);
		}

		// Send real-time frame
		await sendMessage({
			type: "player_answer",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			answer_text: trimmed,
			timestamp: ts,
		});
		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerLastAnswer: trimmed, playerTimestamp: Number(ts.toFixed(3)) }
					: p,
			),
		);
		setQuestionAnswer("");
	}, [questionAnswer, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendMessage, timeLimit, token, matchCode]);

	// Opens confirmation popup; actual submission happens in handleConfirmKeyword
	const handleSubmitKeyword = useCallback(() => {
		if (!keyword.trim()) return;
		if (hasSubmittedKeyword || isKeywordLocked) return;
		if (!currentQuestion.questionCode) return;
		setKeywordToConfirm(keyword.trim());
		setShowKeywordConfirm(true);
	}, [keyword, hasSubmittedKeyword, isKeywordLocked, currentQuestion.questionCode]);

	const handleConfirmKeyword = useCallback(async () => {
		const trimmed = keywordToConfirm.trim();
		console.info("[KEYWORD SUBMIT] Player:", playerCode, "submitting:", trimmed);
		setShowKeywordConfirm(false);
		if (!trimmed || !currentQuestion.questionCode) {
			console.warn("[KEYWORD SUBMIT] Blocked: trimmed=", trimmed, "questionCode=", currentQuestion.questionCode);
			return;
		}

		try {
			const res = await fetch(`${API_BASE_URL}/answers/`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					user_code: playerCode,
					match_code: matchCode,
					question_code: currentQuestion.questionCode,
					answer_text: trimmed,
					has_buzzed: false,
					timestamp: 0,
				}),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				console.warn("Failed to POST keyword:", res.status, body);
			} else {
				console.info("[KEYWORD SUBMIT] POST success");
			}
		} catch (err) {
			console.warn("Failed to POST keyword:", err);
		}

		console.info("[KEYWORD SUBMIT] Sending WebSocket message...");
		// Snapshot how many clue cards count toward this submission:
		// - If the admin has already pressed "ĐẾM GIỜ TỪ KHOÁ" (`isKeywordCluesLocked`),
		//   every submission from this point is treated as N = CLUE_COUNT.
		// - Otherwise N = how many cards are non-idle in this player's local state.
		const cluesOpened = isKeywordCluesLocked
			? CLUE_COUNT
			: clueStates.filter((s) => s !== "idle").length;
		await sendMessage({
			type: "keyword_submit",
			user_code: playerCode,
			keyword_text: trimmed,
			timestamp: 0,
			clues_opened: cluesOpened,
		});
		console.info("[KEYWORD SUBMIT] WebSocket message sent");

		// Mark self as submitted and show key icon immediately
		setHasSubmittedKeyword(true);
		setKeywordSubmittedCodes((prev) => new Set([...prev, playerCode]));
		// Cache own clues count so we can render "Sau N gợi ý" right after admin reveals.
		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode ? { ...p, playerKeywordCluesOpened: cluesOpened } : p,
			),
		);
		console.info("[KEYWORD SUBMIT] State updated, keyword cleared");
		setKeyword("");
	}, [keywordToConfirm, currentQuestion.questionCode, playerCode, sendMessage, token, matchCode, clueStates, isKeywordCluesLocked]);

	const isTimerExpired = timeLimit > 0 && timer === 0;
	// Question answer box: only enabled after admin starts the clock; also disabled after expiry or keyword submitted
	const isQuestionAnswerDisabled = !isConnected || hasSubmittedKeyword || !currentQuestion.questionCode || !timerHasStarted || isTimerExpired;
	// Keyword box: additionally locked by isKeywordLocked (broadcast when all clues open or all players submitted)
	// Auto-lock keyword when the keyword-phase QuestionBoard timer expires
	const isKeywordTimerExpired = isKeywordPhase && timeLimit > 0 && timer === 0;
	useEffect(() => {
		if (isKeywordTimerExpired) {
			setIsKeywordLocked(true);
		}
	}, [isKeywordTimerExpired]);

	const isKeywordInputDisabled = !isConnected || hasSubmittedKeyword || isKeywordLocked || !currentQuestion.questionCode;

	const displayPlayers = players.map((p) => {
		const withKeyword = keywordSubmittedCodes.has(p.playerCode)
			? { ...p, playerHasSubmittedKeyword: true }
			: p;
		// Hide other players' answers until this player has submitted their own
		if (p.playerCode !== playerCode && !showAnswers) {
			return { ...withKeyword, playerLastAnswer: undefined, playerTimestamp: undefined };
		}
		return withKeyword;
	});

	const clueGrid = (
		<div className="flex flex-col gap-2 sm:gap-3 w-full mb-2 sm:mb-3 px-1 sm:px-3">
			<div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center font-[SVN-Gratelos_Display] text-lg sm:text-2xl lg:text-3xl font-bold text-white uppercase shadow">
				{keywordAnswer ? `${keywordAnswer}` : keywordBanner}
			</div>
			<div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
				{Array.from({ length: CLUE_COUNT }, (_, i) => (
					<PlayerClueCard
						key={i}
						index={i + 1}
						state={clueStates[i]}
						hintContent={revealedHints[i]}
					/>
				))}
			</div>
		</div>
	);

	return (
		<PBasePageLayout
			players={displayPlayers}
			currentPlayerCode={playerCode}
		>
			<>
				{clueGrid}

				<PQuestionBoard
					title="GIẢI MÃ"
					question={isKeywordPhase ? { ...currentQuestion, questionText: keywordBanner, questionMediaURL: undefined } : currentQuestion}
					timerDuration={timer}
					boardHeightClass="h-[18vh] sm:h-[20vh] lg:h-[26vh]"
					controls={{ variant: 'numbers', count: 0 }}
					hideContent={hideQuestionContent || isKeywordPhase}
					/>

				<PAnswerBox
					answer={questionAnswer}
					setAnswer={setQuestionAnswer}
					isDisabled={isQuestionAnswerDisabled}
					onSubmit={handleSubmitQuestionAnswer}
					placeholderString={isQuestionAnswerDisabled ? "Bạn không thể nhập câu trả lời tại thời điểm này" : "Nhập câu trả lời và nhấn Enter"}
				/>
				<PAnswerBox
					answer={keyword}
					setAnswer={setKeyword}
					isDisabled={isKeywordInputDisabled}
					onSubmit={handleSubmitKeyword}
					placeholderString={isKeywordInputDisabled ? "Bạn không thể nhập từ khoá tại thời điểm này" : "Nhập từ khoá và nhấn Enter"}
					showKeyIcon={true}
				/>

				{showKeywordConfirm && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
						<div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-8 flex flex-col gap-5 max-w-sm w-full mx-4">
							<p className="text-white font-bold text-xl text-center">Xác nhận nộp Từ khoá</p>
							<p className="text-blue-200 text-center text-sm">
								Bạn chỉ được nộp <strong>1 lần</strong>. Không thể thay đổi sau khi xác nhận.
							</p>
							<p className="text-white font-bold text-center text-lg">"{keywordToConfirm}"</p>
							<div className="flex gap-4 justify-center">
								<button
									onClick={() => setShowKeywordConfirm(false)}
									className="px-5 py-2 rounded-lg bg-slate-600 text-white font-bold hover:bg-slate-500"
								>
									HỦY
								</button>
								<button
									onClick={() => { void handleConfirmKeyword(); }}
									className="px-5 py-2 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-400"
								>
									XÁC NHẬN
								</button>
							</div>
						</div>
					</div>
				)}
			</>
		</PBasePageLayout>
	);
};

export default PGiaiMaPage;
