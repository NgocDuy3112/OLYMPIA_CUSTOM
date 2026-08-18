import { requestJson } from "@/api/client";
import { validateScoreEvent } from "@/utils/validation";

export const calculateScore = async (
  matchCode: string,
  questionCode: string,
  action: string,
  userCodes: string[],
): Promise<unknown> => {
  validateScoreEvent({
    match_code: matchCode,
    question_code: questionCode,
    user_codes: userCodes,
  });
  return requestJson("/scoreboard/calculate", {
    method: "POST",
    body: JSON.stringify({
      match_code: matchCode,
      question_code: questionCode,
      action,
      user_codes: userCodes,
    }),
  });
};
