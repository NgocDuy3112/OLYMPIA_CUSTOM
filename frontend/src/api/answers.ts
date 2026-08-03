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

export async function submitAnswer(input: SubmitAnswerInput, token: string): Promise<void> {
  validateAnswerInput(input);
  await requestJson<unknown>(
    "/answers/",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
}

export async function submitBuzz(input: SubmitAnswerInput, token: string): Promise<boolean> {
  try {
    await submitAnswer(input, token);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return false;
    throw error;
  }
}
