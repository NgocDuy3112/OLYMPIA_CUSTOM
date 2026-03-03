
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
// temporary page-level logging uses console.info; createLogger import removed for brevity
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import type { PlayerStatus } from "@/types/player";



const PKhoiDongChungPage = () => {
	const { playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendAnswer } = usePlayerWebSocket();
	const { timer, timeLimit, start, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [answer, setAnswer] = useState("");

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
				// Receive player information through WebSocket instead of API
				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = playersList.map((p: any) => {
					const code = String(p.user_code ?? "");
					const profile = profiles.find((prof: any) => prof.user_code === code);
					const score = scoreboard.find((s: any) => s.user_code === code);
					return {
						playerCode: code,
						playerName: profile?.user_name ?? "",
						playerScore: score?.cummulative_score ?? score?.new_total_score ?? 0,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "start_the_timer": {
				start(Number(msg.time_limit ?? 0));
				setAnswer("");
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
							playerTimestamp: ans.timestamp,
						};
					}),
				);
				break;
			}

			default:
				break;
		}
	}, [applyWsMessage, lastMessage, start]);

	const handleSubmitAnswer = useCallback(async () => {
		const trimmed = answer.trim();
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

		await sendAnswer(playerCode, currentQuestion.questionCode, trimmed, ts, token);
		setAnswer("");
	}, [answer, currentQuestion.questionCode, getElapsedSeconds, isConnected, playerCode, sendAnswer, timeLimit, timer, token]);

	const isSubmissionDisabled = !isConnected || timer <= 0;

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
		>
			<>
				<PQuestionBoard
					title="KHỞI ĐỘNG - LƯỢT CHUNG"
					question={currentQuestion}
					timerDuration={timer}
					controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
				/>

				<PAnswerBox
					answer={answer}
					setAnswer={setAnswer}
					isDisabled={isSubmissionDisabled}
					onSubmit={handleSubmitAnswer}
					placeholderString="Nhập đáp án và nhấn Enter"
				/>
			</>
		</PBasePageLayout>
	);
};

export default PKhoiDongChungPage;