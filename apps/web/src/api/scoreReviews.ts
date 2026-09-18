import { requestJson } from "@/api/client";

export interface ReviewCandidateInput {
  userCode: string;
  answerText?: string;
}

export const requestScoreReview = async (
  matchCode: string,
  questionCode: string,
  candidates: ReviewCandidateInput[],
): Promise<{ id: string; expiresAt: string }> => {
  const json = (await requestJson("/score-reviews", {
    method: "POST",
    body: JSON.stringify({
      match_code: matchCode,
      question_code: questionCode,
      candidates: candidates.map((c) => ({
        userCode: c.userCode,
        answerText: c.answerText ?? "",
      })),
    }),
  })) as { data: { id: string; expiresAt: string } };
  return json.data;
};
