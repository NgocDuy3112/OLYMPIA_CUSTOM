
import { useCallback, useState } from "react";
import { API_BASE_URL } from "@/configs";

export function useMcQuestionReveal(matchCode: string, token: string) {
    const [questionAnswer, setQuestionAnswer] = useState("");
    const [questionExplanation, setQuestionExplanation] = useState("");

    const fetchAnswer = useCallback(async (questionCode: string) => {
        if (!questionCode || !token || !matchCode) return;
        try {
            const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}&question_code=${encodeURIComponent(questionCode)}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json();
            let payload: any = null;
            if (Array.isArray(data.data)) {
                payload = data.data.find((q: any) => String(q?.question_code) === String(questionCode)) ?? data.data[0] ?? null;
            } else {
                payload = data.data ?? null;
            }
            const answer =
                payload?.correct_answers ??
                payload?.correct_answer ??
                payload?.answer ??
                payload?.question?.correct_answers ??
                payload?.question?.correct_answer ??
                "";
            const explanation =
                payload?.explanation ??
                payload?.question?.explanation ??
                "";
            setQuestionAnswer(String(answer));
            setQuestionExplanation(String(explanation));
        } catch {

        }
    }, [matchCode, token]);

    const clearAnswer = useCallback(() => {
        setQuestionAnswer("");
        setQuestionExplanation("");
    }, []);

    return { questionAnswer, questionExplanation, fetchAnswer, clearAnswer };
}