import { ApiError, requestJson } from "@/api/client";
import { validateAnswerInput } from "@/utils/validation";

interface SubmitAnswerInput {
  user_code: string;
  match_code: string;
  question_code: string;
  answer_text?: string;
  has_buzzed: boolean;
  timestamp?: number;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<void> {
  validateAnswerInput(input);
  await requestJson<unknown>("/answers/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitBuzz(input: SubmitAnswerInput): Promise<boolean> {
  try {
    await submitAnswer(input);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return false;
    throw error;
  }
}
