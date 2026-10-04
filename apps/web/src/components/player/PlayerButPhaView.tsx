import { useCallback, useEffect, useRef, useState } from "react";

import { usePlayerRound } from "@/hooks/usePlayerRound";

import { useRoleSession } from "@/hooks/useRoleSession";

import { submitAnswer } from "@/api/answers";

import PQuestionBoard from "@/components/player/PQuestionBoard";

import PAnswerBox from "@/components/player/PAnswerBox";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

export const PlayerButPhaView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    sendMessage,
    timer,
    timeLimit,
    getElapsedSeconds,
    currentQuestion,
    currentQuestionIndex,
    players,
    setPlayers,
    showAnswers,
    videoPlayState,
    timerHasStarted,
  } = usePlayerRound();

  const [answer, setAnswer] = useState("");
  const isPlayerAfk = players.some(
    (player) => player.playerCode === playerCode && player.playerAfk,
  );
  const [submitDisabledTemporarily, setSubmitDisabledTemporarily] =
    useState(false);
  const [submitDisableSecondsLeft, setSubmitDisableSecondsLeft] = useState(0);
  const submitTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current)
        window.clearInterval(submitTimeoutRef.current);
    };
  }, []);

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (
      !trimmed ||
      submitDisabledTemporarily ||
      isPlayerAfk ||
      !isConnected ||
      !currentQuestion.questionCode ||
      !timerHasStarted ||
      timer <= 0
    )
      return;

    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));

    setSubmitDisabledTemporarily(true);
    setSubmitDisableSecondsLeft(1.5);
    if (submitTimeoutRef.current)
      window.clearInterval(submitTimeoutRef.current);
    submitTimeoutRef.current = window.setInterval(() => {
      setSubmitDisableSecondsLeft((prev) => {
        if (prev <= 0.5) {
          if (submitTimeoutRef.current) {
            window.clearInterval(submitTimeoutRef.current);
            submitTimeoutRef.current = null;
          }
          setSubmitDisabledTemporarily(false);
          return 0;
        }
        return Number((prev - 0.5).toFixed(1));
      });
    }, 500);

    setPlayers((prev) =>
      prev.map((p) =>
        p.playerCode === playerCode
          ? {
              ...p,
              playerLastAnswer: trimmed,
              playerTimestamp: Number(ts.toFixed(3)),
            }
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
      });
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
  }, [
    answer,
    currentQuestion.questionCode,
    getElapsedSeconds,
    isConnected,
    isPlayerAfk,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
    submitDisabledTemporarily,
    timeLimit,
    timer,
    timerHasStarted,
  ]);

  const isTimerExpired = timerHasStarted && timeLimit > 0 && timer === 0;
  const isSubmissionDisabled =
    isPlayerAfk ||
    !isConnected ||
    !currentQuestion.questionCode ||
    !timerHasStarted ||
    isTimerExpired ||
    submitDisabledTemporarily;

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
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="BỨT PHÁ"
        question={currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: 5,
          activeIndices:
            currentQuestionIndex > 0 ? [currentQuestionIndex - 1] : [],
        }}
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
    </PBasePageLayout>
  );
};

