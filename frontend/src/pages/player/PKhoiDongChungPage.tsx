

import { useCallback, useEffect, useRef, useState } from "react";
import { submitAnswer } from "@/api/answers";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";

const PKhoiDongChungPage = () => {
	const { matchCode, playerCode, token } = useRoleSession("player");
	const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, clearAnswers } = useAudiencePlayers();
	const [answer, setAnswer] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		return () => { audioRef.current?.pause(); };
	}, []);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = lastMessage.message ?? lastMessage;

		queueMicrotask(() => {

		applyWsMessage(msg);

		switch (msg?.type) {
			case "send_players_info":
				applyPlayersInfo(msg);
				break;

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), Number(msg.started_at ?? Date.now()));
				setAnswer("");
				setShowAnswers(false);
				audioRef.current?.pause();
				audioRef.current = new Audio('/audios/bgm/KD_60s.MP3');
				audioRef.current.play().catch(() => {});
				break;
			}

			case "player_score_updated":
				applyScoreUpdate(msg);
				break;

			case "clear_answers": {
				clearAnswers();
				setAnswer("");
				setShowAnswers(false);
				break;
			}

			case "send_answers_to_players": {
				applyAnswers(msg);
				setShowAnswers(true);
				break;
			}

			case "buzz":
				if (String(msg.user_code ?? "") !== playerCode) applyBuzz(msg);
				break;

			default:
				break;
		}
		});
	}, [applyAnswers, applyBuzz, applyPlayersInfo, applyScoreUpdate, applyWsMessage, clearAnswers, lastMessage, playerCode, startSynced]);

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

		try {
			await submitAnswer({
				user_code: playerCode,
				match_code: matchCode,
				question_code: currentQuestion.questionCode,
				answer_text: trimmed,
				has_buzzed: false,
				timestamp: ts,
			}, token);
			await sendMessage({
				type: "player_answer",
				user_code: playerCode,
				question_code: currentQuestion.questionCode,
				answer_text: trimmed,
				timestamp: ts,
			});
		} catch (error) {
			console.warn("Failed to submit answer:", error);
		}
		setAnswer("");
	}, [answer, currentQuestion.questionCode, getElapsedSeconds, isConnected, matchCode, playerCode, sendMessage, setPlayers, timeLimit, timer, token]);

	const isSubmissionDisabled = !isConnected || timer <= 0;

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
					placeholderString={timer <= 0 ? "Bạn không thể nhập đáp án tại thời điểm này" : "Nhập đáp án và nhấn Enter"}
				/>
			</>
		</PBasePageLayout>
	);
};

export default PKhoiDongChungPage;