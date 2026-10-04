import { useEffect } from "react";

import { usePlayerRound } from "@/hooks/usePlayerRound";

import { useRoleSession } from "@/hooks/useRoleSession";

import PQuestionBoard from "@/components/player/PQuestionBoard";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

import { Badge } from "@/components/ui/badge";

export const PlayerKhoiDongRiengView = () => {
  const { playerCode } = useRoleSession("player");
  const { players, setPlayers, currentQuestion, currentQuestionIndex, timer } =
    usePlayerRound({ audioSrc: "/audios/bgm/kd_60s.mp3" });

  useEffect(() => {
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, playerWrongAttempts: undefined })),
    );
  }, [currentQuestionIndex, setPlayers]);

  const hasPlayerWithSecondAttempt = players.some(
    (p) => p.playerWrongAttempts === 1,
  );

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="KHỞI ĐỘNG - LƯỢT CÁ NHÂN"
        question={currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: 6,
          activeIndices:
            currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
      >
        {hasPlayerWithSecondAttempt && (
          <Badge className="animate-pulse bg-warning text-warning-foreground">
            Trả lời lần 2
          </Badge>
        )}
      </PQuestionBoard>
    </PBasePageLayout>
  );
};

