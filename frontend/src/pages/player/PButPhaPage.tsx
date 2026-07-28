

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";

import PAnswerBox from "@/components/player/PAnswerBox";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";

const PButPhaPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendMessage } = usePlayerWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [answer, setAnswer] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);
	const [timerHasStarted, setTimerHasStarted] = useState(false);
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
	const [submitDisabledTemporarily, setSubmitDisabledTemporarily] = useState(false);
	const submitTimeoutRef = useRef<number | null>(null);
	const [submitDisableSecondsLeft, setSubmitDisableSecondsLeft] = useState(0);

	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info": {

				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = (playersList ?? []).map((p: any) => {
					const code = String(p?.user_code ?? "");

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

					let scoreVal = 0;
					if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else {
						const scoreEntry = (scoreboard ?? []).find((s: any) => String(s?.user_code) === code);
						if (scoreEntry) scoreVal = scoreEntry?.cumulative_score ?? scoreEntry?.cumulative_score ?? scoreEntry?.new_total_score ?? scoreEntry?.score ?? 0;
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

			case "clear_question": {
				setVideoPlayState(null);

				break;
			}

			case "send_question": {
				setVideoPlayState(null);
				break;
			}

			case "play_video": {
				setVideoPlayState("playing");
				break;
			}

			case "pause_video": {
				setVideoPlayState("paused");
				break;
			}

			case "start_the_timer": {
				const timeLimitNum = Number(msg.time_limit ?? 0);
				const startedAtNum = typeof msg.started_at === 'string' ? parseInt(msg.started_at, 10) : Number(msg.started_at ?? Date.now());
				console.info("[TIMER] start_the_timer received:", { time_limit: timeLimitNum, started_at: startedAtNum, started_at_raw: msg.started_at, now: Date.now() });
				startSynced(timeLimitNum, startedAtNum);
				console.info("[BP TIMER] startSynced called, timer state:", { timeLimit: timeLimitNum, started_at: startedAtNum });
				setTimerHasStarted(true);
				setAnswer("");
				setShowAnswers(false);
				setVideoPlayState("playing");
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
				setAnswer("");
				setShowAnswers(false);
				setTimerHasStarted(false);
				break;
			}

			case "send_answers_to_players": {
				const answers = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const ans = answers.find((a: any) => a.user_code === p.playerCode);
						if (!ans) return p;
						return {
							...p,
							playerLastAnswer: ans.content,
							playerTimestamp: ans.timestamp || p.playerTimestamp,
						};
					}),
				);
				setShowAnswers(true);
				break;
			}

			case "buzz": {

				const { user_code } = msg;
				if (user_code && user_code !== playerCode) {
					setPlayers((prev) => prev.map((p) => (p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p)));
					console.info("Player received buzz from", user_code);
				}
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, startSynced, playerCode]);

	const handleSubmitAnswer = useCallback(async () => {
		const trimmed = answer.trim();
		if (!trimmed) return;
		if (submitDisabledTemporarily) return;
		if (!isConnected) return;
		if (!currentQuestion.questionCode) return;

		if (!timerHasStarted) return;
		if (timer <= 0) return;

			const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		console.info(`[BP ANSWER SYNC] Player submitting answer: user=${playerCode} question=${currentQuestion.questionCode} answer=${trimmed} ts=${ts} connected=${isConnected}`);

		const DISABLE_SECONDS = 3;
		setSubmitDisabledTemporarily(true);
		setSubmitDisableSecondsLeft(DISABLE_SECONDS);
		if (submitTimeoutRef.current) window.clearInterval(submitTimeoutRef.current as any);
		submitTimeoutRef.current = window.setInterval(() => {
			setSubmitDisableSecondsLeft((prev) => {
				if (prev <= 1) {
					if (submitTimeoutRef.current) {
						window.clearInterval(submitTimeoutRef.current as any);
						submitTimeoutRef.current = null;
					}
					setSubmitDisabledTemporarily(false);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerLastAnswer: trimmed, playerTimestamp: Number(ts.toFixed(3)) }
					: p,
			),
		);

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
						timestamp: ts,
					}),
			});
			if (res.ok) {
				console.info(`[BP ANSWER SYNC] Player POST answer success: user=${playerCode} question=${currentQuestion.questionCode} answer=${trimmed} ts=${ts}`);

				const wsPayload = {
					type: "player_answer",
					user_code: playerCode,
					question_code: currentQuestion.questionCode,
					answer_text: trimmed,
					timestamp: ts,
				};
				console.info(`[BP ANSWER SYNC] Broadcasting WebSocket message:`, wsPayload);
				await sendMessage(wsPayload);
				console.info(`[BP ANSWER SYNC] WebSocket broadcast completed`);
			} else {
				const body = await res.text().catch(() => "");
				console.warn(`[BP ANSWER SYNC] Player POST answer failed: status=${res.status} body=${body}`);
			}
		} catch (err) {
			console.warn("[BP ANSWER SYNC] Failed to POST answer:", err);
		}
		setAnswer("");
	}, [answer, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendMessage, timeLimit, timer, token, matchCode, submitDisabledTemporarily, timerHasStarted]);

	const isTimerExpired = timerHasStarted && timeLimit > 0 && timer === 0;

	const isSubmissionDisabled =
		!isConnected ||
		!currentQuestion.questionCode ||
		!timerHasStarted ||
		isTimerExpired ||
		submitDisabledTemporarily;

	console.info(`[BP INPUT DEBUG] isConnected=${isConnected}, hasQuestion=${!!currentQuestion.questionCode}, timerHasStarted=${timerHasStarted}, timer=${timer}, isTimerExpired=${isTimerExpired}, submitDisabledTemporarily=${submitDisabledTemporarily}, FINAL_DISABLED=${isSubmissionDisabled}`);

	useEffect(() => {
		return () => {
			if (submitTimeoutRef.current) {
				window.clearInterval(submitTimeoutRef.current as any);
				submitTimeoutRef.current = null;
			}
		};
	}, []);

	const answerPlaceholder = !currentQuestion.questionCode
		? "Chờ admin chọn câu hỏi..."
		: !timerHasStarted
			? "Chờ admin bắt đầu tính giờ..."
			: isTimerExpired
				? "Thời gian đã hết!"
				: submitDisabledTemporarily
					? `Vui lòng đợi trong ${submitDisableSecondsLeft} giây`
					: "Nhập đáp án và nhấn Enter";

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
						title="BỨT PHÁ"
						question={currentQuestion}
						timerDuration={timer}
						controls={{ variant: 'numbers', count: 5, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
						videoPlayState={videoPlayState}
						hideMediaUntilPlayed
					/>

				<PAnswerBox
					answer={answer}
					setAnswer={setAnswer}
					isDisabled={isSubmissionDisabled}
					onSubmit={handleSubmitAnswer}
					placeholderString={answerPlaceholder}
				/>
			</>
		</PBasePageLayout>
	);
};

export default PButPhaPage;

