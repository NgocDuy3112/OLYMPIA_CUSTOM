import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NewTournamentDialog } from "@/components/new-tournament-dialog"
import { StatusBanners } from "@/components/match-question/status-banners"
import { renderWithProviders } from "../helpers/render"

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("NewTournamentDialog — one submit per click", () => {
    it("refuses a second create while the first is still in flight", async () => {
        const user = userEvent.setup()
        // A response that never settles keeps the mutation pending.
        const fetchMock = vi.fn(() => new Promise(() => {}))
        vi.stubGlobal("fetch", fetchMock)

        renderWithProviders(<NewTournamentDialog open onOpenChange={() => {}} />)

        await user.type(screen.getByLabelText("Name"), "Giải 2026")
        const create = screen.getByRole("button", { name: "Create tournament" })
        await user.click(create)

        const pending = await screen.findByRole("button", { name: "Creating…" })
        expect(pending).toBeDisabled()
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

        await user.click(pending)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe("StatusBanners — the room hears about a save without asking", () => {
    const quiet = { conflict: null, saveError: null, flash: null, notice: null, onSave: () => {} }

    it("announces the flash and the notice on a live region", () => {
        renderWithProviders(
            <>
                <StatusBanners {...quiet} flash="Câu này thuộc nhóm khởi động." />
                <StatusBanners {...quiet} notice="Đã lưu — revision 4." />
            </>
        )

        const statuses = screen.getAllByRole("status")
        expect(statuses.map((node) => node.textContent)).toEqual([
            "Câu này thuộc nhóm khởi động.",
            "✓ Đã lưu — revision 4.",
        ])
        expect(statuses.every((node) => node.getAttribute("aria-live") === "polite")).toBe(true)
    })

    it("keeps the refusals on role=alert", () => {
        renderWithProviders(
            <StatusBanners {...quiet} saveError="Máy chủ từ chối." conflict="Bản nháp cũ." />
        )

        expect(screen.getAllByRole("alert")).toHaveLength(2)
    })
})
