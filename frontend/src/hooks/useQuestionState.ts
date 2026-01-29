/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from "react";
import type { Question } from "@/types/question";

const emptyQuestion: Question = {
    questionCode: "",
    questionText: "",
    questionAnswer: "",
    questionExplanation: "",
    questionMediaURL: undefined,
};

export interface QuestionState {
    currentQuestion: Question;
    applyWsMessage: (msg: unknown) => void;
    clear: () => void;
}

export function useQuestionState(): QuestionState {
    const [currentQuestion, setCurrentQuestion] = useState<Question>(emptyQuestion);

    const clear = useCallback(() => {
        setCurrentQuestion(emptyQuestion);
    }, []);

    const applyWsMessage = useCallback((raw: unknown) => {
        if (!raw || typeof raw !== "object") return;

        // Some servers wrap as { message: {...} }
        const msg: any = "message" in (raw as any) ? (raw as any).message : raw;

        switch (msg?.type) {
            case "send_question":
                setCurrentQuestion({
                    ...emptyQuestion,
                    questionCode: msg.question_code ?? "",
                    questionText: msg.content ?? "",
                    questionMediaURL: msg.media_source ?? undefined,
                });
                break;
            case "clear_question":
                setCurrentQuestion(emptyQuestion);
                break;
            default:
                break;
        }
    }, []);

    return { currentQuestion, applyWsMessage, clear };
}
