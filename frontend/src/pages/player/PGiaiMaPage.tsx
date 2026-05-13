/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PSubmitButton } from "@/components/player/PSubmitButton";
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

function buildKeywordBanner(answer: string): string {
	const len = answer.length;
	if (/^[A-ZÀ-Ỹa-zà-ỹ]+$/u.test(answer)) return `TỪ KHOÁ GỒM CÓ ${len} CHỮ CÁI`;
	if (/^\d+$/.test(answer)) return `TỪ KHOÁ GỒM CÓ ${len} CHỮ SỐ`;
	return `TỪ KHOÁ GỒM CÓ ${len} KÝ TỰ`;
}

interface PlayerClueCardProps {
	index: number;
	state: ClueState;
	hintContent?: RevealedHint;
}

const PlayerClueCard: React.FC<PlayerClueCardProps> = ({ index, state, hintContent }) => {
	const base = "flex-1 h-32 sm:h-40 lg:h-56 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2";
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
						: <span className="text-xl font-bold text-center leading-snug">{hintContent!.text}</span>
					}
				</div>
			) : (
				<span className="font-[SVN-Gratelos_Display] text-[60pt]">{index}</span>
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
	const [hasSubmittedKeyword, setHasSubmittedKeyword] = useState(false);
	const [timerHasStarted, setTimerHasStarted] = useState(false);
	const [isKeywordLocked, setIsKeywordLocked] = useState(false);
	const [showKeywordConfirm, setShowKeywordConfirm] = useState(false);
	const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
	const [clueStates, setClueStates] = useState<ClueState[]>(() => Array(CLUE_COUNT).fill("idle"));
	const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
	const [keywordBanner, setKeywordBanner] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");
	const activeClueIdxRef = useRef<number | null>(null);

	useEffect(() => {
		if (!matchCode || !token) return;
		const fetchKeywordQ = async () => {
			try {
				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}&question_code=${encodeURIComponent(KEYWORD_QUESTION_CODE)}`;
				const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) return;
				const data = await res.json();
				let payload: any = null;
				if (Array.isArray(data.data)) {
					payload = data.data.find((q: any) => String(q?.question_code) === KEYWORD_QUESTION_CODE) ?? data.data[0] ?? null;
				} else {
					payload = data.data ?? null;
				}
				const answer: string =
					payload?.question?.correct_answers ??
					payload?.question?.correct_answer ??
					payload?.answer ??
					payload?.correct_answer ??
					"";
				if (answer) setKeywordBanner(buildKeywordBanner(answer));
			} catch {
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
					else if (typeof p?.cummulative_score === "number") scoreVal = p.cummulative_score;
					else {
						const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
						if (scoreEntry) scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.cummulative_score ?? scoreEntry?.total_score ?? scoreEntry?.score ?? 0;
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
				break;
			}

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setTimerHasStarted(true);
				setQuestionAnswer("");
				setKeyword("");
				break;
			}

			case "clear_question": {
				setKeywordAnswer(null);
				setClueStates(Array(CLUE_COUNT).fill("idle"));
				setRevealedHints({});
				setKeywordSubmittedCodes(new Set());
				setTimerHasStarted(false);
				activeClueIdxRef.current = null;
				break;
			}

			case "round_start": {
				setKeywordAnswer(null);
				setClueStates(Array(CLUE_COUNT).fill("idle"));
				setRevealedHints({});
				setKeywordSubmittedCodes(new Set());
				setTimerHasStarted(false);
				activeClueIdxRef.current = null;
				break;
			}

			case "show_hint": {
				const idx = activeClueIdxRef.current;
				if (idx !== null) {
					const targets: string[] = Array.isArray(msg.target_players) ? msg.target_players : [];
					const isTargeted = targets.length === 0 || targets.includes(playerCode);
					if (isTargeted) {
						setRevealedHints((prev) => ({
							...prev,
							[idx]: { text: msg.hint_content ?? undefined, mediaUrl: msg.hint_media_source ?? undefined },
						}));
					}
				}
				break;
			}

			case "hide_hint": {
				const idx = activeClueIdxRef.current;
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
				break;
			}

			case "answer": {
				// Real-time answer from another player via WebSocket
				const { user_code, answer_text, timestamp } = msg;
				if (user_code && user_code !== playerCode && answer_text) {
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
					console.info("Player received answer from", user_code, ":", answer_text);
				}
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

			case "reveal_keyword_answer": {
				setKeywordAnswer(msg.answer ?? null);
				break;
			}

			case "keyword_submit": {
				const { user_code } = msg;
				if (user_code) setKeywordSubmittedCodes((prev) => new Set([...prev, user_code as string]));
				break;
			}

			case "send_keyword_answers": {
				const answers: { user_code: string; content: string; timestamp: number }[] = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const a = answers.find((x: any) => x.user_code === p.playerCode);
						return a ? { ...p, playerLastAnswer: a.content, playerTimestamp: a.timestamp } : p;
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
						return { ...p, playerLastAnswer: ans.content, playerTimestamp: ans.timestamp };
					}),
				);
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
			type: "answer",
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
		setShowKeywordConfirm(true);
	}, [keyword, hasSubmittedKeyword, isKeywordLocked, currentQuestion.questionCode]);

	const handleConfirmKeyword = useCallback(async () => {
		const trimmed = keyword.trim();
		setShowKeywordConfirm(false);
		if (!trimmed || !currentQuestion.questionCode) return;

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
			}
		} catch (err) {
			console.warn("Failed to POST keyword:", err);
		}

		await sendMessage({
			type: "keyword_submit",
			user_code: playerCode,
			keyword_text: trimmed,
			timestamp: 0,
		});

		setHasSubmittedKeyword(true);
		setKeywordSubmittedCodes((prev) => new Set([...prev, playerCode]));
		setKeyword("");
	}, [keyword, currentQuestion.questionCode, playerCode, sendMessage, token, matchCode]);

	const isTimerExpired = timeLimit > 0 && timer === 0;
	// Question answer box: only enabled after admin starts the clock; also disabled after expiry or keyword submitted
	const isQuestionAnswerDisabled = !isConnected || hasSubmittedKeyword || !currentQuestion.questionCode || !timerHasStarted || isTimerExpired;
	// Keyword box: additionally locked by isKeywordLocked (broadcast when all clues open or all players submitted)
	const isKeywordInputDisabled = !isConnected || hasSubmittedKeyword || isKeywordLocked || !currentQuestion.questionCode;

	const displayPlayers = players.map((p) =>
		keywordSubmittedCodes.has(p.playerCode) ? { ...p, playerHasSubmittedKeyword: true } : p,
	);

	const clueGrid = (
		<div className="flex flex-col gap-3 w-full mb-3 px-3">
			<div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-4 py-2 text-center font-[SVN-Gratelos_Display] text-2xl lg:text-3xl font-bold text-white uppercase shadow">
				{keywordBanner}
			</div>
			<div className="grid grid-cols-4 gap-2 w-full">
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
					question={{ ...currentQuestion, questionMediaURL: undefined }}
					timerDuration={timer}
					boardHeightClass="h-[14vh] lg:h-[20vh]"
					controls={{ variant: 'numbers', count: 0 }}
					/>

				{keywordAnswer && (
					<div className="mx-3 p-4 bg-blue-700 border-2 border-blue-400 rounded-xl text-center font-bold text-white text-xl">
						ĐÁP ÁN: {keywordAnswer}
					</div>
				)}

				<div className="flex flex-col gap-2 p-2 lg:p-3">
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
					/>
					<PSubmitButton
						isEnabled={!isKeywordInputDisabled && keyword.trim().length > 0}
						isKeywordMode={true}
						label="NỘP TỪ KHOÁ"
						onSubmit={handleSubmitKeyword}
					/>
				</div>

				{showKeywordConfirm && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
						<div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-8 flex flex-col gap-5 max-w-sm w-full mx-4">
							<p className="text-white font-bold text-xl text-center">Xác nhận nộp Từ khoá</p>
							<p className="text-blue-200 text-center text-sm">
								Bạn chỉ được nộp <strong>1 lần</strong>. Không thể thay đổi sau khi xác nhận.
							</p>
							<p className="text-white font-bold text-center text-lg">"{keyword}"</p>
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
