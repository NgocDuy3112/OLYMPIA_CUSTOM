
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

export interface QuestionStateWithIndex extends QuestionState {
    currentQuestionIndex: number;
}

export function useQuestionState(): QuestionStateWithIndex {
    const [currentQuestion, setCurrentQuestion] = useState<Question>(emptyQuestion);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

    const clear = useCallback(() => {
        setCurrentQuestion(emptyQuestion);
        setCurrentQuestionIndex(0);
    }, []);

    const applyWsMessage = useCallback((raw: unknown) => {
        if (!raw || typeof raw !== "object") return;

        const msg: any = "message" in (raw as any) ? (raw as any).message : raw;

        switch (msg?.type) {
            case "send_question": {
                const code = msg.question_code ?? "";

                const m = String(code).match(/(\d+)\s*$/);
                const idx = m ? Number(m[1]) : 0;
                setCurrentQuestion({
                    ...emptyQuestion,
                    questionCode: code,
                    questionText: msg.content ?? "",
                    questionMediaURL: msg.media_source ?? undefined,
                });
                setCurrentQuestionIndex(Number.isFinite(idx) ? idx : 0);
                break;
            }
            case "clear_question":
                setCurrentQuestion(emptyQuestion);
                setCurrentQuestionIndex(0);
                break;
            default:
                break;
        }
    }, []);

    return { currentQuestion, applyWsMessage, clear, currentQuestionIndex } as unknown as QuestionState & { currentQuestionIndex: number };
}
