import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AdjustScoreDialog } from "@/console/AdjustScoreDialog"


function renderDialog(
    onSubmit = vi.fn(),
    onCancel = vi.fn(),
    pending = false,
    error: string | null = null
) {
    render(
        <AdjustScoreDialog
            playerName="An"
            pending={pending}
            error={error}
            onCancel={onCancel}
            onSubmit={onSubmit}
        />
    )
    return { onSubmit, onCancel }
}

describe("AdjustScoreDialog", () => {
    it("submits the signed delta and the trimmed reason", async () => {
        const user = userEvent.setup()
        const { onSubmit } = renderDialog()

        await user.type(screen.getByLabelText(/Điểm/), "-5")
        await user.type(screen.getByLabelText(/Lý do/), "  chấm lại  ")
        await user.click(screen.getByRole("button", { name: "Lưu" }))

        expect(onSubmit).toHaveBeenCalledWith(-5, "chấm lại")
    })

    it("locks submit for a zero delta or a missing reason", async () => {
        renderDialog()
        const save = screen.getByRole("button", { name: "Lưu" })
        expect(save).toBeDisabled()

        const delta = screen.getByLabelText(/Điểm/)
        const reason = screen.getByLabelText(/Lý do/)
        await userEvent.type(delta, "0")
        await userEvent.type(reason, "lý do")
        expect(save).toBeDisabled() 
    })

    it("Hủy and the backdrop both cancel", async () => {
        const user = userEvent.setup()
        const { onCancel } = renderDialog()

        await user.click(screen.getByRole("button", { name: "Hủy" }))
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it("keeps the typed score while the action is pending, and refuses to dismiss", async () => {
        const user = userEvent.setup()
        const { onCancel } = renderDialog(vi.fn(), vi.fn(), true)

        await user.type(screen.getByLabelText(/Điểm/), "-5")
        expect(screen.getByLabelText(/Điểm/)).toHaveValue(-5)
        expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled()

        await user.keyboard("{Escape}")
        expect(onCancel).not.toHaveBeenCalled()
    })

    it("shows the refusal inside the dialog", () => {
        renderDialog(vi.fn(), vi.fn(), false, "Điểm vượt giới hạn")
        expect(screen.getByRole("alert")).toHaveTextContent("Điểm vượt giới hạn")
    })
})
