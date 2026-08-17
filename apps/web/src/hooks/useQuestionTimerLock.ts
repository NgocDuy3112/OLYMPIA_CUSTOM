import { useCallback, useEffect, useState } from "react";

export const useQuestionTimerLock = (questionCode: string) => {
  const [lockedQuestionCode, setLockedQuestionCode] = useState<string | null>(null);

  useEffect(() => {
    if (lockedQuestionCode && lockedQuestionCode !== questionCode) setLockedQuestionCode(null);
  }, [lockedQuestionCode, questionCode]);

  const lock = useCallback(() => {
    if (questionCode) setLockedQuestionCode(questionCode);
  }, [questionCode]);

  return { isLocked: Boolean(questionCode) && lockedQuestionCode === questionCode, lock };
};
