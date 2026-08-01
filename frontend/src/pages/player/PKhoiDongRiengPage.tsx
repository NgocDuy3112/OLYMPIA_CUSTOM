

import { useEffect, useRef } from "react";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";

const PKhoiDongRiengPage = () => {
	const { playerCode } = useRoleSession("player");
	const { lastMessage } = useGameWebSocket();
	const { timer, startSynced } = useCountdownTimer();
	const { currentQuestion, currentQuestionIndex, applyWsMessage } = useQuestionState();

	const { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyWrongAttempt } = useAudiencePlayers();
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
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				audioRef.current?.pause();
				audioRef.current = new Audio('/audios/bgm/kd_60s.mp3');
				audioRef.current.play().catch(() => {});
				break;
			}

			case "player_score_updated":
				applyScoreUpdate(msg);
				break;

			case "clear_buzz": {
				setPlayers((prev) => prev.map((p) => ({ ...p, playerHasBuzzed: false })));
				break;
			}

			case "player_wrong_attempt":
				applyWrongAttempt(msg);
				break;

			default:
				break;
		}
		});
	}, [applyPlayersInfo, applyScoreUpdate, applyWrongAttempt, applyWsMessage, lastMessage, setPlayers, startSynced]);

	useEffect(() => {
		setPlayers((prev) =>
			prev.map((p) => ({ ...p, playerWrongAttempts: undefined })),
		);
	}, [currentQuestionIndex, setPlayers]);

	const hasPlayerWithSecondAttempt = players.some((p) => p.playerWrongAttempts === 1);

	return (
		<PBasePageLayout
			players={players}
			currentPlayerCode={playerCode}
		>
			<PQuestionBoard
				title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
				question={currentQuestion}
				timerDuration={timer}
				controls={{ variant: 'numbers', count: 6, activeIndices: currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [] }}
			>
				{hasPlayerWithSecondAttempt && (
					<div className="bg-yellow-600 text-white px-3 py-1 rounded-md text-sm font-bold shrink-0 animate-pulse">
						Trả lời lần 2
					</div>
				)}
			</PQuestionBoard>
		</PBasePageLayout>
	);
};

export default PKhoiDongRiengPage;

