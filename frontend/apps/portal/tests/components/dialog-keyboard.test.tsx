import { useState } from "react"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "@shared/ui/button"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { RegradeDialog } from "@/console/RegradeDialog"
import { renderWithProviders } from "../helpers/render"

function DeleteHarness() {
    const [open, setOpen] = useState(false)
    return (
        <>
            <Button onClick={() => setOpen(true)}>Xoá trận</Button>
            {open && (
                <ConfirmDeleteDialog
                    title="Delete this match?"
                    subject="Bảng 1"
                    description="The match disappears from the tournament."
                    error={null}
                    pending={false}
                    onCancel={() => setOpen(false)}
                    onConfirm={() => setOpen(false)}
                />
            )}
        </>
    )
}

describe("a dialog the operator opened from the keyboard", () => {
    it("hands focus back to the button that opened it", async () => {
        const user = userEvent.setup()
        renderWithProviders(<DeleteHarness />)

        const trigger = screen.getByRole("button", { name: "Xoá trận" })
        await user.click(trigger)
        await screen.findByRole("dialog")

        await user.keyboard("{Escape}")

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(trigger).toHaveFocus()
    })
})

describe("RegradeDialog — the search box owns its Enter", () => {
    const rows = [
        { questionId: "q1", text: "Hà Nội là thủ đô", points: 10, roundId: "khoi-dong" },
    ]

    it("typing a search and pressing Enter does not submit the delta", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        renderWithProviders(
            <RegradeDialog
                playerName="An"
                rows={rows}
                pending={false}
                error={null}
                onCancel={() => {}}
                onSubmit={onSubmit}
            />
        )

        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("radio"))
        await user.type(within(dialog).getByLabelText("Điểm (+/-)"), "10")
        await user.type(within(dialog).getByLabelText("Tìm câu hỏi"), "{Enter}")

        expect(onSubmit).not.toHaveBeenCalled()
    })
})
