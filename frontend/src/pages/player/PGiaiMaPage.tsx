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
				setHasSubmittedKeyword(false);
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
				setHasSubmittedKeyword(false);
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

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced, playerCode]);

	const handleSubmitQuestionAnswer = useCallback(async () => {
		const trimmed = questionAnswer.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (timer <= 0) return;
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
	}, [questionAnswer, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendMessage, timeLimit, timer, token, matchCode]);

	const handleSubmitKeyword = useCallback(async () => {
		const trimmed = keyword.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (timer <= 0) return;
		if (!currentQuestion.questionCode) return;

		const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerLastAnswer: trimmed, playerTimestamp: Number(ts.toFixed(3)) }
					: p,
			),
		);

		try {
			// Persist keyword via REST
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
				console.warn("Failed to POST keyword:", res.status, body);
			}
		} catch (err) {
			console.warn("Failed to POST keyword:", err);
		}

		// Send real-time frame
		await sendMessage({
			type: "answer",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			answer_text: trimmed,
			timestamp: ts,
		});
		setKeyword("");
		setHasSubmittedKeyword(true);
	}, [keyword, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendMessage, timeLimit, timer, token, matchCode]);

	const isSubmissionDisabled = !isConnected || timer <= 0;
	const isLockedAfterKeyword = isSubmissionDisabled || hasSubmittedKeyword;

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

				<div className="flex flex-col gap-3 p-3">
					<PAnswerBox
						answer={questionAnswer}
						setAnswer={setQuestionAnswer}
						isDisabled={isLockedAfterKeyword}
						onSubmit={handleSubmitQuestionAnswer}
						placeholderString={isLockedAfterKeyword ? "Bạn không thể nhập câu trả lời tại thời điểm này" : "Nhập câu trả lời và nhấn Enter"}
					/>
					<PAnswerBox
						answer={keyword}
						setAnswer={setKeyword}
						isDisabled={isLockedAfterKeyword}
						onSubmit={handleSubmitKeyword}
						placeholderString={isLockedAfterKeyword ? "Bạn không thể nhập từ khoá tại thời điểm này" : "Nhập từ khoá và nhấn Enter"}
					/>
					<PSubmitButton
						isEnabled={!isLockedAfterKeyword && keyword.trim().length > 0}
						isKeywordMode={true}
						label="NỘP TỪ KHOÁ"
						onSubmit={handleSubmitKeyword}
					/>
				</div>
			</>
		</PBasePageLayout>
	);
};

export default PGiaiMaPage;
