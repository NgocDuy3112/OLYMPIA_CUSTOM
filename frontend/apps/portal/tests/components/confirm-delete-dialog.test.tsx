import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { renderWithProviders } from "../helpers/render"

function draw(pending: boolean) {
    const onCancel = vi.fn()
    renderWithProviders(
        <ConfirmDeleteDialog
            title="Delete this match?"
            subject="Bảng 1"
            description="The match disappears from the tournament."
            error={null}
            pending={pending}
            onCancel={onCancel}
            onConfirm={() => {}}
        />
    )
    return onCancel
}

describe("ConfirmDeleteDialog — dismissal while the DELETE is in flight", () => {
    it("refuses Escape while pending", async () => {
        const onCancel = draw(true)
        await screen.findByRole("dialog")

        await userEvent.keyboard("{Escape}")

        expect(onCancel).not.toHaveBeenCalled()
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    it("closes on Escape once the deletion has settled", async () => {
        const onCancel = draw(false)
        await screen.findByRole("dialog")

        await userEvent.keyboard("{Escape}")

        expect(onCancel).toHaveBeenCalled()
    })

    it("names both icon-only actions for assistive tech", async () => {
        draw(true)

        expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    })
})
