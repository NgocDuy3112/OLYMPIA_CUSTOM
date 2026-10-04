import { useCallback, useEffect, useState } from "react";

import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { submitAnswer } from "@/api/answers";
import { apiGetOrNull } from "@/api/client";
import type { Question } from "@/types/question";
import { MAX_QUESTION_INDEX, QUESTION_PREFIX } from "@/pages/game/khoiDongShared";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

export const PlayerKhoiDongChungView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    sendMessage,
    timer,
    timeLimit,
    getElapsedSeconds,
    currentQuestion,
    players,
    setPlayers,
    showAnswers,
  } = usePlayerRound({ audioSrc: "/audios/bgm/KD_60s.MP3" });

  const [answer, setAnswer] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<
    number | null
  >(null);
  const [answeredQuestionCodes, setAnsweredQuestionCodes] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    void apiGetOrNull<unknown[]>(`/questions/${encodeURIComponent(matchCode)}`)
      .then((json) => {
        const rows = json && Array.isArray(json.data) ? json.data : [];
        setQuestions(
          rows
            .filter((row: any) =>
              String(row.question_code ?? row.questionCode).startsWith(
                QUESTION_PREFIX,
              ),
            )
            .slice(0, MAX_QUESTION_INDEX)
            .map((row: any) => ({
              questionCode: row.question_code ?? row.questionCode,
              questionText: row.content ?? row.questionText ?? "",
              questionAnswer: row.answer ?? "",
              questionExplanation: row.explanation ?? undefined,
              questionMediaURL:
                row.media_url ?? row.questionMediaURL ?? undefined,
              questionOptions: row.options ?? undefined,
            })),
        );
      })
      .catch(() => setQuestions([]));
  }, [matchCode]);

  const selectedQuestion =
    selectedQuestionIndex == null
      ? null
      : (questions[selectedQuestionIndex] ?? null);
  const selectedAnswered =
    !!selectedQuestion &&
    answeredQuestionCodes.has(selectedQuestion.questionCode);
  const isPlayerAfk = players.some(
    (player) => player.playerCode === playerCode && player.playerAfk,
  );

  useEffect(() => {
    setAnswer("");
  }, [selectedQuestionIndex]);

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (
      !trimmed ||
      !isConnected ||
      timer <= 0 ||
      !selectedQuestion ||
      selectedAnswered ||
      isPlayerAfk
    )
      return;

    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));

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
        question_code: selectedQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
        timestamp: ts,
      });
      await sendMessage({
        type: "player_answer",
        user_code: playerCode,
        question_code: selectedQuestion.questionCode,
        answer: trimmed,
        answer_text: trimmed,
        timestamp: ts,
        phase: "kdc",
      });
      setAnsweredQuestionCodes((previous) =>
        new Set(previous).add(selectedQuestion.questionCode),
      );
    } catch (error) {
      console.warn("Failed to submit answer:", error);
    }
    setAnswer("");
  }, [
    answer,
    getElapsedSeconds,
    isConnected,
    isPlayerAfk,
    matchCode,
    playerCode,
    selectedQuestion,
    selectedAnswered,
    sendMessage,
    setPlayers,
    timeLimit,
    timer,
  ]);

  const displayPlayers = players.map((p) =>
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="KHỞI ĐỘNG - LƯỢT CHUNG"
        question={selectedQuestion ?? currentQuestion}
        timerDuration={timer}
        controls={{
          variant: "numbers",
          count: MAX_QUESTION_INDEX,
          activeIndices:
            selectedQuestionIndex == null ? [] : [selectedQuestionIndex],
        }}
        questionSelect={(index) => setSelectedQuestionIndex(index)}
        answeredIndices={
          new Set(
            questions.map((question, index) =>
              answeredQuestionCodes.has(question.questionCode) ? index : -1,
            ),
          )
        }
      />
      <PAnswerBox
        answer={answer}
        setAnswer={setAnswer}
        isDisabled={
          !isConnected ||
          timer <= 0 ||
          !selectedQuestion ||
          selectedAnswered ||
          isPlayerAfk
        }
        onSubmit={handleSubmitAnswer}
        placeholderString={
          timer <= 0
            ? "Bạn không thể nhập đáp án tại thời điểm này"
            : "Nhập đáp án và nhấn Enter"
        }
      />
    </PBasePageLayout>
  );
};
