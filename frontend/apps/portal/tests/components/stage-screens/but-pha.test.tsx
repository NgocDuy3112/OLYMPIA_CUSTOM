import { expect, it, describe, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
    butPhaQuestions,
    byButPhaId,
    expectButtonsInOrder,
    openQ,
    renderRound,
} from "../../helpers/stage-facts"

describe("ButPha — S4", () => {
    it("Tính giờ starts the revealed question's clock, Về sảnh ends the round", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { send: vi.fn() },
            { open: [openQ] },
            { questionId: "q1", opened: true, clockStarted: false },
        )

        expectButtonsInOrder(["Tính giờ", "Về sảnh"])
        await user.click(screen.getByRole("button", { name: "Tính giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "but-pha.startClock" })
        await user.click(screen.getByRole("button", { name: "Về sảnh" }))
        expect(f.backToLobby).toHaveBeenCalledOnce()
    })

    it("clicking a question chip reveals the next question", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { pickQuestion: vi.fn() })

        await user.click(screen.getByRole("button", { name: "1" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("Đáp án thí sinh reveals the cursor's question once it has been asked", async () => {
        const user = userEvent.setup()
        const f = renderRound("but-pha", { send: vi.fn() }, {}, { questionId: "q1", opened: true })

        await user.click(screen.getByRole("button", { name: "Đáp án thí sinh" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "q1" })
    })

    it("…and stays inert before the clock ever starts", () => {
        renderRound("but-pha", {}, {}, { questionId: "q1", opened: false })
        expect(screen.queryByRole("button", { name: "Đáp án thí sinh" })).toBeNull()
    })

    it("while a question is open, the NEXT chip is the clickable one", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { pickQuestion: vi.fn(), byId: byButPhaId },
            { open: [{ questionId: "bp-1", deadlineAt: null, question: null }] },
            { questionId: "bp-1", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        expect(screen.queryByRole("button", { name: "1" })).toBeNull()
        await user.click(screen.getByRole("button", { name: "2" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("the open question's own chip is the current one (0-based position)", () => {
        renderRound(
            "but-pha",
            { byId: byButPhaId },
            { open: [{ questionId: "bp-2", deadlineAt: null, question: null }] },
            { questionId: "bp-2", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        const current = document.querySelector('[aria-current="step"]')
        expect(current?.textContent).toBe("2")
    })

    it("on the LAST question the current chip itself closes it", async () => {
        const user = userEvent.setup()
        const f = renderRound(
            "but-pha",
            { pickQuestion: vi.fn(), byId: byButPhaId },
            { open: [{ questionId: "bp-4", deadlineAt: null, question: null }] },
            { questionId: "bp-4", opened: true, clockStarted: true },
            butPhaQuestions,
        )

        await user.click(screen.getByRole("button", { name: "4" }))
        expect(f.pickQuestion).toHaveBeenCalledOnce()
    })

    it("once the round ends every chip reads done and nothing is clickable", () => {
        renderRound("but-pha", {}, { stage: "ended" })

        expect(screen.queryByRole("button", { name: "1" })).toBeNull()
        expect(screen.getByText("✓1")).toBeInTheDocument()
        expect(screen.getByText("✓4")).toBeInTheDocument()
    })
})
