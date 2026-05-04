/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";



const PGiaiMaPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [questionAnswer, setQuestionAnswer] = useState("");
	const [keyword, setKeyword] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);
	const [hasSubmittedKeyword, setHasSubmittedKeyword] = useState(false);
	const [revealedHint, setRevealedHint] = useState<string | null>(null);
	const [isKeywordLocked, setIsKeywordLocked] = useState(false);
	const [showKeywordConfirm, setShowKeywordConfirm] = useState(false);
	const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);

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

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), msg.started_at);
				setQuestionAnswer("");
				setKeyword("");
				setShowAnswers(false);
				setRevealedHint(null);
				break;
			}

			case "clear_question": {
				setRevealedHint(null);
				setKeywordAnswer(null);
				break;
			}

			case "show_hint": {
				const targets: string[] = msg.target_players ?? [];
				if (targets.length === 0 || targets.includes(playerCode)) {
					setRevealedHint(msg.hint_content ?? null);
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
				setQuestionAnswer("");
				setKeyword("");
				setShowAnswers(true);
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

			case "send_keyword_answers": {
				const answers: { user_code: string; content: string; timestamp: number }[] = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const a = answers.find((x: any) => x.user_code === p.playerCode);
						return a ? { ...p, playerLastAnswer: a.content, playerTimestamp: a.timestamp } : p;
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
			type: "answer",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			answer_text: trimmed,
			timestamp: ts,
		});
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
		setKeyword("");
	}, [keyword, currentQuestion.questionCode, playerCode, sendMessage, token, matchCode]);

	// Question answer box: unlocked by timer, only locked if no active question or already submitted keyword
	const isQuestionAnswerDisabled = !isConnected || hasSubmittedKeyword || !currentQuestion.questionCode;
	// Keyword box: additionally locked by isKeywordLocked (broadcast when all clues open or all players submitted)
	const isKeywordInputDisabled = !isConnected || hasSubmittedKeyword || isKeywordLocked || !currentQuestion.questionCode;

	// Always show the current player's own answer; hide others until admin reveals
	const displayPlayers = players.map((p) =>
		showAnswers || p.playerCode === playerCode ? p : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
	);

	return (
		<PBasePageLayout
			players={displayPlayers}
			currentPlayerCode={playerCode}
		>
			<>
				<PQuestionBoard
					title="GIẢI MÃ"
					question={currentQuestion}
					timerDuration={timer}
					boardHeightClass="h-[38vh]"
					controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
				/>

				{revealedHint && (
					<div className="mx-3 p-4 bg-yellow-600 border-2 border-yellow-400 rounded-xl text-center font-bold text-white text-xl">
						GỢI Ý: {revealedHint}
					</div>
				)}

				{keywordAnswer && (
					<div className="mx-3 p-4 bg-green-700 border-2 border-green-400 rounded-xl text-center font-bold text-white text-xl">
						ĐÁP ÁN: {keywordAnswer}
					</div>
				)}

				<div className="flex flex-col gap-3 p-3">
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
