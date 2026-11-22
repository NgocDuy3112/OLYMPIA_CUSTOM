import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AnswerBand } from "@shared/deck/answer-controls"

const QUESTION = {
    questionId: "q1",
    kind: "TEXT" as const,
    position: 0,
    questionText: "Thủ đô của Việt Nam?",
    media: null,
    payload: {},
}

describe("AnswerBand — submission feedback", () => {
    it("shows what was submitted and how long it took", () => {
        render(
            <AnswerBand
                question={QUESTION}
                answerState="draft"
                mySubmission={{ answer: "Hà Nội", elapsedS: 3.5 }}
                onSubmit={vi.fn()}
            />
        )

        expect(screen.getByRole("status").textContent).toBe(
            "Bạn đã nộp đáp án: Hà Nội (3.5s)"
        )
    })

    it("clears the input as soon as the answer is sent", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(
            <AnswerBand question={QUESTION} answerState="none" onSubmit={onSubmit} />
        )

        const input = screen.getByLabelText("Câu trả lời của bạn") as HTMLInputElement
        await user.type(input, "Hà Nội")
        expect(input.value).toBe("Hà Nội")

        await user.click(screen.getByRole("button", { name: /gửi/i }))

        expect(onSubmit).toHaveBeenCalledWith({ text: "Hà Nội" })
        expect(input.value).toBe("")
    })

    it("clears the input again when a second submission comes back as draft", async () => {
        const user = userEvent.setup()
        const { rerender } = render(
            <AnswerBand
                question={QUESTION}
                answerState="draft"
                mySubmission={{ answer: "Hà Nội", elapsedS: 3.5 }}
                onSubmit={vi.fn()}
            />
        )

        const input = screen.getByLabelText("Câu trả lời của bạn") as HTMLInputElement
        await user.type(input, "Sài Gòn")
        expect(input.value).toBe("Sài Gòn")

        rerender(
            <AnswerBand
                question={QUESTION}
                answerState="draft"
                mySubmission={{ answer: "Sài Gòn", elapsedS: 6.2 }}
                onSubmit={vi.fn()}
            />
        )

        expect(input.value).toBe("")
        expect(screen.getByRole("status").textContent).toBe(
            "Bạn đã nộp đáp án: Sài Gòn (6.2s)"
        )
    })
})
