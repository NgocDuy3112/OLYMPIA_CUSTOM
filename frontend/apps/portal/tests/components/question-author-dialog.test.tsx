import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { QuestionAuthorDialog, type AuthorSave } from "@/components/question-author-dialog"
import { renderWithProviders } from "../helpers/render"

function renderDialog(bucket: string, onSave: (input: AuthorSave) => void) {
    renderWithProviders(
        <QuestionAuthorDialog
            open
            bucket={bucket}
            onCancel={() => {}}
            onSave={onSave}
        />
    )
    return screen.getByRole("dialog")
}

describe("QuestionAuthorDialog", () => {
    it("lets cau-hoi-phu save without options", async () => {
        const user = userEvent.setup()
        const onSave = vi.fn()
        const dialog = renderDialog("cau-hoi-phu", onSave)

        await user.type(within(dialog).getByLabelText("Question"), "Ai là người đầu tiên?")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Nguyễn Trãi")

        const save = within(dialog).getByRole("button", { name: "Save" })
        expect(save).toBeEnabled()
        await user.click(save)

        expect(onSave).toHaveBeenCalledWith({
            kind: "TEXT",
            questionText: "Ai là người đầu tiên?",
            keywordId: null,
            payload: { acceptedAnswers: ["Nguyễn Trãi"] },
            tags: ["cau-hoi-phu"],
            media: null,
        })
    })

    it("still asks for options in the audience-face groups", async () => {
        const user = userEvent.setup()
        const onSave = vi.fn()
        const dialog = renderDialog("ve-dich:40", onSave)

        await user.type(within(dialog).getByLabelText("Question"), "Câu hỏi khán giả")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Đáp án")

        expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
    })

    it("does not write payload.type", async () => {
        const user = userEvent.setup()
        const onSave = vi.fn()
        const dialog = renderDialog("khoi-dong:chung", onSave)

        await user.type(within(dialog).getByLabelText("Question"), "Thủ đô?")
        await user.type(within(dialog).getByLabelText(/Accepted answers/), "Hà Nội")
        await user.click(within(dialog).getByRole("button", { name: "Save" }))

        const saved = onSave.mock.calls[0][0] as AuthorSave
        expect(saved.kind).toBe("TEXT")
        expect(saved.payload).not.toHaveProperty("type")
    })
})
