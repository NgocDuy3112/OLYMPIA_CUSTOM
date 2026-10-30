import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AdjustScoreDialog } from "@/console/AdjustScoreDialog"

// The controller's score correction dialog: one audited delta + reason.
// Submit stays disabled until BOTH a non-zero integer and a reason exist.

function renderDialog(onSubmit = vi.fn(), onCancel = vi.fn()) {
    render(<AdjustScoreDialog playerName="An" onCancel={onCancel} onSubmit={onSubmit} />)
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
        expect(save).toBeDisabled() // 0 is not an adjustment
    })

    it("Hủy and the backdrop both cancel", async () => {
        const user = userEvent.setup()
        const { onCancel } = renderDialog()

        await user.click(screen.getByRole("button", { name: "Hủy" }))
        expect(onCancel).toHaveBeenCalledTimes(1)
    })
})
