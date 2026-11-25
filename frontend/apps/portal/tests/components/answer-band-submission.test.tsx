import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AnswerBand, SubmissionLog } from "@shared/deck/answer-controls"

const QUESTION = {
    questionId: "q1",
    kind: "TEXT" as const,
    position: 0,
    questionText: "Thủ đô của Việt Nam?",
    media: null,
    payload: {},
}

const CHOICE = {
    questionId: "q2",
    kind: "CHOICE" as const,
    position: 1,
    questionText: "Thủ đô của Việt Nam?",
    media: null,
    payload: { options: [{ id: "o1", text: "Hà Nội" }, { id: "o2", text: "Huế" }] },
}

describe("AnswerBand — submission feedback", () => {
    it("shows what was answered in its own section", () => {
        render(
            <SubmissionLog entries={[{ kind: "answer", answer: "Hà Nội", elapsedS: 3.5 }]} />
        )

        expect(screen.getByLabelText("Trạng thái trả lời")).toBeInTheDocument()
        expect(screen.getByRole("status").textContent).toBe(
            "Bạn đã trả lời đáp án: Hà Nội (3.500s)"
        )
    })

    it("labels keyword submissions apart from answers", () => {
        render(
            <SubmissionLog
                entries={[
                    { kind: "answer", answer: "Hà Nội", elapsedS: 3.5 },
                    { kind: "keyword", answer: "AOMASAO", elapsedS: 10.834 },
                ]}
            />
        )

        const rows = screen.getAllByRole("status")
        expect(rows.map((r) => r.textContent)).toEqual([
            "Bạn đã trả lời đáp án: Hà Nội (3.500s)",
            "Bạn đã trả lời từ khóa: AOMASAO (10.834s)",
        ])
    })

    it("clears the input as soon as the answer is sent", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(
            <AnswerBand question={QUESTION} answered={false} onSubmit={onSubmit} />
        )

        const input = screen.getByLabelText("Câu trả lời của bạn") as HTMLInputElement
        await user.type(input, "Hà Nội")
        expect(input.value).toBe("Hà Nội")

        await user.click(screen.getByRole("button", { name: /gửi/i }))

        expect(onSubmit).toHaveBeenCalledWith({ text: "Hà Nội" })
        expect(input.value).toBe("")
    })

    it("keeps the box empty once the server echoes the answer back", async () => {
        const user = userEvent.setup()
        const { rerender } = render(
            <AnswerBand
                question={QUESTION}
                answered={false}
                onSubmit={vi.fn()}
            />
        )

        const input = screen.getByLabelText("Câu trả lời của bạn") as HTMLInputElement
        await user.type(input, "Sài Gòn")
        expect(input.value).toBe("Sài Gòn")

        rerender(
            <AnswerBand
                question={QUESTION}
                answered
                onSubmit={vi.fn()}
            />
        )

        expect(input.value).toBe("")
    })

    it("renders the option buttons for a CHOICE question", () => {
        render(
            <AnswerBand question={CHOICE} answered={false} onSubmit={vi.fn()} />
        )

        expect(screen.getByRole("button", { name: /A\./ })).toBeInTheDocument()
        expect(screen.queryByLabelText("Câu trả lời của bạn")).toBeNull()
    })

    it("typedOnly drops the option buttons — Về đích chung only takes text", () => {
        render(
            <AnswerBand question={CHOICE} answered={false} typedOnly onSubmit={vi.fn()} />
        )

        expect(screen.queryByRole("button", { name: /A\./ })).toBeNull()
        expect(screen.getByLabelText("Câu trả lời của bạn")).toBeInTheDocument()
    })
})
