

import React, { useCallback, useEffect, useRef, useState } from "react";
import { submitAnswer } from "@/api/answers";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";
import { buildKeywordBanner } from "@/utils/keywordBanner";

const CLUE_COUNT = 8;
type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

function isMediaFilename(value: string): boolean {
	return /\.(mp3|ogg|wav|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value.trim());
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
	const { matchCode, playerCode, token } = useRoleSession("player");
	const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();

	const { players, setPlayers, applyPlayersInfo, applyScoreUpdate } = useAudiencePlayers();
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

	const [hideQuestionContent, setHideQuestionContent] = useState(false);

	const [isKeywordPhase, setIsKeywordPhase] = useState(false);

	const [isKeywordCluesLocked, setIsKeywordCluesLocked] = useState(false);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = lastMessage.message ?? lastMessage;

		queueMicrotask(() => {

		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info":
				applyPlayersInfo(msg);
				break;

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

				setHideQuestionContent(false);
				break;
			}

			case "start_the_timer": {
				const isKeywordTimer = msg.phase === "gm_keyword";
				if (isKeywordTimer) {
					setIsKeywordLocked(false);
				}
				startSynced(Number(msg.time_limit ?? 0), Number(msg.started_at ?? Date.now()));
				setTimerHasStarted(true);
				if (!isKeywordTimer) {
					setQuestionAnswer("");
					setKeyword("");
				}
				setIsKeywordPhase(isKeywordTimer);
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
				const targets: string[] = Array.isArray(msg.target_players) ? msg.target_players.map(String) : [];
				const canSeeHint = targets.length === 0 || targets.includes(String(playerCode));

				const contentIsMedia = isMediaFilename(hintContent);
				const displayText = canSeeHint ? (contentIsMedia ? hintMediaSource : hintContent) : "";
				const displayMedia = canSeeHint ? (contentIsMedia ? hintContent : hintMediaSource) : "";
				setHideQuestionContent(true);
				const explicitIdx = Number(msg.clue_index);
				const questionCodeMatch = String(msg.question_code ?? "").match(/(\d+)\s*$/);
				const questionCodeIdx = questionCodeMatch ? Number(questionCodeMatch[1]) - 1 : null;
				const hasQuestionCodeIdx = Number.isInteger(questionCodeIdx) && questionCodeIdx !== null && questionCodeIdx >= 0 && questionCodeIdx < CLUE_COUNT;
				const hasExplicitIdx = Number.isInteger(explicitIdx) && explicitIdx >= 0 && explicitIdx < CLUE_COUNT;
				const resolvedIdx = hasExplicitIdx ? explicitIdx : hasQuestionCodeIdx ? questionCodeIdx : null;

				if (resolvedIdx !== null) {
					const idx = resolvedIdx;
					activeClueIdxRef.current = idx;
					setClueStates((prev) => {
						if (prev[idx] === "used") return prev;
						return prev.map((s, i) => (i === idx ? "used" : s));
					});
					setRevealedHints((prev) => {
						const next = { ...prev };
						if (displayText || displayMedia) next[idx] = { text: displayText || undefined, mediaUrl: displayMedia || undefined };
						else delete next[idx];
						return next;
					});
				} else {
					const idx = activeClueIdxRef.current;
					if (idx !== null && canSeeHint) {
						setRevealedHints((prev) => ({
							...prev,
							[idx]: { text: displayText || undefined, mediaUrl: displayMedia || undefined },
						}));
					}
				}
				break;
			}

			case "hide_hint": {
				setHideQuestionContent(true);

				let idx: number | null = null;
				const explicitIdx = Number(msg.clue_index);
				if (Number.isInteger(explicitIdx) && explicitIdx >= 0 && explicitIdx < CLUE_COUNT) {
					idx = explicitIdx;
					activeClueIdxRef.current = explicitIdx;
				} else if (activeClueIdxRef.current !== null) {
					idx = activeClueIdxRef.current;
				}
				if (idx !== null) {
					setRevealedHints((prev) => {
						if (!(idx! in prev)) return prev;
						const next = { ...prev };
						delete next[idx!];
						return next;
					});
				}
				break;
			}

			case "player_score_updated":
				applyScoreUpdate(msg);
				break;

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

				const banner = msg.banner;
				if (typeof banner === "string" && banner) {
					console.info("[KEYWORD INFO] Received banner from admin:", banner);
					setKeywordBanner(banner);
				}
				break;
			}

			case "keyword_submit": {
				const { user_code, keyword_text, clues_opened } = msg;
				if (user_code) {
					setKeywordSubmittedCodes((prev) => new Set([...prev, user_code as string]));

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

					if (user_code === playerCode) {
						setHasSubmittedKeyword(true);
						if (typeof keyword_text === "string" && keyword_text) {
							setKeyword(keyword_text);
						}
					}
					console.info("Player received keyword_submit from", user_code, "clues_opened=", clues_opened);
				}
				break;
			}

			case "send_keyword_answers": {
				const answers = msg.answers ?? [];
				console.info("[KEYWORD ANSWERS] Received answers:", answers.length, "submissions");
				setPlayers((prev) =>
					prev.map((p) => {
						const a = answers.find((x) => String(x.user_code) === p.playerCode);
						if (!a) return p;
						return {
							...p,
							playerLastAnswer: a.content,
							playerTimestamp: undefined,
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
						const ans = answers.find((a) => String(a.user_code) === p.playerCode);
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
		});
	}, [applyPlayersInfo, applyScoreUpdate, applyWsMessage, lastMessage, playerCode, setPlayers, startSynced]);

	const handleSubmitQuestionAnswer = useCallback(async () => {
		const trimmed = questionAnswer.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (!currentQuestion.questionCode) return;

		const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		try {
			await submitAnswer({
				user_code: playerCode,
				match_code: matchCode,
				question_code: currentQuestion.questionCode,
				answer_text: trimmed,
				has_buzzed: false,
				timestamp: ts,
			}, token);
		} catch (error) {
			console.warn("Failed to submit question answer:", error);
		}

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
	}, [currentQuestion.questionCode, getElapsedSeconds, isConnected, matchCode, playerCode, questionAnswer, sendMessage, setPlayers, timeLimit, token]);

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
			await submitAnswer({
				user_code: playerCode,
				match_code: matchCode,
				question_code: currentQuestion.questionCode,
				answer_text: trimmed,
				has_buzzed: false,
			}, token);
		} catch (error) {
			console.warn("Failed to submit keyword:", error);
		}

		console.info("[KEYWORD SUBMIT] Sending WebSocket message...");

		const cluesOpened = isKeywordCluesLocked
			? CLUE_COUNT
			: clueStates.filter((s) => s !== "idle").length;
		await sendMessage({
			type: "keyword_submit",
			user_code: playerCode,
			keyword_text: trimmed,
			clues_opened: cluesOpened,
		});
		console.info("[KEYWORD SUBMIT] WebSocket message sent");

		setHasSubmittedKeyword(true);
		setKeywordSubmittedCodes((prev) => new Set([...prev, playerCode]));

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode ? { ...p, playerKeywordCluesOpened: cluesOpened } : p,
			),
		);
		console.info("[KEYWORD SUBMIT] State updated, keyword cleared");
		setKeyword("");
	}, [clueStates, currentQuestion.questionCode, isKeywordCluesLocked, keywordToConfirm, matchCode, playerCode, sendMessage, setPlayers, token]);

	const isTimerExpired = timeLimit > 0 && timer === 0;
	const isQuestionAnswerDisabled = !isConnected || hasSubmittedKeyword || !currentQuestion.questionCode || !timerHasStarted || isTimerExpired || isKeywordPhase;

	const isKeywordTimerExpired = isKeywordPhase && timeLimit > 0 && timer === 0;
	const isKeywordInputDisabled = !isConnected || hasSubmittedKeyword || isKeywordLocked || isKeywordTimerExpired || !currentQuestion.questionCode;

	const displayPlayers = players.map((p) => {
		const withKeyword = keywordSubmittedCodes.has(p.playerCode)
			? { ...p, playerHasSubmittedKeyword: true }
			: p;

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
