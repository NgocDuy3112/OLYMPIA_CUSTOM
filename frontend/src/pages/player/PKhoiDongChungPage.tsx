
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { PlayerStatus } from "@/types/player";

function unwrapWsMessage(message: any): any {
	if (message && typeof message === "object" && "message" in message) {
		return message.message;
	}
	return message;
}

const PKhoiDongChungPage = () => {
	const { matchCode, playerCode, token } = usePlayerSession();
	const { isConnected, lastMessage, sendAnswer } = useWebSocket(matchCode);
	const { timer, timeLimit, start, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [answer, setAnswer] = useState("");

	const loadPlayersState = useCallback(async () => {
		if (!matchCode || !token) return;
		try {
			const playersRes = await fetch(`${API_BASE_URL}/matches/${matchCode}/players`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			const playersList = (await playersRes.json()).response?.data?.players ?? [];

			const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${matchCode}`, {
				headers: { Authorization: `Bearer ${token}` },
			}).catch(() => null);
			const scoreList = scoreRes ? (await scoreRes.json()).response?.data?.scoreboard ?? [] : [];

			const profiles = await Promise.all(
				playersList.map((p: { player_code: any }) =>
					fetch(`${API_BASE_URL}/players/${p.player_code}`, {
						headers: { Authorization: `Bearer ${token}` },
					})
						.then((res) => res.json())
						.catch(() => null),
				),
			);

			const finalPlayers: PlayerStatus[] = playersList.map((p: any, index: number) => {
				const code = String(p.player_code ?? "");
				const profile = profiles[index]?.response?.data;
				const score = scoreList.find((s: any) => s.player_code === code);
				return {
					playerCode: code,
					playerName: profile?.player_name ?? "",
					playerScore: score?.total_d_score ?? score?.new_total_score ?? 0,
					playerLastAnswer: undefined,
					playerTimestamp: undefined,
					playerHasBuzzed: undefined,
				};
			});

			setPlayers(finalPlayers);
		} catch (err) {
			console.error("Failed to load players:", err);
		}
	}, [matchCode, token]);

	useEffect(() => {
		void loadPlayersState();
	}, [loadPlayersState]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = unwrapWsMessage(lastMessage);

		// Let the question hook handle send_question/clear_question
		applyWsMessage(msg);

		switch (msg?.type) {
			case "start_the_timer": {
				start(Number(msg.time_limit ?? 0));
				setAnswer("");
				break;
			}

			case "player_score_updated": {
				if (msg.player_code && typeof msg.new_total_score === "number") {
					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === msg.player_code ? { ...p, playerScore: msg.new_total_score } : p,
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
						const ans = answers.find((a: any) => a.player_code === p.playerCode);
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
			title="KHỞI ĐỘNG - LƯỢT CHUNG"
			currentQuestion={currentQuestion}
			timerDuration={timer}
		>
			<PAnswerBox
				answer={answer}
				setAnswer={setAnswer}
				isDisabled={isSubmissionDisabled}
				onSubmit={handleSubmitAnswer}
				placeholderString="Nhập đáp án và nhấn Enter"
			/>
		</PBasePageLayout>
	);
};

export default PKhoiDongChungPage;

